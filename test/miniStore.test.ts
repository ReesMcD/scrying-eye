import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MiniStore, type RosterCharacter } from '../src/minis/store.js';
import { createApi } from '../src/app/api.js';
import { ConfigStore } from '../src/app/configStore.js';
import { JobRunner } from '../src/app/jobs.js';
import { EncounterStore } from '../src/encounter/store.js';
import { applyAction, newEncounter } from '../src/encounter/rules.js';
import { playerApp } from '../src/play/playerServer.js';
import { playerView } from '../src/play/view.js';
import { MiniError } from '../src/shared/minis/index.js';
import type { BattleMap } from '../src/shared/battlemap.js';
import type { EncounterState, MiniFigure, MiniSpec, PlayerView } from '../src/shared/types.js';

const ROSTER: RosterCharacter[] = [
  { id: 'aria', name: 'Aria', campaign: 'ember' },
  { id: 'brom', name: 'Brom', campaign: 'ember' },
];

function store(roster = ROSTER, dir = mkdtempSync(join(tmpdir(), 'minis-'))) {
  return { minis: new MiniStore(dir, () => roster, () => {}), dir };
}

test('the party comes from the roster and is listed first, before NPCs and monsters by name', () => {
  const { minis } = store();
  minis.add('Zorg', 'monster');
  minis.add('Sister Maren', 'npc', { outfit: { kind: 'robe' } });
  assert.deepEqual(
    minis.list().map((f) => [f.name, f.kind, f.mini !== null]),
    [['Aria', 'pc', false], ['Brom', 'pc', false], ['Sister Maren', 'npc', true], ['Zorg', 'monster', false]],
  );
});

test('adding refuses a party character, a blank name and a name already taken', () => {
  const { minis } = store();
  assert.throws(() => minis.add('Cleo', 'pc'), /come from the roster/);
  assert.throws(() => minis.add('  ', 'npc'), /Give it a name/);
  assert.throws(() => minis.add('aria', 'npc'), /already a mini called aria/);
});

test('a mini is checked before it is saved, and survives a restart', () => {
  const { minis, dir } = store();
  assert.throws(() => minis.setMini('pc-aria', { ancestry: 'owlbear' }), MiniError);
  minis.setMini('pc-aria', { ancestry: 'elf', weapon: 'bow' });
  const again = new MiniStore(dir, () => ROSTER, () => {});
  assert.deepEqual(again.list()[0]!.mini, { ancestry: 'elf', weapon: 'bow' });
  again.setMini('pc-aria', null);
  assert.equal(again.list()[0]!.mini, null, 'null goes back to the default figure');
});

test('a token finds its mini by name, ignoring case and a group number', () => {
  const { minis } = store();
  const goblin = minis.add('Goblin', 'monster', { ancestry: 'goblin', weapon: 'spear' });
  assert.deepEqual(minis.forName('goblin 3'), { ancestry: 'goblin', weapon: 'spear' });
  assert.equal(minis.forName('Aria'), null, 'no mini yet: the map picks a default');
  minis.remove(goblin.id);
  assert.equal(minis.forName('Goblin'), null);
});

test('a character dropped from the roster leaves the list, and its link stops working', () => {
  const roster = [...ROSTER];
  const { minis } = store(roster);
  const token = minis.newLink('pc-brom');
  roster.pop();
  assert.equal(minis.byLink(token), null);
  assert.throws(() => minis.setMini('pc-brom', {}), /No such mini/);
});

test('a player link opens that one character; a new link or turning it off ends the old one', () => {
  const { minis, dir } = store();
  assert.throws(() => minis.newLink(minis.add('Goblin', 'monster').id), /Only player characters/);
  const first = minis.newLink('pc-aria');
  assert.equal(minis.byLink(first)?.name, 'Aria');
  assert.equal(minis.list()[0]!.hasLink, true);
  const second = minis.newLink('pc-aria');
  assert.equal(minis.byLink(first), null, 'the old link stops');
  assert.equal(minis.byLink(second)?.id, 'pc-aria');
  assert.ok(!readFileSync(join(dir, 'minis.json'), 'utf8').includes(second), 'only a hash of the link is kept');
  minis.setMini('pc-aria', { ancestry: 'elf' });
  minis.remove('pc-aria');
  assert.equal(minis.list()[0]!.mini, null, 'removing a character clears its mini');
  assert.equal(minis.byLink(second)?.id, 'pc-aria', 'and keeps its player link');
  minis.revokeLink('pc-aria');
  assert.equal(minis.byLink(second), null);
  assert.equal(minis.byLink('not a token!'), null);
});

