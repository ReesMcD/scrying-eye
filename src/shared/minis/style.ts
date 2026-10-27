import { BODIES, type Ancestry, type Features, type Mini, type MiniSpec } from './spec.js';

/**
 * What every art style shares (docs/minis-style-guide.md says why): the named colours a mini is
 * described in, each ancestry's proportions (they set how tall its card stands next to others),
 * and how a mini's missing parts are decided. How it's drawn is the art style's (`styles.ts`).
 */

/** Named colours: muted, earthy, readable small and on a dark dungeon floor. */
export const PALETTE: Record<string, string> = {
  // Cloth.
  crimson: '#a8322d', maroon: '#6e2430', rust: '#a8552c', ochre: '#c08a2e', moss: '#5e7a34', forest: '#2f6a43',
  teal: '#1f7d72', sky: '#4f86b8', navy: '#2e4a7a', violet: '#5b4386', plum: '#6b2f5f', brown: '#7a5a3a',
  tan: '#b08a5a', grey: '#6f6c66', charcoal: '#3a3836', bone: '#e6dfcb', white: '#ece7da', black: '#262422',
  // Metal.
  steel: '#9aa3ad', iron: '#6d737a', bronze: '#a8783a', gold: '#d6a63a', silver: '#c9ced3',
  // Skin.
  'skin-pale': '#f0cfb2', 'skin-light': '#e3b58f', 'skin-tan': '#c98f6a', 'skin-brown': '#8d5a3b', 'skin-deep': '#5e3a26',
  'skin-green': '#7f9a5a', 'skin-grey-green': '#8fa36a', 'skin-red': '#b0453c', 'skin-blue': '#5f7fa8', 'skin-bone': '#ece6d4',
  'skin-grey': '#8f8a83', 'skin-ash': '#6f6461', 'skin-stone': '#9a958b', 'skin-frost': '#aac6d3', 'skin-storm': '#5d6c80', 'skin-cloud': '#cfd6dd',
  'skin-ember': '#a0583c', 'skin-drow': '#4e4a62', 'skin-violet': '#7d5b8f', 'skin-silver': '#d3d6da', 'skin-gold': '#e3c68b', 'skin-olive': '#a68a5c',
  // Hair.
  'hair-black': '#2a2420', 'hair-brown': '#5a3a22', 'hair-auburn': '#8a3a1e', 'hair-copper': '#b0562a', 'hair-blond': '#d9b45a',
  'hair-grey': '#9a958c', 'hair-white': '#e6e1d6',
  // Scales (dragonborn).
  'scales-red': '#a8322d', 'scales-bronze': '#a8783a', 'scales-green': '#4f7a3a', 'scales-blue': '#3d6f9a', 'scales-black': '#33302c', 'scales-white': '#dcd7cc', 'scales-gold': '#c99a2e',
  'scales-brass': '#c2a24e', 'scales-copper': '#b4683a', 'scales-silver': '#c3c9cf',
  // Eyes (and anything that shines).
  'eye-ink': '#2b2118', 'eye-gold': '#f4cd4f', 'eye-ice': '#a6dcff', 'eye-ember': '#ff8a3d', 'eye-violet': '#c48cff', 'eye-green': '#86e08f', 'eye-red': '#ff5a4f', 'eye-white': '#fbf7ea',
};

/** A colour as drawn: a palette name, a #hex, or a fallback. */
export function colour(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  return PALETTE[value] ?? PALETTE[value.toLowerCase()] ?? fallback;
}

/**
 * Proportions, in card units: the card is 120 wide, the feet stand at y = 200. `height` is from the
 * feet to the top of the head, `width` the shoulders, `head` the head's radius, `legs` the share of
 * the height below the hips.
 */
export interface Proportions {
  height: number;
  width: number;
  head: number;
  legs: number;
}

export const PROPORTIONS: Record<Ancestry, Proportions> = {
  human: { height: 168, width: 46, head: 13, legs: 0.44 },
  elf: { height: 172, width: 40, head: 12.5, legs: 0.47 },
  'half-orc': { height: 176, width: 56, head: 14, legs: 0.42 },
  tiefling: { height: 168, width: 44, head: 13, legs: 0.45 },
  dragonborn: { height: 182, width: 54, head: 15, legs: 0.43 },
  dwarf: { height: 124, width: 52, head: 14, legs: 0.34 },
  halfling: { height: 104, width: 36, head: 13, legs: 0.38 },
  gnome: { height: 98, width: 34, head: 14, legs: 0.36 },
  goblin: { height: 100, width: 34, head: 14, legs: 0.38 },
  skeleton: { height: 168, width: 42, head: 12, legs: 0.46 },
  aasimar: { height: 170, width: 45, head: 13, legs: 0.45 },
  goliath: { height: 196, width: 60, head: 14, legs: 0.44 },
  orc: { height: 178, width: 56, head: 14, legs: 0.43 },
};

const BUILD = { slim: 0.86, average: 1, broad: 1.18 } as const;

/** An ancestry's proportions for a build. */
export function proportionsOf(m: Pick<Mini, 'ancestry' | 'build'>): Proportions {
  const p = PROPORTIONS[m.ancestry];
  return { ...p, width: p.width * BUILD[m.build] };
}

