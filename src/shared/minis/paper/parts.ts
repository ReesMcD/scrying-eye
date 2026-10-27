import type { Mini } from '../spec.js';
import { f, INK, PALETTE, shade, shape } from './draw.js';

/**
 * Parts shared by the creatures seen side on (beasts, birds, dragons, monsters): heads, wings,
 * tails, eyes and flames, each drawn facing right at a point and a size.
 */

/** A line with an ink outline (a thin tail, a leg, an antler): the ink under, the colour over. */
export function strand(d: string, colour: string, width: number): string {
  return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${f(width + 3)}"/><path d="${d}" fill="none" stroke="${colour}" stroke-width="${f(width)}"/>`;
}

/** An eye: an ink dot, or a coloured one (shining, with a soft light) when the mini says so. */
export function eye(m: Mini, x: number, y: number, r: number): string {
  const { eyes, glow } = m.features;
  if (eyes === INK && !glow) return shape.circle(x, y, r, INK);
  const light = glow ? `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 2.6)}" fill="${eyes}" stroke="none" opacity="0.45"/>` : '';
  return `${light}<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 1.3)}" fill="${eyes}" stroke="${INK}" stroke-width="1.1"/>`;
}

/** A tongue of fire rising from a point. */
export function flame(x: number, y: number, h: number): string {
  const w = h * 0.42;
  return (
    shape.path(`M${f(x - w)},${f(y)} Q${f(x - w * 1.1)},${f(y - h * 0.55)} ${f(x)},${f(y - h)} Q${f(x + w * 0.3)},${f(y - h * 0.5)} ${f(x + w)},${f(y)} Z`, '#f08c2a') +
    `<path d="M${f(x - w * 0.45)},${f(y)} Q${f(x - w * 0.4)},${f(y - h * 0.4)} ${f(x)},${f(y - h * 0.62)} Q${f(x + w * 0.2)},${f(y - h * 0.3)} ${f(x + w * 0.45)},${f(y)} Z" fill="#ffd36b" stroke="none"/>`
  );
}

/** Flames along a line of points (a mane, a back, a crown). */
export function flames(points: Array<[number, number]>, h: number): string {
  return points.map(([x, y], i) => flame(x, y, h * (i % 2 ? 0.75 : 1))).join('');
}

/**
 * A wing seen side on, rising from the shoulder at (x, y) and sweeping back (to the left).
 * `span` is how tall it stands.
 */
export function sideWing(kind: 'feathered' | 'bat' | 'insect', x: number, y: number, span: number, colour: string): string {
  const s = span;
  if (kind === 'feathered')
    return (
      shape.path(`M${f(x + s * 0.12)},${f(y)} Q${f(x + s * 0.1)},${f(y - s * 0.75)} ${f(x - s * 0.35)},${f(y - s)} Q${f(x - s * 0.55)},${f(y - s * 0.55)} ${f(x - s * 0.7)},${f(y - s * 0.2)} Q${f(x - s * 0.55)},${f(y - s * 0.2)} ${f(x - s * 0.52)},${f(y - s * 0.05)} Q${f(x - s * 0.38)},${f(y - s * 0.08)} ${f(x - s * 0.34)},${f(y + s * 0.06)} Q${f(x - s * 0.2)},${f(y - s * 0.02)} ${f(x - s * 0.12)},${f(y + s * 0.1)} Z`, colour) +
      shape.detail(`M${f(x - s * 0.05)},${f(y - s * 0.6)} Q${f(x - s * 0.3)},${f(y - s * 0.55)} ${f(x - s * 0.5)},${f(y - s * 0.32)} M${f(x - s * 0.02)},${f(y - s * 0.3)} Q${f(x - s * 0.2)},${f(y - s * 0.28)} ${f(x - s * 0.36)},${f(y - s * 0.1)}`, shade(colour, -0.22))
    );
  if (kind === 'bat')
    return (
      shape.path(`M${f(x + s * 0.12)},${f(y)} L${f(x - s * 0.1)},${f(y - s)} L${f(x - s * 0.72)},${f(y - s * 0.55)} Q${f(x - s * 0.55)},${f(y - s * 0.38)} ${f(x - s * 0.6)},${f(y - s * 0.2)} Q${f(x - s * 0.42)},${f(y - s * 0.24)} ${f(x - s * 0.38)},${f(y - s * 0.02)} Q${f(x - s * 0.2)},${f(y - s * 0.12)} ${f(x - s * 0.1)},${f(y + s * 0.08)} Z`, colour) +
      shape.detail(`M${f(x + s * 0.05)},${f(y - s * 0.1)} L${f(x - s * 0.1)},${f(y - s)} M${f(x - s * 0.06)},${f(y - s * 0.72)} L${f(x - s * 0.58)},${f(y - s * 0.22)} M${f(x - s * 0.02)},${f(y - s * 0.45)} L${f(x - s * 0.36)},${f(y - s * 0.04)}`, shade(colour, -0.35), 1.8)
    );
  return (
    `<ellipse cx="${f(x - s * 0.3)}" cy="${f(y - s * 0.45)}" rx="${f(s * 0.52)}" ry="${f(s * 0.16)}" fill="${colour}" fill-opacity="0.7" transform="rotate(-55 ${f(x)} ${f(y)})"/>` +
    `<ellipse cx="${f(x - s * 0.32)}" cy="${f(y - s * 0.2)}" rx="${f(s * 0.4)}" ry="${f(s * 0.13)}" fill="${colour}" fill-opacity="0.7" transform="rotate(-25 ${f(x)} ${f(y)})"/>`
  );
}

