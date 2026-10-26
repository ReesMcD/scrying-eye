import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApi } from '../src/app/api.js';
import { ConfigStore } from '../src/app/configStore.js';
import { JobRunner } from '../src/app/jobs.js';
import { readTracks } from '../src/app/sessions.js';
import { parseConfig } from '../src/config/load.js';
import { rosterAt, rosterOverall, sharedAnyTime, speakerNames } from '../src/config/roster.js';
import { paths, readSessionInfo, writeJson } from '../src/session/layout.js';
import type { SessionDetail, TrackSwitch, TranscriptLine } from '../src/shared/types.js';
import { disambiguateLines } from '../src/summary/disambiguate.js';
import { mergeSession } from '../src/transcript/merge.js';
import { FakeModel } from './helpers/fakeModel.js';

/**
 * #71: Sam starts on his own phone, then from 0:10 joins Rees's mic. Pat isn't set up at all.
 */
const T0 = Date.UTC(2026, 9, 24, 19);
const REES = '111111111111111111';
const SAM = '222222222222222222';
const YAML = `
transcript:
  timezone: UTC
speakers:
  rees: { name: Rees, discord: ["${REES}"], description: DM }
  sam: { name: Sam, discord: ["${SAM}"] }
`;
const { config } = parseConfig(YAML);
const SWITCH: TrackSwitch[] = [
  { account: REES, fromMs: 10_000, speakers: ['rees', 'sam'] },
  { account: SAM, fromMs: 10_000, speakers: [] },
];

test('who is on each account follows the session\'s switches; before them, the settings', () => {
  assert.deepEqual(speakerNames(rosterAt(config, SWITCH, 9_999)), { [REES]: 'Rees', [SAM]: 'Sam' });
  assert.deepEqual(speakerNames(rosterAt(config, SWITCH, 10_000)), {}, "Rees's mic is shared and Sam's phone has nobody we know");
  assert.deepEqual(rosterOverall(config, SWITCH).speakers.sam!.discord.sort(), [REES, SAM].sort());
  assert.deepEqual([...sharedAnyTime(config, SWITCH)], [REES]);
  assert.deepEqual([...sharedAnyTime(config, undefined)], []);
  assert.equal(rosterAt(config, undefined, 50_000), config, 'no switches: the settings as they are');
});

function session(tracks?: TrackSwitch[], dir = mkdtempSync(join(tmpdir(), 'tracks-'))) {
  writeJson(paths.session(dir), { id: 's', startedAt: T0, stoppedAt: T0 + 60_000, ...(tracks ? { tracks } : {}) });
  writeJson(paths.participants(dir), { [REES]: { displayName: 'rees_d' }, [SAM]: { displayName: 'sam_phone' } });
  const seg = (sec: number, text: string) => ({ startMs: T0 + sec * 1000, endMs: T0 + sec * 1000 + 800, text, utteranceStartMs: T0 });
  writeJson(join(paths.transcriptsDir(dir), `${REES}.json`), { userId: REES, transcriber: 'fake', segments: [seg(1, 'Welcome.'), seg(2, 'Roll initiative.'), seg(12, 'The door creaks.'), seg(13, 'I open it.')], dropped: [] });
  writeJson(join(paths.transcriptsDir(dir), `${SAM}.json`), { userId: SAM, transcriber: 'fake', segments: [seg(5, 'On my way!'), seg(30, 'Wrong mic.')], dropped: [] });
  return dir;
}

test('the transcript names each line by who was on that account at the time, and keeps shared lines apart', () => {
  const dir = session(SWITCH);
  mergeSession(dir, config);
  const { lines } = JSON.parse(readFileSync(paths.segments(dir), 'utf8')) as { lines: TranscriptLine[] };
  assert.deepEqual(
    lines.map((l) => `${l.speaker}: ${l.text}`),
    ['Rees: Welcome. Roll initiative.', 'Sam: On my way!', 'rees_d: The door creaks.', 'rees_d: I open it.', 'sam_phone: Wrong mic.'],
  );
});

