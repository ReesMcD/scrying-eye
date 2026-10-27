import type { Mini } from '../spec.js';
import type { Drawn } from './index.js';
import { f, FEET, INK, PALETTE, shade, shape } from './draw.js';
import { eye, flightPost, strand } from './parts.js';

/**
 * Spiders, scorpions, crabs and insects, side on and facing right (a crab face on). Thin legs are
 * outlined strands, so they read at a glance without filling the card.
 */
export function arthropod(m: Mini): Drawn {
  switch (m.body) {
    case 'scorpion':
      return scorpion(m);
    case 'crab':
      return crab(m);
    case 'centipede':
      return centipede(m);
    case 'wasp':
    case 'fly':
      return flier(m);
    case 'beetle':
    case 'ankheg':
      return beetle(m);
    default:
      return spider(m);
  }
}

/** A jointed leg from the body up to a knee and down to the ground. */
function legTo(x: number, y: number, knee: [number, number], foot: number, colour: string, w = 2.6): string {
  return strand(`M${f(x)},${f(y)} L${f(knee[0])},${f(knee[1])} L${f(foot)},${f(FEET)}`, colour, w);
}

function spider(m: Mini): Drawn {
  const c = m.coat;
  const dark = shade(c, -0.3);
  const cy = FEET - 40;
  const out: string[] = [];
  // Far legs, then the abdomen and head, then near legs.
  for (let i = 0; i < 4; i++) out.push(legTo(66 + i * 3, cy, [44 + i * 22, cy - 30 + i * 4], 24 + i * 30, dark, 2.2));
  out.push(shape.ellipse(42, cy - 6, 30, 24, c));
  out.push(markOn(m, 42, cy - 6, 30, 24));
  out.push(shape.ellipse(80, cy + 2, 16, 13, c));
  for (let i = 0; i < 4; i++) out.push(legTo(76 + i * 3, cy + 4, [56 + i * 24, cy - 24 + i * 6], 36 + i * 28, c, 3));
  out.push(shape.poly([[92, cy + 8], [100, cy + 16], [92, cy + 14]], PALETTE.bone!));
  out.push(eye(m, 90, cy - 2, 1.6) + eye(m, 86, cy - 6, 1.3) + eye(m, 92, cy - 7, 1.1));
  return { art: out.join(''), top: cy - 36, left: 8, right: 124 };
}

function scorpion(m: Mini): Drawn {
  const c = m.coat;
  const dark = shade(c, -0.3);
  const cy = FEET - 18;
  const out: string[] = [];
  for (let i = 0; i < 4; i++) out.push(legTo(40 + i * 10, cy, [34 + i * 12, cy - 12], 28 + i * 12, dark, 2));
  // The tail arching up over the back to the stinger.
  out.push(strand(`M${f(30)},${f(cy - 4)} Q${f(4)},${f(cy - 30)} ${f(20)},${f(cy - 62)} Q${f(36)},${f(cy - 80)} ${f(56)},${f(cy - 66)}`, c, 8));
  out.push(shape.poly([[54, cy - 70], [70, cy - 60], [54, cy - 60]], PALETTE.bone!));
  out.push(shape.ellipse(52, cy - 4, 26, 11, c));
  for (let i = 0; i < 4; i++) out.push(shape.detail(`M${f(36 + i * 9)},${f(cy - 14)} l0,${f(18)}`, dark, 1.4));
  // Claws forward.
  out.push(strand(`M${f(74)},${f(cy - 4)} L${f(90)},${f(cy - 18)}`, c, 4));
  out.push(shape.path(`M${f(88)},${f(cy - 24)} Q${f(110)},${f(cy - 30)} ${f(114)},${f(cy - 18)} L${f(100)},${f(cy - 16)} L${f(112)},${f(cy - 10)} Q${f(96)},${f(cy - 6)} ${f(88)},${f(cy - 14)} Z`, c));
  out.push(eye(m, 74, cy - 10, 1.4));
  return { art: out.join(''), top: cy - 84, left: 4, right: 120 };
}

