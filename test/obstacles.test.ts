import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankMap, breakObstacle, crossings, crossingText, moveToken, obstaclesAt, readMap, solid, type BattleMap, type Terrain } from '../src/shared/battlemap.js';
import { pathFeet, pathRoute, routeCrossings } from '../src/shared/tableAids.js';
import { applyAction, makeCombatant, newEncounter } from '../src/encounter/rules.js';

const hows = (t: Terrain) => crossings(t).map((w) => w.how);

test('how each obstacle is crossed, by default: walls and pillars no, locked doors break, boulders climb, crates climb or jump', () => {
  assert.deepEqual(hows({ kind: 'wall', rect: [0, 0, 3, 1] }), ['no']);
  assert.deepEqual(hows({ kind: 'door', cells: [[0, 0]], state: 'closed' }), ['no']);
  assert.deepEqual(hows({ kind: 'door', cells: [[0, 0]], state: 'open' }), [], 'an open door is no obstacle');
  assert.deepEqual(crossings({ kind: 'door', cells: [[0, 0]], state: 'locked' }), [{ how: 'break', check: 'strength', dc: 15, ac: 15, hp: 18 }]);
  assert.deepEqual(crossings({ kind: 'object', cells: [[0, 0]], asset: 'boulder' }), [{ how: 'climb', check: 'athletics', dc: 10 }]);
  assert.deepEqual(hows({ kind: 'object', cells: [[0, 0]], asset: 'cart' }), ['climb', 'jump']);
  assert.deepEqual(hows({ kind: 'cover', cover: 'half', cells: [[0, 0]], asset: 'crates' }), ['climb', 'jump'], 'cover goes by its asset too');
  assert.deepEqual(hows({ kind: 'object', cells: [[0, 0]], asset: 'chest' }), ['climb'], 'anything else: climbed onto, no check');
  assert.deepEqual(hows({ kind: 'object', cells: [[0, 0]], asset: 'statue' }), ['no']);
  assert.deepEqual(hows({ kind: 'object', cells: [[0, 0]], label: 'Old oak tree' }), ['no']);
  assert.deepEqual(hows({ kind: 'difficult', cells: [[0, 0]], asset: 'rubble' }), ['difficult']);
  assert.deepEqual(hows({ kind: 'water', cells: [[0, 0]], depth: 'deep' }), ['swim']);
  assert.deepEqual(hows({ kind: 'object', cells: [[0, 0]], asset: 'brazier' }), [], 'a light is not in the way');
});

test('a map can say how its obstacle is crossed, which overrides the default', () => {
  const ledge: Terrain = { kind: 'wall', cells: [[0, 0]], label: 'low wall', cross: { how: 'climb', check: 'athletics', dc: 12, feet: 10 } };
  assert.deepEqual(hows(ledge), ['climb']);
  assert.equal(solid(ledge), false, 'a wall you can climb is not solid');
  assert.equal(crossingText(ledge, crossings(ledge)[0]!), 'climb the low wall (DC 12 Athletics, +10 ft)');
  assert.deepEqual(hows({ kind: 'object', cells: [[0, 0]], asset: 'boulder', cross: [{ how: 'nonsense' } as never] }), ['climb'], 'nothing readable: the default');
  const map = readMap({ v: 1, width: 3, height: 3, terrain: [ledge], tokens: [], notes: [] });
  assert.deepEqual(map!.terrain[0]!.cross, ledge.cross, 'kept when read from the wiki');
});

/** 7×3: a boulder at (3,1), a row of pillars above and below it. */
function pass(boulder: Partial<Terrain> = {}): BattleMap {
  return {
    ...blankMap(7, 3),
    terrain: [
      { kind: 'object', asset: 'pillar', cells: [[3, 0], [3, 2]] },
      { kind: 'object', asset: 'boulder', cells: [[3, 1]], ...boulder },
    ],
    tokens: [{ id: 'ari', name: 'Ari', kind: 'pc', size: 'medium', at: [1, 1] }],
  };
}

test('the route goes over a boulder when it’s the only way, costing double and saying what it takes', () => {
  const m = pass();
  assert.equal(pathFeet(m, 'medium', [1, 1], [5, 1]), 25, 'climbing onto the boulder counts double');
  const route = pathRoute(m, 'medium', [1, 1], [5, 1]);
  assert.deepEqual(routeCrossings(m, 'medium', route), ['climb the boulder (DC 10 Athletics)']);
  assert.deepEqual(routeCrossings(m, 'medium', pathRoute(m, 'medium', [1, 1], [2, 1])), [], 'nothing to cross');
  assert.deepEqual(moveToken(m, 'ari', [3, 1]).tokens[0]!.at, [3, 1], 'a creature can stand on a boulder');
  assert.throws(() => moveToken(m, 'ari', [3, 0]), /solid/, 'but never in a pillar');

  const steep = pass({ cross: { how: 'climb', check: 'athletics', dc: 15, feet: 15 } });
  assert.equal(pathFeet(steep, 'medium', [1, 1], [5, 1]), 35, 'what the map says it costs');
  const sheer = pass({ cross: { how: 'no' } });
  assert.equal(pathFeet(sheer, 'medium', [1, 1], [5, 1]), 20, 'no way past or round: the straight line');
  assert.throws(() => moveToken(sheer, 'ari', [3, 1]), /solid/);
});

test('the DM breaks a locked door open for good, or breaks an obstacle off the map', () => {
  const map: BattleMap = {
    ...blankMap(5, 3),
    terrain: [
      { kind: 'wall', rect: [2, 0, 1, 3] },
      { kind: 'door', cells: [[2, 1]], state: 'locked', label: 'cellar door' },
      { kind: 'object', asset: 'crate', cells: [[0, 0]] },
    ],
    tokens: [],
  };
  assert.deepEqual(obstaclesAt(map, [2, 1]), [0, 1], 'the wall and the door in it');
  assert.equal(pathFeet(map, 'medium', [1, 1], [3, 1]), 10, 'no way through a locked door: the straight line');

  let s = newEncounter('e', 'Cellar', 0);
  s.map = map;
  s.combatants = [makeCombatant('ari', { name: 'Ari', kind: 'pc', hp: 10 })];
  s = applyAction(s, { type: 'break', index: 1 }, { now: () => 1, d20: () => 10 });
  assert.equal(s.map!.terrain[1]!.state, 'open');
  assert.equal(s.log.at(-1)!.text, 'Broke the cellar door');
  assert.deepEqual(crossings(s.map!.terrain[1]!), [], 'a way through now');

  assert.equal(breakObstacle(map, 2).terrain.length, 2, 'the crate is gone');
  const row: BattleMap = { ...map, terrain: [{ kind: 'cover', asset: 'crates', rect: [0, 0, 3, 1] }] };
  assert.deepEqual(breakObstacle(row, 0, [1, 0]).terrain, [{ kind: 'cover', asset: 'crates', cells: [[0, 0], [2, 0]] }], 'one of a row of crates: just that one');
  assert.throws(() => breakObstacle(map, 0), /can’t be broken/, 'a plain wall stays');
});
