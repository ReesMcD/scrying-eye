import type { Mini, MiniSpec } from './spec.js';
import { resolveMini } from './style.js';
import { paperStyle } from './paper/index.js';

/**
 * Art styles: how a mini is drawn. A mini (`MiniSpec`) says what a figure is (a dwarf in chain
 * with an axe; a red dragon); a style decides what that looks like. Every style draws every mini,
 * so swapping the style redraws the whole table, the minis people saved included.
 *
 * Adding one: a folder beside `paper/` with a `MiniArtStyle`, one line in `ART_STYLES`, and the
 * tests in test/minis.test.ts check it draws every part of every figure. `DEFAULT_ART_STYLE`
 * is the one the app uses.
 */

export interface RenderedMini {
  svg: string;
  /** The view box's size, in card units: the card's aspect, and its height relative to others. */
  width: number;
  height: number;
  /** Where the face is, in the SVG's own coordinates: a circle round the head (for portrait tokens). */
  face: { x: number; y: number; r: number };
}

export interface RenderOptions {
  /** A prefix for the SVG's ids, unique on the page when several minis are inlined. */
  id?: string;
  /** Cut out of its card (default), or just the figure. */
  paper?: boolean;
  /** Which art style draws it (default: `DEFAULT_ART_STYLE`). */
  style?: ArtStyleId;
}

export interface MiniArtStyle {
  id: string;
  name: string;
  /**
   * Draws a mini as plain SVG (no scripts or external files: it's inlined in pages and turned into
   * textures). Card units: the feet stand at y = 200 and a human is about 168 tall, so cards from
   * different styles stand at the same height on the board.
   */
  render(mini: Mini, options: { id: string; paper: boolean }): RenderedMini;
}

export const ART_STYLES = { paper: paperStyle } as const satisfies Record<string, MiniArtStyle>;
export type ArtStyleId = keyof typeof ART_STYLES;
export const DEFAULT_ART_STYLE: ArtStyleId = 'paper';

/**
 * The mini's face for a round token: the same drawing, framed on its head, with no card. The SVG
 * is square; draw it clipped to a circle.
 */
export function renderPortrait(spec: MiniSpec, options: Omit<RenderOptions, 'paper'> = {}): string {
  const { svg, face } = renderMini(spec, { ...options, paper: false });
  const f = (n: number) => String(Math.round(n * 10) / 10);
  const box = `${f(face.x - face.r)} ${f(face.y - face.r)} ${f(face.r * 2)} ${f(face.r * 2)}`;
  return svg.replace(/viewBox="[^"]*"/, `viewBox="${box}"`).replace(/ width="[^"]+" height="[^"]+"/, ' width="128" height="128"');
}

/** Draws a mini as an SVG card in an art style. */
export function renderMini(spec: MiniSpec, options: RenderOptions = {}): RenderedMini {
  const style: MiniArtStyle = ART_STYLES[options.style ?? DEFAULT_ART_STYLE];
  return style.render(resolveMini(spec), { id: options.id ?? 'mini', paper: options.paper !== false });
}