function crab(m: Mini): Drawn {
  const c = m.coat;
  const dark = shade(c, -0.3);
  const cy = FEET - 30;
  const out: string[] = [];
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) out.push(legTo(60 + s * 18, cy + 4, [60 + s * (34 + i * 8), cy - 4 + i * 4], 60 + s * (40 + i * 10), dark, 2.4));
  // Claws raised on both sides.
  for (const s of [-1, 1]) {
    out.push(strand(`M${f(60 + s * 22)},${f(cy - 4)} L${f(60 + s * 36)},${f(cy - 24)}`, c, 5));
    out.push(shape.path(`M${f(60 + s * 30)},${f(cy - 24)} Q${f(60 + s * 26)},${f(cy - 52)} ${f(60 + s * 42)},${f(cy - 54)} L${f(60 + s * 40)},${f(cy - 40)} L${f(60 + s * 50)},${f(cy - 44)} Q${f(60 + s * 50)},${f(cy - 22)} ${f(60 + s * 30)},${f(cy - 24)} Z`, c));
  }
  out.push(shape.ellipse(60, cy, 28, 16, c));
  out.push(markOn(m, 60, cy, 28, 16));
  if (m.head === 'own') {
    for (const s of [-1, 1]) out.push(strand(`M${f(60 + s * 6)},${f(cy - 12)} L${f(60 + s * 8)},${f(cy - 22)}`, c, 2) + eye(m, 60 + s * 8, cy - 23, 2));
  } else {
    // A chuul's mouth: a beak with tentacles below it.
    out.push(shape.poly([[52, cy - 6], [60, cy + 8], [68, cy - 6]], dark));
    for (const dx of [-6, 0, 6]) out.push(strand(`M${f(60 + dx)},${f(cy + 8)} q${f(dx)},8 ${f(dx / 2)},16`, PALETTE['skin-light']!, 1.8));
    out.push(eye(m, 54, cy - 8, 1.6) + eye(m, 66, cy - 8, 1.6));
  }
  out.push(shape.detail(`M${f(42)},${f(cy + 6)} Q${f(60)},${f(cy + 12)} ${f(78)},${f(cy + 6)}`, dark, 1.4));
  return { art: out.join(''), top: cy - 58, left: 2, right: 118 };
}

function centipede(m: Mini): Drawn {
  const c = m.coat;
  const dark = shade(c, -0.3);
  const out: string[] = [];
  const segs: Array<[number, number]> = [];
  for (let i = 0; i < 9; i++) segs.push([4 + i * 12, FEET - 14 - (i > 6 ? (i - 6) * 10 : 0)]);
  for (const [x, y] of segs.slice(0, 8)) out.push(strand(`M${f(x)},${f(y)} L${f(x - 6)},${f(FEET)} M${f(x)},${f(y)} L${f(x + 7)},${f(FEET)}`, dark, 1.6));
  for (const [x, y] of segs) out.push(shape.ellipse(x, y, 8, 7, c));
  const [hx, hy] = segs[8]!;
  out.push(shape.circle(hx + 8, hy - 2, 7, c));
  out.push(strand(`M${f(hx + 12)},${f(hy - 7)} q8,-14 16,-12 M${f(hx + 10)},${f(hy - 8)} q2,-14 10,-16`, dark, 1.4));
  out.push(shape.poly([[hx + 14, hy + 2], [hx + 20, hy + 6], [hx + 13, hy + 6]], PALETTE.bone!));
  out.push(eye(m, hx + 10, hy - 4, 1.4));
  return { art: out.join(''), top: hy - 26, left: -6, right: hx + 30 };
}

