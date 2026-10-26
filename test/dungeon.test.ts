import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApi } from '../src/app/api.js';
import { ConfigStore } from '../src/app/configStore.js';
import { JobRunner } from '../src/app/jobs.js';
import { configSchema } from '../src/config/schema.js';
import { WikiDungeons } from '../src/encounter/dungeonWiki.js';
import { EncounterStore } from '../src/encounter/store.js';
import { encounterFromDungeon, dungeonProgress } from '../src/encounter/dungeon.js';
import { applyAction, outcomeOf, type RuleDeps } from '../src/encounter/rules.js';
import { playerView } from '../src/play/view.js';
import type { EncounterAction, EncounterState, WikiDungeon } from '../src/shared/types.js';

function deps(): RuleDeps {
  let t = Date.UTC(2026, 9, 26, 20);
  return { now: () => (t += 1000), d20: () => 10 };
}
const run = (s: EncounterState, actions: EncounterAction[]) => actions.reduce((x, a) => applyAction(x, a, deps()), s);

/**
 * Two rooms joined by a corridor through a door, in solid rock, like a wiki_dungeon plan:
 * 1. Gatehouse (stairs in its corner), 2. Crypt (skeletons, a riddle, a coffer).
 */
export const DUNGEON: WikiDungeon = {
  id: 'barrow',
  title: 'The Barrow',
  campaign: 'Into the Valley',
  place: 'Ashfall Hills',
  summary: 'An old king’s barrow.',
  read_aloud: 'A cold wind breathes from the hillside.',
  overview: null,
  dm_notes: null,
  map: {
    v: 1,
    width: 18,
    height: 9,
    ground: 'rock',
    terrain: [
      { kind: 'wall', rect: [0, 0, 18, 1], asset: 'wall' },
      { kind: 'wall', rect: [0, 8, 18, 1], asset: 'wall' },
      { kind: 'wall', rect: [0, 1, 1, 7], asset: 'wall' },
      { kind: 'wall', rect: [17, 1, 1, 7], asset: 'wall' },
      { kind: 'wall', rect: [6, 1, 4, 3], asset: 'wall' },
      { kind: 'wall', rect: [6, 5, 4, 3], asset: 'wall' },
      { kind: 'floor', rect: [1, 1, 5, 7], ground: 'stone' },
      { kind: 'floor', rect: [6, 4, 3, 1], ground: 'stone' },
      { kind: 'door', cells: [[9, 4]], state: 'closed' },
      { kind: 'floor', rect: [10, 1, 7, 7], ground: 'stone' },
      { kind: 'floor', cells: [[1, 1]], asset: 'stairs', label: 'stairs (the way in)' },
    ],
    tokens: [],
    notes: [],
    rooms: [
      { id: '1', name: 'Gatehouse', rect: [1, 1, 5, 7] },
      { id: '2', name: 'Crypt', rect: [10, 1, 7, 7] },
    ],
  },
  party: [
    { name: 'Aria', player: 'Rees', level: 3, class: null, race: null, ac: 16, hp: 28, passive_perception: 12 },
    { name: 'Brom', player: 'Sam', level: 3, class: null, race: null, ac: 18, hp: 30, passive_perception: 11 },
  ],
  rooms: [
    { key: '1', name: 'Gatehouse', role: 'guardian', read_aloud: 'Rusted portcullis.', description: null, dm: null, exits: ['2'], encounter: null, trap: null, puzzle: null, treasure: null },
    {
      key: '2',
      name: 'Crypt',
      role: 'climax',
      read_aloud: 'Bones stir in the niches.',
      description: null,
      dm: 'The king’s skull is the key.',
      exits: ['1'],
      encounter: { text: '3 skeletons', creatures: [{ name: 'Skeleton', source: 'srd', ac: 13, hp: 13, xp: 50, size: 'Medium', count: 3 }] },
      trap: null,
      puzzle: { name: 'The Riddle Door', premise: 'A door of faces.', solution: 'Silence', clues: [{ text: 'Whispers', where: 'Gatehouse' }], hints: ['Listen', 'Say nothing', 'The answer is silence'], bypass: 'DC 20 Strength', fail: 'Alarm', reward: 'The door opens' },
      treasure: 'A coffer of 300 gp',
    },
  ],
};

test('running a dungeon: the party at the way in, fog that follows them, rooms unseen', () => {
  const s = encounterFromDungeon(DUNGEON, 'd1', deps());
  assert.equal(s.status, 'exploring');
  assert.deepEqual(s.combatants.map((c) => c.name), ['Aria', 'Brom']);
  const at = s.map!.tokens.map((t) => t.at.join(','));
  assert.ok(at.includes('1,1') || at.some((c) => ['1,2', '2,1', '2,2'].includes(c)), `by the stairs: ${at}`);
  assert.ok(s.fog?.follow);
  assert.ok(s.fog!.revealed.includes('3,4'), 'they see their own room');
  assert.ok(!s.fog!.revealed.includes('13,4'), 'not through the closed door');
  assert.equal(s.dungeon!.current, '1');

  const phone = playerView(s, 'aria');
  assert.ok(!JSON.stringify(phone).includes('Silence') && !JSON.stringify(phone).includes('skull'), 'room content never reaches players');
  assert.equal(phone.map!.rooms, undefined, 'nor room keys');
});

