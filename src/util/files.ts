import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, rmSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';

let counter = 0;

/**
 * Writes a file so a crash or power cut mid-write never leaves half of it (#38): the data goes to
 * a temporary file next to it, is flushed to disk, then renamed over the original in one step.
 * Readers see the old file or the new one, never a mix.
 */
export function writeFileAtomic(path: string, data: string | Uint8Array, opts: { mode?: number } = {}): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${++counter}.tmp`;
  try {
    const fd = openSync(tmp, 'w', opts.mode ?? 0o644);
    try {
      writeSync(fd, typeof data === 'string' ? Buffer.from(data, 'utf8') : data);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, path);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}

/** A file that exists but can't be read as what it should be (cut off, or not JSON). */
export class DamagedFileError extends Error {
  constructor(
    readonly path: string,
    cause: unknown,
  ) {
    super(`${path} is damaged: ${(cause as Error).message}`);
  }
}
