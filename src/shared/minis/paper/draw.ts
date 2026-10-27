import { PALETTE } from '../style.js';

/**
 * The paper style's pen: one warm ink outline on every shape (never pure black: softer next to
 * KayKit's colours), cream card, flat colour. Every part is drawn with `shape`, so the ink is the
 * same everywhere.
 */

/** The outline on every shape, and the card it's cut from. */
export const INK = '#2b2118';
export const INK_WIDTH = 2.6;
export const PAPER = '#fbf6ea';
export const PAPER_EDGE = '#c9bea7';

export const f = (n: number) => String(Math.round(n * 10) / 10);
export const CX = 60;
export const FEET = 200;

/** Outlined shapes: everything a part draws goes through these, so the ink is the same everywhere. */
export const shape = {
  poly: (points: Array<[number, number]>, fill: string) => `<polygon points="${points.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}" fill="${fill}"/>`,
  path: (d: string, fill: string) => `<path d="${d}" fill="${fill}"/>`,
  circle: (x: number, y: number, r: number, fill: string) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${fill}"/>`,
  ellipse: (x: number, y: number, rx: number, ry: number, fill: string) => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"/>`,
  rect: (x: number, y: number, w: number, h: number, fill: string, r = 1.5) => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${f(r)}" fill="${fill}"/>`,
  line: (x1: number, y1: number, x2: number, y2: number, width = INK_WIDTH, stroke = INK) => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${stroke}" stroke-width="${f(width)}"/>`,
  /** A detail line with no outline of its own (rib, belt stitch). */
  detail: (d: string, stroke: string, width = 1.6) => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${f(width)}"/>`,
};

/** Lighter or darker, for a highlight or a shadow side. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(amount > 0 ? v + (255 - v) * amount : v * (1 + amount)))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export { PALETTE };
