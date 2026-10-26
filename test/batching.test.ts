import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planBatches } from '../src/transcription/batching.js';

const clip = (startMs: number, durationSec: number) => ({ file: `${startMs}.ogg`, startMs, durationSec });

test('packs clips in time order with a gap between them', () => {
  const [b] = planBatches('u', [clip(5000, 2), clip(1000, 3)], 600);
  assert.ok(b);
  assert.deepEqual(b.clips.map((c) => [c.startMs, c.offsetSec]), [[1000, 0], [5000, 4]]);
  assert.equal(b.durationSec, 6);
});

test('starts a new batch when the limit would be exceeded', () => {
  const batches = planBatches('u', [clip(0, 4), clip(10_000, 4), clip(20_000, 4)], 9);
  assert.deepEqual(batches.map((b) => b.clips.length), [2, 1]);
  assert.deepEqual(batches.map((b) => b.index), [0, 1]);
  assert.equal(batches[1]!.clips[0]!.offsetSec, 0);
});

test('a single clip longer than the limit still gets its own batch', () => {
  const batches = planBatches('u', [clip(0, 2), clip(5000, 50), clip(90_000, 2)], 10);
  assert.deepEqual(batches.map((b) => b.clips.length), [1, 1, 1]);
});

test('rendering a batch in one ffmpeg run lays clips out exactly as decoding them one by one did (#41)', async (t) => {
  const { spawnSync } = await import('node:child_process');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { decodeToPcm16k, PCM_RATE } = await import('../src/audio/decode.js');
  const { renderBatchPcm } = await import('../src/transcription/batching.js');
  const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';
  if (spawnSync(ffmpeg, ['-version']).status !== 0) return t.skip('no ffmpeg');

  // 70 short Opus clips (over the 64-per-run limit), stereo 48 kHz like Discord's.
  const dir = mkdtempSync(join(tmpdir(), 'batch-'));
  const clips = Array.from({ length: 70 }, (_, i) => {
    const file = join(dir, `${i}.ogg`);
    const sec = 0.3 + (i % 5) * 0.1;
    spawnSync(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${200 + i * 10}:duration=${sec}:sample_rate=48000`, '-ac', '2', '-c:a', 'libopus', file]);
    return { file, startMs: i * 2000, durationSec: sec };
  });
  const [plan] = planBatches('u', clips, 600);

  // The old way: one ffmpeg per clip, copied in at its offset.
  const before = new Int16Array(Math.ceil(plan!.durationSec * PCM_RATE));
  for (const clip of plan!.clips) {
    const pcm = await decodeToPcm16k(clip.file);
    const start = Math.round(clip.offsetSec * PCM_RATE);
    before.set(pcm.subarray(0, Math.max(0, Math.min(pcm.length, Math.round(clip.durationSec * PCM_RATE), before.length - start))), start);
  }
  const after = await renderBatchPcm(plan!);
  assert.equal(after.length, before.length);
  let worst = 0;
  for (let i = 0; i < before.length; i++) worst = Math.max(worst, Math.abs(before[i]! - after[i]!));
  assert.ok(worst <= 2, `samples differ by up to ${worst}`);
});
