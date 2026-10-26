import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readMap } from '../src/shared/battlemap.js';
import { buildScene } from '../src/shared/mapScene.js';
import { configSchema } from '../src/config/schema.js';
import { WikiDungeons } from '../src/encounter/dungeonWiki.js';
import { dungeonProgress, encounterFromDungeon } from '../src/encounter/dungeon.js';
import { applyAction, type RuleDeps } from '../src/encounter/rules.js';
import { createApi } from '../src/app/api.js';
import { ConfigStore } from '../src/app/configStore.js';
import { JobRunner } from '../src/app/jobs.js';
import { EncounterStore } from '../src/encounter/store.js';
import type { EncounterState, WikiDungeon, WikiEncounter } from '../src/shared/types.js';

/**
 * A dungeon exactly as the live wiki sends it (GET /api/dungeons/<id>, dnd-wiki #104–#110): nulls
 * where it has nothing, every trap field, a puzzle written in words only (no name), the party's
 * speed, `maps`, a dark plan with torches by the door, a brazier, a pit, and the way in.
 */
const MILL: WikiDungeon = {
  id: 'the-old-mill',
  title: 'The Old Mill',
  campaign: 'Crimson Tide',
  place: 'Phandalin',
  summary: 'A burned mill.',
  read_aloud: 'Smoke and ash.',
  overview: null,
  dm_notes: null,
  map: null,
  maps: [],
  party: [{ name: 'Aria', player: 'Sam', level: 3, class: null, race: null, ac: 15, hp: 24, passive_perception: 13, initiative_bonus: 2, dex: 14, speed: 35 }],
  rooms: [
    {
      key: '1', name: 'Millyard', role: 'guardian', read_aloud: 'Charred beams.', description: null, dm: null, exits: ['2'], level: 1,
      encounter: { text: 'They wake when the door opens.', difficulty: 'moderate', xp: 100, creatures: [{ name: 'Skeleton', source: 'srd', ac: 13, hp: 13, xp: 50, size: 'Medium', count: 2 }] },
      trap: null, puzzle: null, treasure: null, state: { entered: false, cleared: false, looted: false, solved: false },
    },
    {
      key: '2', name: 'Sluice Room', role: 'trap', read_aloud: null, description: null, dm: null, exits: [], level: 1, encounter: null,
      trap: { text: 'The sluice gate drops.', trigger: 'the lever', detect: 'DC 15 Perception', disarm: null, dc: '13 Strength', attack: null, damage: '2d10 bludgeoning' },
      puzzle: { name: null, premise: 'A face asks a riddle.', solution: null, clues: [], hints: [], bypass: null, fail: null, reward: null },
      treasure: null, state: { entered: false, cleared: false, looted: false, solved: false },
    },
  ],
};
const PLAN = {
  v: 1, width: 12, height: 7, ground: 'rock', lighting: 'dark', level: 1,
  terrain: [
    { kind: 'wall', rect: [0, 0, 12, 1] },
    { kind: 'wall', rect: [0, 6, 12, 1] },
    { kind: 'wall', rect: [0, 1, 1, 5] },
    { kind: 'wall', rect: [11, 1, 1, 5] },
    { kind: 'wall', cells: [[5, 1], [5, 2], [5, 4], [5, 5]] },
    { kind: 'wall', cells: [[5, 2]], asset: 'torch', light: { bright: 20, dim: 40, color: '#ffb060' } },
    { kind: 'wall', cells: [[6, 1]], secret: 'door' },
    { kind: 'door', cells: [[5, 3]], state: 'closed', height: 10 },
    { kind: 'floor', rect: [1, 1, 4, 5], ground: 'stone' },
    { kind: 'floor', rect: [6, 1, 5, 5], ground: 'stone' },
    { kind: 'floor', cells: [[1, 1]], asset: 'stairs', label: 'stairs (the way in)', to: { level: 0 }, rises: 'up' },
    { kind: 'object', cells: [[9, 3]], asset: 'brazier', height: 3, light: { bright: 10, dim: 20 } },
    { kind: 'elevation', cells: [[8, 4]], height: -10, label: 'pit' },
    { kind: 'cover', cells: [[3, 4]], cover: 'half', height: 4, asset: 'crate' },
  ],
  tokens: [],
  notes: [],
  rooms: [
    { id: '1', name: 'Millyard', rect: [1, 1, 4, 5] },
    { id: '2', name: 'Sluice Room', rect: [6, 1, 5, 5] },
  ],
};
MILL.map = PLAN;
MILL.maps = [{ level: 1, map: PLAN }];