test('entering a room reveals it; flags and the hint ladder are kept', () => {
  let s = encounterFromDungeon(DUNGEON, 'd1', deps());
  s = run(s, [{ type: 'room', key: '2', entered: true }]);
  assert.ok(s.fog!.revealed.includes('13,4'), 'the crypt is shown on the map');
  assert.ok(s.fog!.revealed.includes('17,4') && s.fog!.revealed.includes('13,0') && s.fog!.revealed.includes('9,4'), 'with its walls and door, not floor in the void');
  assert.equal(s.dungeon!.current, '2');
  s = run(s, [{ type: 'room', key: '2', hintsShown: 2 }, { type: 'room', key: '2', solved: true }]);
  const crypt = s.dungeon!.rooms[1]!;
  assert.deepEqual([crypt.hintsShown, crypt.state.solved], [2, true]);
  s = run(s, [{ type: 'room', key: '2', hintsShown: 9 }]);
  assert.equal(s.dungeon!.rooms[1]!.hintsShown, 3, 'no more hints than there are');
  assert.throws(() => run(s, [{ type: 'room', key: '9' }]), /No such room/);
  assert.match(s.log.map((l) => l.text).join('\n'), /2\. Crypt: entered[\s\S]*2\. Crypt: solved/);
});

test('a fight in a room: its creatures appear there, initiative, then back to exploring and the room is cleared', () => {
  let s = encounterFromDungeon(DUNGEON, 'd1', deps());
  assert.throws(() => run(s, [{ type: 'fight', room: '1' }]), /No creatures are listed for Gatehouse/);
  s = run(s, [{ type: 'fight', room: '2' }]);
  assert.equal(s.status, 'setup');
  const skeletons = s.combatants.filter((c) => c.kind === 'monster');
  assert.deepEqual(skeletons.map((c) => c.name), ['Skeleton 1', 'Skeleton 2', 'Skeleton 3']);
  const tokens = s.map!.tokens.filter((t) => skeletons.some((c) => c.tokenId === t.id));
  assert.ok(tokens.every((t) => t.at[0] >= 10 && t.at[0] <= 16), `in the crypt: ${tokens.map((t) => t.at.join(','))}`);
  assert.ok(s.combatants.every((c) => c.initiative === null), 'everyone rolls again');
  assert.equal(s.statBlocks.Skeleton!.hp, 13);
  assert.throws(() => run(s, [{ type: 'fight', room: '2' }]), /Finish this fight first/);

  s = run(s, [
    { type: 'rollInitiative' },
    { type: 'initiative', id: 'aria', value: 15 },
    { type: 'initiative', id: 'brom', value: 12 },
    { type: 'begin' },
    { type: 'damage', id: 'skeleton-1', amount: 13 },
    { type: 'damage', id: 'skeleton-2', amount: 13 },
    { type: 'next' },
  ]);
  s = run(s, [{ type: 'endFight' }]);
  assert.equal(s.status, 'exploring');
  assert.deepEqual(s.combatants.map((c) => c.name), ['Aria', 'Brom', 'Skeleton 3'], 'the fallen leave; one fled');
  assert.equal(s.map!.tokens.length, 3);
  assert.equal(s.dungeon!.rooms[1]!.state.cleared, undefined, 'not cleared while one is still about');
  assert.deepEqual(s.dungeon!.fights.map((f) => [f.room, f.defeated.length, f.xp]), [['2', 2, 100]]);

  // It comes back: fighting there again doesn't bring the whole group back.
  s = run(s, [{ type: 'fight', room: '2' }]);
  assert.deepEqual(s.combatants.filter((c) => c.kind === 'monster').map((c) => c.name), ['Skeleton 3']);
  s = run(s, [{ type: 'damage', id: 'skeleton-3', amount: 13 }, { type: 'endFight' }]);
  assert.equal(s.dungeon!.rooms[1]!.state.cleared, true);
  assert.throws(() => run(s, [{ type: 'fight', room: '2' }]), /Nothing is left to fight in Crypt/);

  const outcome = outcomeOf(s, Date.now());
  assert.equal(outcome.xp, 150, 'every skeleton, across both fights');
  assert.equal(outcome.defeated.length, 3);
  assert.match(outcome.text, /^The Barrow: 1 of 2 rooms explored, 1 cleared; 2 fights/);
  assert.deepEqual(dungeonProgress(s.dungeon!, Date.UTC(2026, 9, 26)).rooms, [{ key: '2', entered: true, cleared: true }]);
});

