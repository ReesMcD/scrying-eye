import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import type { BattleMap, Terrain } from '../src/shared/battlemap.js';
import { buildScene } from '../src/shared/mapScene.js';
import { KIT_MODELS, kitPlan } from '../src/shared/kitPlan.js';
import { quickBattle } from '../src/encounter/quick.js';

const map = (terrain: Terrain[], extra: Partial<BattleMap> = {}): BattleMap => ({ v: 1, width: 6, height: 4, terrain, tokens: [], notes: [], ...extra });
const planOf = (m: BattleMap) => kitPlan(m, buildScene(m));

test('a forest or a field keeps its trees and painted ground: no dungeon pieces', () => {
  assert.equal(planOf(map([{ kind: 'object', asset: 'tree', cells: [[2, 2]] }], { ground: 'grass' })), null);
  const forest = quickBattle({ map: 'forest', party: ['A'], monsters: [] }, 'e', 0).map!;
  assert.equal(planOf(forest), null);
});

test('a straight wall is one piece a square; its ends get a pillar with an arm toward the wall', () => {
  const plan = planOf(map([{ kind: 'wall', cells: [[1, 0], [2, 0], [3, 0]] }], { ground: 'stone' }))!;
  const walls = plan.pieces.filter((p) => p.model === 'wall_half');
  const pillars = plan.pieces.filter((p) => p.model === 'pillar');
  // The middle square: a full-length piece along x, centred across the square.
  assert.ok(walls.some((p) => p.x === 2 && p.z === 2 - 2 + 0.5 && p.turn === 0 && p.sx === 0.5));
  // Each end: a pillar, and a half-length arm pointing at the middle.
  assert.equal(pillars.length, 2);
  assert.equal(walls.filter((p) => p.sx === 0.25).length, 2);
  // Every wall box is drawn by KayKit, 10 ft tall (2 squares: KayKit's 4 units at half scale).
  assert.equal(plan.replacedBoxes.size, 3);
  assert.ok(walls.every((p) => p.sy === 0.5));
});

test('a corner gets a pillar and an arm along each wall it joins', () => {
  const plan = planOf(map([{ kind: 'wall', cells: [[1, 1], [2, 1], [1, 2]] }]))!;
  const corner = plan.pieces.filter((p) => p.x === 1.5 && p.z === 1.5 && !p.model.startsWith('floor'));
  assert.deepEqual(corner.map((p) => p.model).sort(), ['pillar', 'wall_half', 'wall_half']);
});

test('the floor is tiled to match the ground, around water', () => {
  const stone = planOf(map([{ kind: 'water', cells: [[0, 0]] }], { ground: 'stone' }))!;
  const tiles = stone.pieces.filter((p) => p.model.startsWith('floor_tile'));
  assert.equal(tiles.length, 6 * 4 - 1, 'every square but the water');
  assert.equal(stone.floor, true);
  const wood = planOf(map([], { ground: 'wood' }))!;
  assert.ok(wood.pieces.every((p) => p.model.startsWith('floor_wood')));
});

test('crates, barrels, chests, tables, pillars and stairs become models; anything unknown stays a box', () => {
  const plan = planOf(
    map(
      [
        { kind: 'wall', cells: [[0, 0]] },
        { kind: 'cover', cover: 'half', asset: 'crates', cells: [[1, 1]] },
        { kind: 'cover', cover: 'half', label: 'Barrels', cells: [[2, 1]] },
        { kind: 'object', asset: 'chest', cells: [[3, 1]] },
        { kind: 'object', label: 'Long table', cells: [[4, 1]] },
        { kind: 'object', asset: 'pillar', cells: [[1, 2]] },
        { kind: 'object', label: 'Strange machine', cells: [[5, 3]] },
      ],
      { ground: 'stone' },
    ),
  )!;
  const models = new Set(plan.pieces.map((p) => p.model));
  for (const m of ['crates_stacked', 'barrel_large', 'chest', 'table_medium', 'pillar'] as const) assert.ok(models.has(m), m);
  const scene = buildScene(map([{ kind: 'object', label: 'Strange machine', cells: [[5, 3]] }], { ground: 'stone' }));
  assert.equal(kitPlan({ ground: 'stone', width: 6, height: 4 }, scene)!.replacedBoxes.size, 0, 'the machine keeps its box');
});

test('the quick battle dungeon is fully dressed, and every model it uses is bundled', () => {
  const dungeon = quickBattle({ map: 'dungeon', party: ['A'], monsters: [] }, 'e', 0).map!;
  const scene = buildScene(dungeon);
  const plan = kitPlan(dungeon, scene)!;
  const wallBoxes = scene.boxes.filter((b) => b.part === 'wall').length;
  assert.ok(wallBoxes > 0);
  assert.equal(scene.boxes.filter((b, i) => b.part === 'wall' && !plan.replacedBoxes.has(i)).length, 0);
  assert.equal(plan.replacedProps.size, scene.props.filter((p) => p.kind === 'pillar').length);
  for (const m of KIT_MODELS) assert.ok(existsSync(new URL(`../web/public/kaykit/${m}.glb`, import.meta.url)), `${m}.glb is bundled`);
});

test('stairs climb the way the map says, centred on their square', () => {
  const m = map([{ kind: 'wall', cells: [[2, 0]] }, { kind: 'floor', asset: 'stairs', cells: [[2, 1]] }], { ground: 'stone' });
  const scene = buildScene(m);
  const stairs = scene.props.find((p) => p.kind === 'stairs')!;
  const piece = kitPlan(m, scene)!.pieces.find((p) => p.model === 'stairs')!;
  assert.equal(piece.turn, stairs.facing ?? 0);
  // The model's origin is its bottom step's edge: half a square from the centre, away from the climb.
  const back = { x: piece.x + Math.sin(piece.turn) * 0.5, z: piece.z + Math.cos(piece.turn) * 0.5 };
  assert.ok(Math.abs(back.x - stairs.x) < 1e-9 && Math.abs(back.z - stairs.z) < 1e-9);
});

test('a stone floor is plain tiles: nothing that reads as a hole', () => {
  const plan = planOf(map([], { ground: 'stone', width: 20, height: 20 }))!;
  assert.ok(plan.pieces.every((p) => p.model === 'floor_tile_small'));
});
