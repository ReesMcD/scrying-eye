import type { Mini } from '../spec.js';
import type { Bones } from './humanoid.js';
import { CX, f, FEET, INK, PALETTE, shade, shape } from './draw.js';
import { eye, flames, strand } from './parts.js';

/**
 * What makes a humanoid a monster: an animal's head (a minotaur's bull, a gnoll's hyena), a lower
 * body that isn't legs (a naga's tail, a centaur's horse, a drider's spider, a ghost's wisp),
 * extra arms, snakes for hair, a crown of fire. Faces look out of the card, like the rest.
 */

/** An animal's head in place of the figure's own, face on. Null for its own head. */
export function animalHead(m: Mini, b: Bones): string | null {
  if (m.head === 'own') return null;
  const { x, y, r } = b.head;
  const c = m.skin;
  const light = shade(c, 0.35);
  const dark = shade(c, -0.3);
  const out: string[] = [];
  const eyes = (dy = -0.15, dx = 0.38, size = 0.12) => eye(m, x - r * dx, y + r * dy, r * size) + eye(m, x + r * dx, y + r * dy, r * size);
  const ears = (dx: number, dy: number, h: number, w: number, colour = c) => [-1, 1].map((s) => shape.poly([[x + s * r * (dx - w), y - r * dy], [x + s * r * dx, y - r * (dy + h)], [x + s * r * (dx + w), y - r * (dy - 0.15)]], colour)).join('');
  const muzzle = (len: number, wide: number, colour = light) => shape.path(`M${f(x - r * wide)},${f(y + r * 0.05)} Q${f(x - r * wide)},${f(y + r * len)} ${f(x)},${f(y + r * (len + 0.1))} Q${f(x + r * wide)},${f(y + r * len)} ${f(x + r * wide)},${f(y + r * 0.05)} Z`, colour);
  switch (m.head) {
    case 'bull': {
      const horn = m.features.hornColour;
      for (const s of [-1, 1]) out.push(shape.path(`M${f(x + s * r * 0.6)},${f(y - r * 0.55)} Q${f(x + s * r * 1.9)},${f(y - r * 0.7)} ${f(x + s * r * 1.85)},${f(y - r * 1.75)} Q${f(x + s * r * 1.45)},${f(y - r * 1.0)} ${f(x + s * r * 0.55)},${f(y - r * 0.15)} Z`, horn));
      out.push(ears(1.05, 0.2, 0.15, 0.25));
      out.push(shape.ellipse(x, y, r * 1.0, r * 1.05, c));
      out.push(shape.ellipse(x, y + r * 0.62, r * 0.62, r * 0.42, light));
      out.push(shape.circle(x - r * 0.22, y + r * 0.62, r * 0.09, INK) + shape.circle(x + r * 0.22, y + r * 0.62, r * 0.09, INK));
      out.push(eyes(-0.2, 0.42));
      break;
    }
    case 'hyena':
    case 'wolf':
    case 'dog':
    case 'jackal': {
      const tall = m.head === 'jackal' ? 1.0 : m.head === 'wolf' ? 0.75 : 0.5;
      if (m.head === 'dog') out.push([-1, 1].map((s) => shape.ellipse(x + s * r * 0.9, y + r * 0.1, r * 0.3, r * 0.6, dark)).join(''));
      else if (m.head === 'hyena') out.push([-1, 1].map((s) => shape.circle(x + s * r * 0.72, y - r * 0.78, r * 0.32, c)).join(''));
      else out.push(ears(0.6, 0.55, tall, 0.25));
      out.push(shape.circle(x, y, r, c));
      if (m.head === 'hyena' || m.features.markings === 'spots') out.push([[-0.5, -0.4], [0.45, -0.5], [0.6, 0.1], [-0.65, 0.15]].map(([dx, dy]) => `<circle cx="${f(x + r * dx!)}" cy="${f(y + r * dy!)}" r="${f(r * 0.12)}" fill="${dark}" stroke="none"/>`).join(''));
      out.push(muzzle(1.15, 0.42));
      out.push(shape.ellipse(x, y + r * 1.0, r * 0.18, r * 0.12, INK));
      out.push(eyes(-0.2, 0.4));
      break;
    }
    case 'rat':
      out.push([-1, 1].map((s) => shape.circle(x + s * r * 0.85, y - r * 0.7, r * 0.45, shade(c, 0.15))).join(''));
      out.push(shape.circle(x, y, r * 0.95, c));
      out.push(shape.path(`M${f(x - r * 0.45)},${f(y + r * 0.1)} L${f(x)},${f(y + r * 1.25)} L${f(x + r * 0.45)},${f(y + r * 0.1)} Z`, c));
      out.push(shape.circle(x, y + r * 1.2, r * 0.13, PALETTE['skin-light']!));
      out.push(shape.detail(`M${f(x - r * 0.15)},${f(y + r * 0.95)} l${f(-r * 0.8)},${f(-r * 0.1)} M${f(x + r * 0.15)},${f(y + r * 0.95)} l${f(r * 0.8)},${f(-r * 0.1)}`, INK, 0.8));
      out.push(eyes(-0.15, 0.36));
      break;
    case 'tiger':
    case 'lion':
      if (m.head === 'lion') out.push(shape.circle(x, y + r * 0.1, r * 1.6, m.hair.style === 'none' ? dark : m.hair.colour));
      out.push([-1, 1].map((s) => shape.circle(x + s * r * 0.75, y - r * 0.75, r * 0.3, c)).join(''));
      out.push(shape.circle(x, y, r, c));
      if (m.head === 'tiger') out.push(`<path d="M${f(x)},${f(y - r * 0.95)} l0,${f(r * 0.4)} M${f(x - r * 0.3)},${f(y - r * 0.9)} l${f(r * 0.05)},${f(r * 0.3)} M${f(x + r * 0.3)},${f(y - r * 0.9)} l${f(-r * 0.05)},${f(r * 0.3)} M${f(x - r * 0.98)},${f(y)} l${f(r * 0.35)},0 M${f(x + r * 0.98)},${f(y)} l${f(-r * 0.35)},0" fill="none" stroke="${INK}" stroke-width="2"/>`);
      out.push(shape.circle(x - r * 0.22, y + r * 0.45, r * 0.3, light) + shape.circle(x + r * 0.22, y + r * 0.45, r * 0.3, light));
      out.push(shape.poly([[x - r * 0.15, y + r * 0.18], [x + r * 0.15, y + r * 0.18], [x, y + r * 0.35]], INK));
      out.push(eyes(-0.15, 0.38));
      break;
    case 'boar':
      out.push(ears(0.75, 0.6, 0.45, 0.2));
      out.push(shape.circle(x, y, r, c));
      out.push(shape.ellipse(x, y + r * 0.5, r * 0.42, r * 0.32, light));
      out.push(shape.circle(x - r * 0.14, y + r * 0.5, r * 0.08, INK) + shape.circle(x + r * 0.14, y + r * 0.5, r * 0.08, INK));
      for (const s of [-1, 1]) out.push(`<path d="M${f(x + s * r * 0.4)},${f(y + r * 0.8)} Q${f(x + s * r * 0.75)},${f(y + r * 0.6)} ${f(x + s * r * 0.7)},${f(y + r * 0.15)} Q${f(x + s * r * 0.6)},${f(y + r * 0.55)} ${f(x + s * r * 0.3)},${f(y + r * 0.7)} Z" fill="${PALETTE.bone}" stroke="${INK}" stroke-width="1.1"/>`);
      out.push(eyes(-0.25, 0.4));
      break;
    case 'bear':
      out.push([-1, 1].map((s) => shape.circle(x + s * r * 0.78, y - r * 0.72, r * 0.32, c)).join(''));
      out.push(shape.circle(x, y, r * 1.02, c));
      out.push(muzzle(0.8, 0.45));
      out.push(shape.ellipse(x, y + r * 0.45, r * 0.18, r * 0.12, INK));
      out.push(eyes(-0.2, 0.4));
      break;
    case 'ape':
      out.push([-1, 1].map((s) => shape.circle(x + s * r * 0.95, y, r * 0.25, light)).join(''));
      out.push(shape.circle(x, y, r, c));
      out.push(shape.ellipse(x, y + r * 0.4, r * 0.62, r * 0.45, light));
      out.push(shape.detail(`M${f(x - r * 0.65)},${f(y - r * 0.3)} Q${f(x)},${f(y - r * 0.55)} ${f(x + r * 0.65)},${f(y - r * 0.3)}`, dark, 2.4));
      out.push(shape.detail(`M${f(x - r * 0.25)},${f(y + r * 0.6)} Q${f(x)},${f(y + r * 0.7)} ${f(x + r * 0.25)},${f(y + r * 0.6)}`, INK, 1.2));
      out.push(eyes(-0.1, 0.32));
      break;
    case 'owl':
      out.push(ears(0.7, 0.75, 0.55, 0.18));
      out.push(shape.circle(x, y, r * 1.08, c));
      out.push(shape.circle(x - r * 0.42, y - r * 0.05, r * 0.45, light) + shape.circle(x + r * 0.42, y - r * 0.05, r * 0.45, light));
      out.push(shape.poly([[x - r * 0.16, y + r * 0.2], [x + r * 0.16, y + r * 0.2], [x, y + r * 0.6]], PALETTE.gold!));
      out.push(eyes(-0.05, 0.42, 0.16));
      break;
    case 'vulture':
    case 'eagle': {
      const bald = m.head === 'vulture';
      if (bald) out.push(shape.ellipse(x, y + r * 1.0, r * 1.2, r * 0.45, light));
      out.push(shape.circle(x, y, r * (bald ? 0.85 : 1), bald ? PALETTE['skin-light']! : m.head === 'eagle' ? PALETTE.white! : c));
      out.push(shape.path(`M${f(x - r * 0.3)},${f(y + r * 0.1)} L${f(x + r * 0.3)},${f(y + r * 0.1)} Q${f(x + r * 0.25)},${f(y + r * 0.85)} ${f(x)},${f(y + r * 0.95)} Q${f(x - r * 0.05)},${f(y + r * 0.6)} ${f(x - r * 0.3)},${f(y + r * 0.1)} Z`, PALETTE.gold!));
      out.push(eyes(-0.2, 0.4));
      break;
    }
    case 'frog':
      out.push([-1, 1].map((s) => shape.circle(x + s * r * 0.55, y - r * 0.6, r * 0.38, c)).join(''));
      out.push(shape.ellipse(x, y + r * 0.1, r * 1.15, r * 0.85, c));
      out.push(shape.detail(`M${f(x - r * 0.85)},${f(y + r * 0.35)} Q${f(x)},${f(y + r * 0.75)} ${f(x + r * 0.85)},${f(y + r * 0.35)}`, INK, 1.8));
      out.push(eye(m, x - r * 0.55, y - r * 0.62, r * 0.16) + eye(m, x + r * 0.55, y - r * 0.62, r * 0.16));
      break;
    case 'fish':
      out.push(shape.poly([[x - r * 0.4, y - r * 0.8], [x, y - r * 1.6], [x + r * 0.4, y - r * 0.8]], dark));
      out.push([-1, 1].map((s) => shape.poly([[x + s * r * 0.85, y - r * 0.2], [x + s * r * 1.5, y - r * 0.4], [x + s * r * 0.95, y + r * 0.4]], dark)).join(''));
      out.push(shape.ellipse(x, y, r * 1.0, r * 1.05, c));
      out.push(shape.ellipse(x, y + r * 0.55, r * 0.6, r * 0.22, '#3a1418'));
      out.push(shape.detail(`M${f(x - r * 0.5)},${f(y + r * 0.5)} l${f(r * 0.1)},${f(r * 0.12)} l${f(r * 0.1)},${f(-r * 0.12)} l${f(r * 0.1)},${f(r * 0.12)} l${f(r * 0.1)},${f(-r * 0.12)} l${f(r * 0.1)},${f(r * 0.12)} l${f(r * 0.1)},${f(-r * 0.12)} l${f(r * 0.1)},${f(r * 0.12)} l${f(r * 0.1)},${f(-r * 0.12)}`, PALETTE.bone!, 1.2));
      out.push(eyes(-0.2, 0.55, 0.17));
      break;
    case 'skull':
      out.push(shape.circle(x, y, r, PALETTE['skin-bone']!));
      out.push(shape.circle(x - r * 0.38, y - r * 0.05, r * 0.28, m.features.glow ? m.features.eyes : INK) + shape.circle(x + r * 0.38, y - r * 0.05, r * 0.28, m.features.glow ? m.features.eyes : INK));
      out.push(shape.poly([[x, y + r * 0.2], [x - r * 0.12, y + r * 0.42], [x + r * 0.12, y + r * 0.42]], INK));
      out.push(shape.detail(`M${f(x - r * 0.45)},${f(y + r * 0.62)} L${f(x + r * 0.45)},${f(y + r * 0.62)}`, INK, 1.2));
      break;
    case 'eyeless':
      out.push(shape.circle(x, y, r, c));
      out.push(shape.detail(`M${f(x - r * 0.55)},${f(y - r * 0.1)} q${f(r * 0.2)},${f(r * 0.1)} ${f(r * 0.35)},0 M${f(x + r * 0.2)},${f(y - r * 0.1)} q${f(r * 0.2)},${f(r * 0.1)} ${f(r * 0.35)},0`, dark, 1.6));
      out.push(shape.ellipse(x, y + r * 0.5, r * 0.45, r * 0.2, '#3a1418'));
      out.push(shape.detail(`M${f(x - r * 0.35)},${f(y + r * 0.45)} l${f(r * 0.7)},0`, PALETTE.bone!, 1.4));
      break;
    default:
      return null;
  }
  return out.join('');
}

