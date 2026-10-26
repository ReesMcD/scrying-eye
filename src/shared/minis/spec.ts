/**
 * A paper mini: what a character, NPC or monster looks like, as a short list of parts, made in the
 * Minis builder (by the DM, or a player from their link). Everything is optional: a missing part
 * gets a sensible default, so `{ ancestry: 'dwarf' }` is already a mini.
 */

export const ANCESTRIES = ['human', 'dwarf', 'elf', 'halfling', 'gnome', 'half-orc', 'tiefling', 'dragonborn', 'goblin', 'skeleton'] as const;
export const OUTFITS = ['tunic', 'robe', 'leather', 'chain', 'plate', 'rags'] as const;
export const HEADGEAR = ['none', 'hood', 'helm', 'great-helm', 'wizard-hat', 'circlet', 'crown'] as const;
export const HAIR = ['none', 'short', 'long', 'braids', 'topknot', 'wild'] as const;
export const BEARDS = ['none', 'short', 'long', 'forked'] as const;
export const WEAPONS = ['none', 'sword', 'greatsword', 'axe', 'warhammer', 'mace', 'spear', 'staff', 'bow', 'crossbow', 'daggers', 'wand'] as const;
export const OFFHAND = ['none', 'shield', 'kite-shield', 'tome', 'torch', 'orb', 'lantern'] as const;
export const FORMS = ['humanoid', 'beast'] as const;

export type Ancestry = (typeof ANCESTRIES)[number];
export type Outfit = (typeof OUTFITS)[number];
export type Headgear = (typeof HEADGEAR)[number];
export type HairStyle = (typeof HAIR)[number];
export type Beard = (typeof BEARDS)[number];
export type Weapon = (typeof WEAPONS)[number];
export type Offhand = (typeof OFFHAND)[number];
export type Form = (typeof FORMS)[number];

/** A colour: a palette name from the style guide (`steel`, `crimson`…) or a hex like `#3d6f9a`. */
export type Colour = string;

export interface MiniSpec {
  /** `humanoid` (the default) or `beast` (four legs: wolves, bears, boars, big cats). */
  form?: Form;
  ancestry?: Ancestry;
  /** Build within the ancestry. */
  build?: 'slim' | 'average' | 'broad';
  skin?: Colour;
  hair?: { style?: HairStyle; colour?: Colour };
  beard?: Beard;
  outfit?: { kind?: Outfit; colour?: Colour; trim?: Colour };
  cloak?: Colour | null;
  headgear?: Headgear;
  weapon?: Weapon;
  offhand?: Offhand;
  /** Beasts: the coat colour and whether it has horns or tusks. */
  coat?: Colour;
}

/** A mini with every part decided, ready to draw. */
export interface Mini {
  form: Form;
  ancestry: Ancestry;
  build: 'slim' | 'average' | 'broad';
  skin: string;
  hair: { style: HairStyle; colour: string };
  beard: Beard;
  outfit: { kind: Outfit; colour: string; trim: string };
  cloak: string | null;
  headgear: Headgear;
  weapon: Weapon;
  offhand: Offhand;
  coat: string;
}

export class MiniError extends Error {}

const oneOf = <T extends string>(list: readonly T[], value: unknown, what: string): T | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string' && (list as readonly string[]).includes(value)) return value as T;
  throw new MiniError(`${what} is one of ${list.join(', ')} (got ${JSON.stringify(value)})`);
};

/** Checks a mini sent to the app, keeping only what this version knows; throws on a bad value. */
export function readMiniSpec(raw: unknown): MiniSpec {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new MiniError('A mini is a set of parts, like { ancestry: dwarf }');
  const r = raw as Record<string, unknown>;
  const colour = (v: unknown, what: string): string | undefined => {
    if (v === undefined || v === null) return undefined;
    if (typeof v === 'string' && v.trim()) return v.trim();
    throw new MiniError(`${what} is a colour name or a #hex`);
  };
  const obj = (v: unknown, what: string): Record<string, unknown> | undefined => {
    if (v === undefined || v === null) return undefined;
    if (typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
    throw new MiniError(`${what} is a set of parts`);
  };
  /** Without the parts left out, so a mini round-trips as sent. */
  const known = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
  const hair = obj(r.hair, 'hair');
  const outfit = obj(r.outfit, 'outfit');
  const out: MiniSpec = {
    form: oneOf(FORMS, r.form, 'form'),
    ancestry: oneOf(ANCESTRIES, r.ancestry, 'ancestry'),
    build: oneOf(['slim', 'average', 'broad'] as const, r.build, 'build'),
    skin: colour(r.skin, 'skin'),
    hair: hair ? known({ style: oneOf(HAIR, hair.style, 'hair style'), colour: colour(hair.colour, 'hair colour') }) : undefined,
    beard: oneOf(BEARDS, r.beard, 'beard'),
    outfit: outfit ? known({ kind: oneOf(OUTFITS, outfit.kind, 'outfit'), colour: colour(outfit.colour, 'outfit colour'), trim: colour(outfit.trim, 'outfit trim') }) : undefined,
    cloak: r.cloak === null || r.cloak === 'none' ? null : colour(r.cloak, 'cloak'),
    headgear: oneOf(HEADGEAR, r.headgear, 'headgear'),
    weapon: oneOf(WEAPONS, r.weapon, 'weapon'),
    offhand: oneOf(OFFHAND, r.offhand, 'offhand'),
    coat: colour(r.coat, 'coat'),
  };
  return known(out);
}
