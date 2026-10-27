import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BattleMap } from '../src/shared/battlemap.js';
import { playersMap } from '../src/shared/battlemap.js';
import { buildScene, cellAt, figureOf, sceneKey, WALL_HEIGHT } from '../src/shared/mapScene.js';

/** A room with a door in its east wall, a dais, a barrel, trees, a crate, a pond and rubble. */
const MAP: BattleMap = {
  v: 1,
  width: 12,
  height: 8,
  terrain: [
    { kind: 'wall', rect: [0, 0, 6, 1] },
    { kind: 'wall', cells: [[5, 1], [5, 3]] },
    { kind: 'door', cells: [[5, 2]], state: 'closed' },
    { kind: 'door', cells: [[2, 0]], state: 'open' },
    { kind: 'wall', cells: [[0, 1]], secret: 'door' },
    { kind: 'wall', cells: [[0, 2]], height: 20 },
    { kind: 'elevation', rect: [1, 1, 2, 1], height: 5, label: 'dais' },
    { kind: 'cover', cells: [[3, 2]], cover: 'half', label: 'barrel' },
    { kind: 'cover', cells: [[3, 3]], cover: 'three-quarters' },
    { kind: 'object', cells: [[8, 1], [9, 1]], asset: 'tree' },
    { kind: 'object', cells: [[1, 4]], label: 'stone pillar' },
    { kind: 'object', cells: [[2, 4]], asset: 'crate', height: 10 },
    { kind: 'water', rect: [8, 5, 2, 2], depth: 'deep' },
    { kind: 'difficult', cells: [[6, 6]], label: 'rubble' },
    { kind: 'difficult', cells: [[7, 6]], label: 'mud' },
  ],
  tokens: [],
  notes: [],
};

test('walls stand 10 ft tall unless the map says; secret doors stay walls (marked for the DM only)', () => {
  const scene = buildScene(MAP);
  const at = (x: number, z: number, part?: string) => scene.boxes.filter((b) => Math.floor(b.x) === x && Math.floor(b.z) === z && (!part || b.part === part));
  assert.equal(at(0, 0, 'wall')[0]!.h, WALL_HEIGHT);
  assert.equal(at(0, 2, 'wall')[0]!.h, 4, '20 ft');
  assert.equal(at(0, 1, 'secret').length, 1);
  assert.equal(buildScene(playersMap(MAP, new Set())).boxes.filter((b) => b.part === 'secret').length, 0, "players' maps don't say which wall it is");
});

test('a door faces along its wall, has a wall above it, and swings to the side when open', () => {
  const scene = buildScene(MAP);
  const east = scene.boxes.filter((b) => Math.floor(b.x) === 5 && Math.floor(b.z) === 2);
  const door = east.find((b) => b.part === 'door')!;
  assert.ok(door.w < 0.3 && door.d === 1, 'walls above and below it: it spans z');
  assert.ok(east.some((b) => b.part === 'lintel' && b.y > 1), 'wall above the doorway');
  const north = scene.boxes.find((b) => b.part === 'door' && Math.floor(b.z) === 0)!;
  assert.equal(north.state, 'open');
  assert.ok(north.w < 0.3, 'open: against the side of the doorway, out of the way');
});

test('raised ground lifts what stands on it; cover is waist or chest high; things are where the map says', () => {
  const scene = buildScene(MAP);
  assert.equal(scene.levels.get('1,1'), 1, '5 ft dais');
  assert.equal(figureOf(scene, { id: 'a', size: 'medium' }, [1, 1]).y, 1, 'standing on the dais');
  assert.equal(figureOf(scene, { id: 'o', size: 'large' }, [2, 1]).y, 1, 'a large creature half on it stands on its highest part');
  const fig = figureOf(scene, { id: 'o', size: 'large' }, [6, 3]);
  assert.deepEqual([fig.x, fig.z, fig.y, fig.height], [7, 4, 0, 2], 'the centre of its 2×2 squares');
  const cover = (z: number) => scene.boxes.find((b) => b.part === 'cover' && Math.floor(b.z) === z)!.h;
  assert.ok(cover(2) < cover(3));
  assert.deepEqual(scene.props.map((p) => p.kind).sort(), ['pillar', 'rock', 'tree', 'tree']);
  assert.equal(scene.boxes.find((b) => b.part === 'object')!.h, 2, 'a 10 ft crate stack');
  assert.equal(scene.water.length, 4);
  assert.ok(scene.water.every((w) => w.deep));
  const trees = scene.props.filter((p) => p.kind === 'tree');
  assert.notEqual(trees[0]!.h, trees[1]!.h, 'not all the same tree');
});

