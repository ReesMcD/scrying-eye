import { cellsOf, crossings, SIZE_SQUARES, type CrossHow, type BattleMap, type Cell, type Terrain, type TerrainKind, type TokenSize } from '../../../src/shared/battlemap';
import type { ArtPlan } from '../../../src/shared/types';

/**
 * Painting the battle map from above, shared by the 2D map and the 3D view's floor: ground and
 * terrain (with pictures from the art folder), the grid, fog and spell areas.
 */

/** Shaded areas on top (spell areas, a measure), each with an optional label. */
export interface Overlay {
  cells: Cell[];
  tone: 'accent' | 'warn' | 'bad';
  label?: string;
  /** A line from one grid corner to another (a measure, a cone's aim). */
  line?: [Cell, Cell];
}

/** Decoded pictures, shared by every map on the page (ids are stable per file). */
const images = new Map<string, ImageBitmap | 'loading' | 'failed'>();

/** A picture if it has arrived. */
export function picture(id: string | undefined): ImageBitmap | undefined {
  const img = id ? images.get(id) : undefined;
  return img && img !== 'loading' && img !== 'failed' ? img : undefined;
}

/** Fetches the pictures not already here; `arrived` runs as each one does (until the returned stop). */
export function loadPictures(ids: readonly string[], load: (id: string) => Promise<Blob>, arrived: () => void): () => void {
  let live = true;
  for (const id of ids) {
    if (images.has(id)) continue;
    images.set(id, 'loading');
    load(id)
      .then((blob) => createImageBitmap(blob))
      .then(
        (bitmap) => images.set(id, bitmap),
        () => images.set(id, 'failed'),
      )
      .then(() => live && arrived());
  }
  return () => {
    live = false;
  };
}

/** The format's drawing order. */
export const DRAW_ORDER: TerrainKind[] = ['floor', 'elevation', 'water', 'difficult', 'cover', 'object', 'wall', 'door'];

/**
 * Ground, then terrain in the format's order (pictures where the art folder has them), then decals.
 * `skip` leaves kinds out (the 3D view builds those); `ground: false` leaves the ground clear (the 3D
 * view's KayKit floor tiles show through).
 */
export function paintTerrain(ctx: CanvasRenderingContext2D, map: BattleMap, s: number, colors: Palette, art: ArtPlan | null | undefined, skip?: ReadonlySet<TerrainKind>, ground = true) {
  if (ground) {
    ctx.fillStyle = groundColor(map.ground, colors);
    ctx.fillRect(0, 0, map.width * s, map.height * s);
    const groundImage = picture(art?.ground);
    if (groundImage) for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) ctx.drawImage(groundImage, x * s, y * s, s, s);
  }
  for (const kind of DRAW_ORDER) {
    if (skip?.has(kind)) continue;
    map.terrain.forEach((t, i) => {
      if (t.kind !== kind) return;
      const cells = cellsOf(t, map.width, map.height);
      const tile = picture(art?.tiles[i]);
      const prop = art?.props[i];
      const sprite = picture(prop?.id);
      if (tile) for (const [x, y] of cells) ctx.drawImage(tile, x * s, y * s, s, s);
      else if (sprite && prop) {
        if (prop.each) for (const [x, y] of cells) ctx.drawImage(sprite, x * s, y * s, s, s);
        else {
          const xs = cells.map((c) => c[0]);
          const ys = cells.map((c) => c[1]);
          const x0 = Math.min(...xs);
          const y0 = Math.min(...ys);
          ctx.drawImage(sprite, x0 * s, y0 * s, (Math.max(...xs) - x0 + 1) * s, (Math.max(...ys) - y0 + 1) * s);
        }
      } else for (const [x, y] of cells) paintCell(ctx, t, x, y, s, colors);
      // Difficult ground stays visible over any picture: it's a rule.
      if (kind === 'difficult' && tile) for (const [x, y] of cells) paintCell(ctx, t, x, y, s, colors);
    });
  }
  paintLights(ctx, map, s);
  for (const d of art?.decals ?? []) {
    const img = picture(d.id);
    if (!img) continue;
    const [w, h] = d.size;
    ctx.save();
    ctx.translate((d.at[0] + w / 2) * s, (d.at[1] + h / 2) * s);
    ctx.rotate((d.rotate * Math.PI) / 180);
    ctx.drawImage(img, (-w / 2) * s, (-h / 2) * s, w * s, h * s);
    ctx.restore();
  }
}

