/**
 * The wiki's battle map format (ReesMcD/dnd-wiki docs/battlemap.md, v1) and the maths the tracker
 * and both map views share: which squares a feature covers, what blocks movement, where a token
 * fits, and distances. No Node imports: the web pages use it too.
 *
 * Squares are 5 ft; x runs left to right from 0, y top to bottom from 0.
 */
export type Cell = [number, number];
export type TerrainKind = 'floor' | 'wall' | 'door' | 'difficult' | 'water' | 'cover' | 'elevation' | 'object';
export type TokenSize = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';

export interface Terrain {
  kind: TerrainKind;
  /** One shape: squares, a rectangle [x, y, w, h], or a polygon of grid corners. */
  cells?: Cell[];
  rect?: [number, number, number, number];
  polygon?: Cell[];
  state?: 'open' | 'closed' | 'locked';
  depth?: 'shallow' | 'deep';
  cover?: 'half' | 'three-quarters';
  height?: number;
  label?: string;
  /** Art layer: what it is ("tree", "cart"), for picking a picture. Never changes the rules. */
  asset?: string;
  /** Art layer, floor features: what the floor is made of ("road"). */
  ground?: string;
  /** Overrides whether it blocks line of sight; never changes movement. */
  blocks_sight?: boolean;
  /** On a wall: a secret door. A wall in every way until found; never sent to players. */
  secret?: 'door';
  /** A light on it (torch, brazier, campfire), in feet. Never changes the rules. */
  light?: Light;
  /** Stairs between a dungeon's levels: where they come out (`level` 0 is outside, the way in). */
  to?: { level: number; at?: Cell };
  rises?: 'up' | 'down';
}

export interface Light {
  bright: number;
  dim: number;
  /** Hex, e.g. "#ffb060". */
  color?: string;
}

/** A keyed area (a dungeon's room): DM information, left out of players' copies. */
export interface Room {
  id: string;
  name?: string;
  cells?: Cell[];
  rect?: [number, number, number, number];
  polygon?: Cell[];
}

export interface Decal {
  asset: string;
  at: Cell;
  /** In squares; default [1, 1]. */
  size?: Cell;
  /** Degrees clockwise. */
  rotate?: number;
}

export interface MapToken {
  id: string;
  name: string;
  kind: 'pc' | 'monster' | 'npc';
  size: TokenSize;
  /** The top-left square it fills. */
  at: Cell;
  hidden?: boolean;
  ref?: string;
}

export interface BattleMap {
  v: 1;
  width: number;
  height: number;
  background?: { file: string; scale?: number; offset?: Cell };
  /** Art layer: the floor where nothing else is drawn ("grass", "stone"). */
  ground?: string;
  /** Art layer: a look for the whole map, and pictures with no rules. */
  art?: { style?: string; decals?: Decal[] };
  terrain: Terrain[];
  tokens: MapToken[];
  notes: Array<{ at: Cell; text: string }>;
  rooms?: Room[];
  /** Wherever no light reaches; default bright. The wiki's dungeon plans are dark. */
  lighting?: 'bright' | 'dim' | 'dark';
  /** Which floor of a dungeon this plan is (1 is the first). */
  level?: number;
}

export const SIZE_SQUARES: Record<TokenSize, number> = { tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };
const KINDS: TerrainKind[] = ['floor', 'wall', 'door', 'difficult', 'water', 'cover', 'elevation', 'object'];
export const MAX_SIDE = 80;

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);
const isCell = (c: unknown): c is Cell => Array.isArray(c) && c.length === 2 && isInt(c[0]) && isInt(c[1]);

/**
 * A map from the wiki, as far as this app understands it: features and tokens it can't read are
 * left out (the wiki already checked the map; a newer version may add fields). Null when it isn't a map.
 */
