import data from './srd-5.2.json' with { type: 'json' };

/**
 * The free 2024 rules (SRD 5.2, CC-BY-4.0), bundled so lookups are instant and work offline:
 * the same file the wiki's wiki_srd uses (ReesMcD/dnd-wiki mcp/data/srd-5.2.json, built from
 * Open5e). Conditions aren't in it, so their summaries are written here.
 */
export const SRD_CREDIT =
  'Includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC (dndbeyond.com/srd), licensed CC-BY-4.0.';

export type LookupKind = 'spell' | 'monster' | 'item' | 'rule' | 'condition';

interface Named {
  name: string;
}
export interface Spell extends Named {
  level: number;
  school: string;
  casting_time: string;
  range: string;
  components: string;
  duration: string;
  classes?: string[];
  /** Missing on one entry in the source data. */
  desc?: string;
  higher?: string;
  ritual?: boolean;
}
export interface Monster extends Named {
  size: string;
  type: string;
  alignment?: string;
  ac: number;
  ac_detail?: string;
  hp: number;
  hit_dice?: string;
  speed: Record<string, number | boolean>;
  initiative?: number;
  abilities: number[];
  saves?: Record<string, number>;
  skills?: Record<string, number>;
  immunities?: string;
  resistances?: string;
  senses?: string;
  languages?: string;
  cr: string;
  xp?: number;
  traits?: Array<{ name: string; desc: string }>;
  actions?: Array<{ name: string; kind?: string; desc: string }>;
}
export interface Item extends Named {
  category?: string;
  rarity?: string;
  cost?: string;
  weight?: string;
  desc: string;
}
export interface Rule extends Named {
  set?: string;
  desc: string;
}

const srd = data as unknown as { spells: Spell[]; monsters: Monster[]; magic_items: Item[]; gear: Item[]; rules: Rule[] };

/** 2024 conditions, summarised (the SRD file has no condition text). */
export const CONDITION_TEXT: Record<string, string> = {
  Blinded: "Can't see; fails checks that need sight. Attacks against it have Advantage; its attacks have Disadvantage.",
  Charmed: "Can't attack the charmer or target it with damaging abilities. The charmer has Advantage on social checks with it.",
  Deafened: "Can't hear; fails checks that need hearing.",
  Exhaustion: 'Levels 1–6: each level subtracts 2 from d20 tests and 5 ft from Speed. Level 6 is death. A Long Rest removes one level.',
  Frightened: "Disadvantage on ability checks and attacks while the source is in sight; can't willingly move closer to it.",
  Grappled: "Speed 0; Disadvantage on attacks against anyone but the grappler. The grappler can drag it (extra movement cost).",
  Incapacitated: "No actions, Bonus Actions or Reactions; concentration breaks; can't speak; Disadvantage on Initiative.",
  Invisible: "Can't be seen without magic: Advantage on Initiative and on its attacks, Disadvantage on attacks against it (unless it can be seen).",
  Paralyzed: 'Incapacitated, Speed 0; fails Str and Dex saves; attacks against it have Advantage; hits from within 5 ft are Critical Hits.',
  Petrified: "Turned to stone: Incapacitated, Speed 0, fails Str and Dex saves, Resistance to all damage, immune to Poisoned; attacks against it have Advantage.",
  Poisoned: 'Disadvantage on attack rolls and ability checks.',
  Prone: "Can only crawl or spend half its Speed to stand; Disadvantage on its attacks. Attacks within 5 ft have Advantage; farther ones Disadvantage.",
  Restrained: 'Speed 0; Disadvantage on its attacks and Dex saves; attacks against it have Advantage.',
  Stunned: 'Incapacitated; fails Str and Dex saves; attacks against it have Advantage.',
  Unconscious: 'Incapacitated and Prone, drops what it holds; fails Str and Dex saves; attacks have Advantage; hits from within 5 ft are Critical Hits.',
};

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, '');

/** A few rule names repeat under different headings ("Ability Checks"): those get the heading too. */
function uniqueRules(rules: Rule[]): Rule[] {
  const count = new Map<string, number>();
  for (const r of rules) count.set(r.name, (count.get(r.name) ?? 0) + 1);
  return rules.map((r) => (count.get(r.name)! > 1 && r.set ? { ...r, name: `${r.name} (${r.set})` } : r));
}

const SIZE_OF_DIE: Record<string, string> = { '4': 'tiny', '6': 'small', '8': 'medium', '10': 'large', '12': 'huge', '20': 'gargantuan' };

/**
 * A monster's size from its Hit Dice, which the rules tie to size (d4 Tiny, d6 Small, d8 Medium,
 * d10 Large, d12 Huge, d20 Gargantuan). The SRD file lists every Tiny creature as Small, and every
 * "Medium or Small" one (a knight, a mage, a vampire) as Small; the dice say what they are.
 */
export function sizeFromHitDice(hitDice: string | undefined, listed: string): string {
  const die = hitDice?.match(/\d+d(\d+)/)?.[1];
  return (die && SIZE_OF_DIE[die]) || listed;
}

const monsters = srd.monsters.map((m) => ({ ...m, size: sizeFromHitDice(m.hit_dice, m.size) }));

const conditions = Object.entries(CONDITION_TEXT).map(([name, desc]) => ({ name, desc }));
const entries = {
  spell: srd.spells,
  monster: monsters,
  item: [...srd.magic_items, ...srd.gear],
  rule: uniqueRules(srd.rules),
  condition: conditions,
} satisfies Record<LookupKind, Named[]>;

/** Names matching what's typed so far: starts-with first, then contains; at most `limit`. */
export function suggest(kind: LookupKind, typed: string, limit = 25): string[] {
  const q = fold(typed);
  const names = entries[kind].map((e) => e.name);
  if (!q) return names.slice(0, limit);
  const starts = names.filter((n) => fold(n).startsWith(q));
  const contains = names.filter((n) => !fold(n).startsWith(q) && fold(n).includes(q));
  return [...starts, ...contains].slice(0, limit);
}

export type LookupResult =
  | { kind: 'spell'; entry: Spell }
  | { kind: 'monster'; entry: Monster }
  | { kind: 'item'; entry: Item }
  | { kind: 'rule'; entry: Rule }
  | { kind: 'condition'; entry: { name: string; desc: string } };

/** One entry by name (exact, ignoring case and punctuation; else the best match). */
export function lookup(kind: LookupKind, name: string): LookupResult | undefined {
  const list: Named[] = entries[kind];
  const exact = list.find((e) => fold(e.name) === fold(name));
  const best = suggest(kind, name, 1)[0];
  const entry = exact ?? list.find((e) => e.name === best);
  return entry ? ({ kind, entry } as LookupResult) : undefined;
}
