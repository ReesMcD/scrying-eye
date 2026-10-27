import { useEffect, useRef } from 'react';
import { cellsOf, SIZE_SQUARES, tokenAt, type BattleMap, type Cell, type MapToken } from '../../../src/shared/battlemap';
import { pathRoute } from '../../../src/shared/tableAids';
import { roomCells } from '../../../src/shared/mapSight';
import type { ArtPlan, MiniSpec } from '../../../src/shared/types';
import { initials, label, loadPictures, paintFog, paintGrid, paintOverlays, paintRoute, paintTerrain, palette, type Overlay, type Palette } from './paint';
import { dropAllowed, PENDING_MS, pendingMove, settled, shownAt, type PendingMove } from './pendingMove';
import { moveGuide } from './moveGuide';
import './map.css';

export type { Overlay };

/** What the tracker knows about a token's combatant, for drawing it. */
export interface TokenInfo {
  name: string;
  /** Whose turn it is. */
  current?: boolean;
  /** Hidden from players (the DM sees it faded). */
  hidden?: boolean;
  /** This device's own token. */
  mine?: boolean;
  /** During a fight: feet moved since its turn started. */
  moved?: number;
  /** Walking speed in feet, when known. */
  speed?: number | null;
  /** Two foes on opposite sides of it (the optional flanking rule). */
  flanked?: boolean;
  /** Its paper mini for the 3D standee (without one, it gets one from its name). */
  mini?: MiniSpec;
}

/** What both map views (2D and 3D) take. */
export interface MapViewProps {
  map: BattleMap;
  info: Record<string, TokenInfo>;
  canMove: (tokenId: string) => boolean;
  onMove: (tokenId: string, at: Cell) => void;
  /** A tap (not a drag) on a square, with the token there if any. */
  onTap?: (at: Cell, token: MapToken | undefined) => void;
  selected?: string | null;
  /** The DM's notes on the map. */
  showNotes?: boolean;
  label: string;
  /** Pictures from the DM's art folder, and how to fetch one. Without them the map is drawn plainly. */
  art?: ArtPlan | null;
  loadArt?: (id: string) => Promise<Blob>;
  /** Fog of war: squares not revealed are dark (players: solid; the DM: shaded, to see through). */
  fog?: { revealed: ReadonlySet<string>; solid: boolean } | null;
  /** Shaded areas on top (spell areas, a measure), each with an optional label. */
  overlays?: Overlay[];
  /** When set, a drag on the map reports grid corners (placing an area, measuring) instead of panning. */
  onCornerDrag?: (from: Cell, to: Cell, done: boolean) => void;
  /** Whose turn it is: the squares their token has walked this turn, drawn as a dotted trail. */
  trail?: { token: string; cells: Cell[] } | null;
}

type View = { scale: number; ox: number; oy: number };
type Drag = { pointer: number; tokenId: string; from: Cell; to: Cell; startX: number; startY: number; moved: boolean };
type Gesture =
  | { kind: 'pan'; pointer: number; startX: number; startY: number; view: View; moved: boolean }
  | { kind: 'pinch'; distance: number; mid: [number, number]; view: View }
  | { kind: 'corner'; pointer: number; from: Cell; to: Cell; startX: number; startY: number; moved: boolean };

const TAP_SLOP = 6;
/** Squares smaller than this (CSS px) are too fiddly to drag a token onto. */
const MIN_TOUCH_SQUARE = 22;

/**
 * The battle map on a canvas (fast on big maps and old phones). Drag a token you may move: it
 * snaps to squares and shows the distance. Drag the map to pan; pinch or scroll to zoom.
 */