/** Lights (#105): a warm pool out to bright light's reach, and a dot where the flame is. */
function paintLights(ctx: CanvasRenderingContext2D, map: BattleMap, s: number) {
  for (const t of map.terrain) {
    const fire = /\b(torch|brazier|campfire|fire|lantern|sconce)\b/i.test(`${t.asset ?? ''} ${t.label ?? ''}`);
    if (!t.light && !fire) continue;
    const bright = (t.light?.bright ?? (fire ? 15 : 0)) / 5;
    const color = t.light?.color && /^#[0-9a-f]{6}$/i.test(t.light.color) ? t.light.color : '#ffa64d';
    for (const [x, y] of cellsOf(t, map.width, map.height)) {
      const cx = (x + 0.5) * s;
      const cy = (y + 0.5) * s;
      if (bright > 0) {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, bright * s);
        g.addColorStop(0, `${color}55`);
        g.addColorStop(1, `${color}00`);
        ctx.fillStyle = g;
        ctx.fillRect(cx - bright * s, cy - bright * s, bright * s * 2, bright * s * 2);
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(2, s * 0.12), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function paintGrid(ctx: CanvasRenderingContext2D, map: BattleMap, s: number, colors: Palette) {
  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= map.width; x++) {
    ctx.moveTo(x * s + 0.5, 0);
    ctx.lineTo(x * s + 0.5, map.height * s);
  }
  for (let y = 0; y <= map.height; y++) {
    ctx.moveTo(0, y * s + 0.5);
    ctx.lineTo(map.width * s, y * s + 0.5);
  }
  ctx.stroke();
}

/** Fog over the map (players: solid; the DM: shaded, to see through). */
export function paintFog(ctx: CanvasRenderingContext2D, map: BattleMap, s: number, fog: { revealed: ReadonlySet<string>; solid: boolean }, colors: Palette) {
  ctx.fillStyle = fog.solid ? colors.fog : 'rgba(0,0,0,0.45)';
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (!fog.revealed.has(`${x},${y}`)) ctx.fillRect(x * s, y * s, s + 0.5, s + 0.5);
}

/** Spell areas and measures: shaded squares, a dashed line, a label. */
export function paintOverlays(ctx: CanvasRenderingContext2D, overlays: readonly Overlay[], s: number, colors: Palette) {
  for (const o of overlays) {
    const tone = colors[o.tone];
    ctx.fillStyle = tone;
    ctx.globalAlpha = 0.28;
    for (const [x, y] of o.cells) ctx.fillRect(x * s, y * s, s, s);
    ctx.globalAlpha = 1;
    if (o.line) {
      ctx.strokeStyle = tone;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(o.line[0][0] * s, o.line[0][1] * s);
      ctx.lineTo(o.line[1][0] * s, o.line[1][1] * s);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (o.label) {
      const at = o.line?.[1] ?? o.cells[0];
      if (at) label(ctx, o.label, at[0] * s, at[1] * s - 14, colors);
    }
  }
}

/**
 * A walk across the map through the middle of each square the token filled: the trail it left
 * this turn (dots), or the way a drag would go (dashes).
 */
export function paintRoute(ctx: CanvasRenderingContext2D, cells: readonly Cell[], size: TokenSize, s: number, color: string, style: 'trail' | 'drag') {
  if (cells.length < 2) return;
  const half = (SIZE_SQUARES[size] * s) / 2;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = style === 'trail' ? Math.max(3, s * 0.13) : 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = style === 'trail' ? 0.85 : 1;
  ctx.setLineDash(style === 'trail' ? [1, Math.max(6, s * 0.28)] : [6, 4]);
  ctx.beginPath();
  cells.forEach(([x, y], i) => (i ? ctx.lineTo(x * s + half, y * s + half) : ctx.moveTo(x * s + half, y * s + half)));
  ctx.stroke();
  if (style === 'trail') {
    // Where it started: a ring, so the trail reads as "from here".
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cells[0]![0] * s + half, cells[0]![1] * s + half, Math.max(3, s * 0.16), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

export type Palette = Record<'surface' | 'text' | 'muted' | 'accent' | 'good' | 'warn' | 'bad' | 'grid' | 'ground' | 'fog', string>;

/** A small label on a background, centred on x (or starting at x). */
export function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, p: Palette, color?: string, align: 'center' | 'left' = 'center') {
  ctx.font = '600 13px system-ui, sans-serif';
  const tw = ctx.measureText(text).width;
  const left = align === 'center' ? x - tw / 2 : x + 6;
  ctx.fillStyle = p.surface;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(left - 6, y - 10, tw + 12, 20);
  ctx.globalAlpha = 1;
  ctx.fillStyle = color ?? p.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left, y);
}

const CROSS_ICON: Partial<Record<CrossHow, string>> = { climb: '⛰', jump: '↷', break: '⚒', squeeze: '⇔', swim: '≈' };

/**
 * For the DM: a small badge on each square of an obstacle that takes a check or a ruling to cross
 * (climb, jump, break…). Tap it for the details.
 */
export function paintCrossings(ctx: CanvasRenderingContext2D, map: BattleMap, s: number, p: Palette) {
  const r = Math.max(6, s * 0.17);
  ctx.font = `600 ${Math.round(r * 1.25)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const t of map.terrain) {
    if (t.secret) continue;
    const ruled = crossings(t).filter((w) => w.check || w.dc || w.how === 'break');
    const text = [...new Set(ruled.flatMap((w) => CROSS_ICON[w.how] ?? []))].join('');
    if (!text) continue;
    const w = Math.max(r * 2, ctx.measureText(text).width + r);
    for (const [cx, cy] of cellsOf(t, map.width, map.height)) {
      const x = cx * s + 2;
      const y = (cy + 1) * s - 2 - r * 2;
      ctx.fillStyle = p.surface;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.roundRect(x, y, w, r * 2, r);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.warn;
      ctx.fillText(text, x + w / 2, y + r);
    }
  }
}

/** The app's colours (light or dark), read from its CSS custom properties. */
export function palette(el: HTMLElement): Palette {
  const css = getComputedStyle(el);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    surface: v('--surface', '#131722'),
    text: v('--text', '#e7e9f0'),
    muted: v('--muted', '#8d93a8'),
    accent: v('--accent', '#7fe7d4'),
    good: v('--good', '#6ee7a8'),
    warn: v('--warn', '#f5b85a'),
    bad: v('--bad', '#ff7a85'),
    grid: v('--map-grid', 'rgba(127,127,127,0.25)'),
    ground: v('--map-ground', '#1b2130'),
    fog: v('--map-fog', '#05060a'),
  };
}

export const GROUND: Record<string, string> = {
  grass: '#55743f',
  dirt: '#7a5c3c',
  road: '#8a7354',
  stone: '#6b6f78',
  wood: '#86623d',
  sand: '#c2a76b',
  snow: '#d8dee6',
  cave: '#4a4740',
  mud: '#5d4a35',
  water: '#3f6f9a',
  rock: '#2b2a28',
};

export function groundColor(ground: string | undefined, p: Palette): string {
  return (ground && GROUND[ground]) ?? p.ground;
}

export function paintCell(ctx: CanvasRenderingContext2D, t: Terrain, x: number, y: number, s: number, p: Palette) {
  const px = x * s;
  const py = y * s;
  switch (t.kind) {
    case 'floor':
      ctx.fillStyle = (t.ground && GROUND[t.ground]) ?? 'rgba(160,140,110,0.55)';
      ctx.fillRect(px, py, s, s);
      break;
    case 'elevation':
      // Raised: a light tint. A pit (negative): a dark hole, darker the deeper.
      if ((t.height ?? 0) < 0) {
        ctx.fillStyle = `rgba(12,10,8,${Math.min(0.92, 0.55 + -(t.height ?? 0) / 60)})`;
        ctx.fillRect(px + s * 0.04, py + s * 0.04, s * 0.92, s * 0.92);
      } else {
        ctx.fillStyle = 'rgba(170,150,220,0.35)';
        ctx.fillRect(px, py, s, s);
      }
      break;
    case 'water':
      ctx.fillStyle = t.depth === 'deep' ? 'rgba(40,90,170,0.85)' : 'rgba(80,140,210,0.6)';
      ctx.fillRect(px, py, s, s);
      break;
    case 'difficult':
      // Hatched, so it reads as "slow" over any ground.
      ctx.save();
      ctx.beginPath();
      ctx.rect(px, py, s, s);
      ctx.clip();
      ctx.strokeStyle = 'rgba(245,184,90,0.7)';
      ctx.lineWidth = Math.max(1, s * 0.06);
      for (let i = -s; i < s; i += Math.max(4, s / 4)) {
        ctx.beginPath();
        ctx.moveTo(px + i, py + s);
        ctx.lineTo(px + i + s, py);
        ctx.stroke();
      }
      ctx.restore();
      break;
    case 'cover':
      ctx.fillStyle = 'rgba(140,140,150,0.75)';
      ctx.fillRect(px + s * 0.18, py + s * 0.18, s * 0.64, s * 0.64);
      break;
    case 'object':
      ctx.fillStyle = t.asset === 'tree' || t.asset === 'bush' || t.asset === 'reeds' ? 'rgba(40,90,45,0.95)' : 'rgba(70,70,78,0.95)';
      ctx.fillRect(px + 1, py + 1, s - 2, s - 2);
      break;
    case 'wall':
      ctx.fillStyle = p.text;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(px, py, s, s);
      ctx.globalAlpha = 1;
      break;
    case 'door': {
      // A door sits in a wall: draw it on a plain floor, whatever the map's ground.
      ctx.fillStyle = GROUND.stone!;
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#a0703c';
      if (t.state === 'open') {
        ctx.fillRect(px, py, s * 0.18, s);
      } else {
        ctx.fillRect(px + 1, py + s * 0.3, s - 2, s * 0.4);
        if (t.state === 'locked') {
          ctx.fillStyle = p.warn;
          ctx.fillRect(px + s * 0.42, py + s * 0.4, s * 0.16, s * 0.2);
        }
      }
      break;
    }
  }
}


export function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  const last = words.at(-1) ?? '';
  // "Goblin 2" → "G2"; "Ari" → "AR".
  if (words.length > 1 && /^\d+$/.test(last)) return `${words[0]![0]!.toUpperCase()}${last}`;
  return words.length > 1 ? `${words[0]![0]}${words[1]![0]}`.toUpperCase() : name.slice(0, 2).toUpperCase();
}

