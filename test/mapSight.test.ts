import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSecretDoor, playersMap, readMap, secretDoorsAt, canPlace } from '../src/shared/battlemap.js';
import { canSee, clipToRevealed, readTemplate, roomAt, sightBlockers, templateCells, visibleFrom } from '../src/shared/mapSight.js';
import { applyAction, makeCombatant, newEncounter } from '../src/encounter/rules.js';
import { playerAction, playerView } from '../src/play/view.js';
import type { EncounterState } from '../src/shared/types.js';

/**
 * Two rooms, 1 (west) and 2 (east), split by a wall at x = 5 with a closed door at [5, 2] and a
 * secret door at [5, 4]. A pillar stands in room 1.
 */
const RAW = {
  v: 1,
  width: 11,
  height: 7,
  ground: 'rock',
  art: { style: 'dungeon' },
  terrain: [
    { kind: 'wall', rect: [5, 0, 1, 7] },
    { kind: 'door', cells: [[5, 2]], state: 'closed' },
    { kind: 'wall', cells: [[5, 4]], secret: 'door', label: 'loose stone' },
    { kind: 'object', cells: [[2, 3]], asset: 'pillar' },
  ],
  tokens: [
    { id: 'ari', name: 'Ari', kind: 'pc', size: 'medium', at: [1, 3] },
    { id: 'ghoul', name: 'Ghoul', kind: 'monster', size: 'medium', at: [8, 3] },
  ],
  notes: [{ at: [5, 4], text: 'secret door' }],
  rooms: [
    { id: '1', name: 'Guard room', rect: [0, 0, 5, 7] },
    { id: '2', name: 'Crypt', rect: [6, 0, 5, 7] },
    { name: 'no id', rect: [0, 0, 1, 1] },
  ],
};
const map = () => readMap(RAW)!;

test('rooms and secret doors are read; players get plain walls, no rooms, notes or labels (#78)', () => {
  const m = map();
  assert.deepEqual(m.rooms?.map((r) => r.id), ['1', '2']);
  assert.equal(roomAt(m, [7, 1])?.name, 'Crypt');
  assert.deepEqual(secretDoorsAt(m, [5, 4]), [2]);
  const p = playersMap(m, new Set());
  assert.equal(p.rooms, undefined);
  assert.deepEqual(p.notes, []);
  assert.deepEqual(p.terrain[2], { kind: 'wall', cells: [[5, 4]] }, 'no secret flag, no label');

  assert.equal(canPlace(m, 'ari', 'medium', [5, 4]).ok, false, 'a secret door is a wall until found');
  const found = findSecretDoor(m, 2);
  assert.deepEqual(found.terrain[2], { kind: 'door', cells: [[5, 4]], label: 'loose stone', state: 'closed' });
  assert.throws(() => findSecretDoor(found, 2), /isn’t a secret door/);
});

test('line of sight: walls, closed doors and objects block; an open door lets you see through', () => {
  const m = map();
  const blockers = sightBlockers(m);
  assert.equal(canSee(blockers, [1, 3], [4, 3]), false, 'the pillar is in the way');
  assert.equal(canSee(blockers, [1, 3], [3, 0]), true);
  assert.equal(canSee(blockers, [3, 1], [5, 1]), true, 'a wall itself is seen');
  assert.equal(canSee(blockers, [4, 2], [8, 2]), false, 'the closed door');
  const open = { ...m, terrain: m.terrain.map((t, i) => (i === 1 ? { ...t, state: 'open' as const } : t)) };
  assert.equal(canSee(sightBlockers(open), [4, 2], [8, 2]), true);
  const seen = visibleFrom(m, [[1, 3]]);
  assert.ok(seen.has('0,0') && !seen.has('8,3') && !seen.has('3,3'), 'room 1, not behind the pillar, not room 2');
  assert.equal(visibleFrom(m, [[1, 3]], 1).size, 9, 'range 1: the 3×3 around (the pillar itself is seen)');
});

