import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readMap } from '../src/shared/battlemap.js';
import { buildScene } from '../src/shared/mapScene.js';
import { configSchema } from '../src/config/schema.js';
import { WikiDungeons } from '../src/encounter/dungeonWiki.js';
import { dungeonProgress, encounterFromDungeon } from '../src/encounter/dungeon.js';
import { applyAction, type RuleDeps } from '../src/encounter/rules.js';
import type { WikiDungeon } from '../src/shared/types.js';

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
