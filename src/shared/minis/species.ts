import type { MiniSpec, SPECIES } from './spec.js';

/**
 * Looks for each 2024 species: the lineages, legacies and ancestries the rules name (a drow, a
 * fire goliath, an abyssal tiefling, a gold dragonborn), as a start to pick in the builder. A look
 * sets the body (skin, hair, ears, horns…) and leaves the outfit and weapons as they were.
 */
export interface SpeciesLook {
  name: string;
  look: MiniSpec;
}

export const SPECIES_LOOKS: Record<(typeof SPECIES)[number], readonly SpeciesLook[]> = {
  aasimar: [
    { name: 'Heavenly wings', look: { ancestry: 'aasimar', skin: 'skin-light', hair: { style: 'long', colour: 'hair-blond' }, features: { halo: true, glow: true, eyes: 'eye-gold', wings: 'feathered', wingColour: 'white' } } },
    { name: 'Inner radiance', look: { ancestry: 'aasimar', skin: 'skin-gold', hair: { style: 'curly', colour: 'hair-white' }, features: { halo: true, glow: true, eyes: 'eye-white' } } },
    { name: 'Necrotic shroud', look: { ancestry: 'aasimar', skin: 'skin-ash', hair: { style: 'long', colour: 'hair-black' }, features: { halo: false, glow: true, eyes: 'eye-violet', wings: 'feathered', wingColour: 'charcoal' } } },
    { name: 'Silver-skinned', look: { ancestry: 'aasimar', skin: 'skin-silver', hair: { style: 'short', colour: 'hair-grey' }, features: { halo: true, glow: true, eyes: 'eye-ice' } } },
  ],
  dragonborn: [
    { name: 'Red', look: { ancestry: 'dragonborn', skin: 'scales-red' } },
    { name: 'Blue', look: { ancestry: 'dragonborn', skin: 'scales-blue' } },
    { name: 'Green', look: { ancestry: 'dragonborn', skin: 'scales-green' } },
    { name: 'Black', look: { ancestry: 'dragonborn', skin: 'scales-black' } },
    { name: 'White', look: { ancestry: 'dragonborn', skin: 'scales-white' } },
    { name: 'Gold', look: { ancestry: 'dragonborn', skin: 'scales-gold', features: { horns: 'swept' } } },
    { name: 'Silver', look: { ancestry: 'dragonborn', skin: 'scales-silver', features: { horns: 'swept' } } },
    { name: 'Bronze', look: { ancestry: 'dragonborn', skin: 'scales-bronze', features: { horns: 'swept' } } },
    { name: 'Brass', look: { ancestry: 'dragonborn', skin: 'scales-brass', features: { horns: 'swept' } } },
    { name: 'Copper', look: { ancestry: 'dragonborn', skin: 'scales-copper', features: { horns: 'swept' } } },
  ],
  dwarf: [
    { name: 'Braided beard', look: { ancestry: 'dwarf', skin: 'skin-tan', hair: { style: 'braids', colour: 'hair-copper' }, beard: 'braided' } },
    { name: 'Grey elder', look: { ancestry: 'dwarf', skin: 'skin-light', hair: { style: 'long', colour: 'hair-grey' }, beard: 'long' } },
    { name: 'Shaved and inked', look: { ancestry: 'dwarf', skin: 'skin-brown', hair: { style: 'mohawk', colour: 'hair-black' }, beard: 'forked', features: { markings: 'runes', markingColour: 'navy' } } },
    { name: 'Short beard', look: { ancestry: 'dwarf', skin: 'skin-deep', hair: { style: 'bun', colour: 'hair-black' }, beard: 'short' } },
  ],
  elf: [
    { name: 'High elf', look: { ancestry: 'elf', skin: 'skin-pale', hair: { style: 'long', colour: 'hair-blond' }, features: { eyes: 'eye-gold' } } },
    { name: 'Wood elf', look: { ancestry: 'elf', skin: 'skin-tan', hair: { style: 'braids', colour: 'hair-auburn' }, features: { eyes: 'eye-green', markings: 'freckles' } } },
    { name: 'Drow', look: { ancestry: 'elf', skin: 'skin-drow', hair: { style: 'long', colour: 'hair-white' }, features: { eyes: 'eye-red' } } },
    { name: 'Moon-touched', look: { ancestry: 'elf', skin: 'skin-cloud', hair: { style: 'ponytail', colour: 'hair-black' }, features: { eyes: 'eye-ice', glow: true } } },
  ],
  gnome: [
    { name: 'Forest gnome', look: { ancestry: 'gnome', skin: 'skin-tan', hair: { style: 'wild', colour: 'hair-copper' }, features: { markings: 'freckles' } } },
    { name: 'Rock gnome', look: { ancestry: 'gnome', skin: 'skin-pale', hair: { style: 'topknot', colour: 'hair-white' }, beard: 'short' } },
    { name: 'Tinker', look: { ancestry: 'gnome', skin: 'skin-brown', hair: { style: 'curly', colour: 'hair-black' }, features: { eyes: 'eye-green' } } },
  ],
  goliath: [
    { name: 'Stone giant', look: { ancestry: 'goliath', skin: 'skin-stone', hair: { style: 'none' }, features: { markings: 'patches' } } },
    { name: 'Hill giant', look: { ancestry: 'goliath', skin: 'skin-olive', hair: { style: 'short', colour: 'hair-brown' }, features: { markings: 'patches' } } },
    { name: 'Frost giant', look: { ancestry: 'goliath', skin: 'skin-frost', hair: { style: 'long', colour: 'hair-white' }, beard: 'braided', features: { markings: 'runes', markingColour: 'navy', eyes: 'eye-ice' } } },
    { name: 'Fire giant', look: { ancestry: 'goliath', skin: 'skin-ash', hair: { style: 'wild', colour: 'hair-copper' }, features: { markings: 'runes', markingColour: 'eye-ember', eyes: 'eye-ember', glow: true } } },
    { name: 'Cloud giant', look: { ancestry: 'goliath', skin: 'skin-cloud', hair: { style: 'topknot', colour: 'hair-grey' }, features: { markings: 'patches', eyes: 'eye-ice' } } },
    { name: 'Storm giant', look: { ancestry: 'goliath', skin: 'skin-storm', hair: { style: 'long', colour: 'hair-black' }, features: { markings: 'runes', markingColour: 'eye-ice', eyes: 'eye-ice', glow: true } } },
  ],
  halfling: [
    { name: 'Curly', look: { ancestry: 'halfling', skin: 'skin-light', hair: { style: 'curly', colour: 'hair-brown' }, features: { markings: 'freckles' } } },
    { name: 'Ponytail', look: { ancestry: 'halfling', skin: 'skin-brown', hair: { style: 'ponytail', colour: 'hair-black' } } },
    { name: 'Old wanderer', look: { ancestry: 'halfling', skin: 'skin-tan', hair: { style: 'short', colour: 'hair-grey' }, beard: 'short' } },
  ],
  human: [
    { name: 'Northern', look: { ancestry: 'human', skin: 'skin-pale', hair: { style: 'braids', colour: 'hair-blond' }, beard: 'long' } },
    { name: 'Desert-born', look: { ancestry: 'human', skin: 'skin-brown', hair: { style: 'short', colour: 'hair-black' }, beard: 'short' } },
    { name: 'City-born', look: { ancestry: 'human', skin: 'skin-tan', hair: { style: 'bun', colour: 'hair-auburn' } } },
    { name: 'Islander', look: { ancestry: 'human', skin: 'skin-deep', hair: { style: 'curly', colour: 'hair-black' }, features: { markings: 'stripes', markingColour: 'white' } } },
  ],
  orc: [
    { name: 'Grey-skinned', look: { ancestry: 'orc', skin: 'skin-grey', hair: { style: 'topknot', colour: 'hair-black' }, features: { tusks: 'small' } } },
    { name: 'Green', look: { ancestry: 'orc', skin: 'skin-green', hair: { style: 'mohawk', colour: 'hair-black' }, features: { tusks: 'large' } } },
    { name: 'Scarred veteran', look: { ancestry: 'orc', skin: 'skin-grey-green', hair: { style: 'none' }, features: { tusks: 'large', markings: 'scar', markingColour: 'skin-pale' } } },
    { name: 'Braided', look: { ancestry: 'orc', skin: 'skin-olive', hair: { style: 'braids', colour: 'hair-brown' }, features: { tusks: 'small', markings: 'runes', markingColour: 'crimson' } } },
  ],
  tiefling: [
    { name: 'Infernal', look: { ancestry: 'tiefling', skin: 'skin-red', hair: { style: 'long', colour: 'hair-black' }, features: { horns: 'curved', tail: 'devil', eyes: 'eye-gold' } } },
    { name: 'Abyssal', look: { ancestry: 'tiefling', skin: 'skin-violet', hair: { style: 'wild', colour: 'hair-white' }, features: { horns: 'ram', tail: 'devil', eyes: 'eye-green', glow: true } } },
    { name: 'Chthonic', look: { ancestry: 'tiefling', skin: 'skin-ash', hair: { style: 'short', colour: 'hair-black' }, features: { horns: 'straight', tail: 'devil', eyes: 'eye-violet' } } },
    { name: 'Human-looking', look: { ancestry: 'tiefling', skin: 'skin-tan', hair: { style: 'ponytail', colour: 'hair-auburn' }, features: { horns: 'swept', tail: 'none', eyes: 'eye-red' } } },
  ],
};

/** A look put on a mini: the body changes, its outfit, cloak, headgear and what it holds stay. */
export function withLook(spec: MiniSpec, look: MiniSpec): MiniSpec {
  const { ancestry: _a, skin: _s, hair: _h, beard: _b, features: _f, build: _d, ...kept } = spec;
  return { ...kept, ...look };
}
