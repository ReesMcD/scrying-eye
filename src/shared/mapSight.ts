/**
 * What can be seen on a battle map, and what a spell's area covers (#55). Shared by the server
 * (what players are sent) and both map views (what they draw). No Node imports.
 */
import { cellsOf, type BattleMap, type Cell, type Room, type Terrain } from './battlemap.js';

const key = (x: number, y: number) => `${x},${y}`;
export const cellKey = (c: Cell) => key(c[0], c[1]);

/** Walls, closed or locked doors and objects block sight, unless `blocks_sight` says otherwise. */
export function blocksSight(t: Terrain): boolean {
  if (t.blocks_sight !== undefined) return t.blocks_sight;
  return t.kind === 'wall' || t.kind === 'object' || (t.kind === 'door' && t.state !== 'open');
}

/** The squares that block sight. An open door clears the wall it sits in. */
export function sightBlockers(map: BattleMap): Set<string> {
  const out = new Set<string>();
  for (const t of map.terrain) if (blocksSight(t)) for (const [x, y] of cellsOf(t, map.width, map.height)) out.add(key(x, y));
  for (const t of map.terrain) if (t.kind === 'door' && t.state === 'open' && t.blocks_sight !== true) for (const [x, y] of cellsOf(t, map.width, map.height)) out.delete(key(x, y));
  return out;
}

/**
 * Whether the centre of `to` can be seen from the centre of `from`: the line between them may not
 * pass through a blocking square (the squares at either end don't count, so a wall is seen). It's
 * sampled four times a square; grazing a corner doesn't block.
 */
export function canSee(blockers: ReadonlySet<string>, from: Cell, to: Cell): boolean {
  const [x0, y0] = [from[0] + 0.5, from[1] + 0.5];
  const [x1, y1] = [to[0] + 0.5, to[1] + 0.5];
  const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 4);
  // Sampled between steps (never on a grid corner): a line that only grazes a corner isn't blocked.
  for (let i = 0; i < steps; i++) {
    const x = Math.floor(x0 + ((x1 - x0) * (i + 0.5)) / steps);
    const y = Math.floor(y0 + ((y1 - y0) * (i + 0.5)) / steps);
    if ((x !== from[0] || y !== from[1]) && (x !== to[0] || y !== to[1]) && blockers.has(key(x, y))) return false;
  }
  return true;
}

/** Every square seen from any of `eyes` (a token's squares), out to `rangeSquares` if given. */
export function visibleFrom(map: BattleMap, eyes: readonly Cell[], rangeSquares = Infinity, blockers = sightBlockers(map)): Set<string> {
  const seen = new Set<string>();
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      if (eyes.some((e) => Math.max(Math.abs(e[0] - x), Math.abs(e[1] - y)) <= rangeSquares && canSee(blockers, e, [x, y]))) seen.add(key(x, y));
    }
  return seen;
}

export function roomCells(map: BattleMap, room: Room): Cell[] {
  return cellsOf({ kind: 'floor', ...(room.cells ? { cells: room.cells } : room.rect ? { rect: room.rect } : { polygon: room.polygon! }) }, map.width, map.height);
}

/** The room a square is in, if the map has rooms. */
export function roomAt(map: BattleMap, at: Cell): Room | undefined {
  return map.rooms?.find((r) => roomCells(map, r).some(([x, y]) => x === at[0] && y === at[1]));
}

/**
 * A players' map cut to what's been revealed: features keep only their revealed squares (as
 * cells), and tokens outside it are left out, so nothing under the fog reaches a phone.
 */
