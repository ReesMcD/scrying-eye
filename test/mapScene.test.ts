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
