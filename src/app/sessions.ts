import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { listUtterances, paths, readJson, readParticipants, readSessionInfo, skipDamaged, writeJson, type SessionInfo } from '../session/layout.js';
import { sessionTitle } from '../session/title.js';
import { campaignFor } from '../config/roster.js';
import { configSchema } from '../config/schema.js';
import type { TranscriptLine } from '../transcript/merge.js';
import { readEditState, recapState } from '../summary/recapEdits.js';
import { uploadStatus } from '../upload/recapUpload.js';
import { summaryPaths, type SummaryMeta } from '../summary/summarizeSession.js';
import type { DiscordAccount, GuildInfo, SessionDetail, SessionSummary, TrackSwitch } from '../shared/types.js';
import type { Config } from '../config/schema.js';
import { DamagedFileError } from '../util/files.js';
import { pendingUnpaired } from './unpaired.js';

export type { DiscordAccount, SessionDetail, SessionSummary };

const SESSION_ID = /^[\w.-]+$/;

export function sessionsRoot(dataDir: string): string {
  return join(dataDir, 'sessions');
}

/** Resolves a session id to its folder, refusing anything that could escape the sessions root. */
export function sessionDirFor(dataDir: string, id: string): string | undefined {
  if (!SESSION_ID.test(id) || id === '.' || id === '..') return undefined;
  const dir = join(sessionsRoot(dataDir), id);
  return existsSync(dir) && statSync(dir).isDirectory() ? dir : undefined;
}

function segmentsOf(dir: string, file: string): { session?: SessionInfo; lines: TranscriptLine[] } {
  return readJson<{ session?: SessionInfo; lines: TranscriptLine[] }>(file) ?? { lines: [] };
}

/** Settings to name sessions by; the defaults while config.yaml has an error. */
const settings = (config: Config | null) => config ?? configSchema.parse({});

interface SessionStats {
  speakers: string[];
  utterances: number;
}
const statsCache = new Map<string, { stamp: string; stats: SessionStats }>();

/** Size and modification time of the files the stats come from: if none changed, neither did they. */
function statsStamp(dir: string): string {
  const one = (path: string) => {
    try {
      const st = statSync(path);
      return `${st.size}:${st.mtimeMs}`;
    } catch {
      return '-';
    }
  };
  return [paths.segments(dir), paths.utterances(dir), paths.participants(dir), paths.audioDir(dir)].map(one).join('|');
}

/**
 * Who spoke and how many clips, for the session list (#39). Working these out reads the whole
 * transcript and lists every audio file, so they're kept until one of those files changes: the
 * list then costs a few stats per session instead.
 */
function sessionStats(dir: string): SessionStats {
  const stamp = statsStamp(dir);
  const cached = statsCache.get(dir);
  if (cached?.stamp === stamp) return cached.stats;
  const participants = readParticipants(dir);
  const utterances = listUtterances(dir);
  const lines = segmentsOf(dir, paths.segments(dir)).lines;
  const speakers = lines.length ? [...new Set(lines.map((l) => l.speaker))] : [...new Set(utterances.map((u) => participants[u.userId]?.displayName ?? u.userId))];
  const stats = { speakers, utterances: utterances.length };
  statsCache.set(dir, { stamp, stats });
  return stats;
}

