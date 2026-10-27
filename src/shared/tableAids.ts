import { cellsOf, climbable, solid, footprint, SIZE_SQUARES, type BattleMap, type Cell, type TokenSize } from './battlemap.js';

/**
 * Table aids: what the board works out to help the DM rule, never to refuse a move. How far a
 * creature walked, and who is flanked. No Node imports: the web pages use it too.
 */

const key = (x: number, y: number) => `${x},${y}`;

/** What a step onto a square costs, in 5-ft squares: 1, 2 (difficult, swimming), or no way through. */
function stepCosts(map: BattleMap): (x: number, y: number) => number {
  const walls = new Set<string>();
  const slow = new Set<string>();
  for (const t of map.terrain) {
    // Walls, closed doors and solid objects can't be walked through; difficult ground, water and
    // climbing onto crates or tables cost double.
    const wall = solid(t);
    const hard = t.kind === 'difficult' || t.kind === 'water' || climbable(t);
    if (!wall && !hard) continue;
    for (const [x, y] of cellsOf(t, map.width, map.height)) (wall ? walls : slow).add(key(x, y));
  }
  // An open door is a way through the wall it sits in.
  for (const t of map.terrain) if (t.kind === 'door' && t.state === 'open') for (const [x, y] of cellsOf(t, map.width, map.height)) walls.delete(key(x, y));
  return (x, y) => (walls.has(key(x, y)) ? Infinity : slow.has(key(x, y)) ? 2 : 1);
}

/**
 * Feet walked from one square to another, the short way round (2024 rules): 5 ft a square,
 * diagonals too, double through difficult terrain, water or climbing, around walls, closed doors
 * and solid objects. With no way round (a jump, a teleport, a squeeze through), it's the straight line.
 */
export function pathFeet(map: BattleMap, size: TokenSize, from: Cell, to: Cell): number {
  return walk(map, size, from, to).feet;
}

/** The squares walked from one square to another (both included), the same short way round as pathFeet. */
export function pathRoute(map: BattleMap, size: TokenSize, from: Cell, to: Cell): Cell[] {
  return walk(map, size, from, to).route;
}

function walk(map: BattleMap, size: TokenSize, from: Cell, to: Cell): { feet: number; route: Cell[] } {
  const straight = { feet: Math.max(Math.abs(from[0] - to[0]), Math.abs(from[1] - to[1])) * 5, route: [from, to] as Cell[] };
  if (from[0] === to[0] && from[1] === to[1]) return { feet: 0, route: [from] };
  const n = SIZE_SQUARES[size];
  const w = map.width - n + 1;
  const h = map.height - n + 1;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  if (!inside(from[0], from[1]) || !inside(to[0], to[1])) return straight;
  const cost = stepCosts(map);
  // A big creature pays for the worst square it moves onto.
  const enter = (x: number, y: number) => Math.max(...footprint([x, y], size).map(([cx, cy]) => cost(cx, cy)));
  const best = new Float64Array(w * h).fill(Infinity);
  const came = new Int32Array(w * h).fill(-1);
  // Steps cost 1 or 2, so a list per total cost is a priority queue.
  const buckets: number[][] = [[from[1] * w + from[0]]];
  best[from[1] * w + from[0]] = 0;
  const target = to[1] * w + to[0];
  // Of equally short ways, the one nearest the straight line: a trail that reads as walked.
  const offLine = (i: number) => Math.abs((to[0] - from[0]) * ((i - (i % w)) / w - from[1]) - (to[1] - from[1]) * ((i % w) - from[0]));
  for (let d = 0; d < buckets.length; d++) {
    for (const i of buckets[d] ?? []) {
      if (best[i]! < d) continue;
      if (i === target) {
        const route: Cell[] = [];
        for (let j = i; j !== -1; j = came[j]!) route.unshift([j % w, (j - (j % w)) / w]);
        return { feet: d * 5, route };
      }
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if ((!dx && !dy) || !inside(nx, ny)) continue;
          const step = enter(nx, ny);
          if (step === Infinity) continue;
          const j = ny * w + nx;
          if (d + step < best[j]!) {
            best[j] = d + step;
            came[j] = i;
            (buckets[d + step] ??= []).push(j);
          } else if (d + step === best[j]! && offLine(i) < offLine(came[j]!)) came[j] = i;
        }
    }
  }
  return straight;
}

/** A piece on the board for flanking: which side it's on, and whether it can flank (it can act). */
export interface FlankPiece {
  token: string;
  side: 'party' | 'foes';
  canFlank: boolean;
}

/**
 * Who is flanked (the DMG's optional rule): two creatures that can act, on the other side,
 * next to it on opposite sides or corners of its space. Only says so; the DM decides.
 */
export function flankedTokens(map: BattleMap, pieces: FlankPiece[]): Set<string> {
  const byToken = new Map(map.tokens.map((t) => [t.id, t]));
  const out = new Set<string>();
  for (const target of pieces) {
    const t = byToken.get(target.token);
    if (!t) continue;
    const tn = SIZE_SQUARES[t.size];
    // Where each attacker stands around the target: -1 before it, 1 after, 0 alongside.
    const sides: Array<[number, number]> = [];
    for (const p of pieces) {
      const a = p.side !== target.side && p.canFlank ? byToken.get(p.token) : undefined;
      if (!a) continue;
      const an = SIZE_SQUARES[a.size];
      const dx = a.at[0] + an - 1 < t.at[0] ? -1 : a.at[0] > t.at[0] + tn - 1 ? 1 : 0;
      const dy = a.at[1] + an - 1 < t.at[1] ? -1 : a.at[1] > t.at[1] + tn - 1 ? 1 : 0;
      const touching = a.at[0] <= t.at[0] + tn && a.at[0] + an >= t.at[0] && a.at[1] <= t.at[1] + tn && a.at[1] + an >= t.at[1];
      if (touching && (dx || dy)) sides.push([dx, dy]);
    }
    if (sides.some(([x, y]) => sides.some(([u, v]) => u === -x && v === -y))) out.add(target.token);
  }
  return out;
}

/** Conditions that stop a creature from flanking: it can't take actions. */
const CANT_FLANK = new Set(['Incapacitated', 'Paralyzed', 'Petrified', 'Stunned', 'Unconscious']);

/**
 * The party (PCs) and their foes (monsters) on the map, for flankedTokens. NPCs could be on
 * either side, so they're left out. `down`: at 0 HP.
 */
export function flankPieces(list: ReadonlyArray<{ tokenId?: string | undefined; kind: string; down: boolean; conditions: ReadonlyArray<{ name: string }> }>): FlankPiece[] {
  return list.flatMap((c) =>
    c.tokenId && (c.kind === 'pc' || c.kind === 'monster') ? [{ token: c.tokenId, side: c.kind === 'pc' ? ('party' as const) : ('foes' as const), canFlank: !c.down && !c.conditions.some((x) => CANT_FLANK.has(x.name)) }] : [],
  );
}