function deps(): RuleDeps {
  let t = Date.UTC(2026, 9, 26, 20);
  return { now: () => (t += 1000), d20: () => 10 };
}

test('the live wiki’s dungeon runs: the party’s speed, nameless puzzles, a dark plan that keeps its level and lights', () => {
  const s = encounterFromDungeon(MILL, 'd1', deps());
  assert.equal(s.combatants[0]!.speed, 35, 'from the party sync (#104)');
  assert.equal(s.combatants[0]!.initiativeBonus, 2);
  assert.deepEqual([s.map!.lighting, s.map!.level], ['dark', 1]);
  const stairs = s.map!.terrain.find((t) => t.asset === 'stairs')!;
  assert.deepEqual([stairs.to, stairs.rises], [{ level: 0 }, 'up']);
  assert.equal(s.dungeon!.rooms[1]!.puzzle!.name, null);
  assert.deepEqual(s.map!.tokens[0]!.at, [1, 1], 'at the way in');
});

test('3D reads the format’s additions (#105): torches on the wall face the room, a brazier, a pit, heights, darkness', () => {
  const scene = buildScene(readMap(PLAN)!);
  assert.equal(scene.lighting, 'dark');
  const torch = scene.lights.find((l) => l.kind === 'torch')!;
  assert.ok(Math.abs(torch.x - 5.5) > 0.5 && torch.z === 2.5, `out from the wall, over an open square: ${torch.x}`);
  assert.equal(torch.color, '#ffb060');
  assert.deepEqual([torch.bright, torch.dim], [4, 8], 'in squares');
  const brazier = scene.lights.find((l) => l.kind === 'brazier')!;
  assert.deepEqual([brazier.x, brazier.z, brazier.bright], [9.5, 3.5, 2]);
  assert.ok(!scene.boxes.some((b) => b.part === 'object'), 'the brazier is drawn as a brazier, not a block');
  assert.deepEqual(scene.pits, [{ x: 8, z: 4, depth: 2 }]);
  assert.equal(scene.levels.get('8,4'), undefined, 'a pit doesn’t raise the ground');
  assert.equal(scene.boxes.find((b) => b.part === 'cover')!.h, 0.8, '4 ft of crate');
  const door = scene.boxes.find((b) => b.part === 'door')!;
  assert.equal(door.h, 2, 'a 10-ft doorway');
  assert.equal(buildScene(readMap({ ...PLAN, lighting: undefined })!).lighting, 'bright', 'outdoors by day unless it says');
});

test('progress the wiki accepts: secret doors found (with their level when deeper), no fight without a room', () => {
  let s = encounterFromDungeon(MILL, 'd1', deps());
  const secret = s.map!.terrain.findIndex((t) => t.secret === 'door');
  s = applyAction(s, { type: 'secretDoor', index: secret }, deps());
  s.dungeon!.fights.push({ room: null, rounds: 2, defeated: ['Rat'], xp: 10, at: 0 }, { room: '1', rounds: 3, defeated: ['Skeleton 1'], xp: 50, at: 0 });
  const body = dungeonProgress(s.dungeon!, Date.UTC(2026, 9, 26));
  assert.deepEqual(body.secret_doors_found, [[6, 1]]);
  assert.deepEqual(body.fights, [{ room: '1', rounds: 3, defeated: ['Skeleton 1'], xp: 50 }], 'the wiki files fights by room');

  const deeper = { ...s, map: { ...s.map!, level: 2, terrain: [...s.map!.terrain, { kind: 'wall' as const, cells: [[7, 5] as [number, number]], secret: 'door' as const }] } };
  const found = applyAction(deeper, { type: 'secretDoor', index: deeper.map.terrain.length - 1 }, deps());
  assert.deepEqual(found.dungeon!.secretDoorsFound!.at(-1), [7, 5, 2]);
});