export function describeSession(dataDir: string, id: string, config: Config | null = null): SessionSummary | undefined {
  const dir = sessionDirFor(dataDir, id);
  if (!dir) return undefined;
  const info = readSessionInfo(dir) as SessionInfo & { source?: string; interrupted?: boolean };
  const cfg = settings(config);
  const campaign = campaignFor(cfg, info);
  const { speakers, utterances } = sessionStats(dir);
  return {
    id,
    title: sessionTitle(info, cfg),
    customTitle: !!info.title?.trim(),
    campaign: campaign ? { key: campaign.id, name: campaign.name, picked: !!info.campaign } : null,
    startedAt: info.startedAt,
    ...(info.stoppedAt ? { stoppedAt: info.stoppedAt } : {}),
    ...(info.channelName ? { channelName: info.channelName } : {}),
    ...(info.guildName ? { guildName: info.guildName } : {}),
    ...(info.source ? { source: info.source } : {}),
    ...(info.interrupted ? { interrupted: true } : {}),
    ...(info.audioDeletedAt ? { audioDeletedAt: info.audioDeletedAt } : {}),
    speakers,
    utterances,
    has: {
      audio: utterances > 0,
      transcript: existsSync(paths.transcript(dir)),
      speakerLabels: existsSync(paths.disambiguatedTranscript(dir)),
      summary: existsSync(summaryPaths.markdown(dir)),
    },
  };
}

export function listSessions(dataDir: string, config: Config | null = null): SessionSummary[] {
  const root = sessionsRoot(dataDir);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .map((id) => skipDamaged(`session ${id}`, () => describeSession(dataDir, id, config)))
    .filter((s): s is SessionSummary => !!s)
    .sort((a, b) => b.startedAt - a.startedAt);
}

export function sessionDetail(dataDir: string, id: string, config: Config | null = null): SessionDetail | undefined {
  const base = describeSession(dataDir, id, config);
  const dir = sessionDirFor(dataDir, id);
  if (!base || !dir) return undefined;
  const summaryFile = summaryPaths.markdown(dir);
  return {
    ...base,
    participants: readParticipants(dir),
    tracks: readSessionInfo(dir).tracks ?? [],
    lines: segmentsOf(dir, paths.segments(dir)).lines,
    speakerLines: existsSync(paths.disambiguatedSegments(dir)) ? segmentsOf(dir, paths.disambiguatedSegments(dir)).lines : null,
    summary: existsSync(summaryFile) ? readFileSync(summaryFile, 'utf8') : null,
    summaryMeta: readJson<SummaryMeta>(summaryPaths.meta(dir)) ?? null,
    recapState: recapState(dir),
    editedAt: readEditState(dir)?.editedAt ?? null,
    upload: uploadStatus(dir),
    uploadTo: config?.upload.url ? new URL(config.upload.url).host : null,
    unpaired: pendingUnpaired(dir, config),
  };
}

const MAX_SWITCHES = 100;

/** Who's-on-which-account changes sent by the session page, checked: real speakers, sane times, one entry per account and time. */
export function readTracks(raw: unknown, config: Config | null): TrackSwitch[] {
  if (!Array.isArray(raw) || raw.length > MAX_SWITCHES) throw new Error(`Send up to ${MAX_SWITCHES} changes of who's on each account`);
  const speakers = settings(config).speakers;
  const byKey = new Map<string, TrackSwitch>();
  for (const t of raw as Array<Partial<TrackSwitch>>) {
    if (typeof t?.account !== 'string' || !t.account || t.account.length > 40) throw new Error('Each change needs the Discord account');
    if (typeof t.fromMs !== 'number' || !Number.isInteger(t.fromMs) || t.fromMs < 0 || t.fromMs > 48 * 3_600_000) throw new Error('A change needs a time within the session');
    if (!Array.isArray(t.speakers) || t.speakers.some((id) => typeof id !== 'string' || !speakers[id])) throw new Error('No such speaker');
    byKey.set(`${t.account}@${t.fromMs}`, { account: t.account, fromMs: t.fromMs, speakers: [...new Set(t.speakers as string[])] });
  }
  return [...byKey.values()].sort((a, b) => a.account.localeCompare(b.account) || a.fromMs - b.fromMs);
}

/**
 * Renames a session, picks its campaign, or says who was on which account, after the fact. null
 * puts the name back to the sessions.title template and the campaign to the voice channel's
 * default; an empty `tracks` puts the settings back. The folder (and id) never change.
 */
