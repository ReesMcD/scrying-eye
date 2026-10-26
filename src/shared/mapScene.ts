/**
 * The battle map as a 3D scene (#53), as plain data: what stands where and how tall, so the 3D
 * view only has to draw it (and this can be tested without a GPU). No Node imports.
 *
 * Units: one square (5 ft) is 1. x runs with the map's x, z with the map's y, and y is up; the
 * ground is y = 0. Heights in the map format are in feet.
 */
import { cellsOf, footprint, SIZE_SQUARES, type BattleMap, type Cell, type MapToken, type Terrain } from './battlemap.js';

export const FEET_PER_UNIT = 5;
/** A wall without a height: 10 ft, tall enough to read as a wall without hiding the room. */
export const WALL_HEIGHT = 2;
/** A doorway's opening; the wall goes on above it. */
const DOOR_HEIGHT = 1.6;
const DOOR_THICKNESS = 0.18;

/**
 * `wall`: built walls; `rock`: natural rock faces (`asset: "rock"`, caves); `mass`: solid rock
 * that no room or corridor touches (a dungeon plan's fill), merged into big blocks.
 */
export type BoxPart = 'wall' | 'rock' | 'mass' | 'secret' | 'door' | 'lintel' | 'elevation' | 'cover' | 'object' | 'chest' | 'altar';

/** A box standing on the map: x/z its corner, w/d its size, y its base, h its height. */
export interface SceneBox {
  part: BoxPart;
  x: number;
  z: number;
  w: number;
  d: number;
  y: number;
  h: number;
  /** The door's state, for its colour. */
  state?: Terrain['state'];
}

export interface SceneProp {
  kind: 'tree' | 'bush' | 'pillar' | 'statue' | 'rock' | 'stairs';
  /** The centre of its square. */
  x: number;
  z: number;
  y: number;
  h: number;
  /** A per-square number in [0, 1), so trees and rocks don't all look alike. */
  seed: number;
  /** Stairs: the way they rise, in radians about the up axis (0 = toward -z, the map's top). */
  facing?: number;
}

export interface SceneWater {
  x: number;
  z: number;
  deep: boolean;
}

/** A token as a standing figure. */
export interface SceneFigure {
  id: string;
  /** The centre of its footprint. */
  x: number;
  z: number;
  /** What it stands on (a dais, a ledge). */
  y: number;
  radius: number;
  height: number;
}

/** A light (#105): a torch on a wall, a brazier, a campfire, or a glow with no fixture. */
export interface SceneLight {
  kind: 'torch' | 'brazier' | 'campfire' | 'glow';
  /** Where the flame is. */
  x: number;
  y: number;
  z: number;
  /** In squares. */
  bright: number;
  dim: number;
  color: string;
  /** A torch on a wall: the way it faces, out from the wall (radians about the up axis, 0 = toward -z). */
  facing?: number;
}

/** A pit or sunken floor (negative elevation): its square and how deep, in squares. */
export interface ScenePit {
  x: number;
  z: number;
  depth: number;
}

export interface MapScene {
  width: number;
  height: number;
  boxes: SceneBox[];
  props: SceneProp[];
  water: SceneWater[];
  lights: SceneLight[];
  pits: ScenePit[];
  /** Wherever no light reaches (the map's `lighting`). */
  lighting: 'bright' | 'dim' | 'dark';
  /** The ground level at each square ("x,y" → height), where it isn't 0. */
  levels: Map<string, number>;
  /** The part worth framing: everything but solid rock (the whole map when there's none). */
  open: { x: number; z: number; w: number; d: number };
}

const key = (x: number, y: number) => `${x},${y}`;
const feet = (ft: number | undefined, fallback: number) => (typeof ft === 'number' && ft > 0 ? ft / FEET_PER_UNIT : fallback);
/** A stable pseudo-random number per square. */
const seedOf = (x: number, y: number) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 1000 / 1000;

const FIGURE_HEIGHT: Record<MapToken['size'], number> = { tiny: 0.45, small: 0.8, medium: 1.2, large: 2, huge: 3, gargantuan: 4 };

/** Light fixtures by their asset word, with the light each gives when the map doesn't say (feet). */
const FIXTURES = { torch: { bright: 20, dim: 40 }, brazier: { bright: 10, dim: 20 }, campfire: { bright: 20, dim: 40 } } as const;
const FIRE = '#ffa64d';

