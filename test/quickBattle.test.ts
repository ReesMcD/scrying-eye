import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { quickBattle, QUICK_MAPS, QUICK_MONSTERS } from '../src/encounter/quick.js';
import { statBlock } from '../src/encounter/srdMonsters.js';
import { sizeFromHitDice } from '../src/srd/lookup.js';
import { newEncounter } from '../src/encounter/rules.js';
import { applyAction } from '../src/encounter/rules.js';
import { canPlace, footprint } from '../src/shared/battlemap.js';
import { createApi } from '../src/app/api.js';
import { ConfigStore } from '../src/app/configStore.js';
import { JobRunner } from '../src/app/jobs.js';
import type { EncounterState, QuickBattleOptions } from '../src/shared/types.js';

const deps = { now: () => 1, d20: () => 10 };

test('a quick battle puts the party and the monsters on the board, at their sizes, ready to start', () => {
  const s = quickBattle({ map: 'dungeon', party: ['Thorin', 'Liora'], monsters: [{ name: 'Goblin Warrior', count: 3 }, { name: 'Adult Red Dragon', count: 1 }] }, 'e1', 0);
  assert.equal(s.title, 'Basic dungeon');
  assert.deepEqual(s.order, ['thorin', 'liora', 'goblin-warrior-1', 'goblin-warrior-2', 'goblin-warrior-3', 'adult-red-dragon'], 'party first, then monsters as added');
  const tokens = s.map!.tokens;
  assert.equal(tokens.length, 6);
  assert.equal(tokens.find((t) => t.id === 'adult-red-dragon')!.size, 'huge');
  assert.equal(tokens.find((t) => t.id === 'goblin-warrior-1')!.size, 'small');
  // Nobody overlaps anybody, or a wall.
  const seen = new Set<string>();
  for (const t of tokens)
    for (const [x, y] of footprint(t.at, t.size)) {
      assert.ok(!seen.has(`${x},${y}`), `${t.name} overlaps`);
      seen.add(`${x},${y}`);
    }
  for (const t of tokens) assert.ok(canPlace(s.map!, t.id, t.size, t.at).ok, `${t.name} stands somewhere legal`);
  // No stats are tracked for anyone; monsters keep their stat block to read.
  assert.ok(s.combatants.every((c) => c.hp === null && c.ac === null && c.initiative === null));
  assert.equal(s.statBlocks['Adult Red Dragon']!.cr, '17');
  const running = applyAction(s, { type: 'begin' }, deps);
  assert.deepEqual([running.round, running.turn], [1, 'thorin']);
});

test('every quick map builds, and every quick monster is in the 2024 rules', () => {
  for (const id of Object.keys(QUICK_MAPS) as Array<keyof typeof QUICK_MAPS>) {
    const s = quickBattle({ map: id, party: ['A', 'B', 'C', 'D', 'E'], monsters: QUICK_MONSTERS.map((name) => ({ name, count: 2 })) }, 'e', 0);
    assert.equal(s.map!.tokens.length, 13, id);
  }
  assert.equal(statBlock('Guard').size, 'medium', 'the SRD data says Small; a 2024 Guard is Medium');
  assert.equal(statBlock('Hill Giant').size, 'huge');
});

test('every monster is the size its Hit Dice say (the SRD file lists Tiny ones and "Medium or Small" ones as Small)', () => {
  for (const [name, size] of [['Bat', 'tiny'], ['Imp', 'tiny'], ['Pseudodragon', 'tiny'], ['Knight', 'medium'], ['Mage', 'medium'], ['Vampire', 'medium'], ['Werewolf', 'medium'], ['Goblin Warrior', 'small'], ['Owlbear', 'large'], ['Ancient Red Dragon', 'gargantuan']] as const)
    assert.equal(statBlock(name).size, size, name);
  assert.equal(sizeFromHitDice('3d4 + 3', 'small'), 'tiny');
  assert.equal(sizeFromHitDice(undefined, 'large'), 'large', 'no Hit Dice: the listed size stands');
  const s = quickBattle({ map: 'dungeon', party: [], monsters: [{ name: 'Bat', count: 1 }, { name: 'Knight', count: 1 }] }, 'e', 0);
  assert.deepEqual(s.map!.tokens.map((t) => t.size), ['tiny', 'medium']);
});

test('a quick battle refuses an unknown map or monster, and an empty board', () => {
  assert.throws(() => quickBattle({ map: 'moon' as never, party: ['A'], monsters: [] }, 'e', 0), /Pick a map/);
  assert.throws(() => quickBattle({ map: 'forest', party: [], monsters: [{ name: 'Beholder Prime', count: 1 }] }, 'e', 0), /No monster called Beholder Prime/);
  assert.throws(() => quickBattle({ map: 'forest', party: [], monsters: [] }, 'e', 0), /Add the party or a monster/);
  assert.throws(() => quickBattle({ map: 'forest', party: [], monsters: [{ name: 'Guard', count: 31 }] }, 'e', 0), /Up to 30|0 to 30/);
});

test('the DM picks a quick battle: the maps, monsters and each campaign’s party, then starts it', async () => {
  const root = mkdtempSync(join(tmpdir(), 'quick-'));
  writeFileSync(join(root, 'config.yaml'), 'campaigns:\n  ember:\n    name: Embers\ncharacters:\n  thorin:\n    name: Thorin\n    campaign: ember\n  pip:\n    name: Pip\n');
  const api = createApi({ password: 'pw', dataDir: join(root, 'data'), configStore: new ConfigStore(join(root, 'config.yaml')), jobs: new JobRunner(async () => {}) });
  const call = (path: string, body?: unknown) =>
    api.request(path, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer pw', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const options = (await (await call('/encounters/quick')).json()) as QuickBattleOptions;
  assert.deepEqual(options.maps.map((m) => m.name), ['Basic dungeon', 'Basic forest']);
  assert.deepEqual(options.monsters.map((m) => m.name), ['Goblin Warrior', 'Guard', 'Hill Giant', 'Adult Red Dragon']);
  assert.deepEqual(options.campaigns, [{ id: 'ember', name: 'Embers', party: ['Thorin'] }, { id: '', name: 'No campaign', party: ['Pip'] }]);
  const started = await call('/encounter', { quick: { map: 'forest', party: ['Thorin'], monsters: [{ name: 'Hill Giant', count: 1 }] } });
  assert.equal(started.status, 201);
  const s = (await started.json()) as EncounterState;
  assert.equal(s.map!.ground, 'grass');
  assert.deepEqual(s.combatants.map((c) => c.name), ['Thorin', 'Hill Giant']);
  assert.equal((await call('/encounter', { quick: { map: 'dungeon', party: ['Thorin'], monsters: [] } })).status, 409, 'one at a time: this one is still running');
});

test('adding a monster by its 2024 name brings its stat block; anything else is just a piece', () => {
  let s = applyAction(newEncounter('e', 'Fight', 0), { type: 'add', combatant: { name: 'Ogre', count: 2 } }, deps);
  s = applyAction(s, { type: 'add', combatant: { name: 'Mysterious Hooded Figure', kind: 'npc' } }, deps);
  assert.equal(s.statBlocks.Ogre!.size, 'large');
  assert.deepEqual(s.combatants.map((c) => c.ref ?? null), ['Ogre', 'Ogre', null]);
});