/** How far above the head an animal head reaches (a bull's horns, a jackal's ears, a lion's mane). */
export function aboveAnimal(m: Mini, r: number): number {
  return { own: 0, human: 0, bull: r * 0.85, jackal: r * 0.65, wolf: r * 0.4, lion: r * 0.65, rat: r * 0.25, owl: r * 0.4, fish: r * 0.65, hyena: r * 0.15, frog: 0, dog: 0, tiger: 0, boar: r * 0.15, bear: 0, ape: 0, vulture: 0, eagle: 0, skull: 0, eyeless: 0 }[m.head];
}

/** A lower body in place of legs, drawn behind the torso. Null for legs. */
export function lowerBody(m: Mini, b: Bones): { art: string; left: number; right: number } | null {
  const c = m.coat;
  const dark = shade(c, -0.3);
  const { hip, sw } = b;
  switch (m.lower) {
    case 'snake': {
      // A thick tail from the hips down to a coil on the ground.
      const art =
        shape.path(`M${f(CX - sw * 0.9)},${f(hip - 8)} Q${f(CX - sw * 1.1)},${f(FEET - 20)} ${f(CX + 10)},${f(FEET - 14)} Q${f(CX + sw + 30)},${f(FEET - 10)} ${f(CX + sw + 34)},${f(FEET - 24)} Q${f(CX + sw + 38)},${f(FEET - 36)} ${f(CX + sw + 26)},${f(FEET - 34)} Q${f(CX + sw + 30)},${f(FEET)} ${f(CX - 10)},${f(FEET)} Q${f(CX - sw * 1.6)},${f(FEET)} ${f(CX - sw * 1.4)},${f(FEET - 30)} Q${f(CX - sw * 1.2)},${f(hip + 10)} ${f(CX - sw * 0.9)},${f(hip - 8)} Z`, c) +
        shape.path(`M${f(CX - sw * 0.9)},${f(hip - 8)} L${f(CX + sw * 0.9)},${f(hip - 8)} Q${f(CX + sw * 0.8)},${f(FEET - 30)} ${f(CX + 6)},${f(FEET - 16)} Q${f(CX - sw * 1.0)},${f(FEET - 24)} ${f(CX - sw * 0.9)},${f(hip - 8)} Z`, c) +
        `<path d="M${f(CX - sw * 0.3)},${f(hip)} Q${f(CX - sw * 0.2)},${f(FEET - 30)} ${f(CX + 8)},${f(FEET - 20)}" fill="none" stroke="${shade(c, 0.35)}" stroke-width="5"/>`;
      return { art, left: CX - sw * 1.6, right: CX + sw + 40 };
    }
    case 'fish': {
      const art =
        shape.path(`M${f(CX - sw * 0.9)},${f(hip - 8)} L${f(CX + sw * 0.9)},${f(hip - 8)} Q${f(CX + sw * 0.6)},${f(FEET - 40)} ${f(CX + 14)},${f(FEET - 20)} L${f(CX + 6)},${f(FEET - 16)} Q${f(CX - sw * 0.9)},${f(FEET - 50)} ${f(CX - sw * 0.9)},${f(hip - 8)} Z`, c) +
        shape.path(`M${f(CX + 10)},${f(FEET - 18)} Q${f(CX + 34)},${f(FEET - 30)} ${f(CX + 42)},${f(FEET - 8)} Q${f(CX + 26)},${f(FEET - 10)} ${f(CX + 12)},${f(FEET)} Q${f(CX)},${f(FEET - 10)} ${f(CX - 18)},${f(FEET - 6)} Q${f(CX - 10)},${f(FEET - 28)} ${f(CX + 10)},${f(FEET - 18)} Z`, dark) +
        shape.detail(`M${f(CX - sw * 0.5)},${f(hip + 10)} q${f(sw * 0.5)},6 ${f(sw)},0 M${f(CX - sw * 0.5)},${f(hip + 24)} q${f(sw * 0.5)},6 ${f(sw)},0`, dark, 1.4);
      return { art, left: CX - 22, right: CX + 46 };
    }
    case 'wisp': {
      // No legs: the body thins to a wisp that touches the stand.
      const art = `<path d="M${f(CX - sw * 1.05)},${f(hip - 8)} Q${f(CX - sw * 0.9)},${f(FEET - 40)} ${f(CX - 4)},${f(FEET - 20)} Q${f(CX + 10)},${f(FEET - 8)} ${f(CX - 2)},${f(FEET)} Q${f(CX + 24)},${f(FEET - 14)} ${f(CX + 10)},${f(FEET - 34)} Q${f(CX + sw * 1.1)},${f(FEET - 60)} ${f(CX + sw * 1.05)},${f(hip - 8)} Z" fill="${m.outfit.kind === 'bare' ? m.skin : m.outfit.colour}" fill-opacity="0.85"/>`;
      return { art, left: CX - sw * 1.1, right: CX + sw * 1.1 };
    }
    case 'horse':
    case 'lion': {
      // A four-legged body behind: the torso stands at its front.
      const horse = m.lower === 'horse';
      const by = hip + 14;
      const bx = CX - 26;
      const legs: string[] = [];
      for (const [x, far] of [[bx - 26, true], [bx + 24, true], [bx - 32, false], [bx + 18, false]] as const) legs.push(shape.rect(x, by + 4, horse ? 8 : 10, FEET - by - 4 - (horse ? 5 : 0), far ? dark : c, 3) + (horse ? shape.rect(x - 0.5, FEET - 6, 9, 6, '#2b2522', 1) : ''));
      const tail = horse ? shape.path(`M${f(bx - 44)},${f(by - 8)} Q${f(bx - 62)},${f(by)} ${f(bx - 58)},${f(by + 44)} Q${f(bx - 50)},${f(by + 20)} ${f(bx - 42)},${f(by + 4)} Z`, m.hair.style === 'none' ? dark : m.hair.colour) : strand(`M${f(bx - 44)},${f(by - 4)} Q${f(bx - 64)},${f(by - 6)} ${f(bx - 62)},${f(by + 26)}`, c, 3) + shape.ellipse(bx - 62, by + 30, 4, 6, dark);
      return { art: tail + legs.slice(0, 2).join('') + shape.ellipse(bx, by, 48, 20, c) + legs.slice(2).join(''), left: bx - 66, right: CX + sw + 6 };
    }
    case 'spider': {
      // A drider: a spider's body behind, eight legs round it.
      const by = hip + 10;
      const out: string[] = [];
      for (let i = 0; i < 4; i++) for (const s of [-1, 1]) out.push(strand(`M${f(CX + s * 8)},${f(by)} L${f(CX + s * (30 + i * 12))},${f(by - 26 + i * 6)} L${f(CX + s * (40 + i * 14))},${f(FEET)}`, i % 2 ? dark : c, 2.6));
      out.push(shape.ellipse(CX - 20, by + 4, 32, 24, c));
      out.push(shape.ellipse(CX + 4, by + 8, 18, 14, dark));
      return { art: out.join(''), left: CX - 98, right: CX + 98 };
    }
    default:
      return null;
  }
}

