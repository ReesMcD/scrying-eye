import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { ANCESTRIES, ART_STYLES, BESTIARY, renderPortrait, BODIES, HEADS, LOWERS, type Body, DEFAULT_ART_STYLE, FORMS, HAIR, MARKINGS, MiniError, SPECIES, SPECIES_LOOKS, withLook, type ArtStyleId, miniForCreature, PALETTE, readMiniSpec, renderMini, resolveMini, STARTER_MINIS, WEAPONS } from '../src/shared/minis/index.js';

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
  assert.equal(miniForCreature({ name: 'Cambion', type: 'Fiend (devil)' }).ancestry, 'tiefling', 'a fiend the rules don’t list: its type’s figure');
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

test('the quick-battle monsters each get their own figure: goblin, guard, giant and a dragon in its colour', () => {
  assert.equal(miniForCreature({ name: 'Goblin Warrior 2', type: 'Fey' }).ancestry, 'goblin');
  assert.equal(miniForCreature({ name: 'Guard', type: 'Humanoid' }).headgear, 'helm');
  assert.equal(miniForCreature({ name: 'Hill Giant', type: 'Giant' }).weapon, 'club');
  assert.equal(miniForCreature({ name: 'Adult Red Dragon', type: 'Dragon' }).coat, 'crimson');
  assert.equal(miniForCreature({ name: 'Young Blue Dragon' }).coat, 'navy');
  assert.notEqual(miniForCreature({ name: 'Dragonborn Knight' }).form, 'dragon');
  for (const name of ['Hill Giant', 'Adult Red Dragon']) assert.doesNotMatch(renderMini(miniForCreature({ name })).svg, /NaN|undefined/, name);
});

test('every art style draws every ancestry, part and form, at the same card scale', () => {
  for (const style of Object.keys(ART_STYLES) as ArtStyleId[]) {
    for (const ancestry of ANCESTRIES)
      for (const weapon of WEAPONS) assert.doesNotMatch(renderMini({ ancestry, weapon }, { style }).svg, /NaN|undefined/, `${style}: ${ancestry} with ${weapon}`);
    for (const form of FORMS) for (const body of BODIES[form] as readonly Body[]) assert.doesNotMatch(renderMini({ form, body }, { style }).svg, /NaN|undefined/, `${style}: ${form} ${body}`);
    assert.equal(renderMini({}, { style, paper: false }).svg.includes('<svg'), true);
  }
  assert.equal(renderMini({}).svg, renderMini({}, { style: DEFAULT_ART_STYLE }).svg, 'the default style is used when none is named');
});

test('every 2024 species has looks, and each is a valid mini that draws', () => {
  for (const species of SPECIES) {
    const looks = SPECIES_LOOKS[species];
    assert.ok(looks.length >= 3, `${species} has looks to pick from`);
    for (const { name, look } of looks) {
      assert.deepEqual(readMiniSpec(look), look, `${species}: ${name}`);
      assert.equal(look.ancestry, species);
      assert.doesNotMatch(renderMini(look).svg, /NaN|undefined/, `${species}: ${name}`);
    }
  }
});

test('a species look changes the body and keeps the outfit and what it holds', () => {
  const fighter = { ancestry: 'human', outfit: { kind: 'chain', colour: 'navy' }, weapon: 'sword', offhand: 'shield', beard: 'long' } as const;
  const drow = withLook(fighter, SPECIES_LOOKS.elf.find((l) => l.name === 'Drow')!.look);
  assert.equal(drow.ancestry, 'elf');
  assert.equal(drow.skin, 'skin-drow');
  assert.equal(drow.beard, undefined, 'the human’s beard goes with the body');
  assert.deepEqual([drow.outfit, drow.weapon, drow.offhand], [fighter.outfit, 'sword', 'shield']);
});

test('species are born with their features; a mini can change any of them', () => {
  const tiefling = resolveMini({ ancestry: 'tiefling' }).features;
  assert.deepEqual([tiefling.horns, tiefling.tail, tiefling.ears], ['curved', 'devil', 'pointed']);
  assert.equal(resolveMini({ ancestry: 'tiefling', features: { horns: 'ram', tail: 'none' } }).features.tail, 'none');
  assert.equal(resolveMini({ ancestry: 'aasimar' }).features.halo, true);
  assert.equal(resolveMini({ ancestry: 'orc' }).features.tusks, 'small');
  assert.equal(resolveMini({ ancestry: 'half-orc' }).features.tusks, 'small', 'older minis keep their tusks');
  assert.equal(resolveMini({ ancestry: 'goliath' }).hair.style, 'none');
  assert.equal(resolveMini({}).features.horns, 'none');
  assert.ok(renderMini({ ancestry: 'goliath' }).height > renderMini({ ancestry: 'human' }).height, 'goliaths stand tall');
});