export function readMap(raw: unknown): BattleMap | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isInt(r.width) || !isInt(r.height) || r.width < 1 || r.height < 1 || r.width > MAX_SIDE || r.height > MAX_SIDE) return null;
  const terrain = (Array.isArray(r.terrain) ? r.terrain : []).filter(
    (t): t is Terrain =>
      !!t && typeof t === 'object' && KINDS.includes((t as Terrain).kind) && (Array.isArray((t as Terrain).cells) ? (t as Terrain).cells!.every(isCell) : true) && (!!(t as Terrain).cells || Array.isArray((t as Terrain).rect) || Array.isArray((t as Terrain).polygon)),
  );
  const tokens = (Array.isArray(r.tokens) ? r.tokens : [])
    .filter((t): t is MapToken => !!t && typeof t === 'object' && typeof (t as MapToken).id === 'string' && typeof (t as MapToken).name === 'string' && isCell((t as MapToken).at))
    .map((t) => ({ ...t, size: t.size in SIZE_SQUARES ? t.size : 'medium', kind: t.kind === 'pc' || t.kind === 'npc' ? t.kind : 'monster' }) as MapToken);
  const notes = (Array.isArray(r.notes) ? r.notes : []).filter((n): n is { at: Cell; text: string } => !!n && isCell((n as { at: unknown }).at) && typeof (n as { text: unknown }).text === 'string');
  const rooms = (Array.isArray(r.rooms) ? r.rooms : []).filter(
    (x): x is Room => !!x && typeof x === 'object' && typeof (x as Room).id === 'string' && (Array.isArray((x as Room).cells) || Array.isArray((x as Room).rect) || Array.isArray((x as Room).polygon)),
  );
  const bg = r.background as BattleMap['background'] | undefined;
  const art = r.art && typeof r.art === 'object' ? (r.art as Record<string, unknown>) : undefined;
  const decals = (Array.isArray(art?.decals) ? art.decals : []).filter((d): d is Decal => !!d && typeof (d as Decal).asset === 'string' && isCell((d as Decal).at));
  return {
    v: 1,
    width: r.width,
    height: r.height,
    ...(bg && typeof bg.file === 'string' ? { background: bg } : {}),
    ...(typeof r.ground === 'string' ? { ground: r.ground } : {}),
    ...(art ? { art: { ...(typeof art.style === 'string' ? { style: art.style } : {}), ...(decals.length ? { decals } : {}) } } : {}),
    terrain,
    tokens,
    notes,
    ...(rooms.length ? { rooms } : {}),
    ...(r.lighting === 'bright' || r.lighting === 'dim' || r.lighting === 'dark' ? { lighting: r.lighting } : {}),
    ...(isInt(r.level) && r.level >= 1 ? { level: r.level } : {}),
  };
}

function insidePolygon(x: number, y: number, poly: Cell[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The squares a feature covers, inside the grid. A polygon covers the squares whose centres it holds. */
export function cellsOf(t: Terrain, width: number, height: number): Cell[] {
  const out: Cell[] = [];
  const add = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < width && y < height) out.push([x, y]);
  };
  if (t.cells) for (const [x, y] of t.cells) add(x, y);
  else if (t.rect) {
    const [x0, y0, w, h] = t.rect;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) add(x, y);
  } else if (t.polygon && t.polygon.length >= 3) {
    const xs = t.polygon.map((p) => p[0]);
    const ys = t.polygon.map((p) => p[1]);
    for (let y = Math.max(0, Math.min(...ys)); y < Math.min(height, Math.max(...ys)); y++)
      for (let x = Math.max(0, Math.min(...xs)); x < Math.min(width, Math.max(...xs)); x++) if (insidePolygon(x + 0.5, y + 0.5, t.polygon)) add(x, y);
  }
  return out;
}

/** Walls, closed or locked doors, deep water and solid objects: nothing stands there. */
export function blocks(t: Terrain): boolean {
  return t.kind === 'wall' || t.kind === 'object' || (t.kind === 'door' && t.state !== 'open') || (t.kind === 'water' && t.depth === 'deep');
}

const key = (x: number, y: number) => `${x},${y}`;

/** The squares a token of this size fills from its top-left square. */
export function footprint(at: Cell, size: TokenSize): Cell[] {
  const n = SIZE_SQUARES[size];
  const out: Cell[] = [];
  for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) out.push([at[0] + dx, at[1] + dy]);
  return out;
}

export type PlaceCheck = { ok: true } | { ok: false; reason: string };