export type SideHead =
  | 'canine' | 'feline' | 'lion' | 'bear' | 'boar' | 'horse' | 'deer' | 'goat' | 'ox' | 'camel' | 'rhino' | 'elephant' | 'hippo'
  | 'lizard' | 'crocodile' | 'rodent' | 'badger' | 'eagle' | 'owl' | 'human' | 'triceratops' | 'ankylosaurus' | 'raptor';

/** A head seen side on, facing right, centred on (x, y) with size s. Returns its art and how far it reaches up. */
export function sideHead(kind: SideHead, x: number, y: number, s: number, m: Mini, colour = m.coat): { art: string; top: number; right: number } {
  const c = colour;
  const light = shade(c, 0.35);
  const dark = shade(c, -0.3);
  const ear = (dx: number, h: number, w = 0.28) => shape.poly([[x + s * (dx - w), y - s * 0.5], [x + s * dx, y - s * (0.5 + h)], [x + s * (dx + w), y - s * 0.45]], c);
  const out: string[] = [];
  let top = y - s;
  let right = x + s * 1.6;
  switch (kind) {
    case 'canine':
      out.push(ear(-0.25, 0.85));
      out.push(shape.ellipse(x, y, s * 0.85, s * 0.72, c));
      out.push(shape.path(`M${f(x + s * 0.35)},${f(y - s * 0.4)} L${f(x + s * 1.65)},${f(y - s * 0.08)} Q${f(x + s * 1.8)},${f(y + s * 0.25)} ${f(x + s * 1.55)},${f(y + s * 0.38)} L${f(x + s * 0.3)},${f(y + s * 0.55)} Z`, c));
      out.push(shape.circle(x + s * 1.66, y + s * 0.02, s * 0.14, INK));
      out.push(shape.detail(`M${f(x + s * 0.7)},${f(y + s * 0.38)} L${f(x + s * 1.4)},${f(y + s * 0.28)}`, dark, 1.3));
      out.push(eye(m, x + s * 0.3, y - s * 0.18, s * 0.11));
      top = y - s * 1.35;
      right = x + s * 1.85;
      break;
    case 'feline':
    case 'lion':
      if (kind === 'lion') out.push(shape.circle(x - s * 0.2, y + s * 0.05, s * 1.3, m.hair.style === 'none' ? dark : m.hair.colour));
      out.push(ear(-0.1, 0.45, 0.22));
      out.push(shape.circle(x, y, s * 0.82, c));
      out.push(shape.ellipse(x + s * 0.72, y + s * 0.2, s * 0.42, s * 0.32, light));
      out.push(shape.poly([[x + s * 0.92, y], [x + s * 1.12, y + s * 0.02], [x + s * 1.0, y + s * 0.15]], INK));
      out.push(shape.detail(`M${f(x + s * 0.8)},${f(y + s * 0.3)} l${f(s * 0.7)},${f(-s * 0.1)} M${f(x + s * 0.8)},${f(y + s * 0.36)} l${f(s * 0.7)},${f(s * 0.08)}`, INK, 0.8));
      out.push(eye(m, x + s * 0.38, y - s * 0.15, s * 0.11));
      top = kind === 'lion' ? y - s * 1.25 : y - s * 1.25;
      right = x + s * 1.3;
      break;
    case 'bear':
      out.push(shape.circle(x - s * 0.3, y - s * 0.68, s * 0.28, c));
      out.push(shape.circle(x, y, s * 0.85, c));
      out.push(shape.path(`M${f(x + s * 0.45)},${f(y - s * 0.25)} L${f(x + s * 1.35)},${f(y - s * 0.05)} Q${f(x + s * 1.5)},${f(y + s * 0.3)} ${f(x + s * 1.3)},${f(y + s * 0.5)} L${f(x + s * 0.5)},${f(y + s * 0.6)} Z`, light));
      out.push(shape.circle(x + s * 1.38, y + s * 0.05, s * 0.15, INK));
      out.push(eye(m, x + s * 0.35, y - s * 0.22, s * 0.1));
      top = y - s;
      right = x + s * 1.6;
      break;
    case 'boar':
      out.push(ear(-0.15, 0.55, 0.25));
      out.push(shape.path(`M${f(x - s * 0.7)},${f(y - s * 0.6)} Q${f(x + s * 0.3)},${f(y - s * 0.75)} ${f(x + s * 1.5)},${f(y + s * 0.05)} L${f(x + s * 1.55)},${f(y + s * 0.55)} Q${f(x + s * 0.4)},${f(y + s * 0.85)} ${f(x - s * 0.7)},${f(y + s * 0.6)} Z`, c));
      out.push(shape.ellipse(x + s * 1.55, y + s * 0.3, s * 0.14, s * 0.28, light));
      out.push(shape.path(`M${f(x + s * 0.95)},${f(y + s * 0.6)} Q${f(x + s * 1.2)},${f(y + s * 0.1)} ${f(x + s * 1.0)},${f(y - s * 0.3)} Q${f(x + s * 1.05)},${f(y + s * 0.2)} ${f(x + s * 0.8)},${f(y + s * 0.6)} Z`, PALETTE.bone!));
      out.push(eye(m, x + s * 0.35, y - s * 0.22, s * 0.1));
      top = y - s * 1.1;
      right = x + s * 1.75;
      break;
    case 'horse':
    case 'deer':
    case 'goat':
    case 'camel': {
      // A long head angled down from the poll to the muzzle.
      const w = kind === 'horse' ? 1 : kind === 'camel' ? 0.85 : 0.82;
      out.push(ear(-0.25, kind === 'deer' ? 0.75 : 0.6, kind === 'deer' ? 0.32 : 0.22));
      out.push(shape.path(`M${f(x - s * 0.55)},${f(y - s * 0.55)} Q${f(x + s * 0.3)},${f(y - s * 0.95)} ${f(x + s * 1.35 * w)},${f(y + s * 0.5)} Q${f(x + s * 1.5 * w)},${f(y + s * 1.05)} ${f(x + s * 1.05 * w)},${f(y + s * 1.12)} L${f(x + s * 0.1)},${f(y + s * 0.62)} Q${f(x - s * 0.65)},${f(y + s * 0.3)} ${f(x - s * 0.55)},${f(y - s * 0.55)} Z`, c));
      out.push(shape.circle(x + s * 1.22 * w, y + s * 0.72, s * 0.09, INK));
      out.push(eye(m, x + s * 0.2, y - s * 0.12, s * 0.11));
      if (kind === 'goat') out.push(shape.path(`M${f(x + s * 0.85)},${f(y + s * 1.0)} L${f(x + s * 0.7)},${f(y + s * 1.6)} L${f(x + s * 0.5)},${f(y + s * 0.85)} Z`, light));
      if (kind === 'camel') out.push(shape.ellipse(x + s * 1.1, y + s * 1.05, s * 0.3, s * 0.15, light));
      top = y - s * 1.2;
      right = x + s * 1.6 * w;
      break;
    }
    case 'ox':
      out.push(shape.path(`M${f(x - s * 0.6)},${f(y - s * 0.6)} L${f(x + s * 0.8)},${f(y - s * 0.55)} Q${f(x + s * 1.3)},${f(y + s * 0.1)} ${f(x + s * 1.15)},${f(y + s * 0.95)} L${f(x + s * 0.3)},${f(y + s * 1.0)} Q${f(x - s * 0.7)},${f(y + s * 0.5)} ${f(x - s * 0.6)},${f(y - s * 0.6)} Z`, c));
      out.push(shape.ellipse(x + s * 0.9, y + s * 0.75, s * 0.38, s * 0.28, light));
      out.push(shape.circle(x + s * 1.05, y + s * 0.7, s * 0.07, INK));
      out.push(shape.poly([[x - s * 0.55, y - s * 0.25], [x - s * 1.05, y - s * 0.45], [x - s * 0.6, y + s * 0.05]], c));
      out.push(eye(m, x + s * 0.4, y - s * 0.1, s * 0.11));
      right = x + s * 1.4;
      break;
    case 'rhino':
      out.push(ear(-0.3, 0.45, 0.2));
      out.push(shape.path(`M${f(x - s * 0.7)},${f(y - s * 0.5)} Q${f(x + s * 0.4)},${f(y - s * 0.6)} ${f(x + s * 1.45)},${f(y + s * 0.35)} Q${f(x + s * 1.5)},${f(y + s * 0.85)} ${f(x + s * 1.1)},${f(y + s * 0.9)} L${f(x - s * 0.5)},${f(y + s * 0.75)} Z`, c));
      out.push(shape.path(`M${f(x + s * 1.0)},${f(y + s * 0.05)} Q${f(x + s * 1.35)},${f(y - s * 0.5)} ${f(x + s * 1.25)},${f(y - s * 1.0)} Q${f(x + s * 1.6)},${f(y - s * 0.3)} ${f(x + s * 1.42)},${f(y + s * 0.3)} Z`, PALETTE.bone!));
      out.push(shape.poly([[x + s * 0.55, y - s * 0.35], [x + s * 0.7, y - s * 0.75], [x + s * 0.85, y - s * 0.25]], PALETTE.bone!));
      out.push(eye(m, x + s * 0.2, y - s * 0.05, s * 0.09));
      top = y - s * 1.05;
      right = x + s * 1.6;
      break;
    case 'elephant':
      out.push(shape.circle(x, y - s * 0.1, s * 0.85, c));
      // The trunk, down to near the ground, and a tusk.
      out.push(shape.path(`M${f(x + s * 0.55)},${f(y - s * 0.1)} Q${f(x + s * 1.25)},${f(y + s * 0.4)} ${f(x + s * 1.05)},${f(y + s * 2.0)} L${f(x + s * 1.3)},${f(y + s * 2.1)} L${f(x + s * 0.75)},${f(y + s * 2.15)} Q${f(x + s * 0.85)},${f(y + s * 0.9)} ${f(x + s * 0.4)},${f(y + s * 0.65)} Z`, c));
      out.push(shape.path(`M${f(x + s * 0.5)},${f(y + s * 0.55)} Q${f(x + s * 1.3)},${f(y + s * 0.9)} ${f(x + s * 1.55)},${f(y + s * 0.4)} Q${f(x + s * 1.3)},${f(y + s * 0.65)} ${f(x + s * 0.6)},${f(y + s * 0.35)} Z`, PALETTE.bone!));
      out.push(shape.path(`M${f(x - s * 0.1)},${f(y - s * 0.75)} Q${f(x - s * 1.05)},${f(y - s * 0.7)} ${f(x - s * 0.95)},${f(y + s * 0.2)} Q${f(x - s * 0.7)},${f(y + s * 0.85)} ${f(x - s * 0.05)},${f(y + s * 0.5)} Z`, dark));
      out.push(eye(m, x + s * 0.4, y - s * 0.25, s * 0.08));
      right = x + s * 1.65;
      break;
    case 'hippo':
      out.push(shape.circle(x - s * 0.35, y - s * 0.72, s * 0.16, c));
      out.push(shape.path(`M${f(x - s * 0.7)},${f(y - s * 0.6)} Q${f(x + s * 0.2)},${f(y - s * 0.8)} ${f(x + s * 0.6)},${f(y - s * 0.4)} Q${f(x + s * 1.4)},${f(y - s * 0.45)} ${f(x + s * 1.45)},${f(y + s * 0.2)} Q${f(x + s * 1.45)},${f(y + s * 0.95)} ${f(x + s * 0.7)},${f(y + s * 0.95)} L${f(x - s * 0.6)},${f(y + s * 0.7)} Z`, c));
      out.push(shape.detail(`M${f(x + s * 0.5)},${f(y + s * 0.45)} L${f(x + s * 1.4)},${f(y + s * 0.4)}`, dark, 1.4));
      out.push(shape.circle(x + s * 1.2, y - s * 0.25, s * 0.07, INK));
      out.push(eye(m, x + s * 0.2, y - s * 0.5, s * 0.09));
      right = x + s * 1.6;
      break;
    case 'lizard':
    case 'crocodile': {
      const len = kind === 'crocodile' ? 2.4 : 1.5;
      out.push(shape.path(`M${f(x - s * 0.6)},${f(y - s * 0.45)} Q${f(x + s * 0.2)},${f(y - s * 0.6)} ${f(x + s * len)},${f(y - s * 0.05)} L${f(x + s * len)},${f(y + s * 0.25)} L${f(x - s * 0.6)},${f(y + s * 0.5)} Z`, c));
      if (kind === 'crocodile') {
        const teeth: Array<[number, number]> = [];
        for (let i = 0; i < 6; i++) teeth.push([x + s * (0.4 + i * 0.32), y + s * 0.1], [x + s * (0.56 + i * 0.32), y + s * 0.3]);
        out.push(shape.detail(`M${teeth.map(([a, b]) => `${f(a)},${f(b)}`).join(' L')}`, PALETTE.bone!, 1.4));
      } else out.push(shape.detail(`M${f(x + s * 0.3)},${f(y + s * 0.15)} L${f(x + s * len - 2)},${f(y + s * 0.08)}`, dark, 1.2));
      out.push(eye(m, x + s * 0.15, y - s * 0.22, s * 0.11));
      top = y - s * 0.7;
      right = x + s * (len + 0.1);
      break;
    }
    case 'rodent':
      out.push(shape.circle(x - s * 0.15, y - s * 0.62, s * 0.38, light));
      out.push(shape.path(`M${f(x - s * 0.7)},${f(y - s * 0.5)} Q${f(x + s * 0.3)},${f(y - s * 0.7)} ${f(x + s * 1.35)},${f(y + s * 0.15)} Q${f(x + s * 0.4)},${f(y + s * 0.7)} ${f(x - s * 0.6)},${f(y + s * 0.5)} Z`, c));
      out.push(shape.circle(x + s * 1.35, y + s * 0.15, s * 0.12, PALETTE['skin-light']!));
      out.push(shape.detail(`M${f(x + s * 1.0)},${f(y + s * 0.2)} l${f(s * 0.6)},${f(-s * 0.2)} M${f(x + s * 1.0)},${f(y + s * 0.26)} l${f(s * 0.6)},${f(s * 0.12)}`, INK, 0.7));
      out.push(eye(m, x + s * 0.35, y - s * 0.12, s * 0.11));
      top = y - s * 1.05;
      right = x + s * 1.7;
      break;
    case 'badger':
      out.push(shape.path(`M${f(x - s * 0.7)},${f(y - s * 0.5)} Q${f(x + s * 0.3)},${f(y - s * 0.65)} ${f(x + s * 1.4)},${f(y + s * 0.2)} Q${f(x + s * 0.5)},${f(y + s * 0.7)} ${f(x - s * 0.6)},${f(y + s * 0.55)} Z`, c));
      out.push(`<path d="M${f(x - s * 0.6)},${f(y - s * 0.32)} Q${f(x + s * 0.3)},${f(y - s * 0.45)} ${f(x + s * 1.3)},${f(y + s * 0.15)} Q${f(x + s * 0.3)},${f(y - s * 0.15)} ${f(x - s * 0.6)},${f(y - s * 0.08)} Z" fill="${PALETTE.white}" stroke="none"/>`);
      out.push(shape.circle(x + s * 1.38, y + s * 0.2, s * 0.12, INK));
      out.push(eye(m, x + s * 0.35, y + s * 0.02, s * 0.1));
      right = x + s * 1.6;
      break;
    case 'eagle':
      out.push(shape.circle(x, y, s * 0.8, c));
      out.push(shape.path(`M${f(x + s * 0.5)},${f(y - s * 0.35)} Q${f(x + s * 1.5)},${f(y - s * 0.4)} ${f(x + s * 1.45)},${f(y + s * 0.4)} Q${f(x + s * 1.25)},${f(y + s * 0.1)} ${f(x + s * 0.55)},${f(y + s * 0.3)} Z`, PALETTE.gold!));
      out.push(shape.path(`M${f(x - s * 0.7)},${f(y + s * 0.2)} L${f(x - s * 1.1)},${f(y + s * 0.55)} L${f(x - s * 0.55)},${f(y + s * 0.55)} Z`, c));
      out.push(eye(m, x + s * 0.3, y - s * 0.15, s * 0.12));
      right = x + s * 1.55;
      break;
    case 'owl':
      out.push(shape.poly([[x - s * 0.55, y - s * 0.6], [x - s * 0.45, y - s * 1.25], [x - s * 0.1, y - s * 0.7]], c));
      out.push(shape.circle(x, y, s * 0.9, c));
      out.push(shape.ellipse(x + s * 0.35, y + s * 0.05, s * 0.55, s * 0.65, light));
      out.push(shape.path(`M${f(x + s * 0.7)},${f(y + s * 0.0)} Q${f(x + s * 1.15)},${f(y + s * 0.15)} ${f(x + s * 0.8)},${f(y + s * 0.55)} Z`, PALETTE.gold!));
      out.push(eye(m, x + s * 0.45, y - s * 0.15, s * 0.16));
      top = y - s * 1.3;
      right = x + s * 1.2;
      break;
    case 'human': {
      // A face looking out of the card, like a sphinx's or a manticore's, framed by its mane.
      const skin = m.skin;
      if (m.hair.style !== 'none') out.push(shape.circle(x, y + s * 0.1, s * 1.3, m.hair.colour));
      out.push(shape.circle(x, y, s * 0.82, skin));
      out.push(eye(m, x - s * 0.28, y - s * 0.05, s * 0.1));
      out.push(eye(m, x + s * 0.28, y - s * 0.05, s * 0.1));
      if (m.beard !== 'none') out.push(shape.path(`M${f(x - s * 0.7)},${f(y + s * 0.15)} Q${f(x)},${f(y + s * 1.6)} ${f(x + s * 0.7)},${f(y + s * 0.15)} Q${f(x)},${f(y + s * 0.65)} ${f(x - s * 0.7)},${f(y + s * 0.15)} Z`, m.hair.colour));
      top = y - s * (m.hair.style !== 'none' ? 1.25 : 0.9);
      right = x + s * 1.35;
      break;
    }
    case 'triceratops':
      out.push(shape.path(`M${f(x - s * 0.4)},${f(y + s * 0.4)} Q${f(x - s * 1.3)},${f(y - s * 0.5)} ${f(x - s * 0.3)},${f(y - s * 1.45)} Q${f(x + s * 0.3)},${f(y - s * 1.0)} ${f(x + s * 0.35)},${f(y - s * 0.3)} Z`, light));
      out.push(shape.path(`M${f(x - s * 0.4)},${f(y - s * 0.3)} Q${f(x + s * 0.6)},${f(y - s * 0.5)} ${f(x + s * 1.4)},${f(y + s * 0.35)} L${f(x + s * 1.2)},${f(y + s * 0.85)} L${f(x - s * 0.2)},${f(y + s * 0.75)} Z`, c));
      out.push(shape.poly([[x + s * 0.2, y - s * 0.38], [x + s * 1.2, y - s * 1.15], [x + s * 0.5, y - s * 0.2]], PALETTE.bone!));
      out.push(shape.poly([[x + s * 1.05, y + s * 0.1], [x + s * 1.35, y - s * 0.35], [x + s * 1.3, y + s * 0.2]], PALETTE.bone!));
      out.push(eye(m, x + s * 0.3, y - s * 0.05, s * 0.1));
      top = y - s * 1.5;
      right = x + s * 1.5;
      break;
    case 'ankylosaurus':
    case 'raptor': {
      const big = kind === 'raptor';
      out.push(shape.path(`M${f(x - s * 0.7)},${f(y - s * 0.5)} Q${f(x + s * 0.4)},${f(y - s * 0.75)} ${f(x + s * (big ? 1.7 : 1.1))},${f(y - s * 0.1)} L${f(x + s * (big ? 1.65 : 1.1))},${f(y + s * 0.2)} L${f(x - s * 0.5)},${f(y + s * 0.3)} Z`, c));
      if (big) {
        out.push(shape.path(`M${f(x - s * 0.4)},${f(y + s * 0.35)} L${f(x + s * 1.45)},${f(y + s * 0.4)} Q${f(x + s * 0.8)},${f(y + s * 0.95)} ${f(x - s * 0.3)},${f(y + s * 0.75)} Z`, c));
        const teeth: string[] = [];
        for (let i = 0; i < 5; i++) teeth.push(`M${f(x + s * (0.2 + i * 0.28))},${f(y + s * 0.25)} l${f(s * 0.06)},${f(s * 0.16)}`);
        out.push(shape.detail(teeth.join(' '), PALETTE.bone!, 1.6));
      }
      out.push(eye(m, x + s * 0.25, y - s * 0.28, s * 0.11));
      top = y - s * 0.9;
      right = x + s * (big ? 1.8 : 1.25);
      break;
    }
  }
  return { art: out.join(''), top, right };
}

