import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { DamagedFileError, writeFileAtomic } from '../util/files.js';
import { join } from 'node:path';
import type { Participant, SessionInfo } from '../shared/types.js';

/**
 * The on-disk session folder is the contract between phases (recording → transcription →
 * transcript → summary → publish). Everything downstream of recording reads only this.
 */
export const paths = {
  session: (dir: string) => join(dir, 'session.json'),
  participants: (dir: string) => join(dir, 'participants.json'),
  audioDir: (dir: string) => join(dir, 'audio'),
  utterances: (dir: string) => join(dir, 'utterances.jsonl'),
  batchesDir: (dir: string) => join(dir, 'transcription', 'batches'),
  rawDir: (dir: string) => join(dir, 'transcription', 'raw'),
  speakerTranscript: (dir: string, userId: string) => join(dir, 'transcripts', `${userId}.json`),
  transcriptsDir: (dir: string) => join(dir, 'transcripts'),
  segments: (dir: string) => join(dir, 'segments.json'),
  transcript: (dir: string) => join(dir, 'transcript.md'),
  /** Same as segments.json / transcript.md, with shared accounts relabelled per speaker. */
  disambiguatedSegments: (dir: string) => join(dir, 'segments.speakers.json'),
  disambiguatedTranscript: (dir: string) => join(dir, 'transcript.speakers.md'),
  /** Same again after Claude's clean-up pass (misheard words fixed, filler dropped). */
  cleanSegments: (dir: string) => join(dir, 'segments.clean.json'),
  cleanTranscript: (dir: string) => join(dir, 'transcript.clean.md'),
  /** Lines transcribed during the recording (a preview; transcript.md is the reference). */
  live: (dir: string) => join(dir, 'live.jsonl'),
  /** Dice rolled with /roll during the recording; the transcript shows them in place. */
  rolls: (dir: string) => join(dir, 'rolls.jsonl'),
};

/** One /roll during a recording (a line of rolls.jsonl). */
export interface RollNote {
  userId: string;
  /** Epoch ms. */
  at: number;
  /** Plain text, e.g. "Longsword: 1d20+5 = 22 (natural 20)". */
  text: string;
}

/** The rolls noted during a recording; a damaged line is skipped (the file is append-only). */
export function readRolls(sessionDir: string): RollNote[] {
  const file = paths.rolls(sessionDir);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .flatMap((line) => {
      try {
        return line.trim() ? [JSON.parse(line) as RollNote] : [];
      } catch {
        return [];
      }
    });
}

export type { Participant, SessionInfo } from '../shared/types.js';

export interface UtteranceFile {
  userId: string;
  /** Epoch ms of the utterance's first packet (from the filename). */
  startMs: number;
  path: string;
}

/** A JSON file, or undefined if there's none. Throws DamagedFileError if it can't be parsed. */
export function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (err) {
    throw new DamagedFileError(path, err);
  }
}

/**
 * For code that goes through every session or saved encounter (the list, startup recovery,
 * retention, past fights): one damaged file is reported and skipped instead of failing all of
 * them. Other errors still throw.
 */
export function skipDamaged<T>(what: string, read: () => T): T | undefined {
  try {
    return read();
  } catch (err) {
    if (!(err instanceof DamagedFileError)) throw err;
    console.warn(`Skipping ${what}: ${err.message}`);
    return undefined;
  }
}

/** Saves JSON atomically: a crash mid-write leaves the old file, never half of the new one. */
export function writeJson(path: string, value: unknown): void {
  writeFileAtomic(path, JSON.stringify(value, null, 2) + '\n');
}

/**
 * Lists utterance audio by scanning audio/<userId>/<startEpochMs>.ogg. Filenames are the source
 * of truth, so a session that crashed before writing its indexes is still fully recoverable.
 */
export function listUtterances(sessionDir: string): UtteranceFile[] {
  const audioDir = paths.audioDir(sessionDir);
  if (!existsSync(audioDir)) return [];
  const out: UtteranceFile[] = [];
  for (const userId of readdirSync(audioDir)) {
    if (!/^[\w-]+$/.test(userId)) continue;
    for (const name of readdirSync(join(audioDir, userId))) {
      const m = /^(\d+)\.ogg$/.exec(name);
      if (m) out.push({ userId, startMs: Number(m[1]), path: join(audioDir, userId, name) });
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs || a.userId.localeCompare(b.userId));
}

export function readSessionInfo(sessionDir: string): SessionInfo {
  let info: SessionInfo | undefined;
  try {
    info = readJson<SessionInfo>(paths.session(sessionDir));
  } catch (err) {
    // A session.json cut off by a crash: say so, and rebuild what we can from the audio.
    console.warn(`${(err as Error).message}; using the audio's times instead`);
  }
  if (info) return info;
  // Older/crashed sessions: derive from the audio.
  const first = listUtterances(sessionDir)[0];
  return { id: sessionDir.split(/[\\/]/).filter(Boolean).at(-1) ?? 'session', startedAt: first?.startMs ?? Date.now() };
}

/** Who spoke, by Discord ID. A file damaged by a crash reads as empty (names fall back to IDs), with a warning. */
export function readParticipants(sessionDir: string): Record<string, Participant> {
  try {
    return readJson<Record<string, Participant>>(paths.participants(sessionDir)) ?? {};
  } catch (err) {
    console.warn(`${(err as Error).message}; showing Discord IDs instead of names`);
    return {};
  }
}
