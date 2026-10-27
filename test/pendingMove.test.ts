import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankMap, type BattleMap } from '../src/shared/battlemap.js';
import { dropAllowed, PENDING_MS, pendingMove, settled, shownAt } from '../web/src/map/pendingMove.js';

test('a dropped token stays where it landed until the map catches up: no flash back to where it was', () => {
  const p = pendingMove('ari', [1, 1], [3, 1], 1000);
  assert.deepEqual(shownAt({ id: 'ari', at: [1, 1] }, p, 1100), [3, 1], 'the server hasn’t answered yet');
  assert.deepEqual(shownAt({ id: 'bob', at: [1, 1] }, p, 1100), [1, 1], 'only that token');
  assert.equal(settled({ tokens: [{ id: 'ari', at: [1, 1] }] }, p, 1100), false);
  assert.equal(settled({ tokens: [{ id: 'ari', at: [3, 1] }] }, p, 1100), true, 'the map has it there now');
  assert.equal(settled({ tokens: [{ id: 'ari', at: [1, 1] }] }, p, 1000 + PENDING_MS + 1), true, 'refused or lost: it goes back');
  assert.deepEqual(shownAt({ id: 'ari', at: [1, 1] }, p, 1000 + PENDING_MS + 1), [1, 1]);
});

test('a drop into a pillar, off the board or on the same square isn’t sent', () => {
  const m: BattleMap = { ...blankMap(4, 4), terrain: [{ kind: 'object', asset: 'pillar', cells: [[2, 2]] }], tokens: [] };
  assert.equal(dropAllowed(m, { size: 'medium' }, [0, 0], [2, 2]), false);
  assert.equal(dropAllowed(m, { size: 'medium' }, [0, 0], [4, 0]), false);
  assert.equal(dropAllowed(m, { size: 'medium' }, [0, 0], [0, 0]), false);
  assert.equal(dropAllowed(m, { size: 'medium' }, [0, 0], [1, 2]), true);
});