test('spell areas cover the squares at least half inside them', () => {
  // A 10 ft sphere around the corner (5, 5): the 4×4 around it, minus the four far corners.
  assert.equal(templateCells({ shape: 'sphere', at: [5, 5], size: 10 }, 20, 20).length, 12);
  assert.equal(templateCells({ shape: 'cube', at: [0, 0], size: 15 }, 20, 20).length, 9);
  // A 30 ft line along a grid line covers half of two rows: the 2024 rule counts neither... so we
  // aim it down the middle of a row instead, which is how it's placed in play.
  assert.equal(templateCells({ shape: 'line', at: [0, 1], to: [6, 1], size: 30 }, 20, 20).length, 12, 'along a grid line: both rows, half each');
  const cone = (size: number) => templateCells({ shape: 'cone', at: [0, 5], to: [9, 5], size }, 20, 20);
  const c15 = cone(15);
  assert.ok(c15.every(([x]) => x < 3), 'within 15 ft');
  assert.deepEqual(c15.map(([x, y]) => [x, 9 - y]).sort().join(';'), c15.map(([x, y]) => [x, y]).sort().join(';'), 'symmetric about its axis');
  assert.ok(cone(30).length > c15.length * 3, 'four times the area at twice the length');
  assert.throws(() => readTemplate({ shape: 'blob', at: [0, 0], size: 10 }, map()), /shape/);
  assert.throws(() => readTemplate({ shape: 'sphere', at: [0, 0], size: 12 }, map()), /steps of 5/);
  assert.throws(() => readTemplate({ shape: 'sphere', at: [99, 0], size: 10 }, map()), /grid corners/);
});

const deps = { now: () => 1000, d20: () => 10 };
function fight(): EncounterState {
  const s = newEncounter('e', 'Crypt', 0);
  s.map = map();
  s.combatants = [makeCombatant('ari', { name: 'Ari', kind: 'pc', hp: 10, tokenId: 'ari' }), makeCombatant('ghoul', { name: 'Ghoul', hp: 22, tokenId: 'ghoul' })];
  s.order = ['ari', 'ghoul'];
  return s;
}

test('fog of war follows what the party sees; players get only revealed squares (#55)', () => {
  let s = applyAction(fight(), { type: 'fog', on: true }, deps);
  assert.ok(s.fog!.revealed.includes('0,0') && !s.fog!.revealed.includes('8,3'));
  let view = playerView(s, 'ari');
  assert.deepEqual(view.map!.tokens.map((t) => t.id), ['ari'], 'the ghoul is under the fog');
  assert.ok(view.map!.terrain.every((t) => t.cells!.every(([x]) => x <= 5)), 'nothing from room 2 is sent');
  assert.equal(view.fog!.length, s.fog!.revealed.length);

  s = applyAction(s, { type: 'door', index: 1, state: 'open' }, deps);
  s = applyAction(s, { type: 'move', token: 'ari', at: [4, 2] }, deps);
  assert.ok(s.fog!.revealed.includes('8,2'), 'through the open door');
  s = applyAction(s, { type: 'fogRoom', at: [8, 5] }, deps);
  assert.ok(s.fog!.revealed.includes('10,6'));
  s = applyAction(s, { type: 'fogCells', cells: [[10, 6], [99, 99] as never], hide: true }, deps);
  assert.ok(!s.fog!.revealed.includes('10,6'));
  assert.throws(() => applyAction(s, { type: 'fogRoom', at: [5, 3] }, deps), /isn’t in a room/);
  s = applyAction(s, { type: 'secretDoor', index: 2 }, deps);
  assert.equal(s.map!.terrain[2]!.kind, 'door');
  assert.equal(applyAction(s, { type: 'fog', on: false }, deps).fog, undefined);
  assert.throws(() => applyAction(newEncounter('x', 'x', 0), { type: 'fog', on: true }, deps), /no map/);
});

test('spell areas: one per person, shared with the table; players clear only their own', () => {
  let s = applyAction(fight(), applyFrom(playerAction(fight(), 'ari', { type: 'template', template: { shape: 'sphere', at: [2, 2], size: 10 } })), deps);
  s = applyAction(s, { type: 'template', template: { shape: 'cone', at: [7, 3], to: [9, 3], size: 15, label: 'Breath' } }, deps);
  assert.deepEqual(s.templates!.map((t) => [t.by, t.label]), [['ari', 'Ari'], ['dm', 'Breath']]);
  s = applyAction(s, applyFrom(playerAction(s, 'ari', { type: 'template', template: { shape: 'sphere', at: [3, 3], size: 10 } })), deps);
  assert.equal(s.templates!.filter((t) => t.by === 'ari').length, 1, 'placing again moves it');
  const dmArea = s.templates!.find((t) => t.by === 'dm')!;
  assert.throws(() => applyAction(s, applyFrom(playerAction(s, 'ari', { type: 'clearTemplate', id: dmArea.id })), deps), /isn’t your area/);
  assert.equal(applyAction(s, { type: 'clearTemplate' }, deps).templates!.length, 0);
});

function applyFrom<T>(action: T): T {
  return action;
}

test('a players’ copy cut to the fog keeps only revealed squares', () => {
  const clipped = clipToRevealed(map(), new Set(['0,0', '1,3', '5,0']));
  assert.deepEqual(clipped.terrain.map((t) => t.cells), [[[5, 0]]]);
  assert.deepEqual(clipped.tokens.map((t) => t.id), ['ari']);
});