/** Whether a token of this size fits on the board at `at`. */
export function onBoard(map: BattleMap, size: TokenSize, at: Cell): boolean {
  const n = SIZE_SQUARES[size];
  return isCell(at) && at[0] >= 0 && at[1] >= 0 && at[0] + n <= map.width && at[1] + n <= map.height;
}

/** Whether a token can stand at `at`: on the board, not on anything blocking, not on another token. */
export function canPlace(map: BattleMap, tokenId: string, size: TokenSize, at: Cell): PlaceCheck {
  if (!onBoard(map, size, at)) return { ok: false, reason: 'That’s off the map' };
  const blocked = new Set<string>();
  for (const t of map.terrain) if (blocks(t)) for (const [x, y] of cellsOf(t, map.width, map.height)) blocked.add(key(x, y));
  // A door is drawn over the wall it sits in: open, it's a way through.
  for (const t of map.terrain) if (t.kind === 'door' && t.state === 'open') for (const [x, y] of cellsOf(t, map.width, map.height)) blocked.delete(key(x, y));
  const taken = new Set<string>();
  for (const t of map.tokens) if (t.id !== tokenId) for (const [x, y] of footprint(t.at, t.size)) taken.add(key(x, y));
  for (const [x, y] of footprint(at, size)) {
    if (blocked.has(key(x, y))) return { ok: false, reason: 'Something is in the way there' };
    if (taken.has(key(x, y))) return { ok: false, reason: 'Someone is already there' };
  }
  return { ok: true };
}

/** Distance in feet between two squares, 2024 rules: every square counts 5 ft, diagonals too. */
export function distanceFeet(a: Cell, b: Cell): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) * 5;
}

/** Whether a square is difficult terrain (difficult, shallow water) for the move preview. */
export function isDifficult(map: BattleMap, at: Cell): boolean {
  return map.terrain.some((t) => (t.kind === 'difficult' || (t.kind === 'water' && t.depth !== 'deep')) && cellsOf(t, map.width, map.height).some(([x, y]) => x === at[0] && y === at[1]));
}

/**
 * The map as players may see it, like the wiki's playerMap(): no hidden tokens, DM notes, rooms
 * or background file name, and secret doors are plain walls (their labels too).
 */
export function playersMap(map: BattleMap, hiddenTokens: ReadonlySet<string>): BattleMap {
  return {
    v: 1,
    width: map.width,
    height: map.height,
    ...(map.ground ? { ground: map.ground } : {}),
    ...(map.art ? { art: map.art } : {}),
    terrain: map.terrain.map((t) => {
      if (!t.secret) return t;
      const { secret: _secret, label: _label, ...wall } = t;
      return wall;
    }),
    tokens: map.tokens.filter((t) => !t.hidden && !hiddenTokens.has(t.id)),
    notes: [],
  };
}

/** The party found a secret door: it becomes a closed door from then on. */
export function findSecretDoor(map: BattleMap, index: number): BattleMap {
  const wall = map.terrain[index];
  if (!wall || wall.kind !== 'wall' || wall.secret !== 'door') throw new MapError('That isn’t a secret door');
  const { secret: _secret, ...rest } = wall;
  return { ...map, terrain: map.terrain.map((t, i) => (i === index ? { ...rest, kind: 'door', state: 'closed' } : t)) };
}

/** The secret doors covering a square, by index in `terrain`. */
export function secretDoorsAt(map: BattleMap, at: Cell): number[] {
  return map.terrain.flatMap((t, i) => (t.kind === 'wall' && t.secret === 'door' && cellsOf(t, map.width, map.height).some(([x, y]) => x === at[0] && y === at[1]) ? [i] : []));
}

/** The token covering a square (the last drawn wins), if any. */
export function tokenAt(map: BattleMap, at: Cell, visible: (t: MapToken) => boolean = () => true): MapToken | undefined {
  return [...map.tokens].reverse().find((t) => visible(t) && footprint(t.at, t.size).some(([x, y]) => x === at[0] && y === at[1]));
}