function fixtureOf(t: Terrain): keyof typeof FIXTURES | null {
  const words = `${t.asset ?? ''} ${t.label ?? ''}`.toLowerCase();
  if (/\b(torch|torches|sconce|lantern)\b/.test(words)) return 'torch';
  if (/\b(brazier|braziers)\b/.test(words)) return 'brazier';
  if (/\b(campfire|fire|bonfire)\b/.test(words)) return 'campfire';
  return null;
}

function propKind(t: Terrain): SceneProp['kind'] | null {
  const words = `${t.asset ?? ''} ${t.label ?? ''}`.toLowerCase();
  if (/\b(tree|trees|oak|pine|willow|forest)\b/.test(words)) return 'tree';
  if (/\b(bush|bushes|shrub|reeds|hedge)\b/.test(words)) return 'bush';
  if (/\b(statue|idol|obelisk)\b/.test(words)) return 'statue';
  if (/\b(pillar|column|post)\b/.test(words)) return 'pillar';
  if (/\b(rock|rocks|boulder|boulders|stone|stones)\b/.test(words)) return 'rock';
  return null;
}

/** Whether a square holds a wall or door, for which way a door faces. */
function walled(map: BattleMap, solid: ReadonlySet<string>, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height && solid.has(key(x, y));
}

/** The map as boxes, props and water. Walls and doors are rebuilt only when the terrain changes. */
export function buildScene(map: BattleMap): MapScene {
  const boxes: SceneBox[] = [];
  const props: SceneProp[] = [];
  const water: SceneWater[] = [];
  const lights: SceneLight[] = [];
  const pits: ScenePit[] = [];
  const levels = new Map<string, number>();

  // Raised ground first: what stands on it stands higher. Negative is a pit, drawn as a hole.
  for (const t of map.terrain) {
    if (t.kind !== 'elevation') continue;
    if (typeof t.height === 'number' && t.height < 0) {
      for (const [x, y] of cellsOf(t, map.width, map.height)) pits.push({ x, z: y, depth: -t.height / FEET_PER_UNIT });
      continue;
    }
    const h = feet(t.height, 1);
    for (const [x, y] of cellsOf(t, map.width, map.height)) {
      levels.set(key(x, y), Math.max(levels.get(key(x, y)) ?? 0, h));
      boxes.push({ part: 'elevation', x, z: y, w: 1, d: 1, y: 0, h });
    }
  }
  const level = (x: number, y: number) => levels.get(key(x, y)) ?? 0;

  const solid = new Set<string>();
  for (const t of map.terrain) if (t.kind === 'wall' || t.kind === 'door') for (const [x, y] of cellsOf(t, map.width, map.height)) solid.add(key(x, y));
  // Rock with nothing open next to it (off the map counts as rock): only its top is ever seen.
  const buried = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < map.width && y + dy < map.height && !solid.has(key(x + dx, y + dy))) return false;
    return true;
  };
  const mass: Array<[number, number, number]> = [];

  for (const t of map.terrain) {
    const cells = cellsOf(t, map.width, map.height);
    addLights(t, cells);
    switch (t.kind) {
      case 'wall': {
        const h = feet(t.height, WALL_HEIGHT);
        const natural = /\b(rock|cave|cliff|stone)\b/i.test(t.asset ?? '');
        for (const [x, y] of cells) {
          if (!t.secret && buried(x, y)) {
            mass.push([x, y, h]);
            continue;
          }
          boxes.push({ part: t.secret ? 'secret' : natural ? 'rock' : 'wall', x, z: y, w: 1, d: 1, y: level(x, y), h });
        }
        break;
      }
      case 'door': {
        // `height` is the opening; the wall carries on above it.
        const opening = feet(t.height, DOOR_HEIGHT);
        for (const [x, y] of cells) {
          const base = level(x, y);
          // It runs along the wall it's in: walls left and right → it spans x.
          const alongX = walled(map, solid, x - 1, y) || walled(map, solid, x + 1, y) || !(walled(map, solid, x, y - 1) || walled(map, solid, x, y + 1));
          const wallTop = Math.max(WALL_HEIGHT, opening + 0.2);
          boxes.push({ part: 'lintel', x, z: y, w: 1, d: 1, y: base + opening, h: wallTop - opening });
          if (t.state === 'open') {
            // Swung open against the side of the doorway.
            boxes.push(alongX ? { part: 'door', x, z: y, w: DOOR_THICKNESS, d: 1, y: base, h: opening, state: 'open' } : { part: 'door', x, z: y, w: 1, d: DOOR_THICKNESS, y: base, h: opening, state: 'open' });
          } else {
            const mid = (1 - DOOR_THICKNESS) / 2;
            boxes.push(alongX ? { part: 'door', x, z: y + mid, w: 1, d: DOOR_THICKNESS, y: base, h: opening, state: t.state ?? 'closed' } : { part: 'door', x: x + mid, z: y, w: DOOR_THICKNESS, d: 1, y: base, h: opening, state: t.state ?? 'closed' });
          }
        }
        break;
      }
      case 'cover': {
        // Half cover: about waist high; three-quarters: about chest high.
        const h = feet(t.height, t.cover === 'three-quarters' ? 1 : 0.6);
        // Barrels and crates are wood; sarcophagi, tombs and low walls are stone.
        const part = /\b(sarcophag\w*|coffins?|tombs?|stone|statue|wall|altar)\b/i.test(`${t.asset ?? ''} ${t.label ?? ''}`) ? 'altar' : 'cover';
        for (const [x, y] of cells) boxes.push({ part, x: x + 0.12, z: y + 0.12, w: 0.76, d: 0.76, y: level(x, y), h });
        break;
      }
      case 'object': {
        // Torches, braziers and campfires are drawn with their light (addLights).
        if (fixtureOf(t)) break;
        const kind = propKind(t);
        for (const [x, y] of cells) {
          const seed = seedOf(x, y);
          const what = `${t.asset ?? ''} ${t.label ?? ''}`.toLowerCase();
          if (kind === 'tree') props.push({ kind, x: x + 0.5, z: y + 0.5, y: level(x, y), h: feet(t.height, 3 + seed), seed });
          else if (kind) props.push({ kind, x: x + 0.5, z: y + 0.5, y: level(x, y), h: feet(t.height, kind === 'pillar' ? WALL_HEIGHT : kind === 'statue' ? 1.5 : kind === 'bush' ? 0.6 : 0.7), seed });
          else if (/\b(chest|coffer|strongbox)\b/.test(what)) boxes.push({ part: 'chest', x: x + 0.22, z: y + 0.3, w: 0.56, d: 0.4, y: level(x, y), h: feet(t.height, 0.42) });
          else if (/\b(altar|table|desk|bench)\b/.test(what)) boxes.push({ part: 'altar', x: x + 0.06, z: y + 0.18, w: 0.88, d: 0.64, y: level(x, y), h: feet(t.height, 0.65) });
          else boxes.push({ part: 'object', x: x + 0.08, z: y + 0.08, w: 0.84, d: 0.84, y: level(x, y), h: feet(t.height, 1) });
        }
        break;
      }
      case 'water':
        for (const [x, y] of cells) water.push({ x, z: y, deep: t.depth === 'deep' });
        break;
      case 'floor':
        // The way in or out of a dungeon.
        if (/\bstairs?\b|\bsteps\b/i.test(`${t.asset ?? ''} ${t.label ?? ''}`))
          for (const [x, y] of cells) {
            // They rise into the wall beside them: the way out.
            const side = ([[0, -1, 0], [1, 0, -Math.PI / 2], [0, 1, Math.PI], [-1, 0, Math.PI / 2]] as const).find(([dx, dy]) => walled(map, solid, x + dx, y + dy));
            props.push({ kind: 'stairs', x: x + 0.5, z: y + 0.5, y: level(x, y), h: 0.6, seed: seedOf(x, y), facing: side?.[2] ?? 0 });
          }
        break;
      case 'difficult':
        // Rubble and boulders read as stones on the ground; other difficult ground stays painted.
        if (propKind(t) === 'rock' || /\b(rubble|debris|scree)\b/i.test(`${t.asset ?? ''} ${t.label ?? ''}`))
          for (const [x, y] of cells) props.push({ kind: 'rock', x: x + 0.5, z: y + 0.5, y: level(x, y), h: 0.25, seed: seedOf(x, y) });
        break;
      default:
        break;
    }
  }
  boxes.push(...mergeMass(mass));
  return { width: map.width, height: map.height, boxes, props, water, lights, pits, lighting: map.lighting ?? 'bright', levels, open: openArea(map.width, map.height, new Set(mass.map(([x, y]) => key(x, y)))) };

  /** A feature's light, and its fixture: a torch on a wall faces the open side; others stand on the floor. */
  function addLights(t: Terrain, cells: Cell[]) {
    const fixture = fixtureOf(t);
    const given = t.light && typeof t.light.bright === 'number' && typeof t.light.dim === 'number' ? t.light : null;
    // A torch, brazier or campfire lights up without being told; anything else only with a light.
    const light = given ?? (fixture ? FIXTURES[fixture] : null);
    if (!light) return;
    const color = typeof given?.color === 'string' && /^#[0-9a-f]{6}$/i.test(given.color) ? given.color : FIRE;
    const radius = { bright: light.bright / FEET_PER_UNIT, dim: Math.max(light.bright, light.dim) / FEET_PER_UNIT };
    for (const [x, y] of cells) {
      const base = level(x, y);
      if (t.kind === 'wall' || t.kind === 'door') {
        // On a wall: a torch on its face, toward the first open square beside it.
        const side = ([[0, 1, Math.PI], [0, -1, 0], [1, 0, -Math.PI / 2], [-1, 0, Math.PI / 2]] as const).find(([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < map.width && y + dy < map.height && !walled(map, solid, x + dx, y + dy));
        const [dx, dy] = side ?? [0, 1];
        lights.push({ kind: fixture === 'torch' || !fixture ? 'torch' : fixture, x: x + 0.5 + dx * 0.62, y: base + 1.35, z: y + 0.5 + dy * 0.62, ...radius, color, facing: side?.[2] ?? Math.PI });
      } else {
        const kind = fixture ?? 'glow';
        lights.push({ kind, x: x + 0.5, y: base + (kind === 'torch' ? 1.3 : kind === 'brazier' ? 0.75 : kind === 'campfire' ? 0.25 : 0.3), z: y + 0.5, ...radius, color });
      }
    }
  }
}

/** Buried rock as few big blocks (per height): rows of squares, then rows stacked when they line up. */
function mergeMass(cells: Array<[number, number, number]>): SceneBox[] {
  const byRow = new Map<string, number[]>();
  for (const [x, y, h] of cells) byRow.set(`${y}|${h}`, [...(byRow.get(`${y}|${h}`) ?? []), x]);
  const runs: SceneBox[] = [];
  for (const [k, xs] of byRow) {
    const [y, h] = k.split('|').map(Number) as [number, number];
    xs.sort((a, b) => a - b);
    let start = xs[0]!;
    for (let i = 1; i <= xs.length; i++) {
      if (i < xs.length && xs[i] === xs[i - 1]! + 1) continue;
      runs.push({ part: 'mass', x: start, z: y, w: xs[i - 1]! - start + 1, d: 1, y: 0, h });
      if (i < xs.length) start = xs[i]!;
    }
  }
  // Stack identical runs on consecutive rows.
  runs.sort((a, b) => a.x - b.x || a.w - b.w || a.h - b.h || a.z - b.z);
  const out: SceneBox[] = [];
  for (const r of runs) {
    const last = out.at(-1);
    if (last && last.x === r.x && last.w === r.w && last.h === r.h && last.z + last.d === r.z) last.d += 1;
    else out.push({ ...r });
  }
  return out;
}

/** The smallest rectangle holding every square that isn't buried rock, one square of margin around it. */
function openArea(width: number, height: number, buried: ReadonlySet<string>): MapScene['open'] {
  let [x0, z0, x1, z1] = [width, height, -1, -1];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (!buried.has(key(x, y))) {
        x0 = Math.min(x0, x);
        z0 = Math.min(z0, y);
        x1 = Math.max(x1, x);
        z1 = Math.max(z1, y);
      }
  if (x1 < 0) return { x: 0, z: 0, w: width, d: height };
  const [ax, az] = [Math.max(0, x0 - 1), Math.max(0, z0 - 1)];
  return { x: ax, z: az, w: Math.min(width, x1 + 2) - ax, d: Math.min(height, z1 + 2) - az };
}

/** Where a token stands: its footprint's centre, on the highest ground under it. */
export function figureOf(scene: Pick<MapScene, 'levels'>, t: Pick<MapToken, 'id' | 'size'>, at: Cell): SceneFigure {
  const n = SIZE_SQUARES[t.size];
  const y = Math.max(0, ...footprint(at, t.size).map(([x, z]) => scene.levels.get(key(x, z)) ?? 0));
  return { id: t.id, x: at[0] + n / 2, z: at[1] + n / 2, y, radius: n * 0.38, height: FIGURE_HEIGHT[t.size] };
}

/** The square under a point on the ground (scene x/z), or null off the map. */
export function cellAt(scene: Pick<MapScene, 'width' | 'height'>, x: number, z: number): Cell | null {
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  return cx >= 0 && cz >= 0 && cx < scene.width && cz < scene.height ? [cx, cz] : null;
}

/** A key that changes when the scene's shape does (terrain or size), not when tokens move. */
export function sceneKey(map: BattleMap): string {
  return JSON.stringify([map.width, map.height, map.terrain]);
}