test('a progress report the wiki refuses says why; a wiki without the route is only a note', async () => {
  const config = configSchema.parse({ upload: { url: 'https://wiki.example/api/sessions', format: 'ardent-weave' } });
  const run = encounterFromDungeon(MILL, 'd1', deps()).dungeon!;
  const send = (res: Response) => new WikiDungeons(mkdtempSync(join(tmpdir(), 'dc-')), () => config, () => 'k'.repeat(24), async () => res).sendProgress(run);
  assert.equal(await send(Response.json({ error: 'No room "9" in The Old Mill.' }, { status: 404 })), 'The wiki refused the dungeon progress (404: No room "9" in The Old Mill.)');
  assert.match(await send(new Response('<html>Not found</html>', { status: 404 })), /doesn’t take dungeon progress yet/);
  assert.equal(await send(Response.json({ ok: true, id: 'the-old-mill', run: false, changed: true })), 'Dungeon progress sent to the wiki');
});

// --- A dungeon on two levels (#110) ------------------------------------------------------------

/** A plan: a room inside walls, with stairs at the given squares. */
function plan(level: number, room: { id: string; rect: [number, number, number, number] }, stairs: Array<Record<string, unknown>>) {
  return {
    v: 1, width: 10, height: 8, ground: 'rock', lighting: 'dark', level,
    terrain: [
      { kind: 'wall', rect: [0, 0, 10, 1] }, { kind: 'wall', rect: [0, 7, 10, 1] }, { kind: 'wall', rect: [0, 1, 1, 6] }, { kind: 'wall', rect: [9, 1, 1, 6] },
      { kind: 'floor', rect: room.rect, ground: 'stone' },
      ...stairs.map((x) => ({ kind: 'floor', asset: 'stairs', ...x })),
    ],
    tokens: [], notes: [], rooms: [{ id: room.id, name: room.id, rect: room.rect }],
  };
}
const CRYPT: WikiDungeon = {
  ...MILL,
  id: 'chapel-crypt',
  title: 'Chapel Crypt',
  map: null,
  maps: [
    { level: 1, map: plan(1, { id: '1', rect: [1, 1, 8, 6] }, [{ cells: [[1, 1]], label: 'stairs (the way in)', to: { level: 0 }, rises: 'up' }, { cells: [[8, 6]], to: { level: 2, at: [2, 2] }, rises: 'down' }]) },
    { level: 2, map: plan(2, { id: '2', rect: [1, 1, 8, 6] }, [{ cells: [[2, 2]], to: { level: 1, at: [8, 6] }, rises: 'up' }]) },
  ],
  rooms: [
    { ...MILL.rooms[1]!, key: '1', name: 'Nave', level: 1, encounter: null },
    { ...MILL.rooms[0]!, key: '2', name: 'Ossuary', level: 2 },
  ],
};
CRYPT.map = CRYPT.maps![0]!.map;