test("shared-mic labelling asks only about the time the account was shared, and says when", async () => {
  const dir = session(SWITCH);
  mergeSession(dir, config);
  const info = readSessionInfo(dir);
  const { lines } = JSON.parse(readFileSync(paths.segments(dir), 'utf8')) as { lines: TranscriptLine[] };
  // Numbered identities: 1 = Rees, 2 = Sam (on Rees's account from 0:10). Line #3 is "The door creaks.", #4 "I open it.".
  const model = new FakeModel({
    disambiguate: () => ({
      labels: [
        { line: 3, speaker: 1, confident: true },
        { line: 4, speaker: 2, confident: true },
        { line: 1, speaker: 2, confident: true },
      ],
    }),
  });
  const r = await disambiguateLines(lines, config, model, dir, info, {});
  assert.match(model.calls.disambiguate[0]!.system, /Account "rees_d" \(from 00:00:10\):\n {2}1\. Rees — DM\n {2}2\. Sam/);
  assert.doesNotMatch(model.calls.disambiguate[0]!.user, /#1 /, 'lines before the switch are not asked about');
  assert.deepEqual(
    r.lines.map((l) => `${l.speaker}: ${l.text}`),
    ['Rees: Welcome. Roll initiative.', 'Sam: On my way!', 'Rees: The door creaks.', 'Sam: I open it.', 'sam_phone: Wrong mic.'],
  );
  assert.equal(r.stats.labelled, 2);
});

test('the session page saves who was on each account (checked) and rebuilds the transcript', async () => {
  assert.deepEqual(readTracks([{ account: REES, fromMs: 0, speakers: ['sam', 'sam'] }], config), [{ account: REES, fromMs: 0, speakers: ['sam'] }]);
  assert.throws(() => readTracks([{ account: REES, fromMs: 0, speakers: ['nobody'] }], config), /No such speaker/);
  assert.throws(() => readTracks([{ account: REES, fromMs: -5, speakers: [] }], config), /time/);
  assert.throws(() => readTracks('x', config), /up to/);

  const root = mkdtempSync(join(tmpdir(), 'tracks-api-'));
  writeFileSync(join(root, 'config.yaml'), YAML);
  const dataDir = join(root, 'data');
  const sessions = join(dataDir, 'sessions');
  session(undefined, join(sessions, 's'));
  const queued: string[] = [];
  const jobs = new JobRunner(async (job) => void queued.push(job.step));
  const api = createApi({ password: 'pw', dataDir, configStore: new ConfigStore(join(root, 'config.yaml')), jobs });
  const patch = (body: unknown) => api.request('/sessions/s', { method: 'PATCH', headers: { Authorization: 'Bearer pw', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  const saved = (await (await patch({ tracks: SWITCH })).json()) as SessionDetail;
  assert.deepEqual(saved.tracks, [...SWITCH].sort((a, b) => a.account.localeCompare(b.account)));
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(queued, ['merge'], 'the transcript is rebuilt with the new names');
  assert.equal((await patch({ tracks: [{ account: REES, fromMs: 0, speakers: ['ghost'] }] })).status, 400);
  const cleared = (await (await patch({ tracks: [] })).json()) as SessionDetail;
  assert.deepEqual(cleared.tracks, []);
  assert.equal(readSessionInfo(join(sessions, 's')).tracks, undefined, 'no switches: nothing stored');
});

test('an account shared all session stays one stretch when another account switches', async () => {
  const PAT = '333333333333333333';
  const { config: cfg } = parseConfig(`${YAML}  pat: { name: Pat, discord: ["${PAT}"] }\n  alex: { name: Alex, discord: ["${PAT}"] }\n`);
  const dir = session(SWITCH);
  const lines: TranscriptLine[] = [5, 20].map((sec) => ({ userId: PAT, speaker: 'pat_d', offsetMs: sec * 1000, startMs: T0 + sec * 1000, endMs: T0 + sec * 1000 + 500, text: `Line at ${sec}.` }));
  const model = new FakeModel({ disambiguate: () => ({ labels: [{ line: 1, speaker: 1, confident: true }, { line: 2, speaker: 2, confident: true }] }) });
  const r = await disambiguateLines(lines, cfg, model, dir, readSessionInfo(dir), {});
  assert.match(model.calls.disambiguate[0]!.system, /Account "pat_d":\n {2}1\. Pat\n {2}2\. Alex/);
  assert.deepEqual(r.lines.map((l) => l.speaker), ['Pat', 'Alex'], 'numbers from the one list work at any time');
});

test('a damaged session.json is never overwritten by a change; tracks: null resets', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tracks-api-'));
  writeFileSync(join(root, 'config.yaml'), YAML);
  const dir = join(root, 'data', 'sessions', 's');
  session(SWITCH, dir);
  const api = createApi({ password: 'pw', dataDir: join(root, 'data'), configStore: new ConfigStore(join(root, 'config.yaml')), jobs: new JobRunner(async () => {}) });
  const patch = (body: unknown) => api.request('/sessions/s', { method: 'PATCH', headers: { Authorization: 'Bearer pw', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.deepEqual(((await (await patch({ tracks: null })).json()) as SessionDetail).tracks, []);

  writeFileSync(paths.session(dir), '{"id":"s","startedAt":');
  const refused = await patch({ title: 'New name' });
  assert.equal(refused.status, 400);
  assert.match(((await refused.json()) as { error: string }).error, /damaged/);
  assert.equal(readFileSync(paths.session(dir), 'utf8'), '{"id":"s","startedAt":', 'left as it was');
});
