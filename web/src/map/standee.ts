import { renderMini, type MiniSpec } from '../../../src/shared/minis';

/**
 * Paper standees (#97): each creature in 3D is its paper mini (src/shared/minis) on a card in a
 * stand, like the paper minis on a real table.
 */

/** Canvas pixels per card unit: sharp enough up close, small enough for a table of twenty. */
const PX = 3;
/** A plain human's card height, in card units: the size every other card is measured against. */
const HUMAN = renderMini({}).height;

export interface MiniCard {
  canvas: HTMLCanvasElement;
  /** Height relative to a human's card (a gnome's is shorter, a wizard's hat makes it taller). */
  scale: number;
  /** Resolves once the figure is drawn on the canvas (an SVG decodes asynchronously). */
  ready: Promise<void>;
}

let drawn = 0;

/** A mini drawn onto a canvas for a card's texture. */
export function miniCard(spec: MiniSpec): MiniCard {
  const { svg, width, height } = renderMini(spec, { id: `standee-${drawn++}` });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * PX);
  canvas.height = Math.round(height * PX);
  const image = new Image();
  const ready = new Promise<void>((resolve, reject) => {
    image.onload = () => {
      canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve();
    };
    image.onerror = () => reject(new Error('The mini could not be drawn'));
  });
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return { canvas, scale: height / HUMAN, ready };
}

/**
 * How far a card leans back for a camera looking down at `down` radians (0 level, π/2 straight
 * down): upright at the table, lying flat from above so the top view reads like the 2D map.
 */
export function leanFor(down: number): number {
  const start = 0.75;
  return Math.max(0, Math.min(1, (down - start) / (Math.PI / 2 - start))) * 1.45;
}