test('a dungeon on two levels: start at the way in, take the stairs down and back, fog kept per level', () => {
  let s = encounterFromDungeon(CRYPT, 'd2', deps());
  assert.deepEqual([s.dungeon!.level, s.map!.level], [1, 1]);
  assert.deepEqual(s.map!.tokens[0]!.at, [1, 1], 'at the way in, not the stairs down');
  assert.throws(() => applyAction(s, { type: 'fight', room: '2' }, deps()), /Ossuary is on level 2: take the stairs first/);
  const down = s.map!.terrain.findIndex((t) => t.to?.level === 2);
  assert.throws(() => applyAction(s, { type: 'stairs', index: s.map!.terrain.findIndex((t) => t.to?.level === 0) }, deps()), /don’t lead to another level/, 'the way out isn’t a level');

  s = applyAction(s, { type: 'move', token: 'aria', at: [8, 6] }, deps());
  const seenUp = s.fog!.revealed.length;
  s = applyAction(s, { type: 'stairs', index: down }, deps());
  assert.deepEqual([s.dungeon!.level, s.map!.level], [2, 2]);
  assert.deepEqual(s.map!.tokens.map((t) => [t.id, t.at]), [['aria', [2, 2]]], 'out at the bottom of the stairs');
  assert.ok(s.fog!.revealed.includes('5,4'), 'they see the room they came down into');
  assert.ok(s.fog!.revealed.length < seenUp + 60, 'and only that: level 1’s fog stayed upstairs');
  assert.equal(s.dungeon!.levels!.find((x) => x.level === 1)!.map.tokens.length, 0, 'nobody left upstairs');
  assert.match(s.log.at(-1)!.text, /takes the stairs down to level 2/);
  assert.equal(s.dungeon!.current, '2', 'the panel opens the room they came out in');

  s = applyAction(s, { type: 'fight', room: '2' }, deps());
  assert.throws(() => applyAction(s, { type: 'stairs', index: s.map!.terrain.findIndex((t) => t.to?.level === 1) }, deps()), /Finish this fight first/);
  const monsters = s.map!.tokens.filter((t) => t.kind === 'monster').length;
  s = applyAction(s, { type: 'endFight' }, deps());
  s = applyAction(s, { type: 'stairs', index: s.map!.terrain.findIndex((t) => t.to?.level === 1) }, deps());
  assert.equal(s.dungeon!.level, 1);
  assert.deepEqual(s.map!.tokens.find((t) => t.id === 'aria')!.at, [8, 6], 'back up by the same stairs');
  assert.equal(s.fog!.revealed.length, seenUp, 'what they saw upstairs is still seen');
  assert.equal(s.dungeon!.levels!.find((x) => x.level === 2)!.map.tokens.filter((t) => t.kind === 'monster').length, monsters, 'the skeletons stay below');
});

// --- A room's prepared battle (#109) ----------------------------------------------------------

/** The Millyard's battle as /api/encounters/<id> sends it: its own map, the party and two skeletons placed. */
const MILLYARD: WikiEncounter = {
  id: 'millyard-skeletons', title: 'Millyard Skeletons', campaign: 'Crimson Tide', place: 'The Old Mill', difficulty: 'moderate', party_level: 3, xp: 100, status: 'prepared', run: false, updated: null,
  summary: 'Skeletons in the ash.', read_aloud: null, setup: null, tactics: 'They flank.', changes: null, treasure: null,
  creatures: [{ name: 'Skeleton', source: 'srd', ac: 13, hp: 13, xp: 50, size: 'Medium', count: 2 }],
  map: {
    v: 1, width: 8, height: 6, lighting: 'dark', terrain: [{ kind: 'cover', cells: [[4, 3]], cover: 'half' }],
    tokens: [
      { id: 'aria', name: 'Aria', kind: 'pc', size: 'medium', at: [1, 3] },
      { id: 'skeleton-1', name: 'Skeleton 1', kind: 'monster', size: 'medium', at: [6, 2] },
      { id: 'skeleton-2', name: 'Skeleton 2', kind: 'monster', size: 'medium', at: [6, 4] },
    ],
    notes: [],
  },
  party: MILL.party,
};
const WITH_BATTLE: WikiDungeon = { ...MILL, rooms: [{ ...MILL.rooms[0]!, encounter: { ...MILL.rooms[0]!.encounter!, encounter_id: 'millyard-skeletons' } }, MILL.rooms[1]!] };