test('a dungeon without a floor plan says how to make one', () => {
  assert.throws(() => encounterFromDungeon({ ...DUNGEON, map: null }, 'd1', deps()), /no floor plan yet: make one in the wiki/);
  assert.throws(() => encounterFromDungeon({ ...DUNGEON, map: null, map_error: 'bad width' }, 'd1', deps()), /can't be used: bad width/);
});

// --- The wiki's dungeons API (ReesMcD/dnd-wiki#106) and starting a run --------------------------

const TOKEN = 'k'.repeat(24);
const CONFIG = configSchema.parse({ upload: { url: 'https://wiki.example/api/sessions', format: 'ardent-weave' } });

function fakeWiki(opts: { hasDungeons?: boolean } = {}) {
  const seen: Array<{ path: string; method: string; body?: unknown }> = [];
  let down = false;
  const doFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    seen.push({ path: `${url.pathname}${url.search}`, method: init?.method ?? 'GET', ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
    if (down) throw new TypeError('fetch failed');
    if (opts.hasDungeons === false) return new Response('<html>Not found</html>', { status: 404 });
    if (url.pathname === '/api/dungeons') return Response.json({ dungeons: [{ id: 'barrow', title: 'The Barrow', campaign: 'Into the Valley', place: null, summary: null, rooms: 2, party_level: 3, has_map: true, run: false, updated: null }] });
    if (url.pathname === '/api/dungeons/barrow') return Response.json(DUNGEON);
    if (url.pathname === '/api/dungeons/barrow/progress') return Response.json({ ok: true });
    return Response.json({ error: 'No dungeon "x".' }, { status: 404 });
  };
  return { seen, doFetch, goDown: () => (down = true) };
}

test('the wiki client: list, one dungeon (kept for when the wiki is down), progress; an older wiki says what it needs', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'dungeons-'));
  const wiki = fakeWiki();
  const dungeons = new WikiDungeons(dataDir, () => CONFIG, () => TOKEN, wiki.doFetch);
  assert.equal((await dungeons.list('Into the Valley'))[0]!.id, 'barrow');
  assert.equal((await dungeons.get('barrow')).rooms.length, 2);
  await assert.rejects(dungeons.get('x'), /No dungeon "x"/);
  wiki.goDown();
  assert.equal((await dungeons.get('barrow')).cached, true);

  const s = run(encounterFromDungeon(DUNGEON, 'd1', deps()), [{ type: 'room', key: '2', entered: true, looted: true }]);
  const live = fakeWiki();
  assert.equal(await new WikiDungeons(dataDir, () => CONFIG, () => TOKEN, live.doFetch).sendProgress(s.dungeon!, Date.UTC(2026, 9, 26, 21)), 'Dungeon progress sent to the wiki');
  assert.deepEqual(live.seen[0], { path: '/api/dungeons/barrow/progress?campaign=Into+the+Valley', method: 'POST', body: { at: '2026-10-26T21:00:00.000Z', rooms: [{ key: '2', entered: true, looted: true }], fights: [], secret_doors_found: [] } });

  const old = new WikiDungeons(dataDir, () => CONFIG, () => TOKEN, fakeWiki({ hasDungeons: false }).doFetch);
  await assert.rejects(old.list(), /doesn’t serve dungeons yet: update it \(ReesMcD\/dnd-wiki#106\)/);
  assert.match(await old.sendProgress(s.dungeon!), /doesn’t take dungeon progress yet/);
});

test('the API: list the wiki’s dungeons, start one, explore and fight; progress goes back to the wiki', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dungeon-api-'));
  writeFileSync(join(root, 'config.yaml'), 'upload:\n  url: https://wiki.example/api/sessions\n  format: ardent-weave\n');
  const wiki = fakeWiki();
  const old = process.env.WIKI_UPLOAD_TOKEN;
  process.env.WIKI_UPLOAD_TOKEN = TOKEN;
  try {
    const store = new EncounterStore(join(root, 'data'), deps(), () => {});
    const progress: string[] = [];
    store.on('dungeon', (r: { rooms: Array<{ key: string; state: object }> }) => progress.push(r.rooms.map((x) => `${x.key}:${Object.keys(x.state).join('+')}`).join(' ')));
    const api = createApi({ password: 'pw', dataDir: join(root, 'data'), configStore: new ConfigStore(join(root, 'config.yaml')), jobs: new JobRunner(async () => {}), encounters: store, httpFetch: wiki.doFetch });
    const call = (path: string, body?: unknown) => api.request(path, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer pw', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

    assert.equal(((await (await call('/encounters/dungeons')).json()) as unknown[]).length, 1);
    const started = (await (await call('/encounter', { dungeonId: 'barrow', campaign: 'Into the Valley' })).json()) as EncounterState;
    assert.equal(started.status, 'exploring');
    assert.equal(started.dungeon!.rooms[1]!.puzzle!.solution, 'Silence', 'the DM gets the room content');
    await call('/encounter/actions', { type: 'room', key: '1', entered: true });
    const fight = (await (await call('/encounter/actions', { type: 'fight', room: '2' })).json()) as EncounterState;
    assert.equal(fight.status, 'setup');
    assert.deepEqual(progress, ['1:entered 2:', '1:entered 2:entered']);
  } finally {
    if (old === undefined) delete process.env.WIKI_UPLOAD_TOKEN;
    else process.env.WIKI_UPLOAD_TOKEN = old;
  }
});