test('features are checked like any other part', () => {
  const spec = readMiniSpec({ features: { horns: 'ram', halo: true, eyes: 'eye-gold', sparkle: 9 } });
  assert.deepEqual(spec, { features: { horns: 'ram', halo: true, eyes: 'eye-gold' } });
  assert.throws(() => readMiniSpec({ features: { horns: 'unicorn' } }), /horns is one of/);
  assert.throws(() => readMiniSpec({ features: { halo: 'yes' } }), /halo is true or false/);
  assert.deepEqual(readMiniSpec({ features: {} }), {}, 'no features is no features');
});

test('wings widen the card, and a halo or antlers raise it, instead of being cut off', () => {
  const plain = renderMini({});
  const winged = renderMini({ features: { wings: 'bat' } });
  assert.ok(winged.width > plain.width && winged.height > plain.height);
  assert.ok(renderMini({ features: { halo: true } }).height > plain.height);
  assert.ok(renderMini({ features: { horns: 'antlers' } }).height > plain.height);
  assert.ok(renderMini({ features: { tail: 'devil' } }).width > plain.width);
  for (const markings of MARKINGS) for (const hair of HAIR) assert.doesNotMatch(renderMini({ hair: { style: hair }, features: { markings, glow: true, eyes: 'eye-ice' } }).svg, /NaN|undefined/);
});

test('every monster in the 2024 rules has its own figure, valid and drawn', () => {
  const names: string[] = JSON.parse(readFileSync(new URL('../src/srd/srd-5.2.json', import.meta.url), 'utf8')).monsters.map((m: { name: string }) => m.name);
  assert.equal(names.length, 331);
  for (const name of names) {
    const mini = BESTIARY[name];
    assert.ok(mini, `${name} has a figure`);
    assert.deepEqual(readMiniSpec(mini), mini, name);
    assert.doesNotMatch(renderMini(mini).svg, /NaN|undefined/, name);
  }
  assert.deepEqual(Object.keys(BESTIARY).sort(), [...names].sort(), 'and nothing the rules don’t have');
});

test('a monster from the rules gets its bestiary figure, whatever its number on the board', () => {
  assert.equal(miniForCreature({ name: 'Owlbear 2', type: 'Monstrosity' }).head, 'owl');
  assert.equal(miniForCreature({ name: 'minotaur of baphomet' }).head, 'bull');
  assert.equal(miniForCreature({ name: 'Naga Priestess' }).form, undefined, 'a name the rules don’t have falls back as before');
});

test('monster bodies: a lower body or extra arms widen the card instead of being cut off', () => {
  const plain = renderMini({}).width;
  for (const lower of (['snake', 'horse', 'lion', 'spider'] as const)) assert.ok(renderMini({ lower }).width > plain, lower);
  assert.ok(renderMini({ arms: 6, weapon: 'sword' }).width > plain);
  assert.notEqual(renderMini({ heads: 2 }).svg, renderMini({}).svg, 'an ettin’s two heads fit side by side on the card');
  for (const head of HEADS) for (const lower of LOWERS) assert.doesNotMatch(renderMini({ head, lower, arms: 4, outfit: { kind: 'fur' } }).svg, /NaN|undefined/, `${head} on ${lower}`);
});

test('a body is checked against its form', () => {
  assert.deepEqual(readMiniSpec({ form: 'beast', body: 'horse' }), { form: 'beast', body: 'horse' });
  assert.throws(() => readMiniSpec({ form: 'beast', body: 'spider' }), /a beast's body is one of/);
  assert.throws(() => readMiniSpec({ heads: 12 }), /heads is a whole number/);
  assert.throws(() => readMiniSpec({ arms: 3 }), /arms is 2, 4 or 6/);
});

test('a token’s face is a square crop on the figure’s head, for every body and every monster', () => {
  const inside = (spec: Parameters<typeof renderMini>[0], what: string) => {
    const { svg, face } = renderMini(spec);
    const [vx, vy, vw, vh] = svg.match(/viewBox="([^"]+)"/)![1]!.split(' ').map(Number) as [number, number, number, number];
    assert.ok(face.r > 4, `${what}: a face big enough to see`);
    assert.ok(face.x >= vx && face.x <= vx + vw && face.y >= vy && face.y <= vy + vh, `${what}: the face is on the card`);
  };
  for (const form of FORMS) for (const body of BODIES[form] as readonly Body[]) inside({ form, body }, `${form} ${body}`);
  for (const [name, mini] of Object.entries(BESTIARY)) inside(mini, name);
  const portrait = renderPortrait({ ancestry: 'dwarf' }, { id: 'tok' });
  const [, , w, h] = portrait.match(/viewBox="([^"]+)"/)![1]!.split(' ').map(Number);
  assert.equal(w, h, 'square');
  assert.doesNotMatch(portrait, /filter|NaN|undefined/, 'no paper cut-out, nothing broken');
});
