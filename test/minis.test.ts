import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ANCESTRIES, MiniError, miniForCreature, PALETTE, readMiniSpec, renderMini, resolveMini, STARTER_MINIS, WEAPONS } from '../src/shared/minis/index.js';

test('a page’s mini block keeps the parts it knows and drops the rest', () => {
  const spec = readMiniSpec({ ancestry: 'dwarf', beard: 'forked', hair: { colour: 'hair-copper' }, cloak: 'none', sparkles: true });
  assert.deepEqual(spec, { ancestry: 'dwarf', beard: 'forked', hair: { colour: 'hair-copper' }, cloak: null });
});

test('a bad part is refused with what it could have been', () => {
  assert.throws(() => readMiniSpec({ ancestry: 'owlbear' }), (e: unknown) => e instanceof MiniError && /ancestry is one of human/.test(e.message));
  assert.throws(() => readMiniSpec({ hair: 'long' }), MiniError);
  assert.throws(() => readMiniSpec(['dwarf']), MiniError);
});

test('a missing part comes from the ancestry, then the house defaults', () => {
  const dwarf = resolveMini({ ancestry: 'dwarf' });
  assert.equal(dwarf.beard, 'long');
  assert.equal(dwarf.build, 'broad');
  assert.equal(resolveMini({ ancestry: 'dwarf', beard: 'none' }).beard, 'none');
  const skeleton = resolveMini({ ancestry: 'skeleton', hair: { style: 'long' }, beard: 'long' });
  assert.equal(skeleton.hair.style, 'none', 'a skull has no hair');
  assert.equal(skeleton.beard, 'none');
  assert.equal(resolveMini({}).ancestry, 'human');
});

test('colours are palette names or hex; anything else falls back, so nothing odd reaches the SVG', () => {
  assert.equal(resolveMini({ skin: 'skin-deep' }).skin, PALETTE['skin-deep']);
  assert.equal(resolveMini({ skin: '#123abc' }).skin, '#123abc');
  const sneaky = resolveMini({ skin: '"/><script>alert(1)</script>' });
  assert.equal(sneaky.skin, PALETTE['skin-light']);
  assert.doesNotMatch(renderMini({ outfit: { colour: 'red" onload="x' } }).svg, /onload|script/);
});

test('every ancestry and weapon draws a card', () => {
  for (const ancestry of ANCESTRIES)
    for (const weapon of WEAPONS) {
      const { svg, width, height } = renderMini({ ancestry, weapon });
      assert.match(svg, /^<svg [^>]*viewBox="[-\d. ]+"/);
      assert.doesNotMatch(svg, /NaN|undefined/, `${ancestry} with ${weapon}`);
      assert.ok(width > 0 && height > 0);
    }
  assert.doesNotMatch(renderMini({ form: 'beast', coat: 'brown' }).svg, /NaN|undefined/);
});

test('small folk stand on shorter cards than tall folk', () => {
  const height = (ancestry: (typeof ANCESTRIES)[number]) => renderMini({ ancestry }).height;
  assert.ok(height('gnome') < height('dwarf'));
  assert.ok(height('dwarf') < height('human'));
  assert.ok(height('human') < height('dragonborn'));
});

test('what a mini holds over its head grows the card instead of being cut off', () => {
  assert.ok(renderMini({ weapon: 'staff', headgear: 'wizard-hat' }).height > renderMini({}).height);
});

test('the paper cut-out can be left off, and its ids are prefixed so several minis share a page', () => {
  const a = renderMini({}, { id: 'pc-1' }).svg;
  assert.match(a, /id="pc-1-cut"/);
  assert.match(a, /url\(#pc-1-cut\)/);
  assert.doesNotMatch(renderMini({}, { paper: false }).svg, /filter/);
});

test('a creature’s name says more than its type', () => {
  assert.equal(miniForCreature({ name: 'Skeleton 3', type: 'undead' }).ancestry, 'skeleton');
  assert.equal(miniForCreature({ name: 'Goblin Boss', type: 'humanoid (goblinoid)' }).ancestry, 'goblin');
  assert.equal(miniForCreature({ name: 'Dire Wolf', type: 'beast' }).form, 'beast');
  assert.equal(miniForCreature({ name: 'Barbed Devil', type: 'Fiend (devil)' }).ancestry, 'tiefling');
  assert.ok(miniForCreature({ name: 'Mysterious Stranger' }), 'no type still gets a figure');
});

test('every creature mini is a valid mini', () => {
  for (const type of ['humanoid', 'undead', 'beast', 'monstrosity', 'fiend', 'dragon', 'giant', 'fey', 'celestial', 'construct', 'elemental', 'aberration', 'plant', 'ooze'])
    assert.deepEqual(readMiniSpec(miniForCreature({ name: 'X', type })), miniForCreature({ name: 'X', type }), type);
});

test('a creature with nothing to go on gets a figure varied by its name, the same every time', () => {
  assert.deepEqual(miniForCreature({ name: 'Bandit Captain 2' }), miniForCreature({ name: 'bandit captain' }));
  const names = ['Arwen', 'Borin', 'Celeste', 'Dorian', 'Elspeth', 'Fenwick'];
  const looks = new Set(names.map((name) => JSON.stringify(miniForCreature({ name }))));
  assert.ok(looks.size >= 5, 'a party without minis doesn’t look alike');
});

test('every starter figure is a valid mini', () => {
  for (const { name, mini } of STARTER_MINIS) assert.deepEqual(readMiniSpec(mini), mini, name);
});
