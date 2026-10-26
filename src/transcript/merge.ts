import { readdirSync, existsSync } from 'node:fs';
import { writeFileAtomic } from '../util/files.js';
import { join } from 'node:path';
import { campaignFor, charactersByAccount, rosterAt, sharedAt, speakerNames, trackEpochs } from '../config/roster.js';
import type { Config } from '../config/schema.js';
import { paths, readJson, readParticipants, readRolls, readSessionInfo, writeJson, type Participant, type RollNote, type SessionInfo } from '../session/layout.js';
import type { SpeakerTranscript } from '../transcription/transcribeSession.js';
import type { SpeakerSegment } from '../transcription/remap.js';
import type { TranscriptLine } from '../shared/types.js';

export type { TranscriptLine };

/** Transcript name for a user: config alias → Discord display name at recording time → raw ID. */
export function speakerName(userId: string, aliases: Record<string, string>, participants: Record<string, Participant>): string {
  return aliases[userId] ?? participants[userId]?.displayName ?? userId;
}

/**
 * How a line's speaker is written in transcripts: inferred speakers carry their confidence, e.g.
 * "Hamqueef (?)" for a low-confidence guess or "Rees (unclear)" when Claude couldn't tell.
 */
export function displaySpeaker(line: Pick<TranscriptLine, 'speaker' | 'inferred'>): string {
  if (line.inferred?.confidence === 'low') return `${line.speaker} (?)`;
  if (line.inferred?.confidence === 'unclear') return `${line.speaker} (unclear)`;
  return line.speaker;
}