test('a damaged minis file is put aside, and the app starts with none', () => {
  const dir = mkdtempSync(join(tmpdir(), 'minis-'));
  writeFileSync(join(dir, 'minis.json'), '{ nope');
  const { minis } = store(ROSTER, dir);
  assert.equal(minis.list().filter((f) => f.mini).length, 0);
  assert.ok(readdirSync(dir).some((f) => f.startsWith('minis.json.damaged-')));
});

/** Aria with a token on a small map, a goblin (stat block: humanoid) and an unknown "Thing". */
function encounterWithMap(): EncounterState {
  let s = newEncounter('e1', 'Ambush', 0);
  const deps = { now: () => 1, d20: () => 10 };
  for (const name of ['Aria', 'Goblin 1', 'Thing']) s = applyAction(s, { type: 'add', combatant: { name, kind: name === 'Aria' ? 'pc' : 'monster', ...(name === 'Thing' ? { ref: 'Thing' } : {}) } }, deps);
  const map: BattleMap = {
    v: 1,
    width: 5,
    height: 5,
    terrain: [],
    notes: [],
    tokens: [
      { id: 't-aria', name: 'Aria', kind: 'pc', size: 'medium', at: [0, 0] },
      { id: 't-gob', name: 'Goblin 1', kind: 'monster', size: 'small', at: [2, 2] },
      { id: 't-thing', name: 'Thing', kind: 'monster', size: 'medium', at: [4, 4] },
    ],
  };
  return {
    ...s,
    map,
    combatants: s.combatants.map((c) => ({ ...c, tokenId: c.name === 'Aria' ? 't-aria' : c.name === 'Thing' ? 't-thing' : 't-gob' })),
    statBlocks: { Thing: { name: 'Thing', source: 'srd', type: 'Undead' } },
  };
}

test('players see each token’s mini: the one made for it, else one from its name or stat block', () => {
  const { minis } = store();
  minis.setMini('pc-aria', { ancestry: 'elf' });
  const v = playerView(encounterWithMap(), null, (name) => minis.forName(name));
  assert.deepEqual(v.minis['t-aria'], { ancestry: 'elf' });
  assert.equal(v.minis['t-gob']!.ancestry, 'goblin', 'from its name');
  assert.equal(v.minis['t-thing']!.ancestry, 'skeleton', 'from its stat block type');
});

