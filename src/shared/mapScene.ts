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

export type BoxPart = 'wall' | 'secret' | 'door' | 'lintel' | 'elevation' | 'cover' | 'object';

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
  kind: 'tree' | 'bush' | 'pillar' | 'rock';
  /** The centre of its square. */
  x: number;
  z: number;
  y: number;
  h: number;
  /** A per-square number in [0, 1), so trees and rocks don't all look alike. */
  seed: number;
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

export interface MapScene {
  width: number;
  height: number;
  boxes: SceneBox[];
  props: SceneProp[];
  water: SceneWater[];
  /** The ground level at each square ("x,y" → height), where it isn't 0. */
  levels: Map<string, number>;
}

const key = (x: number, y: number) => `${x},${y}`;
const feet = (ft: number | undefined, fallback: number) => (typeof ft === 'number' && ft > 0 ? ft / FEET_PER_UNIT : fallback);
/** A stable pseudo-random number per square. */
const seedOf = (x: number, y: number) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 1000 / 1000;

const FIGURE_HEIGHT: Record<MapToken['size'], number> = { tiny: 0.45, small: 0.8, medium: 1.2, large: 2, huge: 3, gargantuan: 4 };

function propKind(t: Terrain): SceneProp['kind'] | null {
  const words = `${t.asset ?? ''} ${t.label ?? ''}`.toLowerCase();
  if (/\b(tree|trees|oak|pine|willow|forest)\b/.test(words)) return 'tree';
  if (/\b(bush|bushes|shrub|reeds|hedge)\b/.test(words)) return 'bush';
  if (/\b(pillar|column|statue|obelisk|post)\b/.test(words)) return 'pillar';
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
  const levels = new Map<string, number>();

  // Raised ground first: what stands on it stands higher.
  for (const t of map.terrain) {
    if (t.kind !== 'elevation') continue;
    const h = feet(t.height, 1);
    for (const [x, y] of cellsOf(t, map.width, map.height)) {
      levels.set(key(x, y), Math.max(levels.get(key(x, y)) ?? 0, h));
      boxes.push({ part: 'elevation', x, z: y, w: 1, d: 1, y: 0, h });
    }
  }
  const level = (x: number, y: number) => levels.get(key(x, y)) ?? 0;

  const solid = new Set<string>();
  for (const t of map.terrain) if (t.kind === 'wall' || t.kind === 'door') for (const [x, y] of cellsOf(t, map.width, map.height)) solid.add(key(x, y));

  for (const t of map.terrain) {
    const cells = cellsOf(t, map.width, map.height);
    switch (t.kind) {
      case 'wall': {
        const h = feet(t.height, WALL_HEIGHT);
        for (const [x, y] of cells) boxes.push({ part: t.secret ? 'secret' : 'wall', x, z: y, w: 1, d: 1, y: level(x, y), h });
        break;
      }
      case 'door':
        for (const [x, y] of cells) {
          const base = level(x, y);
          // It runs along the wall it's in: walls left and right → it spans x.
          const alongX = walled(map, solid, x - 1, y) || walled(map, solid, x + 1, y) || !(walled(map, solid, x, y - 1) || walled(map, solid, x, y + 1));
          const wallTop = Math.max(WALL_HEIGHT, DOOR_HEIGHT + 0.2);
          boxes.push({ part: 'lintel', x, z: y, w: 1, d: 1, y: base + DOOR_HEIGHT, h: wallTop - DOOR_HEIGHT });
          if (t.state === 'open') {
            // Swung open against the side of the doorway.
            boxes.push(alongX ? { part: 'door', x, z: y, w: DOOR_THICKNESS, d: 1, y: base, h: DOOR_HEIGHT, state: 'open' } : { part: 'door', x, z: y, w: 1, d: DOOR_THICKNESS, y: base, h: DOOR_HEIGHT, state: 'open' });
          } else {
            const mid = (1 - DOOR_THICKNESS) / 2;
            boxes.push(alongX ? { part: 'door', x, z: y + mid, w: 1, d: DOOR_THICKNESS, y: base, h: DOOR_HEIGHT, state: t.state ?? 'closed' } : { part: 'door', x: x + mid, z: y, w: DOOR_THICKNESS, d: 1, y: base, h: DOOR_HEIGHT, state: t.state ?? 'closed' });
          }
        }
        break;
      case 'cover': {
        // Half cover: about waist high; three-quarters: about chest high.
        const h = t.cover === 'three-quarters' ? 1 : 0.6;
        for (const [x, y] of cells) boxes.push({ part: 'cover', x: x + 0.12, z: y + 0.12, w: 0.76, d: 0.76, y: level(x, y), h });
        break;
      }
      case 'object': {
        const kind = propKind(t);
        for (const [x, y] of cells) {
          const seed = seedOf(x, y);
          if (kind === 'tree') props.push({ kind, x: x + 0.5, z: y + 0.5, y: level(x, y), h: feet(t.height, 3 + seed), seed });
          else if (kind) props.push({ kind, x: x + 0.5, z: y + 0.5, y: level(x, y), h: feet(t.height, kind === 'pillar' ? WALL_HEIGHT : kind === 'bush' ? 0.6 : 0.7), seed });
          else boxes.push({ part: 'object', x: x + 0.08, z: y + 0.08, w: 0.84, d: 0.84, y: level(x, y), h: feet(t.height, 1) });
        }
        break;
      }
      case 'water':
        for (const [x, y] of cells) water.push({ x, z: y, deep: t.depth === 'deep' });
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
  return { width: map.width, height: map.height, boxes, props, water, levels };
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