/** Horns on a side-on head: a unicorn's, a goat's or a bull's, or antlers. */
export function sideHorns(m: Mini, x: number, y: number, s: number): { art: string; top: number } {
  const c = m.features.hornColour;
  switch (m.features.horns) {
    case 'straight':
      return { art: shape.poly([[x + s * 0.1, y - s * 0.55], [x + s * 0.75, y - s * 2.1], [x + s * 0.45, y - s * 0.45]], m.features.hornColour === PALETTE.bone ? PALETTE.gold! : c), top: y - s * 2.1 };
    case 'curved':
    case 'ram':
      return { art: shape.path(`M${f(x - s * 0.1)},${f(y - s * 0.6)} Q${f(x - s * 0.5)},${f(y - s * 1.6)} ${f(x - s * 1.3)},${f(y - s * 1.0)} Q${f(x - s * 1.0)},${f(y - s * 0.4)} ${f(x - s * 0.7)},${f(y - s * 0.2)} Q${f(x - s * 0.8)},${f(y - s * 1.0)} ${f(x - s * 0.4)},${f(y - s * 0.45)} Z`, c), top: y - s * 1.45 };
    case 'swept':
      return { art: shape.path(`M${f(x - s * 0.2)},${f(y - s * 0.55)} Q${f(x + s * 0.4)},${f(y - s * 1.3)} ${f(x + s * 1.1)},${f(y - s * 1.35)} Q${f(x + s * 0.6)},${f(y - s * 0.9)} ${f(x + s * 0.35)},${f(y - s * 0.45)} Z`, c), top: y - s * 1.4 };
    case 'antlers': {
      const d = `M${f(x - s * 0.1)},${f(y - s * 0.6)} L${f(x - s * 0.35)},${f(y - s * 1.6)} L${f(x - s * 0.9)},${f(y - s * 2.4)} M${f(x - s * 0.25)},${f(y - s * 1.2)} L${f(x + s * 0.4)},${f(y - s * 1.8)} M${f(x - s * 0.5)},${f(y - s * 1.85)} L${f(x - s * 0.1)},${f(y - s * 2.5)} M${f(x - s * 0.7)},${f(y - s * 2.15)} L${f(x - s * 1.3)},${f(y - s * 2.1)}`;
      return { art: strand(d, c, 2.6), top: y - s * 2.6 };
    }
    default:
      return { art: '', top: y };
  }
}

/** A flying creature's post: a strip of the card down to the stand, so the cut-out stays one piece. */
export function flightPost(x: number, from: number, to = 200): string {
  return `<rect x="${f(x - 2.5)}" y="${f(from)}" width="5" height="${f(to - from)}" fill="#fbf6ea" stroke="none"/>`;
}

/** Water at the foot of the card for a swimmer to rise out of. */
export function waves(left: number, right: number, colour = '#3d7ea6'): string {
  const y = 200 - 12;
  let d = `M${f(left)},200 L${f(left)},${f(y)}`;
  for (let x = left; x < right; x += 16) d += ` q4,-7 8,0 q4,7 8,0`;
  d += ` L${f(right)},200 Z`;
  return shape.path(d, colour) + shape.detail(`M${f(left + 6)},${f(y + 6)} l10,0 M${f(left + 30)},${f(y + 7)} l14,0 M${f(right - 30)},${f(y + 6)} l12,0`, '#a6dcff', 1.6);
}
