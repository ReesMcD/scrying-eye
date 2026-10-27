/**
 * Dressing a 3D battle map in KayKit's Dungeon pieces (CC0, kaylousberg.com): which model goes
 * where, as plain data, so the placing is tested without a GPU. The 3D view loads the models and
 * draws these in place of the plain boxes and props they replace; anything with no model stays
 * as it was. No Node imports.
 *
 * KayKit is built on a 4-unit grid, walls 4 tall: at half scale a wall is 2 squares tall (10 ft,
 * our walls' height) and a half wall one square long, so pieces fit our squares exactly.
 */
import type { BattleMap } from './battlemap.js';
import type { MapScene } from './mapScene.js';

export const KIT_MODELS = [
  'wall_half',
  'pillar',
  'floor_tile_small',
  'floor_wood_small',
  'floor_wood_small_dark',
  'floor_dirt_small_A',
  'floor_dirt_small_B',
  'stairs',
  'chest',
  'crates_stacked',
  'barrel_large',
  'box_large',
  'table_medium',
] as const;
export type KitModel = (typeof KIT_MODELS)[number];

/** One model placed on the map: its origin at x/y/z (squares), turned about the up axis, scaled. */
export interface KitPiece {
  model: KitModel;
  x: number;
  y: number;
  z: number;
  /** Radians about the up axis (counter-clockwise seen from above). */
  turn: number;
  sx: number;
  sy: number;
  sz: number;
}

export interface KitPlan {
  pieces: KitPiece[];
  /** Indexes into the scene's boxes and props that these pieces stand in for. */
  replacedBoxes: ReadonlySet<number>;
  replacedProps: ReadonlySet<number>;
  /** Floor tiles were laid: the painted floor leaves out its ground colour so they show. */
  floor: boolean;
}

const HALF = 0.5;
/** KayKit's wall height, in its own units. */
const KIT_WALL = 4;
const key = (x: number, z: number) => `${x},${z}`;
/** A stable pseudo-random number per square, for picking tile variants and turns. */
const seedOf = (x: number, z: number) => (((x * 73856093) ^ (z * 19349663)) >>> 0) % 1000 / 1000;

/** Grounds that read as a built floor; grass, sand, snow and water keep the painted ground. */
const FLOORS: Record<string, readonly KitModel[]> = {
  stone: ['floor_tile_small'],
  wood: ['floor_wood_small', 'floor_wood_small_dark'],
  dirt: ['floor_dirt_small_A', 'floor_dirt_small_B'],
};
const FLOOR_OF: Record<string, keyof typeof FLOORS> = { stone: 'stone', rock: 'stone', cave: 'dirt', dirt: 'dirt', mud: 'dirt', wood: 'wood', road: 'stone' };

/**
 * The KayKit pieces for a map, or null for a map that isn't a built place (no walls and an outdoor
 * ground): forests and fields keep their trees, rocks and painted ground.
 */