/** The public player server with a minis store behind it. */
function linkServer() {
  const { minis, dir } = store();
  const web = join(dir, 'web');
  mkdirSync(web, { recursive: true });
  writeFileSync(join(web, 'play.html'), '<!doctype html><title>play</title>');
  writeFileSync(join(web, 'mini.html'), '<!doctype html><title>mini</title>');
  const app = playerApp(new EncounterStore(dir, undefined, () => {}), { webDist: web, minis });
  const call = (path: string, method = 'GET', body?: unknown) =>
    app.request(path, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { minis, call, dir };
}

test('a player’s link shows and saves their character’s mini, and nothing else', async () => {
  const { minis, call } = linkServer();
  const token = minis.newLink('pc-brom');
  assert.match(await (await call(`/mini/${token}`)).text(), /<title>mini/);
  assert.deepEqual(await (await call(`/m/${token}`)).json(), { name: 'Brom', mini: null });
  const saved = await call(`/m/${token}`, 'PUT', { mini: { ancestry: 'dwarf', beard: 'forked' } });
  assert.equal(saved.status, 200);
  assert.deepEqual(minis.list()[1]!.mini, { ancestry: 'dwarf', beard: 'forked' });
  assert.equal(minis.list()[0]!.mini, null, 'Aria untouched');
  const bad = await call(`/m/${token}`, 'PUT', { mini: { weapon: 'lightsaber' } });
  assert.equal(bad.status, 400);
  assert.match(((await bad.json()) as { error: string }).error, /weapon is one of/);
  assert.equal((await call(`/m/${token}`, 'PUT', { mini: 'x'.repeat(5000) })).status, 413, 'body size capped');
});

test('a turned-off or made-up link gets nothing', async () => {
  const { minis, call } = linkServer();
  const token = minis.newLink('pc-aria');
  minis.revokeLink('pc-aria');
  assert.equal((await call(`/m/${token}`)).status, 410);
  assert.equal((await call(`/m/${token}`, 'PUT', { mini: {} })).status, 410);
  assert.equal((await call('/m/AAAAAAAAAAAAAAAAAAAAAA')).status, 410);
  assert.equal(minis.list()[0]!.mini, null);
});

test('saving a mini tells open maps to redraw', () => {
  const { minis } = store();
  let changes = 0;
  minis.on('change', () => changes++);
  minis.setMini('pc-aria', { ancestry: 'gnome' });
  assert.equal(changes, 1);
});

test('the Minis page: the party from the roster, adding a monster, and a player link at the public address', async () => {
  const root = mkdtempSync(join(tmpdir(), 'minis-api-'));
  const config = join(root, 'config.yaml');
  writeFileSync(config, 'characters:\n  aria:\n    name: Aria\n');
  const api = createApi({ password: 'pw', dataDir: join(root, 'data'), configStore: new ConfigStore(config), jobs: new JobRunner(async () => {}) });
  const call = (path: string, method = 'GET', body?: unknown) =>
    api.request(path, { method, headers: { Authorization: 'Bearer pw', 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

  const list = (await (await call('/minis')).json()) as { figures: MiniFigure[] };
  assert.deepEqual(list.figures.map((f) => f.id), ['pc-aria']);
  assert.equal((await call('/minis', 'POST', { name: 'Goblin' })).status, 400, 'needs a kind');
  const goblin = (await (await call('/minis', 'POST', { name: 'Goblin', kind: 'monster', mini: { ancestry: 'goblin' } })).json()) as MiniFigure;
  assert.deepEqual(goblin.mini, { ancestry: 'goblin' });
  assert.equal((await call(`/minis/${goblin.id}`, 'PUT', { mini: { form: 'dragon' } })).status, 400);
  assert.equal((await call('/minis/nope', 'PUT', { mini: null })).status, 404);

  const noAddress = await call('/minis/pc-aria/link', 'POST');
  assert.equal(noAddress.status, 409, 'players can’t open a link to this Mac without the public address');
  writeFileSync(config, 'characters:\n  aria:\n    name: Aria\nplayers:\n  public_url: https://mac.tail1234.ts.net\n');
  const { url } = (await (await call('/minis/pc-aria/link', 'POST')).json()) as { url: string };
  assert.match(url, /^https:\/\/mac\.tail1234\.ts\.net\/mini\/[A-Za-z0-9_-]{22}$/);
  assert.equal((await call(`/minis/${goblin.id}/link`, 'POST')).status, 400, 'monsters have no player');
  assert.equal((await call('/minis', 'GET')).status, 200);
  assert.equal((await api.request('/minis')).status, 401, 'the DM’s password is needed');
});

test('before a fight starts, every token on the players’ map still stands as its mini', async () => {
  // Web code (its own tsconfig): loaded by path so the server's typecheck doesn't follow it.
  const webModule = '../web/src/play/tokenInfo.ts';
  const { playerTokenInfo } = (await import(webModule)) as { playerTokenInfo: (v: PlayerView) => Record<string, { mini?: MiniSpec }> };
  const { minis } = store();
  minis.setMini('pc-aria', { ancestry: 'elf' });
  const v = playerView(encounterWithMap(), null, (name) => minis.forName(name));
  const info = playerTokenInfo(v);
  assert.deepEqual(info['t-aria']?.mini, { ancestry: 'elf' });
  assert.equal(info['t-thing']?.mini?.ancestry, 'skeleton');
});
