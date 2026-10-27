import type { MiniSpec } from './spec.js';

/**
 * A mini for a creature that has no mini of its own: a stat block's type and name are
 * enough to pick a sensible figure, so every monster on the board has a card from the start. The DM
 * can then give it a real one on the Minis page.
 */

export interface Creature {
  name: string;
  /** The stat block's type: `humanoid`, `undead`, `beast`, `fiend`… (case and extra words are fine). */
  type?: string | undefined;
}

/** Names that say more than the type does, checked first. */
const BY_NAME: Array<[RegExp, MiniSpec]> = [
  [/\bgiant\b/i, { ancestry: 'human', build: 'broad', skin: 'skin-tan', hair: { style: 'wild', colour: 'hair-brown' }, outfit: { kind: 'rags', colour: 'tan', trim: 'brown' }, weapon: 'club' }],
  [/skeleton/i, { ancestry: 'skeleton', weapon: 'sword', offhand: 'shield', outfit: { kind: 'rags', colour: 'brown' } }],
  [/zombie|ghoul/i, { ancestry: 'human', skin: 'skin-grey-green', hair: { style: 'wild', colour: 'hair-grey' }, outfit: { kind: 'rags', colour: 'grey' } }],
  [/goblin|hobgoblin|bugbear/i, { ancestry: 'goblin', weapon: 'daggers', outfit: { kind: 'leather', colour: 'brown' }, hair: { style: 'none' } }],
  [/kobold/i, { ancestry: 'dragonborn', skin: 'scales-red', weapon: 'spear', outfit: { kind: 'rags', colour: 'tan' } }],
  [/orc/i, { ancestry: 'half-orc', weapon: 'axe', outfit: { kind: 'leather', colour: 'charcoal' }, hair: { style: 'topknot', colour: 'hair-black' } }],
  [/cultist|acolyte|priest/i, { outfit: { kind: 'robe', colour: 'maroon', trim: 'gold' }, headgear: 'hood', weapon: 'daggers' }],
  [/mage|wizard|warlock|sorcerer/i, { outfit: { kind: 'robe', colour: 'violet', trim: 'gold' }, headgear: 'wizard-hat', weapon: 'staff' }],
  [/guard|soldier|knight|veteran/i, { outfit: { kind: 'chain', colour: 'navy', trim: 'steel' }, headgear: 'helm', weapon: 'spear', offhand: 'shield' }],
  [/bandit|thug|brigand|thief|assassin|spy/i, { outfit: { kind: 'leather', colour: 'brown' }, headgear: 'hood', cloak: 'charcoal', weapon: 'sword' }],
  [/scout|hunter|archer/i, { outfit: { kind: 'leather', colour: 'forest' }, headgear: 'hood', weapon: 'bow' }],
  [/wolf|dog|hound|jackal/i, { form: 'beast', coat: 'grey' }],
  [/bear/i, { form: 'beast', coat: 'brown' }],
  [/boar/i, { form: 'beast', coat: 'charcoal' }],
  [/lion|panther|tiger|cat/i, { form: 'beast', coat: 'ochre' }],
];

