import type { MiniSpec } from './spec.js';

/** Ready-made figures to pick from, then change: one per classic character, and a few townsfolk. */
export const STARTER_MINIS: ReadonlyArray<{ name: string; mini: MiniSpec }> = [
  { name: 'Fighter', mini: { ancestry: 'human', outfit: { kind: 'chain', colour: 'navy', trim: 'steel' }, weapon: 'sword', offhand: 'shield', hair: { style: 'short', colour: 'hair-brown' } } },
  { name: 'Cleric', mini: { ancestry: 'dwarf', outfit: { kind: 'plate', colour: 'steel', trim: 'gold' }, headgear: 'helm', weapon: 'warhammer', offhand: 'kite-shield', beard: 'forked', hair: { colour: 'hair-copper' } } },
  { name: 'Wizard', mini: { ancestry: 'elf', outfit: { kind: 'robe', colour: 'violet', trim: 'gold' }, headgear: 'wizard-hat', weapon: 'staff', offhand: 'tome', hair: { style: 'long', colour: 'hair-white' } } },
  { name: 'Rogue', mini: { ancestry: 'halfling', outfit: { kind: 'leather', colour: 'forest' }, cloak: 'charcoal', headgear: 'hood', weapon: 'daggers' } },
  { name: 'Warlock', mini: { ancestry: 'tiefling', outfit: { kind: 'robe', colour: 'plum', trim: 'gold' }, weapon: 'wand', offhand: 'orb', hair: { style: 'long', colour: 'hair-black' } } },
  { name: 'Paladin', mini: { ancestry: 'dragonborn', skin: 'scales-blue', outfit: { kind: 'plate', colour: 'silver', trim: 'gold' }, cloak: 'crimson', weapon: 'greatsword' } },
  { name: 'Barbarian', mini: { ancestry: 'orc', outfit: { kind: 'leather', colour: 'charcoal' }, weapon: 'axe', hair: { style: 'topknot', colour: 'hair-black' } } },
  { name: 'Ranger', mini: { ancestry: 'human', skin: 'skin-brown', outfit: { kind: 'leather', colour: 'moss' }, cloak: 'forest', weapon: 'bow', hair: { style: 'braids', colour: 'hair-black' } } },
  { name: 'Artificer', mini: { ancestry: 'gnome', outfit: { kind: 'leather', colour: 'rust' }, weapon: 'crossbow', offhand: 'lantern', hair: { style: 'wild', colour: 'hair-blond' } } },
  { name: 'Bard', mini: { ancestry: 'human', skin: 'skin-tan', outfit: { kind: 'tunic', colour: 'teal', trim: 'gold' }, cloak: 'maroon', weapon: 'daggers', hair: { style: 'long', colour: 'hair-auburn' } } },
  { name: 'Druid', mini: { ancestry: 'elf', skin: 'skin-tan', outfit: { kind: 'robe', colour: 'moss', trim: 'brown' }, headgear: 'circlet', weapon: 'staff', hair: { style: 'braids', colour: 'hair-copper' } } },
  { name: 'Innkeeper', mini: { ancestry: 'human', build: 'broad', skin: 'skin-tan', outfit: { kind: 'tunic', colour: 'ochre', trim: 'brown' }, offhand: 'lantern', beard: 'short', hair: { style: 'short', colour: 'hair-grey' } } },
];