export function formatOffset(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

export interface JoinOptions {
  mergeGapMs: number;
  maxLineMs: number;
  /** Lines never joined to another (on a shared account, so each can be relabelled). */
  keepApart?: (line: Pick<TranscriptLine, 'userId' | 'offsetMs'>) => boolean;
}

export interface Naming {
  aliases: Record<string, string>;
  participants: Record<string, Participant>;
  /** userId → character name, for campaign sessions: lines are named by character. */
  characters?: Record<string, string>;
}

/** How a line on an account is named: its character (with the person as `player`), else the person. */
export type NameFor = (userId: string, offsetMs: number) => Pick<TranscriptLine, 'speaker' | 'player'>;

export function namer(n: Naming): NameFor {
  return (userId) => {
    const person = speakerName(userId, n.aliases, n.participants);
    const character = n.characters?.[userId];
    return { speaker: character ?? person, ...(character && character !== person ? { player: person } : {}) };
  };
}

export interface MergeOptions extends JoinOptions {
  sessionStartMs: number;
  nameFor: NameFor;
}

/** Joins consecutive lines from the same speaker when the pause is short. Input must be time-ordered. */
export function joinLines(lines: readonly TranscriptLine[], opts: JoinOptions): TranscriptLine[] {
  const out: TranscriptLine[] = [];
  for (const line of lines) {
    const prev = out.at(-1);
    if (
      prev &&
      prev.userId === line.userId &&
      prev.speaker === line.speaker &&
      prev.inferred?.confidence === line.inferred?.confidence &&
      !opts.keepApart?.(prev) &&
      !opts.keepApart?.(line) &&
      line.startMs - prev.endMs <= opts.mergeGapMs &&
      line.endMs - prev.startMs <= opts.maxLineMs
    ) {
      prev.text = `${prev.text} ${line.text}`;
      prev.endMs = Math.max(prev.endMs, line.endMs);
      continue;
    }
    out.push({ ...line });
  }
  return out;
}

/**
 * Interleaves every speaker's segments chronologically, joining consecutive segments from the
 * same speaker when the pause is short, so the transcript reads as turns rather than fragments.
 */
export function mergeSegments(bySpeaker: ReadonlyMap<string, readonly SpeakerSegment[]>, opts: MergeOptions): TranscriptLine[] {
  const all = [...bySpeaker].flatMap(([userId, segs]) => segs.map((s) => ({ userId, ...s })));
  all.sort((a, b) => a.startMs - b.startMs || a.userId.localeCompare(b.userId));

  const lines: TranscriptLine[] = all
    .filter((seg) => seg.text.trim())
    .map((seg): TranscriptLine => {
      const offsetMs = seg.startMs - opts.sessionStartMs;
      return { userId: seg.userId, ...opts.nameFor(seg.userId, offsetMs), offsetMs, startMs: seg.startMs, endMs: seg.endMs, text: seg.text.trim() };
    });
  return joinLines(lines, opts);
}

/** Puts /roll results among the spoken lines, named like the roller's speech: "[roll] Longsword: 1d20+5 = 22". */
export function withRolls(lines: readonly TranscriptLine[], rolls: readonly RollNote[], sessionStartMs: number, nameFor: NameFor): TranscriptLine[] {
  if (!rolls.length) return [...lines];
  const rollLines = rolls.map((r): TranscriptLine => {
    const offsetMs = r.at - sessionStartMs;
    return { userId: r.userId, ...nameFor(r.userId, offsetMs), offsetMs, startMs: r.at, endMs: r.at, text: `[roll] ${r.text}` };
  });
  return [...lines, ...rollLines].sort((a, b) => a.startMs - b.startMs);
}

/**
 * How a session's lines are named: by the settings, and where the session says who was on an
 * account from some time on (#71), by who was on it at the line's time.
 */
export function sessionNamer(config: Config, session: SessionInfo, participants: Record<string, Participant>): NameFor {
  const campaign = campaignFor(config, session);
  const epochs = trackEpochs(session.tracks).map((fromMs) => {
    const roster = rosterAt(config, session.tracks, fromMs);
    return { fromMs, name: namer({ aliases: speakerNames(roster), participants, ...(campaign ? { characters: charactersByAccount(roster, campaign) } : {}) }) };
  });
  return (userId, offsetMs) => (epochs.findLast((e) => e.fromMs <= offsetMs) ?? epochs[0]!).name(userId, offsetMs);
}

/** Lines on an account while it's shared stay apart, so each can be given to whoever said it. */
export function keepSharedApart(config: Config, session: SessionInfo): MergeOptions['keepApart'] {
  const shared = sharedAt(config, session.tracks);
  return (line) => shared(line.userId, line.offsetMs);
}

function formatDate(ms: number, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(ms);
}

export function renderMarkdown(session: SessionInfo, lines: readonly TranscriptLine[], timeZone?: string): string {
  const endMs = session.stoppedAt ?? lines.reduce((m, l) => Math.max(m, l.endMs), session.startedAt);
  const speakers = [...new Set(lines.filter((l) => l.inferred?.confidence !== 'unclear').map((l) => (l.player ? `${l.speaker} (${l.player})` : l.speaker)))];
  const header = [
    `# Transcript: ${session.id}`,
    '',
    `- **Date:** ${formatDate(session.startedAt, timeZone)}`,
    `- **Duration:** ${formatOffset(endMs - session.startedAt)}`,
    ...(session.channelName ? [`- **Channel:** #${session.channelName}${session.guildName ? ` (${session.guildName})` : ''}`] : []),
    `- **Speakers:** ${speakers.join(', ') || 'none'}`,
    '',
    '---',
    '',
  ];
  const body = lines.map((l) => `[${formatOffset(l.offsetMs)}] ${displaySpeaker(l)}: ${l.text}`);
  return [...header, ...body, ''].join('\n');
}

export interface MergeResult {
  lines: number;
  speakers: number;
  file: string;
}

/** Reads transcripts/*.json and writes segments.json + transcript.md. */
export function mergeSession(sessionDir: string, config: Config): MergeResult {
  const dir = paths.transcriptsDir(sessionDir);
  if (!existsSync(dir)) throw new Error(`No transcripts in ${sessionDir}; run transcribe first`);
  const bySpeaker = new Map<string, SpeakerSegment[]>();
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const t = readJson<SpeakerTranscript>(join(dir, name));
    if (t) bySpeaker.set(t.userId, t.segments);
  }
  const session = readSessionInfo(sessionDir);
  const nameFor = sessionNamer(config, session, readParticipants(sessionDir));
  const spoken = mergeSegments(bySpeaker, {
    sessionStartMs: session.startedAt,
    nameFor,
    mergeGapMs: config.transcript.merge_gap_seconds * 1000,
    maxLineMs: config.transcript.max_line_seconds * 1000,
    keepApart: keepSharedApart(config, session),
  });
  const lines = withRolls(spoken, readRolls(sessionDir), session.startedAt, nameFor);
  writeJson(paths.segments(sessionDir), { session, lines });
  const file = paths.transcript(sessionDir);
  writeFileAtomic(file, renderMarkdown(session, lines, config.transcript.timezone));
  return { lines: lines.length, speakers: new Set(lines.map((l) => l.userId)).size, file };
}