test('squares under a point, and a key that ignores moving tokens', () => {
  const scene = buildScene(MAP);
  assert.deepEqual(cellAt(scene, 3.7, 2.1), [3, 2]);
  assert.equal(cellAt(scene, -0.1, 2), null);
  assert.equal(cellAt(scene, 12, 0), null);
  const moved = { ...MAP, tokens: [{ id: 'a', name: 'A', kind: 'pc' as const, size: 'medium' as const, at: [1, 1] as [number, number] }] };
  assert.equal(sceneKey(moved), sceneKey(MAP));
  assert.notEqual(sceneKey({ ...MAP, terrain: MAP.terrain.slice(1) }), sceneKey(MAP));
});

test('a dungeon plan: buried rock becomes a few big blocks, room walls stay, and the camera frames the dug-out part', () => {
  // 20×12 of solid rock with one 4×3 room carved out at (5, 4), stairs on its west side, a statue, a chest and an altar.
  const plan: BattleMap = {
    v: 1,
    width: 20,
    height: 12,
    ground: 'rock',
    terrain: [
      { kind: 'wall', rect: [0, 0, 20, 4], asset: 'wall' },
      { kind: 'wall', rect: [0, 7, 20, 5], asset: 'wall' },
      { kind: 'wall', rect: [0, 4, 5, 3], asset: 'rock' },
      { kind: 'wall', rect: [9, 4, 11, 3], asset: 'wall' },
      { kind: 'floor', rect: [5, 4, 4, 3], ground: 'stone' },
      { kind: 'floor', cells: [[5, 5]], asset: 'stairs' },
      { kind: 'object', cells: [[7, 4]], asset: 'statue' },
      { kind: 'object', cells: [[8, 6]], asset: 'chest' },
      { kind: 'object', cells: [[6, 6]], asset: 'altar' },
      { kind: 'cover', cells: [[7, 6]], asset: 'sarcophagus' },
    ],
    tokens: [],
    notes: [],
  };
  const scene = buildScene(plan);
  const parts = (p: string) => scene.boxes.filter((b) => b.part === p);
  // The ring of walls around the room (6×5 minus the room's 4×3) stays as squares; the rest is merged.
  assert.equal(parts('wall').length + parts('rock').length, 6 * 5 - 4 * 3);
  assert.equal(parts('rock').length, 3, 'the natural rock face west of the room');
  const buried = 20 * 12 - 6 * 5;
  assert.equal(parts('mass').reduce((n, b) => n + b.w * b.d, 0), buried, 'every buried square once');
  assert.ok(parts('mass').length <= 6, `merged into a few blocks (got ${parts('mass').length})`);
  assert.deepEqual(scene.open, { x: 3, z: 2, w: 8, d: 7 }, 'the room and its walls, a square of margin around');

  const stairs = scene.props.find((p) => p.kind === 'stairs')!;
  assert.equal(stairs.facing, Math.PI / 2, 'they rise west, into the rock they lead out through');
  assert.deepEqual(scene.props.map((p) => p.kind).sort(), ['stairs', 'statue']);
  assert.equal(parts('chest').length, 1);
  assert.equal(parts('altar').length, 2, 'the altar, and the sarcophagus in stone');
});

test('a boulder used as cover stands as a rock, not a crate', () => {
  const scene = buildScene({ v: 1, width: 4, height: 4, terrain: [{ kind: 'cover', cover: 'half', asset: 'rock boulder', cells: [[1, 1]] }], tokens: [], notes: [] });
  assert.equal(scene.boxes.filter((b) => b.part === 'cover').length, 0);
  assert.equal(scene.props.filter((p) => p.kind === 'rock').length, 1);
});
