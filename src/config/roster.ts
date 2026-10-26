import type { Config } from './schema.js';
import type { SessionInfo, TrackSwitch, TranscriptLine, UnpairedSpeaker } from '../shared/types.js';

/**
 * Speakers, campaigns and characters are set up separately in config.yaml; this module answers
 * the questions the transcript and recap ask of them: who is on this Discord account, which
 * campaign is this session, who plays whom.
 */

type Roster = Pick<Config, 'speakers' | 'campaigns' | 'characters'>;

export interface Identity {
  /** How the speaker is named in transcripts. */
  label: string;
  /** The label plus what tells them apart, for Claude. */
  description: string;
}

export interface Character extends Identity {
  id: string;
  dndbeyond?: number;
  /** The speaker who plays them. */
  speaker?: { id: string; name: string };
}

export interface Campaign {
  id: string;
  name: string;
  context?: string;
  dndbeyond?: number;
  channels: string[];
  characters: Character[];
}

/** A speaker on a shared account, as one of the choices for labelling its lines. */
export interface SharedIdentity extends Identity {
  /** The speaker's own name when `label` is their character's. */
  player?: string;
}

/** Speaker IDs on each Discord account. */
function speakersByAccount(roster: Pick<Config, 'speakers'>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [id, s] of Object.entries(roster.speakers)) for (const account of s.discord) out.set(account, [...(out.get(account) ?? []), id]);
  return out;
}

/**
 * The speakers as they stood at one moment of a session (#71): each account a session's `tracks`
 * mention carries the speakers its latest switch at or before `offsetMs` names. Accounts it
 * doesn't mention (or not yet) keep the settings.
 */
export function rosterAt<R extends Pick<Config, 'speakers'>>(roster: R, tracks: readonly TrackSwitch[] | undefined, offsetMs: number): R {
  const governing = new Map<string, TrackSwitch>();
  for (const t of tracks ?? []) if (t.fromMs <= offsetMs && (governing.get(t.account)?.fromMs ?? -1) <= t.fromMs) governing.set(t.account, t);
  if (!governing.size) return roster;
  const speakers = Object.fromEntries(
    Object.entries(roster.speakers).map(([id, s]) => [
      id,
      { ...s, discord: [...s.discord.filter((a) => !governing.has(a)), ...[...governing].filter(([, t]) => t.speakers.includes(id)).map(([a]) => a)] },
    ]),
  );
  return { ...roster, speakers };
}

/** When who's-on-which-account changes in a session: 0, then each switch time, in order. */
export function trackEpochs(tracks: readonly TrackSwitch[] | undefined): number[] {
  return [...new Set([0, ...(tracks ?? []).map((t) => t.fromMs)])].sort((a, b) => a - b);
}

/** The roster for questions about the whole session (who's unpaired, who's at the table): everyone on each account at any time. */
export function rosterOverall<R extends Pick<Config, 'speakers'>>(roster: R, tracks: readonly TrackSwitch[] | undefined): R {
  if (!tracks?.length) return roster;
  const rosters = trackEpochs(tracks).map((at) => rosterAt(roster, tracks, at));
  const speakers = Object.fromEntries(Object.entries(roster.speakers).map(([id, s]) => [id, { ...s, discord: [...new Set(rosters.flatMap((r) => r.speakers[id]!.discord))] }]));
  return { ...roster, speakers };
}

/** Whether an account carries more than one speaker at a moment of the session. */
export function sharedAt(roster: Roster, tracks: readonly TrackSwitch[] | undefined): (account: string, offsetMs: number) => boolean {
  const epochs = trackEpochs(tracks).map((at) => ({ at, shared: new Set(sharedAccounts(rosterAt(roster, tracks, at)).keys()) }));
  return (account, offsetMs) => (epochs.findLast((e) => e.at <= offsetMs) ?? epochs[0]!).shared.has(account);
}

/** Accounts with more than one speaker on them at some point of the session. */
export function sharedAnyTime(roster: Roster, tracks: readonly TrackSwitch[] | undefined): Set<string> {
  return new Set(trackEpochs(tracks).flatMap((at) => [...sharedAccounts(rosterAt(roster, tracks, at)).keys()]));
}

/** Account → name, for Discord accounts with exactly one speaker. */
export function speakerNames(roster: Pick<Config, 'speakers'>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [account, ids] of speakersByAccount(roster)) if (ids.length === 1) out[account] = roster.speakers[ids[0]!]!.name;
  return out;
}

/**
 * Accounts with more than one speaker on them, and who those speakers are. In a campaign session
 * a speaker who plays a character there is labelled by the character.
 */