export function kitPlan(map: Pick<BattleMap, 'ground' | 'width' | 'height'>, scene: MapScene): KitPlan | null {
  const walls = scene.boxes.filter((b) => b.part === 'wall');
  const groundFloor = map.ground ? FLOOR_OF[map.ground] : walls.length ? 'stone' : undefined;
  if (!walls.length && !groundFloor) return null;

  const pieces: KitPiece[] = [];
  const replacedBoxes = new Set<number>();
  const replacedProps = new Set<number>();
  const place = (model: KitModel, x: number, y: number, z: number, turn: number, sx: number, sy: number, sz: number) => pieces.push({ model, x, y, z, turn, sx, sy, sz });

  // Walls join to walls, doors, secret doors and solid rock around them.
  const joins = new Set<string>();
  const mass = new Set<string>();
  for (const b of scene.boxes) {
    if (b.part === 'wall' || b.part === 'secret' || b.part === 'lintel' || b.part === 'rock') joins.add(key(Math.floor(b.x), Math.floor(b.z)));
    if (b.part === 'mass')
      for (let x = b.x; x < b.x + b.w; x++)
        for (let z = b.z; z < b.z + b.d; z++) {
          joins.add(key(x, z));
          mass.add(key(x, z));
        }
  }

  scene.boxes.forEach((b, i) => {
    if (b.part === 'wall') {
      replacedBoxes.add(i);
      wall(b.x, b.z, b.y, b.h);
    } else if (b.part === 'lintel') {
      // The stone over a doorway, matching the walls either side.
      replacedBoxes.add(i);
      const alongX = joins.has(key(b.x - 1, b.z)) || joins.has(key(b.x + 1, b.z)) || !(joins.has(key(b.x, b.z - 1)) || joins.has(key(b.x, b.z + 1)));
      if (alongX) place('wall_half', b.x, b.y, b.z + 0.5, 0, HALF, b.h / KIT_WALL, HALF);
      else place('wall_half', b.x + 0.5, b.y, b.z, -Math.PI / 2, HALF, b.h / KIT_WALL, HALF);
    } else if (b.part === 'chest') {
      replacedBoxes.add(i);
      place('chest', Math.floor(b.x) + 0.5, b.y + 0.06, Math.floor(b.z) + 0.4, 0, 0.34, 0.34, 0.34);
    } else if (b.part === 'cover' || b.part === 'object' || b.part === 'altar') {
      const model = propModel(b.what ?? '', b.part);
      if (!model) return;
      replacedBoxes.add(i);
      const [s, sy] = model === 'table_medium' ? [0.42, 0.5] : model === 'barrel_large' ? [0.42, b.h / 2] : model === 'crates_stacked' ? [0.4, b.h / 2.14] : [0.55, b.h / 1.5];
      place(model, Math.floor(b.x) + 0.5, b.y, Math.floor(b.z) + 0.5, seedOf(b.x, b.z) < 0.5 ? 0 : Math.PI / 2, s, sy, s);
    }
  });

  scene.props.forEach((p, i) => {
    if (p.kind === 'pillar') {
      replacedProps.add(i);
      place('pillar', p.x, p.y, p.z, 0, HALF, p.h / KIT_WALL, HALF);
    } else if (p.kind === 'stairs') {
      // KayKit's stairs climb toward -z, like the map's (facing 0 rises toward the top), from an
      // origin on their bottom edge: turned to the map's way, centred on the square.
      replacedProps.add(i);
      const turn = p.facing ?? 0;
      const back = 0.5;
      place('stairs', p.x - Math.sin(turn) * back, p.y, p.z - Math.cos(turn) * back, turn, 0.2, 0.2, 0.25);
    }
  });

  // The floor: a tile under every square but water, pits and solid rock.
  let floor = false;
  if (groundFloor) {
    const wet = new Set(scene.water.map((w) => key(w.x, w.z)));
    const holes = new Set(scene.pits.map((p) => key(p.x, p.z)));
    const tiles = FLOORS[groundFloor]!;
    for (let z = 0; z < map.height; z++)
      for (let x = 0; x < map.width; x++) {
        if (wet.has(key(x, z)) || holes.has(key(x, z)) || mass.has(key(x, z))) continue;
        const seed = seedOf(x, z);
        // KayKit's broken and weedy stone tiles read as holes on a battle map: stone stays plain.
        const model = tiles.length > 1 && seed > 0.85 ? tiles[1]! : tiles[0]!;
        place(model, x + 0.5, (scene.levels.get(key(x, z)) ?? 0) - 0.03, z + 0.5, Math.floor(seed * 4) * (Math.PI / 2), HALF, HALF, HALF);
      }
    floor = true;
  }
  return { pieces, replacedBoxes, replacedProps, floor };

  /** A wall square: one straight piece through it, or a pillar with an arm toward each wall beside it. */
  function wall(x: number, z: number, y: number, h: number) {
    const sy = h / KIT_WALL;
    const e = joins.has(key(x + 1, z));
    const w = joins.has(key(x - 1, z));
    const n = joins.has(key(x, z - 1));
    const s = joins.has(key(x, z + 1));
    if (e && w && !n && !s) return place('wall_half', x, y, z + 0.5, 0, HALF, sy, HALF);
    if (n && s && !e && !w) return place('wall_half', x + 0.5, y, z, -Math.PI / 2, HALF, sy, HALF);
    // A corner, a junction, an end or a lone square: a pillar, and half walls out to the neighbours.
    const cx = x + 0.5;
    const cz = z + 0.5;
    if (e) place('wall_half', cx, y, cz, 0, HALF / 2, sy, HALF);
    if (w) place('wall_half', cx, y, cz, Math.PI, HALF / 2, sy, HALF);
    if (s) place('wall_half', cx, y, cz, -Math.PI / 2, HALF / 2, sy, HALF);
    if (n) place('wall_half', cx, y, cz, Math.PI / 2, HALF / 2, sy, HALF);
    const lone = !e && !w && !n && !s;
    place('pillar', cx, y, cz, 0, lone ? 0.6 : 0.42, sy * 1.02, lone ? 0.6 : 0.42);
  }
}

/** A model for cover, an object or an altar, from the map's words; null keeps the plain box. */
function propModel(what: string, part: 'cover' | 'object' | 'altar'): KitModel | null {
  if (/\b(barrels?|kegs?|casks?)\b/.test(what)) return 'barrel_large';
  if (/\b(crates?|boxes|cargo|supplies)\b/.test(what)) return 'crates_stacked';
  if (/\b(box|chest)\b/.test(what)) return 'box_large';
  if (part === 'altar' && /\b(table|desk|bench)\b/.test(what)) return 'table_medium';
  return null;
}
