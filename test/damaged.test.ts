import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../src/app/startServer.js';
import { knownAccounts, listSessions } from '../src/app/sessions.js';
import { recoverInterrupted } from '../src/bot/BotService.js';
import { pruneOldAudio } from '../src/session/retention.js';
import { readJson, writeJson } from '../src/session/layout.js';
import { DamagedFileError, writeFileAtomic } from '../src/util/files.js';

/** A data folder with one good session and one whose session.json was cut off mid-write (#38). */
function dataWithDamage(): string {
  const data = mkdtempSync(join(tmpdir(), 'damaged-'));
  writeJson(join(data, 'sessions', 'good', 'session.json'), { id: 'good', startedAt: 1000, stoppedAt: 2000, source: 'bot' });
  writeJson(join(data, 'sessions', 'good', 'participants.json'), { '111111111111111111': { displayName: 'Sam' } });
  mkdirSync(join(data, 'sessions', 'cut-off'), { recursive: true });
  writeFileSync(join(data, 'sessions', 'cut-off', 'session.json'), '{"id": "cut-off", "startedA');
  writeFileSync(join(data, 'sessions', 'cut-off', 'participants.json'), '{"1111');
  mkdirSync(join(data, 'sessions', 'cut-off-2'), { recursive: true });
  writeFileSync(join(data, 'sessions', 'cut-off-2', 'segments.json'), '{"lines": [');
  return data;
}

test('a damaged file is named in the error; atomic writes leave no temporary files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atomic-'));
  writeFileSync(join(dir, 'bad.json'), '{');
  assert.throws(() => readJson(join(dir, 'bad.json')), (e: Error) => e instanceof DamagedFileError && e.message.includes('bad.json is damaged'));
  writeFileAtomic(join(dir, 'a', 'b.txt'), 'one');
  writeFileAtomic(join(dir, 'a', 'b.txt'), 'two');
  assert.deepEqual(readdirSync(join(dir, 'a')), ['b.txt']);
});

test('one damaged session doesn’t stop the app starting, the list, recovery, retention or the accounts', async () => {
  const data = dataWithDamage();
  assert.deepEqual(
    listSessions(data).map((s) => s.id),
    ['cut-off', 'good'],
    'the cut-off session.json is rebuilt from the audio; the cut-off segments.json is skipped',
  );
  assert.deepEqual(recoverInterrupted(data), []);
  assert.deepEqual(pruneOldAudio(data, 1, 10 * 86_400_000), []);
  assert.deepEqual(knownAccounts(data).map((a) => a.names), [['Sam']]);
  const server = await startServer({ password: 'pw-12345678', port: 0, host: '127.0.0.1', dataDir: data, configPath: join(data, 'c.yaml'), webDist: join(data, 'none'), players: false, log: () => {} });
  const res = await fetch(`http://127.0.0.1:${server.port}/api/sessions`, { headers: { Authorization: 'Bearer pw-12345678' } });
  assert.equal(res.status, 200);
  await res.arrayBuffer();
  await server.close();
});

test('the session list reuses what it worked out until the transcript or audio changes (#39)', async () => {
  const { utimesSync } = await import('node:fs');
  const data = mkdtempSync(join(tmpdir(), 'list-'));
  const dir = join(data, 'sessions', 'game');
  writeJson(join(dir, 'session.json'), { id: 'game', startedAt: 1000 });
  const segments = join(dir, 'segments.json');
  const lines = (name: string) => JSON.stringify({ lines: [{ userId: '1', speaker: name, offsetMs: 0, startMs: 0, endMs: 1, text: 'hi' }] });
  const mtime = new Date('2026-10-20T10:00:00Z');
  writeFileSync(segments, lines('Thorin'));
  utimesSync(segments, mtime, mtime);
  assert.deepEqual(listSessions(data)[0]!.speakers, ['Thorin']);

  // Same size and time, different text: still the cached answer, so the transcript wasn't read again.
  writeFileSync(segments, lines('Elaraa'));
  utimesSync(segments, mtime, mtime);
  assert.deepEqual(listSessions(data)[0]!.speakers, ['Thorin']);

  // A rebuilt transcript (new time) is read again.
  writeFileSync(segments, lines('Bren'));
  utimesSync(segments, new Date(mtime.getTime() + 5000), new Date(mtime.getTime() + 5000));
  assert.deepEqual(listSessions(data)[0]!.speakers, ['Bren']);
});