export function clipToRevealed(map: BattleMap, revealed: ReadonlySet<string>): BattleMap {
  const terrain = map.terrain.flatMap((t): Terrain[] => {
    const cells = cellsOf(t, map.width, map.height).filter(([x, y]) => revealed.has(key(x, y)));
    if (!cells.length) return [];
    const { rect: _rect, polygon: _polygon, ...rest } = t;
    return [{ ...rest, cells }];
  });
  const tokens = map.tokens.filter((t) => revealed.has(key(t.at[0], t.at[1])));
  const decals = map.art?.decals?.filter((d) => revealed.has(key(d.at[0], d.at[1])));
  return { ...map, terrain, tokens, ...(map.art ? { art: { ...map.art, ...(decals ? { decals } : {}) } } : {}) };
}

// --- Area templates -------------------------------------------------------------------------------

export type TemplateShape = 'sphere' | 'cube' | 'cone' | 'line';

/**
 * A spell's area on the grid. `at` is a grid corner (sphere: its centre; cone and line: their
 * point of origin), `to` the corner it points at (cone, line), `size` in feet: radius (sphere),
 * side (cube), length (cone, line).
 */
export interface AreaTemplate {
  shape: TemplateShape;
  at: Cell;
  to?: Cell;
  size: number;
  /** Who placed it, for the label ("Ari's Fireball"). */
  label?: string;
}

/**
 * The squares an area covers: those at least half inside it (the 2024 DMG's grid rule, measured
 * on a 5×5 sample of each square). A cone is as wide as it is long at its end, a line 5 ft wide;
 * a cube extends from its corner toward `to` (default: down and right).
 */
export function templateCells(t: AreaTemplate, width: number, height: number): Cell[] {
  const units = t.size / 5;
  const [ax, ay] = t.at;
  const to = t.to ?? [ax + 1, ay + 1];
  const dx = to[0] - ax;
  const dy = to[1] - ay;
  const length = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [dx / length, dy / length];
  const inside = (cx: number, cy: number): boolean => {
    const px = cx - ax;
    const py = cy - ay;
    switch (t.shape) {
      case 'sphere':
        return Math.hypot(px, py) <= units + 1e-9;
      case 'cube': {
        const sx = Math.sign(dx) || 1;
        const sy = Math.sign(dy) || 1;
        return px * sx >= 0 && px * sx <= units && py * sy >= 0 && py * sy <= units;
      }
      case 'cone': {
        const along = px * ux + py * uy;
        const across = Math.abs(-px * uy + py * ux);
        return along > 0 && along <= units + 1e-9 && across <= along / 2 + 1e-9;
      }
      case 'line': {
        const along = px * ux + py * uy;
        const across = Math.abs(-px * uy + py * ux);
        return along > 0 && along <= units + 1e-9 && across <= 0.5 + 1e-9;
      }
    }
  };
  const covered = (x: number, y: number) => {
    let n = 0;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) if (inside(x + (i + 0.5) / 5, y + (j + 0.5) / 5)) n++;
    return n >= 13;
  };
  const out: Cell[] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (covered(x, y)) out.push([x, y]);
  return out;
}

/** Checks a template from a person's request; throws the reason. */
export function readTemplate(raw: unknown, map: BattleMap): AreaTemplate {
  const t = (raw ?? {}) as Partial<AreaTemplate>;
  const corner = (c: unknown): c is Cell => Array.isArray(c) && c.length === 2 && c.every((n) => Number.isInteger(n)) && c[0] >= 0 && c[1] >= 0 && c[0] <= map.width && c[1] <= map.height;
  if (!t.shape || !['sphere', 'cube', 'cone', 'line'].includes(t.shape)) throw new Error('The shape must be sphere, cube, cone or line');
  if (!corner(t.at) || (t.to !== undefined && !corner(t.to))) throw new Error('The area must start and point at grid corners on the map');
  if (typeof t.size !== 'number' || !Number.isInteger(t.size) || t.size < 5 || t.size > 300 || t.size % 5) throw new Error('The size must be 5 to 300 ft, in steps of 5');
  return { shape: t.shape, at: t.at, ...(t.to ? { to: t.to } : {}), size: t.size, ...(typeof t.label === 'string' && t.label.trim() ? { label: t.label.trim().slice(0, 40) } : {}) };
}