function beetle(m: Mini): Drawn {
  const c = m.coat;
  const dark = shade(c, -0.3);
  const ankheg = m.body === 'ankheg';
  const cy = FEET - 30;
  const out: string[] = [];
  for (let i = 0; i < 3; i++) out.push(legTo(46 + i * 14, cy + 4, [40 + i * 18, cy - 8], 30 + i * 22, dark, 2.4));
  if (ankheg) for (let i = 0; i < 3; i++) out.push(shape.ellipse(20 + i * 12, cy + 6 - i * 2, 10, 9, shade(c, -0.12)));
  out.push(shape.path(`M${f(30)},${f(cy + 10)} Q${f(32)},${f(cy - 30)} ${f(64)},${f(cy - 30)} Q${f(90)},${f(cy - 26)} ${f(92)},${f(cy + 8)} Z`, c));
  out.push(shape.detail(`M${f(62)},${f(cy - 29)} L${f(60)},${f(cy + 8)}`, dark, 1.6));
  out.push(markOn(m, 61, cy - 8, 26, 16));
  for (let i = 0; i < 3; i++) out.push(legTo(46 + i * 16, cy + 8, [40 + i * 20, cy + 14], 32 + i * 24, c, 2.8));
  out.push(shape.circle(96, cy + 2, 10, dark));
  // Mandibles (great ones on an ankheg), or a fire beetle's glowing glands.
  out.push(shape.path(`M${f(102)},${f(cy - 2)} Q${f(118)},${f(cy - (ankheg ? 10 : 4))} ${f(ankheg ? 122 : 112)},${f(cy + 6)} L${f(104)},${f(cy + 2)} Z`, PALETTE.bone!));
  out.push(shape.path(`M${f(102)},${f(cy + 8)} Q${f(118)},${f(cy + 16)} ${f(ankheg ? 120 : 112)},${f(cy + 6)} L${f(104)},${f(cy + 4)} Z`, PALETTE.bone!));
  out.push(eye(m, 98, cy - 2, 1.5));
  if (m.features.flames) out.push(`<circle cx="94" cy="${cy - 6}" r="5" fill="#ffd36b" stroke="${INK}" stroke-width="1"/><circle cx="50" cy="${cy - 4}" r="4" fill="#ffd36b" stroke="${INK}" stroke-width="1"/>`);
  return { art: out.join(''), top: cy - 36, left: ankheg ? 6 : 24, right: 124 };
}

/** A wasp or a fly, in flight on a post: wings up, legs hanging. */
function flier(m: Mini): Drawn {
  const c = m.coat;
  const wasp = m.body === 'wasp';
  const cy = 128;
  const out: string[] = [flightPost(56, cy + 8)];
  out.push(`<ellipse cx="44" cy="${cy - 22}" rx="26" ry="9" fill="#e6eef2" fill-opacity="0.75" transform="rotate(-30 56 ${cy - 6})"/>`);
  for (let i = 0; i < 3; i++) out.push(strand(`M${f(50 + i * 8)},${f(cy + 6)} l${f(-2 + i)},14 l-3,8`, shade(c, -0.3), 1.6));
  if (wasp) {
    out.push(shape.path(`M${f(42)},${f(cy)} Q${f(18)},${f(cy + 4)} ${f(10)},${f(cy + 20)} Q${f(30)},${f(cy + 20)} ${f(46)},${f(cy + 8)} Z`, PALETTE.ochre!));
    out.push(shape.detail(`M${f(32)},${f(cy + 4)} l-4,12 M${f(22)},${f(cy + 9)} l-2,9`, INK, 3));
    out.push(shape.poly([[12, cy + 18], [2, cy + 26], [14, cy + 22]], INK));
  } else out.push(shape.ellipse(36, cy + 4, 18, 13, c));
  out.push(shape.ellipse(58, cy, 14, 11, wasp ? INK : shade(c, -0.15)));
  out.push(shape.circle(76, cy - 2, 9, wasp ? PALETTE.ochre! : c));
  out.push(shape.circle(80, cy - 4, wasp ? 3 : 6, wasp ? INK : PALETTE.crimson!));
  out.push(`<ellipse cx="62" cy="${cy - 26}" rx="24" ry="8" fill="#e6eef2" fill-opacity="0.8" transform="rotate(-62 58 ${cy - 6})"/>`);
  return { art: out.join(''), top: cy - 52, left: 0, right: 94 };
}

/** A pattern on a shell or an abdomen: spots, stripes. */
function markOn(m: Mini, x: number, y: number, rx: number, ry: number): string {
  const c = m.features.markingColour;
  if (m.features.markings === 'stripes') return `<path d="M${f(x - rx * 0.5)},${f(y - ry * 0.8)} l0,${f(ry * 1.6)} M${f(x)},${f(y - ry)} l0,${f(ry * 2)} M${f(x + rx * 0.5)},${f(y - ry * 0.8)} l0,${f(ry * 1.6)}" fill="none" stroke="${c}" stroke-width="3"/>`;
  if (m.features.markings === 'spots' || m.features.markings === 'patches') return [[-0.4, -0.3], [0.2, -0.45], [0.35, 0.2], [-0.15, 0.35]].map(([dx, dy]) => `<circle cx="${f(x + rx * dx!)}" cy="${f(y + ry * dy!)}" r="${f(ry * 0.16)}" fill="${c}" stroke="none"/>`).join('');
  return '';
}
