import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankMap, type BattleMap, type MapToken } from '../src/shared/battlemap.js';
import { flankedTokens, flankPieces, pathFeet } from '../src/shared/tableAids.js';

/** 10×8 with a wall down x = 4 (rows 0–5), a gap at the bottom, and a patch of difficult ground. */
function room(tokens: MapToken[] = []): BattleMap {
  return {
    ...blankMap(10, 8),
    terrain: [
      { kind: 'wall', rect: [4, 0, 1, 6] },
      { kind: 'difficult', rect: [0, 6, 2, 2] },
    ],
    tokens,
  };
}
const token = (id: string, kind: MapToken['kind'], at: [number, number], size: MapToken['size'] = 'medium'): MapToken => ({ id, name: id, kind, size, at });

test('how far a move walked: diagonals count 5 ft, difficult ground double, around walls', () => {
  const m = room();
  assert.equal(pathFeet(m, 'medium', [0, 0], [3, 3]), 15, 'diagonals are 5 ft');
  assert.equal(pathFeet(m, 'medium', [2, 5], [0, 7]), 20, 'two steps, both into difficult ground');
  assert.equal(pathFeet(m, 'medium', [3, 2], [5, 2]), 40, 'the long way round the wall, through the gap');
  assert.equal(pathFeet(m, 'medium', [3, 2], [3, 2]), 0);
});

test('with no way round (a jump, a teleport), it counts the straight line', () => {
  const m: BattleMap = { ...room(), terrain: [{ kind: 'wall', rect: [4, 0, 1, 8] }] };
  assert.equal(pathFeet(m, 'medium', [3, 2], [6, 2]), 15);
  assert.equal(pathFeet(m, 'medium', [3, 2], [4, 2]), 5, 'into the wall itself');
});

test('a big creature pays for every square it covers', () => {
  const m = room();
  assert.equal(pathFeet(m, 'large', [0, 3], [0, 4]), 5, 'rows 4–5 are clear');
  assert.equal(pathFeet(m, 'large', [0, 4], [0, 5]), 10, 'its lower half steps into difficult ground');
});

test('flanked: two foes on opposite sides or corners, able to act', () => {
  const ogre = token('ogre', 'monster', [6, 3]);
  const sides = flankedTokens(room([ogre, token('ari', 'pc', [5, 3]), token('bob', 'pc', [7, 3])]), flankPieces([
    { tokenId: 'ogre', kind: 'monster', down: false, conditions: [] },
    { tokenId: 'ari', kind: 'pc', down: false, conditions: [] },
    { tokenId: 'bob', kind: 'pc', down: false, conditions: [] },
  ]));
  assert.deepEqual([...sides], ['ogre']);

  const corners = room([ogre, token('ari', 'pc', [5, 2]), token('bob', 'pc', [7, 4])]);
  const pieces = (bobDown = false, bobKind = 'pc', stunned = false) =>
    flankPieces([
      { tokenId: 'ogre', kind: 'monster', down: false, conditions: [] },
      { tokenId: 'ari', kind: 'pc', down: false, conditions: stunned ? [{ name: 'Stunned' }] : [] },
      { tokenId: 'bob', kind: bobKind, down: bobDown, conditions: [] },
    ]);
  assert.deepEqual([...flankedTokens(corners, pieces())], ['ogre'], 'opposite corners');
  assert.deepEqual([...flankedTokens(corners, pieces(true))], [], 'Bob is down');
  assert.deepEqual([...flankedTokens(corners, pieces(false, 'pc', true))], [], 'Ari is stunned');
  assert.deepEqual([...flankedTokens(corners, pieces(false, 'npc'))], [], 'an NPC is on no one’s side');

  const lShape = room([ogre, token('ari', 'pc', [5, 3]), token('bob', 'pc', [6, 4])]);
  assert.deepEqual([...flankedTokens(lShape, pieces())], [], 'side by side is not opposite');
});

test('flanking a large creature: either side of its 2×2', () => {
  const m = room([token('ogre', 'monster', [6, 3], 'large'), token('ari', 'pc', [5, 4]), token('bob', 'pc', [8, 3])]);
  const pieces = flankPieces(['ogre', 'ari', 'bob'].map((id) => ({ tokenId: id, kind: id === 'ogre' ? 'monster' : 'pc', down: false, conditions: [] })));
  assert.deepEqual([...flankedTokens(m, pieces)], ['ogre']);
});
