import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApi } from '../src/app/api.js';
import { ConfigStore } from '../src/app/configStore.js';
import { JobRunner } from '../src/app/jobs.js';
import { PollService, readPollInput, type PollPoster } from '../src/polls/PollService.js';
import { answersFor, dueSlot, fromWallTime, nextSlot, wallTime } from '../src/polls/schedule.js';
import type { Poll, PollResults, PollsState } from '../src/shared/types.js';

const LONDON = 'Europe/London';
const NY = 'America/New_York';
const at = (iso: string) => Date.parse(iso);

const weekly = (over: Partial<Poll> = {}): Pick<Poll, 'schedule' | 'lastSlot' | 'createdAt' | 'enabled'> => ({
  schedule: { kind: 'weekly', weekday: 1, time: '10:00' },
  createdAt: at('2026-10-01T00:00Z'),
  enabled: true,
  ...over,
});

test('wall-clock times in a time zone, across daylight saving', () => {
  // The UK leaves summer time on Sun 25 Oct 2026.
  assert.equal(fromWallTime({ year: 2026, month: 10, day: 19, hour: 10, minute: 0 }, LONDON), at('2026-10-19T09:00Z'), 'BST');
  assert.equal(fromWallTime({ year: 2026, month: 10, day: 26, hour: 10, minute: 0 }, LONDON), at('2026-10-26T10:00Z'), 'GMT');
  assert.equal(fromWallTime({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, NY), at('2026-03-08T07:30Z'), '2:30 is skipped that night: 3:30 EDT');
  assert.deepEqual(wallTime(at('2026-10-26T10:00Z'), LONDON), { year: 2026, month: 10, day: 26, hour: 10, minute: 0, weekday: 1 });
});

test('weekly: due at its time, once; the next is a week on at the same local time', () => {
  const fresh = weekly({ createdAt: at('2026-10-18T00:00Z') });
  assert.equal(dueSlot(fresh, at('2026-10-19T08:59Z'), LONDON), null, 'Monday 9:59 in London');
  const due = dueSlot(fresh, at('2026-10-19T09:00Z'), LONDON);
  assert.deepEqual(due, { slot: at('2026-10-19T09:00Z'), late: false });
  assert.equal(dueSlot(weekly({ lastSlot: due!.slot }), at('2026-10-19T09:01Z'), LONDON), null, 'never twice');
  assert.equal(nextSlot(weekly({ lastSlot: due!.slot }), at('2026-10-19T09:01Z'), LONDON), at('2026-10-26T10:00Z'), 'after the clocks change, still 10:00 local');
});

test('missed while the app was off: posted once when it starts, marked late', () => {
  // Off from Sunday to the next Wednesday, missing Monday's slot.
  const due = dueSlot(weekly({ lastSlot: at('2026-10-12T09:00Z') }), at('2026-10-21T12:00Z'), LONDON);
  assert.deepEqual(due, { slot: at('2026-10-19T09:00Z'), late: true });
  // Off for three weeks: one post, for the latest slot.
  assert.equal(dueSlot(weekly({ lastSlot: at('2026-09-28T09:00Z') }), at('2026-10-21T12:00Z'), LONDON)!.slot, at('2026-10-19T09:00Z'));
});

test('a new weekly poll waits for its next time; a one-off set in the past posts at once (late)', () => {
  assert.equal(dueSlot(weekly({ createdAt: at('2026-10-19T12:00Z') }), at('2026-10-19T12:01Z'), LONDON), null, "this Monday's slot passed before it was set up");
  const once = { schedule: { kind: 'once' as const, at: '2026-10-20T19:30' }, createdAt: at('2026-10-21T00:00Z'), enabled: true };
  assert.deepEqual(dueSlot(once, at('2026-10-21T00:01Z'), NY), { slot: at('2026-10-20T23:30Z'), late: true });
  assert.equal(dueSlot({ ...once, lastSlot: at('2026-10-20T23:30Z') }, at('2026-10-22T00:00Z'), NY), null);
  assert.equal(nextSlot({ ...once, lastSlot: at('2026-10-20T23:30Z') }, at('2026-10-22T00:00Z'), NY), null, 'a one-off is done once posted');
  assert.equal(dueSlot({ ...weekly(), enabled: false }, at('2026-10-19T09:00Z'), LONDON), null, 'paused');
});

test('generated answers: the coming days, or only some weekdays, in the time zone', () => {
  const monday = at('2026-10-19T09:00Z');
  assert.deepEqual(answersFor({ kind: 'days', count: 3, startInDays: 1 }, monday, LONDON), ['Tue 20 Oct', 'Wed 21 Oct', 'Thu 22 Oct']);
  assert.deepEqual(answersFor({ kind: 'days', count: 4, startInDays: 1, weekdays: [5, 6] }, monday, LONDON), ['Fri 23 Oct', 'Sat 24 Oct', 'Fri 30 Oct', 'Sat 31 Oct']);
  assert.deepEqual(answersFor({ kind: 'days', count: 2, startInDays: 0 }, at('2026-10-20T03:00Z'), NY), ['Mon 19 Oct', 'Tue 20 Oct'], 'still Monday evening in New York');
  assert.equal(answersFor({ kind: 'days', count: 30, startInDays: 1 }, monday, LONDON).length, 10, "Discord's limit");
  assert.deepEqual(answersFor({ kind: 'fixed', list: ['Pizza', 'Tacos'] }, monday, LONDON), ['Pizza', 'Tacos']);
});

// --- The service: posting, results, the winner -------------------------------------------------

/** A fake Discord: records posts, answers with scripted votes. */
function fakeDiscord() {
  const posts: Array<{ channelId: string; question: string; answers: string[]; hours: number; note?: string }> = [];
  const said: string[] = [];
  const votes = new Map<string, PollResults | null>();
  let fail = false;
  const poster: PollPoster = {
    post: async (channelId, p) => {
      if (fail) throw new Error('Missing Permissions');
      posts.push({ channelId, ...p });
      return { messageId: `m${posts.length}`, channelName: 'general' };
    },
    results: async (_c, messageId) => votes.get(messageId) ?? null,
    say: async (_c, text, roleId) => void said.push(roleId ? `<@&${roleId}> ${text}` : text),
  };
  return { poster, posts, said, votes, failNext: (on: boolean) => (fail = on) };
}

const CHANNEL = '123456789012345678';
const ROLE = '223456789012345678';
const INPUT = {
  question: 'Which day for the next session?',
  channelId: CHANNEL,
  answers: { kind: 'days', count: 3, startInDays: 1, weekdays: [5, 6] },
  schedule: { kind: 'weekly', weekday: 1, time: '10:00' },
  hours: 48,
  multiSelect: true,
  announce: { on: true, roleId: ROLE },
};

test('poll input is checked against Discord’s limits', () => {
  assert.deepEqual(readPollInput(INPUT).answers, { kind: 'days', count: 3, startInDays: 1, weekdays: [5, 6] });
  assert.equal(readPollInput(INPUT).enabled, true);
  assert.throws(() => readPollInput({ ...INPUT, question: '' }), /question/);
  assert.throws(() => readPollInput({ ...INPUT, hours: 800 }), /32 days/);
  assert.throws(() => readPollInput({ ...INPUT, answers: { kind: 'fixed', list: Array.from({ length: 11 }, (_, i) => `A${i}`) } }), /1 to 10 answers/);
  assert.throws(() => readPollInput({ ...INPUT, answers: { kind: 'fixed', list: ['x'.repeat(56)] } }), /55 characters/);
  assert.throws(() => readPollInput({ ...INPUT, schedule: { kind: 'weekly', weekday: 7, time: '10:00' } }), /every week/);
  assert.throws(() => readPollInput({ ...INPUT, schedule: { kind: 'once', at: 'tomorrow' } }), /once at a date/);
  assert.throws(() => readPollInput({ ...INPUT, channelId: 'general' }), /channel/);
});

test('a weekly poll posts on time with generated days, then the winner is announced when it closes', async () => {
  let now = at('2026-10-18T12:00Z');
  const discord = fakeDiscord();
  const file = join(mkdtempSync(join(tmpdir(), 'polls-')), 'polls.json');
  const service = new PollService(file, { poster: () => discord.poster, timeZone: () => LONDON, now: () => now, log: () => {} });
  const poll = service.create(readPollInput(INPUT));

  await service.tick();
  assert.equal(discord.posts.length, 0, 'Sunday: not yet');
  now = at('2026-10-19T09:00:30Z');
  await service.tick();
  await service.tick();
  assert.deepEqual(discord.posts, [{ channelId: CHANNEL, question: 'Which day for the next session?', answers: ['Fri 23 Oct', 'Sat 24 Oct', 'Fri 30 Oct'], hours: 48, multiSelect: true }], 'once, not twice');

  discord.votes.set('m1', { answers: [{ text: 'Fri 23 Oct', votes: 1, voters: ['Sam'] }, { text: 'Sat 24 Oct', votes: 3, voters: ['Sam', 'Pat', 'Rees'] }, { text: 'Fri 30 Oct', votes: 0, voters: [] }], final: true, checkedAt: now });
  now += 47 * 3_600_000;
  await service.tick();
  assert.deepEqual(discord.said, [], 'still open');
  now += 2 * 3_600_000;
  await service.tick();
  await service.tick();
  assert.deepEqual(discord.said, [`<@&${ROLE}> 📊 **Which day for the next session?**: **Sat 24 Oct** (3 votes).`], 'announced once');

  const reloaded = new PollService(file, { poster: () => discord.poster, timeZone: () => LONDON, now: () => now, log: () => {} });
  const saved = reloaded.list().find((p) => p.id === poll.id)!;
  assert.equal(saved.posts[0]!.results!.answers[1]!.votes, 3, 'results survive a restart');
  assert.equal(saved.lastSlot, at('2026-10-19T09:00Z'));
});

test('missed while off: posted once, late, saying so; a refused post is logged, not retried every minute', async () => {
  let now = at('2026-10-21T12:00Z');
  const discord = fakeDiscord();
  const logs: string[] = [];
  const service = new PollService(join(mkdtempSync(join(tmpdir(), 'polls-')), 'polls.json'), { poster: () => discord.poster, timeZone: () => LONDON, now: () => now, log: (m) => logs.push(m) });
  const poll = service.create(readPollInput(INPUT));
  poll.createdAt = at('2026-10-10T00:00Z');
  await service.tick();
  assert.match(discord.posts[0]!.note ?? '', /due while the app was off/);
  assert.equal(service.list()[0]!.posts[0]!.late, true);

  now = at('2026-10-26T10:00Z');
  discord.failNext(true);
  await service.tick();
  now += 60_000;
  await service.tick();
  assert.equal(logs.filter((l) => /Couldn't post/.test(l)).length, 1);
});

test('the API: set up a poll, post it now, see results; nothing posts without the bot', async () => {
  const root = mkdtempSync(join(tmpdir(), 'polls-api-'));
  writeFileSync(join(root, 'config.yaml'), 'transcript:\n  timezone: Europe/London\n');
  const configStore = new ConfigStore(join(root, 'config.yaml'));
  const discord = fakeDiscord();
  let connected = false;
  const polls = new PollService(join(root, 'polls.json'), { poster: () => (connected ? discord.poster : null), timeZone: () => 'Europe/London', log: () => {} });
  const api = createApi({ password: 'pw', dataDir: root, configStore, jobs: new JobRunner(async () => {}), polls });
  const call = (method: string, path: string, body?: unknown) => api.request(path, { method, headers: { Authorization: 'Bearer pw', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });

  const created = (await (await call('POST', '/polls', { ...INPUT, answers: { kind: 'fixed', list: ['Pizza', 'Tacos'] } })).json()) as PollsState;
  assert.equal(created.timeZone, 'Europe/London');
  const id = created.polls[0]!.id;
  assert.ok(created.polls[0]!.next! > Date.now(), 'when it posts next');
  assert.equal((await call('POST', '/polls', { ...INPUT, hours: 0 })).status, 400);

  const offline = await call('POST', `/polls/${id}/post`);
  assert.deepEqual([offline.status, ((await offline.json()) as { error: string }).error], [400, 'The Discord bot isn’t connected']);
  connected = true;
  const posted = (await (await call('POST', `/polls/${id}/post`)).json()) as PollsState;
  assert.equal(posted.polls[0]!.posts[0]!.manual, true);
  assert.deepEqual(discord.posts[0]!.answers, ['Pizza', 'Tacos']);
  discord.votes.set('m1', { answers: [{ text: 'Pizza', votes: 2, voters: ['A', 'B'] }], final: false, checkedAt: 1 });
  const refreshed = (await (await call('POST', `/polls/${id}/refresh`)).json()) as PollsState;
  assert.equal(refreshed.polls[0]!.posts[0]!.results!.answers[0]!.votes, 2);
  assert.equal(((await (await call('DELETE', `/polls/${id}`)).json()) as PollsState).polls.length, 0);
});

test('a paused poll switched back on waits for its next time instead of posting what it missed', async () => {
  let now = at('2026-10-18T12:00Z');
  const discord = fakeDiscord();
  const service = new PollService(join(mkdtempSync(join(tmpdir(), 'polls-')), 'polls.json'), { poster: () => discord.poster, timeZone: () => LONDON, now: () => now, log: () => {} });
  const poll = service.create(readPollInput({ ...INPUT, enabled: false }));
  now = at('2026-10-20T12:00Z');
  await service.tick();
  service.update(poll.id, readPollInput({ ...INPUT, enabled: true }));
  await service.tick();
  assert.equal(discord.posts.length, 0, "Monday's slot passed while it was paused");
  now = at('2026-10-26T10:00Z');
  await service.tick();
  assert.equal(discord.posts.length, 1);
});

test('a one-off poll that already posted stays done when paused and switched back on', async () => {
  let now = at('2026-10-20T09:00Z');
  const discord = fakeDiscord();
  const service = new PollService(join(mkdtempSync(join(tmpdir(), 'polls-')), 'polls.json'), { poster: () => discord.poster, timeZone: () => LONDON, now: () => now, log: () => {} });
  const input = { ...INPUT, schedule: { kind: 'once', at: '2026-10-20T10:00' } };
  const poll = service.create(readPollInput(input));
  await service.tick();
  assert.equal(discord.posts.length, 1);
  service.update(poll.id, readPollInput({ ...input, enabled: false }));
  now += 3_600_000;
  service.update(poll.id, readPollInput({ ...input, enabled: true }));
  await service.tick();
  assert.equal(discord.posts.length, 1, 'not posted again');
});

test('votes that can’t be read yet (an outage, a permission) are retried, not taken as "nobody voted"', async () => {
  let now = at('2026-10-19T09:00Z');
  const discord = fakeDiscord();
  let outage = true;
  const poster: PollPoster = { ...discord.poster, results: async (c, m) => (outage ? Promise.reject(new Error('503')) : discord.poster.results(c, m)) };
  const service = new PollService(join(mkdtempSync(join(tmpdir(), 'polls-')), 'polls.json'), { poster: () => poster, timeZone: () => LONDON, now: () => now, log: () => {} });
  const poll = service.create(readPollInput({ ...INPUT, hours: 1 }));
  poll.createdAt = at('2026-10-18T00:00Z');
  await service.tick();
  now += 2 * 3_600_000;
  await service.tick();
  assert.deepEqual(discord.said, []);
  assert.equal(service.list()[0]!.posts[0]!.results!.final, false);
  outage = false;
  discord.votes.set('m1', { answers: [{ text: 'Fri 23 Oct', votes: 2, voters: ['A', 'B'] }], final: true, checkedAt: now });
  now += 6 * 60_000;
  await service.tick();
  assert.match(discord.said[0]!, /\*\*Fri 23 Oct\*\* \(2 votes\)/);
});