export function sharedAccounts(roster: Roster, campaign?: Campaign): Map<string, SharedIdentity[]> {
  const out = new Map<string, SharedIdentity[]>();
  for (const [account, ids] of speakersByAccount(roster)) {
    if (ids.length < 2) continue;
    out.set(
      account,
      ids.map((id) => {
        const s = roster.speakers[id]!;
        const plays = campaign?.characters.filter((c) => c.speaker?.id === id) ?? [];
        const about = s.description ? ` — ${s.description}` : '';
        if (!plays.length) return { label: s.name, description: `${s.name}${about}` };
        const label = plays.map((c) => c.label).join(' / ');
        return { label, player: s.name, description: `${plays.map((c) => c.description).join('; ')} (played by ${s.name}${s.description ? `, ${s.description}` : ''})` };
      }),
    );
  }
  return out;
}

function campaignOf(roster: Roster, id: string): Campaign {
  const c = roster.campaigns[id]!;
  return {
    id,
    name: c.name,
    ...(c.context ? { context: c.context } : {}),
    ...(c.dndbeyond ? { dndbeyond: c.dndbeyond } : {}),
    channels: c.channels,
    characters: Object.entries(roster.characters)
      .filter(([, ch]) => ch.campaign === id)
      .map(([chId, ch]) => {
        const player = ch.speaker ? roster.speakers[ch.speaker] : undefined;
        return {
          id: chId,
          label: ch.name,
          description: ch.description ? `${ch.name} — ${ch.description}` : ch.name,
          ...(ch.dndbeyond ? { dndbeyond: ch.dndbeyond } : {}),
          ...(player && ch.speaker ? { speaker: { id: ch.speaker, name: player.name } } : {}),
        };
      }),
  };
}

/** The campaign that is the default for a voice channel, if any. */
export function campaignForChannel(roster: Roster, channelId: string | undefined): string | undefined {
  if (!channelId) return undefined;
  return Object.keys(roster.campaigns).find((id) => roster.campaigns[id]!.channels.includes(channelId));
}

/**
 * The campaign a session belongs to: the one picked for it (when recording or afterwards), else
 * the default for its voice channel. Sessions without either (Craig imports) use the only
 * campaign when exactly one is set up. Sessions from before 0.5 stored the voice channel as their
 * campaign; that still finds it.
 */
export function campaignFor(roster: Roster, session: Pick<SessionInfo, 'channelId' | 'campaign'>): Campaign | undefined {
  const ids = Object.keys(roster.campaigns);
  const picked = session.campaign ? (roster.campaigns[session.campaign] ? session.campaign : campaignForChannel(roster, session.campaign)) : undefined;
  const id = picked ?? campaignForChannel(roster, session.channelId) ?? (!session.channelId && ids.length === 1 ? ids[0] : undefined);
  return id ? campaignOf(roster, id) : undefined;
}

/**
 * Account → character name(s) in this campaign, for accounts with exactly one speaker (lines on a
 * shared account get theirs when they're labelled).
 */
export function charactersByAccount(roster: Roster, campaign: Campaign): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [account, ids] of speakersByAccount(roster)) {
    if (ids.length !== 1) continue;
    const plays = campaign.characters.filter((c) => c.speaker?.id === ids[0]);
    if (plays.length) out[account] = plays.map((c) => c.label).join(' / ');
  }
  return out;
}

/** "- Thorin — dwarf fighter (played by Sam)" per character in the campaign. */
export function partyBlock(campaign: Campaign): string {
  return campaign.characters.map((c) => `- ${c.description}${c.speaker ? ` (played by ${c.speaker.name})` : ''}`).join('\n');
}

/** "- Rees — DM" for speakers heard in the session who play no character in the campaign. */
export function othersBlock(roster: Roster, campaign: Campaign | undefined, accounts: ReadonlySet<string>): string {
  const players = new Set(campaign?.characters.map((c) => c.speaker?.id));
  return Object.entries(roster.speakers)
    .filter(([id, s]) => !players.has(id) && s.discord.some((a) => accounts.has(a)))
    .map(([, s]) => `- ${s.name}${s.description ? ` — ${s.description}` : ''}`)
    .join('\n');
}

/** Who spoke in this session on a Discord account that no speaker is linked to. */
export function unpairedSpeakers(roster: Pick<Config, 'speakers'>, lines: readonly TranscriptLine[]): UnpairedSpeaker[] {
  const known = speakersByAccount(roster);
  const out = new Map<string, UnpairedSpeaker>();
  for (const l of lines) {
    if (known.has(l.userId) || out.has(l.userId)) continue;
    out.set(l.userId, { userId: l.userId, name: l.player ?? l.inferred?.account ?? l.speaker });
  }
  return [...out.values()];
}