/** The free square nearest `from` (in rings around it) where a token of this size fits, if any. */
export function nearestFree(map: BattleMap, tokenId: string, size: TokenSize, from: Cell): Cell | undefined {
  for (let r = 0; r < Math.max(map.width, map.height); r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const at: Cell = [from[0] + dx, from[1] + dy];
        if (canPlace(map, tokenId, size, at).ok) return at;
      }
  }
  return undefined;
}

/** A copy of the map with one token moved. Throws the reason when it can't stand there. */
export function moveToken(map: BattleMap, tokenId: string, at: Cell): BattleMap {
  const token = map.tokens.find((t) => t.id === tokenId);
  if (!token) throw new MapError('That token isn’t on the map');
  // Like picking up a piece at the table: it goes anywhere on the board. The rules are the DM's
  // to call; the map views say when a square looks wrong (canPlace).
  if (!onBoard(map, token.size, at)) throw new MapError('That’s off the map');
  return { ...map, tokens: map.tokens.map((t) => (t.id === tokenId ? { ...t, at: [at[0], at[1]] } : t)) };
}

/** A copy of the map with a door (by its index in `terrain`) opened, closed or locked. */
export function setDoor(map: BattleMap, index: number, state: 'open' | 'closed' | 'locked'): BattleMap {
  const door = map.terrain[index];
  if (!door || door.kind !== 'door') throw new MapError('That isn’t a door');
  if (state !== 'open') {
    // A creature standing in the doorway keeps it open.
    const doorway = new Set(cellsOf(door, map.width, map.height).map(([x, y]) => key(x, y)));
    if (map.tokens.some((t) => footprint(t.at, t.size).some(([x, y]) => doorway.has(key(x, y))))) throw new MapError('Someone is in the doorway');
  }
  return { ...map, terrain: map.terrain.map((t, i) => (i === index ? { ...t, state } : t)) };
}

/** The doors covering a square, by index in `terrain`. */
export function doorsAt(map: BattleMap, at: Cell): number[] {
  return map.terrain.flatMap((t, i) => (t.kind === 'door' && cellsOf(t, map.width, map.height).some(([x, y]) => x === at[0] && y === at[1]) ? [i] : []));
}

/**
 * A copy of the map with a square marked difficult, or no longer difficult. Unmarking a square
 * inside a larger difficult area turns that area into single squares, minus this one.
 */
export function setDifficult(map: BattleMap, at: Cell, on: boolean): BattleMap {
  if (!isCell(at) || at[0] < 0 || at[1] < 0 || at[0] >= map.width || at[1] >= map.height) throw new MapError('That’s off the map');
  if (on) return isDifficult(map, at) ? map : { ...map, terrain: [...map.terrain, { kind: 'difficult', cells: [[at[0], at[1]]] }] };
  const terrain = map.terrain.flatMap((t): Terrain[] => {
    if (t.kind !== 'difficult') return [t];
    const cells = cellsOf(t, map.width, map.height);
    if (!cells.some(([x, y]) => x === at[0] && y === at[1])) return [t];
    const rest = cells.filter(([x, y]) => x !== at[0] || y !== at[1]);
    const { rect: _rect, polygon: _polygon, ...base } = t;
    return rest.length ? [{ ...base, cells: rest }] : [];
  });
  return { ...map, terrain };
}

/** A token for a combatant placed by hand: medium, at the nearest free square to `at`. */
export function placeToken(map: BattleMap, token: Omit<MapToken, 'at'>, at: Cell): BattleMap {
  const spot = canPlace(map, token.id, token.size, at).ok ? at : nearestFree(map, token.id, token.size, at);
  if (!spot) throw new MapError('There’s no room on the map');
  return { ...map, tokens: [...map.tokens.filter((t) => t.id !== token.id), { ...token, at: spot }] };
}

/** An empty map, for an encounter that didn't come with one. */
export function blankMap(width: number, height: number): BattleMap {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 3 || height < 3 || width > MAX_SIDE || height > MAX_SIDE) throw new MapError(`A map is 3 to ${MAX_SIDE} squares a side`);
  return { v: 1, width, height, terrain: [], tokens: [], notes: [] };
}

/** A move or edit the map doesn't allow: shown to whoever asked, as is. */
export class MapError extends Error {}