export function updateSession(dir: string, change: { title?: string | null; campaign?: string | null; tracks?: TrackSwitch[] }, config: Config | null): void {
  // Never write over a damaged session.json: what's still in it could be recovered by hand.
  if (existsSync(paths.session(dir))) {
    try {
      readJson(paths.session(dir));
    } catch (err) {
      if (err instanceof DamagedFileError) throw new Error(`This session's session.json is damaged, so it can't be changed here. ${err.message}`);
      throw err;
    }
  }
  const info = readSessionInfo(dir);
  const next: SessionInfo = { ...info };
  if (change.title !== undefined) {
    const title = change.title?.trim().slice(0, 120);
    if (title) next.title = title;
    else delete next.title;
  }
  if (change.campaign !== undefined) {
    if (change.campaign && !settings(config).campaigns[change.campaign]) throw new Error('No such campaign');
    if (change.campaign) next.campaign = change.campaign;
    else delete next.campaign;
  }
  if (change.tracks !== undefined) {
    if (change.tracks.length) next.tracks = change.tracks;
    else delete next.tracks;
  }
  writeJson(paths.session(dir), next);
}

const TRASH_DAYS = 30;
const trashRoot = (dataDir: string) => join(dataDir, 'trash');

/** Moves a session to <data>/trash; it's deleted for good after 30 days (see emptyTrash). */
export function trashSession(dataDir: string, id: string, now = Date.now()): void {
  const dir = sessionDirFor(dataDir, id);
  if (!dir) throw new Error('not found');
  mkdirSync(trashRoot(dataDir), { recursive: true });
  renameSync(dir, join(trashRoot(dataDir), `${now}--${id}`));
}

/** Deletes sessions trashed more than 30 days ago. Returns their ids. */
export function emptyTrash(dataDir: string, now = Date.now()): string[] {
  const root = trashRoot(dataDir);
  if (!existsSync(root)) return [];
  const gone: string[] = [];
  for (const name of readdirSync(root)) {
    const m = /^(\d+)--(.+)$/.exec(name);
    if (!m || now - Number(m[1]) < TRASH_DAYS * 86_400_000) continue;
    rmSync(join(root, name), { recursive: true, force: true });
    gone.push(m[2]!);
  }
  return gone;
}

/** Everyone seen in any session (from participants.json), for picking people by name in Settings. */
export function knownAccounts(dataDir: string, guilds: readonly GuildInfo[] = []): DiscordAccount[] {
  const root = sessionsRoot(dataDir);
  const accounts = new Map<string, DiscordAccount>();
  // Whoever is in a voice channel right now, so a new player can be linked before they've been recorded.
  for (const m of guilds.flatMap((g) => g.channels.flatMap((c) => c.members))) {
    if (!accounts.has(m.id)) accounts.set(m.id, { id: m.id, names: [m.name], sessions: 0, lastSeen: Date.now(), ...(m.bot ? { bot: true } : {}) });
  }
  if (!existsSync(root)) return [...accounts.values()];
  for (const id of readdirSync(root)) {
    const dir = sessionDirFor(dataDir, id);
    if (!dir) continue;
    const started = readSessionInfo(dir).startedAt;
    for (const [userId, p] of Object.entries(readParticipants(dir))) {
      const account = accounts.get(userId) ?? { id: userId, names: [], sessions: 0, lastSeen: 0 };
      for (const n of [p.displayName, p.username]) if (n && !account.names.includes(n)) account.names.push(n);
      account.sessions++;
      account.lastSeen = Math.max(account.lastSeen, started);
      accounts.set(userId, account);
    }
  }
  return [...accounts.values()].sort((a, b) => b.lastSeen - a.lastSeen);
}

/** Downloadable text outputs of a session. */
export const SESSION_FILES = {
  'transcript.md': (dir: string) => paths.transcript(dir),
  'transcript.speakers.md': (dir: string) => paths.disambiguatedTranscript(dir),
  'transcript.clean.md': (dir: string) => paths.cleanTranscript(dir),
  'summary.md': (dir: string) => summaryPaths.markdown(dir),
} as const;
