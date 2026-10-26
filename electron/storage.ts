import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Where the Mac app keeps its data, and the name it runs under (Electron names the Keychain entry
 * that encrypts the saved keys after the app's name, so the two go together).
 *
 * - Up to 0.4.0 the app ran as "discord-session-bot" (its package name): data in
 *   ~/Library/Application Support/discord-session-bot.
 * - 0.4.1 to 0.6.0 ran as "Session Bot" by mistake, so an updated app started empty there.
 * - New installs run as "Scrying Eye".
 *
 * The oldest folder that has data wins (it holds the original keys and sessions), and anything
 * recorded in the mistaken folder meanwhile is moved into it, once.
 */
export const LEGACY_NAME = 'discord-session-bot';
export const MISTAKEN_NAME = 'Session Bot';
export const FRESH_NAME = 'Scrying Eye';

export interface StorageChoice {
  name: string;
  dir: string;
  /** A folder whose newer sessions and settings should be moved into `dir`. */
  mergeFrom?: string;
}

/** Whether a folder holds this app's data (not just an empty folder Electron made). */
export function hasAppData(dir: string): boolean {
  return ['config.yaml', 'secrets.bin', 'data'].some((f) => existsSync(join(dir, f)));
}

export function chooseStorage(appData: string, has: (dir: string) => boolean = hasAppData): StorageChoice {
  const legacy = join(appData, LEGACY_NAME);
  const mistaken = join(appData, MISTAKEN_NAME);
  if (has(legacy)) return { name: LEGACY_NAME, dir: legacy, ...(has(mistaken) ? { mergeFrom: mistaken } : {}) };
  if (has(mistaken)) return { name: MISTAKEN_NAME, dir: mistaken };
  return { name: FRESH_NAME, dir: join(appData, FRESH_NAME) };
}

/** Never moved: tied to the other folder's Keychain entry, or only meaningful there. */
const KEEP = new Set(['secrets.bin', 'launched-version', 'updates', 'Cache', 'Code Cache', 'GPUCache', 'Partitions', 'Local Storage', 'Session Storage', 'blob_storage', 'Crashpad']);

/**
 * Moves what `from` has and `to` doesn't: whole sessions, music, encounters and settings files. A
 * session or file both have stays as `to` has it. Then `from` is renamed so this happens once.
 * Returns what was moved, for the log.
 */
export function mergeStorage(from: string, to: string, now = new Date()): string[] {
  const moved: string[] = [];
  const moveMissing = (src: string, dst: string, depth: number) => {
    if (!existsSync(src)) return;
    mkdirSync(dst, { recursive: true });
    for (const name of readdirSync(src)) {
      if (depth === 0 && KEEP.has(name)) continue;
      const s = join(src, name);
      const d = join(dst, name);
      if (!existsSync(d)) {
        renameSync(s, d);
        moved.push(d);
      } else if (depth < 2 && statSync(s).isDirectory() && statSync(d).isDirectory()) {
        // data/, then data/sessions/: merge one level in, so each session moves whole.
        moveMissing(s, d, depth + 1);
      }
    }
  };
  moveMissing(from, to, 0);
  renameSync(from, `${from} (merged ${now.toISOString().slice(0, 10)})`);
  return moved;
}