/** Legs that aren't a person's: a satyr's goat legs, a harpy's talons. Null for ordinary legs. */
export function oddLegs(m: Mini, b: Bones): string | null {
  if (m.lower !== 'goat' && m.lower !== 'talons') return null;
  const { hip, sw } = b;
  const out: string[] = [];
  for (const s of [-1, 1]) {
    const x = CX + s * sw * 0.35;
    if (m.lower === 'goat') {
      const fur = m.hair.style === 'none' ? shade(m.skin, -0.3) : m.hair.colour;
      out.push(shape.path(`M${f(x - 7)},${f(hip - 4)} L${f(x + 7)},${f(hip - 4)} L${f(x + 9)},${f(hip + (FEET - hip) * 0.45)} L${f(x - 2)},${f(FEET - 10)} L${f(x - 8)},${f(FEET - 12)} L${f(x - 4)},${f(hip + (FEET - hip) * 0.5)} Z`, fur));
      out.push(shape.rect(x - 9, FEET - 9, 9, 9, '#2b2522', 1));
    } else {
      out.push(shape.ellipse(x, hip + 6, 9, 12, m.coat));
      out.push(strand(`M${f(x)},${f(hip + 14)} L${f(x)},${f(FEET - 6)}`, PALETTE.ochre!, 3));
      out.push(shape.poly([[x - 7, FEET], [x + 8, FEET], [x, FEET - 7]], PALETTE.ochre!));
    }
  }
  return out.join('');
}