/** What an ancestry looks like when the mini doesn't say. */
const ANCESTRY_DEFAULTS: Record<Ancestry, Partial<Omit<Mini, 'features'>> & { features?: Partial<Features> }> = {
  human: { skin: PALETTE['skin-light']! },
  elf: { skin: PALETTE['skin-pale']!, build: 'slim' },
  'half-orc': { skin: PALETTE['skin-green']!, build: 'broad' },
  tiefling: { skin: PALETTE['skin-red']! },
  dragonborn: { skin: PALETTE['scales-bronze']!, build: 'broad' },
  dwarf: { skin: PALETTE['skin-tan']!, build: 'broad', beard: 'long' },
  halfling: { skin: PALETTE['skin-light']! },
  gnome: { skin: PALETTE['skin-pale']! },
  goblin: { skin: PALETTE['skin-grey-green']!, build: 'slim' },
  skeleton: { skin: PALETTE['skin-bone']!, build: 'slim' },
  aasimar: { skin: PALETTE['skin-light']!, features: { halo: true, glow: true, eyes: PALETTE['eye-gold']! } },
  goliath: { skin: PALETTE['skin-stone']!, build: 'broad', hair: { style: 'none', colour: PALETTE['hair-black']! }, features: { markings: 'patches' } },
  orc: { skin: PALETTE['skin-grey-green']!, build: 'broad', features: { tusks: 'small' } },
};

/** Ears, horns and tails each ancestry is born with. */
const BORN_WITH: Partial<Record<Ancestry, Partial<Features>>> = {
  elf: { ears: 'long' },
  goblin: { ears: 'long' },
  gnome: { ears: 'pointed' },
  tiefling: { ears: 'pointed', horns: 'curved', tail: 'devil' },
  'half-orc': { tusks: 'small' },
};

/** Every part decided: the spec's own, else the ancestry's, else the house defaults. */
export function resolveMini(spec: MiniSpec): Mini {
  const ancestry = spec.ancestry ?? 'human';
  const d = ANCESTRY_DEFAULTS[ancestry];
  const scaly = ancestry === 'dragonborn' || ancestry === 'skeleton';
  const form = spec.form ?? 'humanoid';
  return {
    form,
    body: spec.body ?? BODIES[form][0],
    heads: spec.heads ?? 1,
    head: spec.head ?? 'own',
    lower: spec.lower ?? 'legs',
    arms: spec.arms ?? 2,
    ancestry,
    build: spec.build ?? d.build ?? 'average',
    skin: colour(spec.skin, d.skin ?? PALETTE['skin-light']!),
    hair: { style: scaly ? 'none' : (spec.hair?.style ?? d.hair?.style ?? 'short'), colour: colour(spec.hair?.colour, d.hair?.colour ?? PALETTE['hair-brown']!) },
    beard: scaly ? 'none' : (spec.beard ?? d.beard ?? 'none'),
    outfit: {
      kind: spec.outfit?.kind ?? (ancestry === 'skeleton' ? 'rags' : 'tunic'),
      colour: colour(spec.outfit?.colour, ancestry === 'skeleton' ? PALETTE.brown! : PALETTE.sky!),
      trim: colour(spec.outfit?.trim, PALETTE.ochre!),
    },
    cloak: spec.cloak === null || spec.cloak === undefined ? null : colour(spec.cloak, PALETTE.crimson!),
    headgear: spec.headgear ?? 'none',
    weapon: spec.weapon ?? 'none',
    offhand: spec.offhand ?? 'none',
    coat: colour(spec.coat, PALETTE.grey!),
    features: resolveFeatures(spec, ancestry, colour(spec.skin, d.skin ?? PALETTE['skin-light']!)),
  };
}

function resolveFeatures(spec: MiniSpec, ancestry: Ancestry, skin: string): Features {
  const f = spec.features ?? {};
  const born = { ...BORN_WITH[ancestry], ...ANCESTRY_DEFAULTS[ancestry].features };
  return {
    ears: f.ears ?? born.ears ?? 'round',
    horns: f.horns ?? born.horns ?? 'none',
    // Tiefling horns are a darker shade of their skin; anyone else's are bone.
    hornColour: colour(f.hornColour, ancestry === 'tiefling' ? darken(skin, 0.55) : PALETTE.bone!),
    tail: f.tail ?? born.tail ?? 'none',
    tusks: f.tusks ?? born.tusks ?? 'none',
    wings: f.wings ?? 'none',
    wingColour: colour(f.wingColour, ancestry === 'tiefling' ? darken(skin, 0.35) : PALETTE.white!),
    halo: f.halo ?? born.halo ?? false,
    eyes: colour(f.eyes, born.eyes ?? INK_EYES),
    glow: f.glow ?? born.glow ?? false,
    markings: f.markings ?? born.markings ?? 'none',
    markingColour: colour(f.markingColour, darken(skin, 0.3)),
    flames: f.flames ?? false,
  };
}

/** Plain eyes: the ink colour. */
const INK_EYES = '#2b2118';

/** A darker shade of a #hex colour, for horns, wings and markings that follow the skin. */
function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * (1 - amount)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