export function BattleMapView(props: MapViewProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<View>({ scale: 32, ox: 0, oy: 0 });
  const fitted = useRef<string>('');
  const drag = useRef<Drag | null>(null);
  const pending = useRef<PendingMove | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, [number, number]>());
  const latest = useRef(props);
  latest.current = props;
  const frame = useRef(0);

  // Fetch the pictures the plan uses; redraw as each arrives.
  const artIds = props.art?.ids.join(',') ?? '';
  useEffect(() => {
    const load = latest.current.loadArt;
    if (!load) return;
    return loadPictures(latest.current.art?.ids ?? [], load, () => redraw());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artIds]);

  const redraw = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => draw());
  };

  /**
   * Fits the whole map in the box. On a small screen a big map would make squares too small to
   * touch, so it zooms to a usable size instead, centred on my token (or whoever's turn it is).
   */
  const fit = () => {
    const el = wrap.current;
    if (!el) return;
    const { map, info } = latest.current;
    const whole = Math.min(el.clientWidth / map.width, el.clientHeight / map.height);
    // A mouse can hit small squares; a finger can't.
    const smallest = window.matchMedia?.('(pointer: coarse)').matches ? MIN_TOUCH_SQUARE : 10;
    if (whole >= smallest) {
      view.current = { scale: whole, ox: (el.clientWidth - map.width * whole) / 2, oy: (el.clientHeight - map.height * whole) / 2 };
      return;
    }
    const scale = smallest;
    const focus = map.tokens.find((t) => info[t.id]?.mine) ?? map.tokens.find((t) => info[t.id]?.current);
    const [fx, fy] = focus ? [focus.at[0] + SIZE_SQUARES[focus.size] / 2, focus.at[1] + SIZE_SQUARES[focus.size] / 2] : [map.width / 2, map.height / 2];
    view.current = { scale, ox: el.clientWidth / 2 - fx * scale, oy: el.clientHeight / 2 - fy * scale };
  };

  const draw = () => {
    const el = wrap.current;
    const c = canvas.current;
    if (!el || !c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const { map, info, selected, showNotes, art, fog, overlays, trail } = latest.current;
    const colors = palette(el);
    const { scale: s, ox, oy } = view.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.translate(ox, oy);

    paintTerrain(ctx, map, s, colors, art);
    paintGrid(ctx, map, s, colors);

    if (showNotes) {
      // The DM's view: room keys and secret doors.
      for (const room of map.rooms ?? []) {
        const cells = roomCells(map, room);
        if (!cells.length) continue;
        const x0 = Math.min(...cells.map((c) => c[0]));
        const y0 = Math.min(...cells.map((c) => c[1]));
        label(ctx, room.name ? `${room.id}. ${room.name}` : room.id, x0 * s + 4, y0 * s + 13, colors, colors.warn, 'left');
      }
      map.terrain.forEach((t) => {
        if (!t.secret) return;
        ctx.strokeStyle = colors.warn;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        for (const [x, y] of cellsOf(t, map.width, map.height)) ctx.strokeRect(x * s + 3, y * s + 3, s - 6, s - 6);
        ctx.setLineDash([]);
      });
      for (const n of map.notes) {
        ctx.fillStyle = colors.warn;
        ctx.beginPath();
        ctx.arc((n.at[0] + 0.85) * s, (n.at[1] + 0.15) * s, Math.max(3, s * 0.12), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Fog over the map but under the tokens the viewer may see (a player's map has none under it).
    if (fog) paintFog(ctx, map, s, fog, colors);
    paintOverlays(ctx, overlays ?? [], s, colors);

    const walker = trail ? map.tokens.find((t) => t.id === trail.token) : undefined;
    if (trail && walker) paintRoute(ctx, trail.cells, walker.size, s, colors.accent, 'trail');

    const d = drag.current;
    const now = Date.now();
    if (pending.current && settled(map, pending.current, now)) pending.current = null;
    for (const t of map.tokens) {
      const ti = info[t.id];
      if (d?.moved && d.tokenId === t.id) {
        paintToken(ctx, t, t.at, s, ti, colors, { faded: true });
        continue;
      }
      paintToken(ctx, t, shownAt(t, pending.current, now), s, ti, colors, { selected: selected === t.id });
    }

    // The token being dragged: where it would land, how far, and anything odd about the square.
    if (d?.moved) {
      const t = map.tokens.find((x) => x.id === d.tokenId);
      if (t) {
        const guide = moveGuide(map, t, d.from, d.to, info[t.id]);
        const ok = !guide.warning;
        const half = (SIZE_SQUARES[t.size] * s) / 2;
        // The way it would walk: around pillars and walls, not through them.
        paintRoute(ctx, pathRoute(map, t.size, d.from, d.to), t.size, s, ok ? colors.accent : colors.warn, 'drag');
        paintToken(ctx, t, d.to, s, info[t.id], colors, { dragging: true });
        label(ctx, guide.warning ? `${guide.text} · ${guide.warning}` : guide.text, d.to[0] * s + half, d.to[1] * s - 16, colors, ok ? undefined : colors.warn);
      }
    }
  };

  // Redraw on any change; refit when the map's size changes.
  useEffect(() => {
    const key = `${props.map.width}x${props.map.height}`;
    if (fitted.current !== key) {
      fitted.current = key;
      fit();
    }
    redraw();
  });

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      fit();
      redraw();
    });
    observer.observe(el);
    const scheme = window.matchMedia?.('(prefers-color-scheme: dark)');
    scheme?.addEventListener?.('change', redraw);
    return () => {
      observer.disconnect();
      scheme?.removeEventListener?.('change', redraw);
      cancelAnimationFrame(frame.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const local = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const cellAt = ([px, py]: [number, number]): Cell => {
    const { scale, ox, oy } = view.current;
    return [Math.floor((px - ox) / scale), Math.floor((py - oy) / scale)];
  };
  const zoomAt = (factor: number, [px, py]: [number, number], from = view.current) => {
    const scale = Math.max(8, Math.min(120, from.scale * factor));
    const k = scale / from.scale;
    view.current = { scale, ox: px - (px - from.ox) * k, oy: py - (py - from.oy) * k };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    canvas.current!.setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      // Second finger: pinch (and abandon any drag).
      drag.current = null;
      const [a, b] = [...pointers.current.values()] as [[number, number], [number, number]];
      gesture.current = { kind: 'pinch', distance: Math.hypot(a[0] - b[0], a[1] - b[1]), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], view: { ...view.current } };
      redraw();
      return;
    }
    const { map, canMove, onCornerDrag } = latest.current;
    const cell = cellAt(p);
    const t = tokenAt(map, cell);
    if (onCornerDrag) {
      const corner = cornerAt(p);
      gesture.current = { kind: 'corner', pointer: e.pointerId, from: corner, to: corner, startX: p[0], startY: p[1], moved: false };
    } else if (t && canMove(t.id)) drag.current = { pointer: e.pointerId, tokenId: t.id, from: t.at, to: t.at, startX: p[0], startY: p[1], moved: false };
    else gesture.current = { kind: 'pan', pointer: e.pointerId, startX: p[0], startY: p[1], view: { ...view.current }, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (g?.kind === 'pinch' && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [[number, number], [number, number]];
      const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      zoomAt(Math.hypot(a[0] - b[0], a[1] - b[1]) / g.distance, g.mid, g.view);
      view.current = { ...view.current, ox: view.current.ox + mid[0] - g.mid[0], oy: view.current.oy + mid[1] - g.mid[1] };
      redraw();
      return;
    }
    const d = drag.current;
    if (d && d.pointer === e.pointerId) {
      if (!d.moved && Math.hypot(p[0] - d.startX, p[1] - d.startY) < TAP_SLOP) return;
      d.moved = true;
      const t = latest.current.map.tokens.find((x) => x.id === d.tokenId);
      const n = t ? SIZE_SQUARES[t.size] : 1;
      // Snap by the token's centre, so big tokens land where they're held.
      const { scale, ox, oy } = view.current;
      d.to = [Math.round((p[0] - ox) / scale - n / 2), Math.round((p[1] - oy) / scale - n / 2)];
      redraw();
      return;
    }
    if (g?.kind === 'pan' && g.pointer === e.pointerId) {
      if (!g.moved && Math.hypot(p[0] - g.startX, p[1] - g.startY) < TAP_SLOP) return;
      g.moved = true;
      view.current = { ...g.view, ox: g.view.ox + p[0] - g.startX, oy: g.view.oy + p[1] - g.startY };
      redraw();
    }
    if (g?.kind === 'corner' && g.pointer === e.pointerId) {
      if (!g.moved && Math.hypot(p[0] - g.startX, p[1] - g.startY) < TAP_SLOP) return;
      g.moved = true;
      const to = cornerAt(p);
      if (to[0] !== g.to[0] || to[1] !== g.to[1]) {
        g.to = to;
        latest.current.onCornerDrag?.(g.from, to, false);
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    const g = gesture.current;
    if (d && d.pointer === e.pointerId) {
      drag.current = null;
      if (d.moved) {
        const t = latest.current.map.tokens.find((x) => x.id === d.tokenId);
        // Dropped off the board or into something solid, it goes back where it was. Otherwise it
        // stays where it landed while the move goes to the server, rather than flashing back.
        if (t && dropAllowed(latest.current.map, t, d.from, d.to)) {
          pending.current = pendingMove(t.id, t.at, d.to, Date.now());
          window.setTimeout(redraw, PENDING_MS + 50);
          latest.current.onMove(d.tokenId, d.to);
        }
      } else if (p) tap(p);
      redraw();
      return;
    }
    if (g?.kind === 'pinch') {
      if (pointers.current.size === 0) gesture.current = null;
      return;
    }
    if (g?.kind === 'pan' && g.pointer === e.pointerId) {
      gesture.current = null;
      if (!g.moved && p) tap(p);
    }
    if (g?.kind === 'corner' && g.pointer === e.pointerId) {
      gesture.current = null;
      if (g.moved) latest.current.onCornerDrag?.(g.from, g.to, true);
      else if (p) tap(p);
    }
  };

  /** The grid corner nearest a point (areas and measures start and end on corners). */
  const cornerAt = ([px, py]: [number, number]): Cell => {
    const { scale, ox, oy } = view.current;
    const { map } = latest.current;
    return [Math.max(0, Math.min(map.width, Math.round((px - ox) / scale))), Math.max(0, Math.min(map.height, Math.round((py - oy) / scale)))];
  };

  const tap = (p: [number, number]) => {
    const { map, onTap } = latest.current;
    const cell = cellAt(p);
    if (cell[0] < 0 || cell[1] < 0 || cell[0] >= map.width || cell[1] >= map.height) return;
    onTap?.(cell, tokenAt(map, cell));
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    zoomAt(Math.exp(-e.deltaY * 0.0015), local(e));
    redraw();
  };

  return (
    <div className="battle-map" ref={wrap}>
      <canvas
        ref={canvas}
        role="img"
        aria-label={props.label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      />
      <div className="battle-map-zoom">
        <button type="button" aria-label="Zoom in" onClick={() => (zoomAt(1.25, centre(wrap.current)), redraw())}>
          +
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => (zoomAt(0.8, centre(wrap.current)), redraw())}>
          −
        </button>
        <button type="button" aria-label="Fit the map" onClick={() => (fit(), redraw())}>
          ⤢
        </button>
      </div>
    </div>
  );
}

const centre = (el: HTMLElement | null): [number, number] => [(el?.clientWidth ?? 0) / 2, (el?.clientHeight ?? 0) / 2];

function paintToken(ctx: CanvasRenderingContext2D, t: MapToken, at: Cell, s: number, info: TokenInfo | undefined, p: Palette, o: { faded?: boolean; selected?: boolean; dragging?: boolean }) {
  const n = SIZE_SQUARES[t.size];
  const r = (n * s) / 2;
  const cx = at[0] * s + r;
  const cy = at[1] * s + r;
  const fill = t.kind === 'pc' ? p.accent : t.kind === 'npc' ? p.warn : p.bad;
  ctx.save();
  ctx.globalAlpha = o.faded || info?.hidden ? 0.4 : 1;
  if (info?.current) {
    ctx.strokeStyle = p.text;
    ctx.lineWidth = Math.max(2, s * 0.1);
    ctx.beginPath();
    ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(4, r - Math.max(3, s * 0.12)), 0, Math.PI * 2);
  ctx.fill();
  if (info?.hidden) {
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = p.text;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (o.selected || info?.mine) {
    ctx.strokeStyle = o.selected ? p.text : p.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 1, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Initials.
  if (s * n >= 18) {
    ctx.fillStyle = '#0b0d12';
    ctx.font = `700 ${Math.max(9, Math.min(22, r * 0.75))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(info?.name ?? t.name), cx, cy + 0.5);
  }
  ctx.restore();
  // Table aids, when there's room: flanked above, how far whoever's turn it is has moved below.
  if (s * n < 18 || o.faded || o.dragging) return;
  if (info?.flanked) label(ctx, 'Flanked', cx, at[1] * s - 9, p, p.warn);
  if (info?.current && info.moved) label(ctx, `${info.moved} ft${info.speed ? ` of ${info.speed}` : ''}`, cx, at[1] * s + n * s + 11, p);
}

