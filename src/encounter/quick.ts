import { placeToken, type BattleMap, type Cell, type Terrain, type TokenSize } from '../shared/battlemap.js';
import type { EncounterState } from '../shared/types.js';
import { combatantId, EncounterError, makeCombatant, newEncounter } from './rules.js';
import { statBlock } from './srdMonsters.js';

/**
 * Quick battles: a ready-made map, the party, and monsters from the 2024 rules (SRD 5.2), placed
 * and ready to move. For throwing a fight together at the table, without the wiki.
 */

export const QUICK_MAPS = {
  dungeon: { name: 'Basic dungeon', build: dungeonMap },
  forest: { name: 'Basic forest', build: forestMap },
} as const;
export type QuickMap = keyof typeof QUICK_MAPS;

/** The monsters offered, by their SRD 5.2 names. */
export const QUICK_MONSTERS = ['Goblin Warrior', 'Guard', 'Hill Giant', 'Adult Red Dragon'] as const;

export interface QuickBattle {
  map: QuickMap;
  /** The party's names (from the roster); no stats: players keep those on their sheets. */
  party: string[];
  monsters: Array<{ name: string; count: number }>;
  title?: string;
}

const SIZES: readonly TokenSize[] = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];

/** A quick battle as a ready encounter: everyone on the board, the party first in the turn order. */
export function quickBattle(input: QuickBattle, id: string, now: number): EncounterState {
  const recipe = QUICK_MAPS[input.map];
  if (!recipe) throw new EncounterError('Pick a map: a basic dungeon or a basic forest');
  const total = input.monsters.reduce((n, m) => n + m.count, 0);
  if (!input.party.length && !total) throw new EncounterError('Add the party or a monster first');
  if (total > 30) throw new EncounterError('Up to 30 monsters at a time');

  const s = newEncounter(id, input.title?.trim().slice(0, 80) || recipe.name, now);
  let map = recipe.build();
  const taken = new Set<string>();
  const place = (name: string, kind: 'pc' | 'monster', size: TokenSize, near: Cell, ref?: string) => {
    const cid = combatantId(name, taken);
    taken.add(cid);
    map = placeToken(map, { id: cid, name, kind, size }, near);
    s.combatants.push(makeCombatant(cid, { name, kind, tokenId: cid, ...(ref ? { ref } : {}) }));
  };

  // The party starts bottom left, the monsters top right; placeToken finds the nearest free room.
  input.party.forEach((name, i) => place(name, 'pc', 'medium', [2 + (i % 3), map.height - 3 - Math.floor(i / 3)]));
  let n = 0;
  for (const m of input.monsters) {
    if (!Number.isInteger(m.count) || m.count < 0 || m.count > 30) throw new EncounterError('Add 0 to 30 of each monster');
    const block = statBlock(m.name);
    s.statBlocks[block.name] = block;
    const size = SIZES.includes(block.size as TokenSize) ? (block.size as TokenSize) : 'medium';
    for (let i = 1; i <= m.count; i++, n++) {
      const name = m.count > 1 ? `${block.name} ${i}` : block.name;
      place(name, 'monster', size, [map.width - 3 - (n % 4) * 2, 2 + Math.floor(n / 4) * 2], block.name);
    }
  }
  s.map = map;
  s.order = s.combatants.map((c) => c.id);
  return s;
}

const cell = (x: number, y: number): Cell => [x, y];

/** A torch-lit stone hall, 18 × 14: pillars, rubble, a doorway, a few crates and a chest. */
function dungeonMap(): BattleMap {
  const w = 18;
  const h = 14;
  const walls: Cell[] = [];
  for (let x = 0; x < w; x++) walls.push(cell(x, 0), cell(x, h - 1));
  for (let y = 1; y < h - 1; y++) if (y !== 7) walls.push(cell(0, y), cell(w - 1, y));
  const terrain: Terrain[] = [
    { kind: 'wall', cells: walls },
    { kind: 'door', cells: [cell(w - 1, 7)], state: 'closed' },
    { kind: 'object', asset: 'pillar', cells: [cell(5, 4), cell(12, 4), cell(5, 9), cell(12, 9)] },
    { kind: 'difficult', asset: 'rubble', cells: [cell(8, 6), cell(9, 6), cell(9, 7), cell(14, 11), cell(15, 11)] },
    { kind: 'cover', cover: 'half', asset: 'crates', cells: [cell(2, 2), cell(3, 2), cell(15, 2)] },
    { kind: 'object', asset: 'chest', cells: [cell(16, 1)] },
    { kind: 'object', asset: 'torch', cells: [cell(4, 0), cell(13, 0), cell(4, h - 1), cell(13, h - 1)] },
  ];
  return { v: 1, width: w, height: h, ground: 'stone', lighting: 'dim', terrain, tokens: [], notes: [] };
}

/** A forest clearing, 20 × 14: trees round the edge, a shallow stream, bushes and boulders. */
function forestMap(): BattleMap {
  const w = 20;
  const h = 14;
  const trees: Cell[] = [];
  for (let x = 0; x < w; x += 2) trees.push(cell(x, 0), cell(x + 1 < w ? x + 1 : x, h - 1));
  for (let y = 2; y < h - 1; y += 3) trees.push(cell(0, y), cell(w - 1, y));
  trees.push(cell(6, 3), cell(13, 9), cell(15, 4), cell(4, 8));
  const stream: Cell[] = [];
  for (let y = 0; y < h; y++) stream.push(cell(9 + (y % 4 === 3 ? 1 : 0), y));
  const wet = new Set(stream.map(([x, y]) => `${x},${y}`));
  const terrain: Terrain[] = [
    { kind: 'water', depth: 'shallow', cells: stream },
    { kind: 'object', asset: 'tree', cells: trees.filter(([x, y]) => !wet.has(`${x},${y}`)) },
    { kind: 'difficult', asset: 'bush', cells: [cell(3, 4), cell(4, 4), cell(16, 10), cell(16, 11), cell(12, 2)] },
    { kind: 'cover', cover: 'half', asset: 'rock boulder', cells: [cell(7, 7), cell(14, 6)] },
  ];
  return { v: 1, width: w, height: h, ground: 'grass', lighting: 'bright', terrain, tokens: [], notes: [] };
}