/** Each type's figure when the name doesn't match. */
const BY_TYPE: Record<string, MiniSpec> = {
  undead: { ancestry: 'skeleton', weapon: 'sword', outfit: { kind: 'rags', colour: 'brown' } },
  beast: { form: 'beast', coat: 'brown' },
  monstrosity: { form: 'beast', coat: 'charcoal' },
  fiend: { ancestry: 'tiefling', skin: 'skin-red', outfit: { kind: 'rags', colour: 'black' }, weapon: 'greatsword' },
  dragon: { form: 'dragon', coat: 'crimson' },
  giant: { ancestry: 'half-orc', skin: 'skin-tan', build: 'broad', outfit: { kind: 'rags', colour: 'tan' }, weapon: 'warhammer' },
  fey: { ancestry: 'elf', outfit: { kind: 'robe', colour: 'moss', trim: 'gold' }, headgear: 'circlet', weapon: 'wand' },
  celestial: { ancestry: 'human', outfit: { kind: 'robe', colour: 'white', trim: 'gold' }, headgear: 'circlet', weapon: 'mace' },
  construct: { ancestry: 'human', skin: 'iron', outfit: { kind: 'plate', colour: 'iron', trim: 'bronze' }, headgear: 'great-helm', weapon: 'warhammer' },
  elemental: { ancestry: 'human', skin: 'skin-blue', hair: { style: 'wild', colour: 'sky' }, outfit: { kind: 'robe', colour: 'teal' } },
  aberration: { ancestry: 'goblin', skin: 'plum', outfit: { kind: 'robe', colour: 'violet' }, weapon: 'wand', offhand: 'orb' },
  plant: { ancestry: 'goblin', skin: 'moss', hair: { style: 'wild', colour: 'forest' }, outfit: { kind: 'rags', colour: 'forest' } },
  ooze: { form: 'beast', coat: 'moss' },
};

/** How a token's name finds its mini: case and a trailing number ("Bandit 2") don't matter. */
export const miniNameKey = (name: string) => name.trim().replace(/\s+\d+$/, '').toLowerCase();

/** Chromatic and metallic dragons wear their colour; any other dragon is red. */
const DRAGON_COLOURS: Array<[RegExp, string]> = [
  [/\bred\b/i, 'crimson'], [/\bblue\b/i, 'navy'], [/\bgreen\b/i, 'forest'], [/\bblack\b/i, 'charcoal'], [/\bwhite\b/i, 'white'],
  [/\bgold\b/i, 'gold'], [/\bsilver\b/i, 'silver'], [/\bbrass\b/i, 'ochre'], [/\bbronze\b/i, 'bronze'], [/\bcopper\b/i, 'rust'],
];
const dragonColour = (name: string) => DRAGON_COLOURS.find(([p]) => p.test(name))?.[1] ?? 'crimson';

/** A stable number from a name, so the same creature always gets the same look. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A plain figure varied by name, so a party with no minis yet doesn't look like five copies. */
function variedFigure(name: string): MiniSpec {
  const h = hash(miniNameKey(name));
  const pick = <T>(list: readonly T[], salt: number): T => list[(h >>> salt) % list.length]!;
  return {
    skin: pick(['skin-pale', 'skin-light', 'skin-tan', 'skin-brown', 'skin-deep'], 0),
    hair: { style: pick(['short', 'long', 'braids', 'topknot', 'short'] as const, 3), colour: pick(['hair-black', 'hair-brown', 'hair-auburn', 'hair-blond', 'hair-grey'], 6) },
    outfit: { kind: pick(['tunic', 'leather', 'chain', 'robe'] as const, 9), colour: pick(['crimson', 'navy', 'moss', 'teal', 'plum', 'ochre', 'rust', 'brown'], 12) },
    weapon: pick(['sword', 'mace', 'spear', 'staff', 'bow', 'axe'] as const, 16),
    ...((h >>> 20) % 3 === 0 ? { cloak: pick(['charcoal', 'forest', 'maroon', 'navy'], 22) } : {}),
  };
}

/**
 * A creature's mini when it has none of its own: its name's if the name says what it is ("Goblin
 * Boss"), else its type's ("undead"), else a plain figure varied by its name.
 */
export function miniForCreature(c: Creature): MiniSpec {
  const wyrm = /\b(dragon|wyrm|wyrmling|drake)\b/i.exec(c.name);
  if (wyrm && !/dragonborn/i.test(c.name)) return { form: 'dragon', coat: dragonColour(c.name) };
  for (const [pattern, spec] of BY_NAME) if (pattern.test(c.name)) return spec;
  const type = c.type?.toLowerCase().match(/[a-z]+/)?.[0];
  const byType = type ? BY_TYPE[type] : undefined;
  return byType ?? variedFigure(c.name);
}