test('a room’s prepared battle: fought on its own map, then back to the floor plan as it was', () => {
  let s = encounterFromDungeon(WITH_BATTLE, 'd3', deps());
  s = applyAction(s, { type: 'move', token: 'aria', at: [3, 3] }, deps());
  const plan = s.map!;
  const seen = s.fog!.revealed.length;
  assert.throws(() => applyAction(s, { type: 'fight', room: '1', prepared: true }, deps()), /comes from the wiki/);

  s = applyAction(s, { type: 'fight', room: '1', battle: MILLYARD }, deps());
  assert.equal(s.status, 'setup');
  assert.deepEqual([s.map!.width, s.map!.height], [8, 6], 'the room’s own map');
  assert.deepEqual(s.map!.tokens.map((t) => [t.name, t.at]), [['Aria', [1, 3]], ['Skeleton 1', [6, 2]], ['Skeleton 2', [6, 4]]], 'everyone where the battle puts them');
  assert.equal(s.fog, undefined, 'the whole room in view');
  assert.equal(s.statBlocks.Skeleton!.hp, 13);
  assert.equal(s.dungeon!.fight!.battle, 'Millyard Skeletons');
  assert.match(s.log.at(-1)!.text, /on its prepared map \(Millyard Skeletons\)/);

  const skeleton = s.combatants.find((c) => c.name === 'Skeleton 1')!.id;
  s = applyAction(s, { type: 'damage', id: skeleton, amount: 13 }, deps());
  s = applyAction(s, { type: 'endFight' }, deps());
  assert.equal(s.status, 'exploring');
  assert.deepEqual([s.map!.width, s.map!.height], [plan.width, plan.height], 'back on the floor plan');
  assert.deepEqual(s.map!.tokens.find((t) => t.id === 'aria')!.at, [3, 3], 'where she stood before the fight');
  const left = s.map!.tokens.find((t) => t.name === 'Skeleton 2')!;
  assert.ok(left.at[0] >= 1 && left.at[0] <= 4, `the one left is in the millyard: ${left.at}`);
  assert.equal(s.fog!.revealed.length, seen, 'the fog as it was');
  assert.equal(s.dungeon!.plan, undefined);
  assert.deepEqual(s.dungeon!.fights.map((f) => [f.room, f.defeated]), [['1', ['Skeleton 1']]]);
  assert.throws(() => applyAction(s, { type: 'fight', room: '1', battle: MILLYARD }, deps()), /already on the plan: fight them there/);
});

test('the API fetches a room’s prepared battle from the wiki', async () => {
  const root = mkdtempSync(join(tmpdir(), 'battle-api-'));
  writeFileSync(join(root, 'config.yaml'), 'upload:\n  url: https://wiki.example/api/sessions\n  format: ardent-weave\n');
  const asked: string[] = [];
  const doFetch: typeof fetch = async (input) => {
    const url = new URL(String(input));
    asked.push(`${url.pathname}${url.search}`);
    if (url.pathname === '/api/dungeons/the-old-mill') return Response.json(WITH_BATTLE);
    if (url.pathname === '/api/encounters/millyard-skeletons') return Response.json(MILLYARD);
    if (url.pathname.endsWith('/progress')) return Response.json({ ok: true });
    return Response.json({ error: 'No such thing.' }, { status: 404 });
  };
  const old = process.env.WIKI_UPLOAD_TOKEN;
  process.env.WIKI_UPLOAD_TOKEN = 'k'.repeat(24);
  try {
    const store = new EncounterStore(join(root, 'data'), deps(), () => {});
    const api = createApi({ password: 'pw', dataDir: join(root, 'data'), configStore: new ConfigStore(join(root, 'config.yaml')), jobs: new JobRunner(async () => {}), encounters: store, httpFetch: doFetch });
    const call = (path: string, body: unknown) => api.request(path, { method: 'POST', headers: { Authorization: 'Bearer pw', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    await call('/encounter', { dungeonId: 'the-old-mill', campaign: 'Crimson Tide' });
    const none = await call('/encounter/actions', { type: 'fight', room: '2', prepared: true });
    assert.equal(none.status, 400);
    const fight = (await (await call('/encounter/actions', { type: 'fight', room: '1', prepared: true })).json()) as EncounterState;
    assert.equal(fight.dungeon!.fight!.battle, 'Millyard Skeletons');
    assert.ok(asked.includes('/api/encounters/millyard-skeletons?campaign=Crimson+Tide'), asked.join(', '));
  } finally {
    if (old === undefined) delete process.env.WIKI_UPLOAD_TOKEN;
    else process.env.WIKI_UPLOAD_TOKEN = old;
  }
});
