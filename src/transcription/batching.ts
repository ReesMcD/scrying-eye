import { spawn } from 'node:child_process';
import { PCM_RATE } from '../audio/decode.js';

export interface Clip {
  /** Absolute path to the utterance file. */
  file: string;
  /** Epoch ms when the utterance started. */
  startMs: number;
  durationSec: number;
}

export interface PlacedClip extends Clip {
  /** Where the clip starts inside the batch audio, in seconds. */
  offsetSec: number;
}

export interface BatchPlan {
  userId: string;
  index: number;
  clips: PlacedClip[];
  durationSec: number;
}

/** Silence inserted between utterances in a batch; gives Whisper a clean segment boundary. */
export const GAP_SEC = 1;

/**
 * Packs one speaker's utterances, in time order, into batches of at most `maxSec` of audio.
 * Sending batches instead of individual utterances avoids per-request minimum billing and
 * gives Whisper enough context to avoid hallucinating on very short clips.
 */
export function planBatches(userId: string, clips: readonly Clip[], maxSec: number, gapSec = GAP_SEC): BatchPlan[] {
  const sorted = [...clips].sort((a, b) => a.startMs - b.startMs);
  const batches: BatchPlan[] = [];
  let current: BatchPlan | undefined;
  for (const clip of sorted) {
    const needed = (current?.clips.length ? gapSec : 0) + clip.durationSec;
    if (!current || (current.clips.length > 0 && current.durationSec + needed > maxSec)) {
      current = { userId, index: batches.length, clips: [], durationSec: 0 };
      batches.push(current);
    }
    const offsetSec = current.clips.length ? current.durationSec + gapSec : 0;
    current.clips.push({ ...clip, offsetSec });
    current.durationSec = offsetSec + clip.durationSec;
  }
  return batches;
}

/** Clips decoded per ffmpeg run: few processes, but well under macOS's default open-file limit (256). */
const CLIPS_PER_RUN = 64;

/**
 * Decodes a batch's clips and lays them out on one 16 kHz mono timeline at their planned offsets.
 * One ffmpeg run decodes many clips at once (#41): starting a process per clip cost about two
 * minutes per game. Each clip is cut to its planned length and padded with silence to where the
 * next one starts, so the layout matches the plan sample for sample.
 */
export async function renderBatchPcm(plan: BatchPlan, ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg'): Promise<Int16Array> {
  const total = Math.ceil(plan.durationSec * PCM_RATE);
  const out = new Int16Array(total);
  const starts = plan.clips.map((c) => Math.min(total, Math.round(c.offsetSec * PCM_RATE)));
  const runs: number[] = [];
  for (let first = 0; first < plan.clips.length; first += CLIPS_PER_RUN) runs.push(first);
  // A few runs at once: ffmpeg spends much of its time opening inputs, which overlaps well.
  await mapLimit(runs, PARALLEL_RUNS, async (first) => {
    const clips = plan.clips.slice(first, first + CLIPS_PER_RUN);
    const runStart = starts[first]!;
    const runEnd = first + clips.length < plan.clips.length ? starts[first + clips.length]! : total;
    const filters = clips.map((clip, i) => {
      const start = starts[first + i]!;
      const slot = (i + 1 < clips.length ? starts[first + i + 1]! : runEnd) - start;
      const length = Math.max(0, Math.min(Math.round(clip.durationSec * PCM_RATE), slot));
      return `[${i}:a]aformat=sample_fmts=s16:channel_layouts=mono:sample_rates=${PCM_RATE},atrim=end_sample=${length},apad=whole_len=${slot}[c${i}]`;
    });
    const graph = `${filters.join(';')};${clips.map((_, i) => `[c${i}]`).join('')}concat=n=${clips.length}:v=0:a=1[out]`;
    // Utterances are always Ogg Opus written by this app (or Craig's), so skip probing each one.
    const input = (file: string) => (/\.ogg$/i.test(file) ? ['-f', 'ogg', '-probesize', '4096', '-analyzeduration', '0', '-i', file] : ['-i', file]);
    const pcm = await runFfmpeg(ffmpegPath, [...clips.flatMap((c) => input(c.file)), '-filter_complex', graph, '-map', '[out]', '-f', 's16le', '-ac', '1', '-ar', String(PCM_RATE), 'pipe:1']);
    out.set(pcm.subarray(0, Math.max(0, Math.min(pcm.length, runEnd - runStart, total - runStart))), runStart);
  });
  return out;
}

const PARALLEL_RUNS = 3;

async function mapLimit<T>(items: readonly T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await work(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function runFfmpeg(ffmpegPath: string, args: string[]): Promise<Int16Array> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ['-v', 'error', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    let stderr = '';
    proc.stdout.on('data', (c: Buffer) => chunks.push(c));
    proc.stderr.on('data', (c: Buffer) => (stderr += c.toString()));
    proc.once('error', reject);
    proc.once('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exited ${code} rendering a batch: ${stderr.trim().slice(-500)}`));
      const buf = Buffer.concat(chunks);
      resolve(new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 2)));
    });
  });
}

/** Encodes 16 kHz mono PCM to FLAC (lossless, ~half the size of WAV). */
export function encodeFlac(pcm: Int16Array, outFile: string, ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg'): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ['-v', 'error', '-y', '-f', 's16le', '-ar', String(PCM_RATE), '-ac', '1', '-i', 'pipe:0', '-c:a', 'flac', outFile], {
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    let stderr = '';
    proc.stderr.on('data', (c: Buffer) => (stderr += c.toString()));
    proc.once('error', reject);
    proc.once('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg flac encode failed (${code}): ${stderr.trim()}`))));
    proc.stdin.on('error', () => {}); // surfaced via close code
    proc.stdin.end(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
  });
}