/** Extra arms below the first pair (a marilith's six, a glabrezu's four), each holding a blade. */
export function extraArms(m: Mini, b: Bones, colour: string): string {
  if (m.arms === 2) return '';
  const out: string[] = [];
  const pairs = m.arms === 6 ? 2 : 1;
  for (let i = 1; i <= pairs; i++) {
    for (const s of [-1, 1]) {
      const sx = CX + s * (b.sw - b.armW * 0.5);
      const sy = b.sy + i * 9;
      const angle = s * (0.75 + i * 0.35);
      const len = b.armLen * 0.85;
      const hx = sx + Math.sin(angle) * len;
      const hy = sy + Math.cos(angle) * len * 0.55 - i * 4;
      out.push(strand(`M${f(sx)},${f(sy)} L${f(hx)},${f(hy)}`, colour, b.armW * 0.75));
      if (m.weapon !== 'none') out.push(shape.rect(hx - 2, hy - 30, 4, 28, PALETTE.silver!, 1) + shape.rect(hx - 6, hy - 4, 12, 3, PALETTE.bronze!, 1));
      out.push(shape.circle(hx, hy, b.armW * 0.5, m.skin));
    }
  }
  return out.join('');
}

/** Snakes for hair (a medusa's). */
export function snakeHair(m: Mini, b: Bones): string {
  const { x, y, r } = b.head;
  const c = m.hair.colour;
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.95 + (i / 6) * 1.1);
    const sx = x + Math.cos(a) * r * 0.85;
    const sy = y + Math.sin(a) * r * 0.85;
    const ex = x + Math.cos(a) * r * 1.6;
    const ey = y + Math.sin(a) * r * 1.6;
    out.push(strand(`M${f(sx)},${f(sy)} Q${f((sx + ex) / 2 + 3)},${f((sy + ey) / 2 - 3)} ${f(ex)},${f(ey)}`, c, 2.6));
    out.push(shape.circle(ex, ey, 2.6, c));
  }
  return out.join('');
}

/** A crown of fire for hair (an azer, an efreeti). */
export function fireHair(m: Mini, b: Bones): string {
  if (!m.features.flames) return '';
  const { x, y, r } = b.head;
  return flames([[x - r * 0.6, y - r * 0.6], [x - r * 0.2, y - r * 0.85], [x + r * 0.2, y - r * 0.85], [x + r * 0.6, y - r * 0.6]], r * 1.4);
}
