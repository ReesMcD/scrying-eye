import type { EncounterStatBlock } from '../shared/types.js';
import { lookup } from '../srd/lookup.js';
import { EncounterError } from './rules.js';

/** Sizes the SRD data gets wrong (the 2024 Guard is Medium or Small; the data says only Small). */
const SIZE_FIXES: Record<string, string> = { Guard: 'medium', 'Guard Captain': 'medium' };

/** A monster's stat block from SRD 5.2, by its exact name, or null when the 2024 rules have no such monster. */
export function srdStatBlock(name: string): EncounterStatBlock | null {
  const found = lookup('monster', name);
  if (!found || found.kind !== 'monster' || found.entry.name.toLowerCase() !== name.trim().toLowerCase()) return null;
  const m = found.entry;
  return {
    name: m.name,
    source: 'srd',
    cr: m.cr,
    ...(m.xp !== undefined ? { xp: m.xp } : {}),
    size: SIZE_FIXES[m.name] ?? m.size,
    type: m.type,
    ac: m.ac,
    hp: m.hp,
    ...(m.hit_dice ? { hit_dice: m.hit_dice } : {}),
    speed: m.speed,
    ...(m.initiative !== undefined ? { initiative: m.initiative } : {}),
    abilities: m.abilities,
    ...(m.senses ? { senses: m.senses } : {}),
    ...(m.languages ? { languages: m.languages } : {}),
    ...(m.resistances ? { resistances: m.resistances } : {}),
    ...(m.immunities ? { immunities: m.immunities } : {}),
    ...(m.traits ? { traits: m.traits } : {}),
    ...(m.actions ? { actions: m.actions.map((a) => ({ name: a.name, kind: a.kind ?? 'action', desc: a.desc })) } : {}),
  };
}

/** A monster's stat block from SRD 5.2 (the app doesn't track its HP; the DM reads it). */
export function statBlock(name: string): EncounterStatBlock {
  const block = srdStatBlock(name);
  if (!block) throw new EncounterError(`No monster called ${name} in the 2024 rules`);
  return block;
}
