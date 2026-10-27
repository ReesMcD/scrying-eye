import type { Mini } from '../spec.js';
import type { Drawn } from './index.js';
import { f, FEET, INK, PALETTE, shade, shape } from './draw.js';
import { eye, flames, sideHead, sideHorns, sideWing, strand, type SideHead } from './parts.js';

/**
 * Beasts side on, facing right: one body plan (a body, four legs, a neck, a head, a tail) with
 * each kind's proportions and head, so a wolf, a horse and a hippo are clearly themselves and
 * still clearly the same set. Frogs, turtles and two-legged dinosaurs have their own shapes.
 */

type Tail = 'thin' | 'bushy' | 'tuft' | 'stub' | 'curl' | 'horse' | 'reptile' | 'club' | 'none';
type Feet = 'paw' | 'hoof' | 'pad' | 'claw';

interface Plan {
  /** Body length and depth, leg length and width, how high the head is carried above the back. */
  len: number;
  depth: number;
  leg: number;
  legW: number;
  neck: number;
  head: SideHead;
  size: number;
  tail: Tail;
  feet: Feet;
  /** Legs splayed out to the sides (lizards, crocodiles). */
  sprawl?: boolean;
  hump?: boolean;
  mane?: boolean;
  plates?: boolean;
}

const PLANS: Record<string, Plan> = {
  canine: { len: 70, depth: 28, leg: 30, legW: 8, neck: 14, head: 'canine', size: 13, tail: 'bushy', feet: 'paw' },
  feline: { len: 76, depth: 26, leg: 28, legW: 8, neck: 8, head: 'feline', size: 12, tail: 'thin', feet: 'paw' },
  lion: { len: 82, depth: 32, leg: 32, legW: 10, neck: 10, head: 'lion', size: 14, tail: 'tuft', feet: 'paw' },
  bear: { len: 84, depth: 42, leg: 26, legW: 13, neck: 2, head: 'bear', size: 15, tail: 'stub', feet: 'paw' },
  boar: { len: 72, depth: 34, leg: 20, legW: 9, neck: -2, head: 'boar', size: 14, tail: 'curl', feet: 'hoof', mane: true },
  horse: { len: 80, depth: 32, leg: 46, legW: 8, neck: 34, head: 'horse', size: 13, tail: 'horse', feet: 'hoof', mane: true },
  deer: { len: 70, depth: 26, leg: 46, legW: 6, neck: 32, head: 'deer', size: 11, tail: 'stub', feet: 'hoof' },
  goat: { len: 62, depth: 28, leg: 32, legW: 7, neck: 22, head: 'goat', size: 11, tail: 'stub', feet: 'hoof' },
  ox: { len: 88, depth: 42, leg: 32, legW: 11, neck: 4, head: 'ox', size: 15, tail: 'tuft', feet: 'hoof' },
  camel: { len: 80, depth: 30, leg: 50, legW: 7, neck: 40, head: 'camel', size: 11, tail: 'thin', feet: 'pad', hump: true },
  rhino: { len: 94, depth: 44, leg: 26, legW: 14, neck: -4, head: 'rhino', size: 17, tail: 'thin', feet: 'pad' },
  elephant: { len: 96, depth: 56, leg: 40, legW: 18, neck: 4, head: 'elephant', size: 22, tail: 'thin', feet: 'pad' },
  hippo: { len: 98, depth: 46, leg: 18, legW: 15, neck: -8, head: 'hippo', size: 19, tail: 'stub', feet: 'pad' },
  lizard: { len: 64, depth: 18, leg: 12, legW: 6, neck: -4, head: 'lizard', size: 10, tail: 'reptile', feet: 'claw', sprawl: true },
  crocodile: { len: 86, depth: 20, leg: 12, legW: 7, neck: -6, head: 'crocodile', size: 11, tail: 'reptile', feet: 'claw', sprawl: true, plates: true },
  rodent: { len: 50, depth: 26, leg: 10, legW: 6, neck: -2, head: 'rodent', size: 11, tail: 'thin', feet: 'paw' },
  badger: { len: 66, depth: 26, leg: 12, legW: 9, neck: -4, head: 'badger', size: 11, tail: 'stub', feet: 'claw' },
  triceratops: { len: 98, depth: 44, leg: 30, legW: 15, neck: -6, head: 'triceratops', size: 18, tail: 'reptile', feet: 'pad' },
  ankylosaurus: { len: 104, depth: 34, leg: 18, legW: 13, neck: -6, head: 'ankylosaurus', size: 13, tail: 'club', feet: 'pad', plates: true },
};

/** A beast on four legs (or a frog, a turtle, a dinosaur on two). */
export function beast(m: Mini): Drawn {
  if (m.body === 'frog') return frog(m);
  if (m.body === 'turtle') return turtle(m);
  if (m.body === 'raptor') return raptor(m);
  return quadruped(m, PLANS[m.body] ?? PLANS.canine!);
}

/** The head a beast wears: its own kind's, or another's (a griffon's eagle, an owlbear's owl). */
function headOf(m: Mini, own: SideHead): SideHead {
  const swap: Partial<Record<Mini['head'], SideHead>> = { eagle: 'eagle', owl: 'owl', lion: 'lion', tiger: 'feline', bull: 'ox', wolf: 'canine', dog: 'canine', boar: 'boar', bear: 'bear', vulture: 'eagle' };
  if (m.head === 'own') return own;
  return swap[m.head] ?? (m.head === 'skull' ? own : 'human');
}

function quadruped(m: Mini, p: Plan): Drawn {
  const c = m.coat;
  const dark = shade(c, -0.3);
  const bx = 60;
  const cy = FEET - p.leg - p.depth * 0.38;
  const back = bx - p.len / 2;
  const front = bx + p.len / 2;
  const s = p.size;
  const hx = front + s * 0.25;
  const hy = cy - p.depth * 0.35 - p.neck;
  const kind = headOf(m, p.head);
  const out: string[] = [];
  let top = hy - s;
  let left = back - 6;
  let right = hx + s * 1.8;

  // Behind: the tail, the far wing, the far legs.
  const t = tail(p.tail, m, back + 4, cy - p.depth * 0.15, p.depth);
  out.push(t.art);
  left = Math.min(left, t.left);
  const legsAt = [back + p.len * 0.2, front - p.len * 0.2];
  for (const x of legsAt) out.push(leg(x + 7, cy, p, dark, true));
  if (m.features.wings !== 'none') {
    const span = Math.max(46, p.len * 0.75);
    out.push(sideWing(m.features.wings, bx + p.len * 0.12, cy - p.depth * 0.3, span, shade(m.features.wingColour, -0.12)));
    top = Math.min(top, cy - p.depth * 0.3 - span);
    left = Math.min(left, bx + p.len * 0.12 - span * 0.75);
  }

  // The body, its markings, the near legs.
  if (p.hump) out.push(shape.ellipse(bx - 2, cy - p.depth * 0.45, p.len * 0.22, p.depth * 0.45, c));
  out.push(shape.ellipse(bx, cy, p.len / 2, p.depth / 2, c));
  out.push(bodyMarks(m, bx, cy, p.len / 2, p.depth / 2));
  if (p.plates) {
    for (let i = 0; i < 6; i++) {
      const x = back + p.len * (0.15 + i * 0.13);
      out.push(shape.poly([[x - 5, cy - p.depth * 0.42], [x, cy - p.depth * 0.42 - 8], [x + 5, cy - p.depth * 0.42]], dark));
    }
  }
  for (const x of legsAt) out.push(leg(x, cy, p, c, false));

  // The neck up to the head, a mane along it, the head, horns, a second head behind.
  if (p.neck > 6 || kind !== p.head) out.push(shape.path(`M${f(front - p.len * 0.26)},${f(cy - p.depth * 0.4)} Q${f(hx - s * 0.9)},${f((hy + cy) / 2 - s * 0.3)} ${f(hx - s * 0.55)},${f(hy - s * 0.35)} L${f(hx + s * 0.35)},${f(hy + s * 0.5)} Q${f(front + s * 0.1)},${f((hy + cy) / 2 + s * 0.4)} ${f(front - 2)},${f(cy + p.depth * 0.12)} Z`, c));
  if (p.mane && !m.features.flames) out.push(shape.path(`M${f(front - p.len * 0.25)},${f(cy - p.depth * 0.42)} Q${f(hx - s * 0.8)},${f(hy - s * 0.6)} ${f(hx - s * 0.3)},${f(hy - s * 0.7)} L${f(hx - s * 0.05)},${f(hy - s * 0.45)} Q${f(hx - s * 0.6)},${f(hy)} ${f(front - p.len * 0.12)},${f(cy - p.depth * 0.3)} Z`, m.hair.style === 'none' ? dark : m.hair.colour));
  for (let i = 1; i < m.heads; i++) {
    const extra = sideHead(kind, hx - s * 0.9 * i, hy - s * 0.55 * i, s * 0.95, m, shade(c, -0.12));
    out.push(shape.poly([[front - p.len * 0.25, cy - p.depth * 0.4], [hx - s * 0.9 * i - s * 0.2, hy - s * 0.55 * i - s * 0.5], [hx - s * 0.9 * i + s * 0.2, hy - s * 0.55 * i + s * 0.5], [front - p.len * 0.1, cy]], shade(c, -0.12)));
    out.push(extra.art);
    top = Math.min(top, extra.top);
  }
  const h = sideHead(kind, hx, hy, s, m);
  out.push(h.art);
  top = Math.min(top, h.top);
  right = Math.max(right, h.right);
  const horns = sideHorns(m, hx, hy, s);
  out.push(horns.art);
  top = Math.min(top, horns.top);
  if (m.features.flames) {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < 5; i++) pts.push([hx - s * 0.6 - i * ((hx - front + p.len * 0.3) / 5), hy - s * 0.4 + i * ((cy - hy) / 6)]);
    out.push(flames(pts, 16));
    top = Math.min(top, hy - s * 0.4 - 16);
  }
  return { art: out.join(''), top, left, right, face: { x: hx + s * 0.35, y: hy + s * 0.1, r: s * 1.6 } };
}

function leg(x: number, cy: number, p: Plan, colour: string, far: boolean): string {
  const w = p.legW;
  const topY = cy + (far ? 0 : 2);
  if (p.sprawl) {
    // Bent out to the side, then down to a clawed foot.
    return shape.path(`M${f(x - w / 2)},${f(topY)} L${f(x + w * 0.9)},${f(FEET - 8)} L${f(x + w * 1.8)},${f(FEET)} L${f(x - w * 0.2)},${f(FEET)} L${f(x - w * 0.2)},${f(FEET - 6)} L${f(x - w * 1.1)},${f(topY + 4)} Z`, colour);
  }
  const foot = p.feet === 'hoof' ? shape.rect(x - w / 2 - 0.5, FEET - 6, w + 1, 6, far ? '#1d1a17' : '#3a3330', 1) : p.feet === 'pad' ? shape.rect(x - w / 2 - 1.5, FEET - 5, w + 3, 5, shade(colour, -0.15), 2) : p.feet === 'claw' ? shape.poly([[x - w / 2, FEET - 3], [x + w / 2 + 4, FEET], [x - w / 2, FEET]], PALETTE.bone!) : '';
  return shape.rect(x - w / 2, topY, w, FEET - topY - (p.feet === 'hoof' ? 5 : 0), colour, Math.min(4, w / 2)) + foot;
}

function tail(kind: Tail, m: Mini, x: number, y: number, depth: number): { art: string; left: number } {
  const c = m.coat;
  const hair = m.hair.style === 'none' ? shade(c, -0.3) : m.hair.colour;
  switch (kind) {
    case 'thin':
      return { art: strand(`M${f(x)},${f(y)} Q${f(x - 22)},${f(y - 4)} ${f(x - 26)},${f(y + 24)} Q${f(x - 28)},${f(y + 34)} ${f(x - 20)},${f(y + 36)}`, c, 3), left: x - 30 };
    case 'tuft':
      return { art: strand(`M${f(x)},${f(y)} Q${f(x - 20)},${f(y - 2)} ${f(x - 24)},${f(y + 26)}`, c, 3) + shape.ellipse(x - 24, y + 30, 4, 6, shade(c, -0.4)), left: x - 30 };
    case 'bushy':
      return { art: shape.path(`M${f(x + 2)},${f(y - 4)} Q${f(x - 26)},${f(y - 10)} ${f(x - 32)},${f(y + 14)} Q${f(x - 20)},${f(y + 10)} ${f(x + 2)},${f(y + 8)} Z`, c), left: x - 34 };
    case 'stub':
      return { art: shape.poly([[x + 2, y - 4], [x - 9, y - 6], [x + 2, y + 5]], c), left: x - 10 };
    case 'curl':
      return { art: strand(`M${f(x)},${f(y)} q-8,-2 -8,-8 q0,-5 5,-4 q3,2 -1,5`, c, 2.2), left: x - 12 };
    case 'horse':
      return { art: shape.path(`M${f(x + 2)},${f(y - 4)} Q${f(x - 16)},${f(y - 6)} ${f(x - 20)},${f(y + 20)} Q${f(x - 22)},${f(y + 40)} ${f(x - 12)},${f(y + 46)} Q${f(x - 10)},${f(y + 20)} ${f(x + 2)},${f(y + 8)} Z`, hair), left: x - 24 };
    case 'reptile':
    case 'club': {
      const end = x - depth * 1.6;
      const art = shape.path(`M${f(x + 4)},${f(y - depth * 0.3)} Q${f(x - depth * 0.6)},${f(y - depth * 0.2)} ${f(end)},${f(y + depth * 0.4)} Q${f(x - depth * 0.6)},${f(y + depth * 0.35)} ${f(x + 4)},${f(y + depth * 0.4)} Z`, c);
      return { art: art + (kind === 'club' ? shape.ellipse(end, y + depth * 0.4, 9, 7, shade(c, -0.25)) : ''), left: end - 10 };
    }
    default:
      return { art: '', left: x };
  }
}

/** Stripes or spots on a body (a tiger, a leopard, a hyena); nothing otherwise. */
function bodyMarks(m: Mini, x: number, y: number, rx: number, ry: number): string {
  const c = m.features.markingColour;
  if (m.features.markings === 'stripes') {
    const d: string[] = [];
    for (let i = -2; i <= 2; i++) d.push(`M${f(x + i * rx * 0.32)},${f(y - ry * 0.9)} q${f(-rx * 0.08)},${f(ry * 0.6)} ${f(rx * 0.04)},${f(ry * 1.1)}`);
    return `<path d="${d.join(' ')}" fill="none" stroke="${c}" stroke-width="3"/>`;
  }
  if (m.features.markings === 'spots') {
    const dots: string[] = [];
    for (let i = 0; i < 9; i++) {
      const a = (i * 2.4) % (Math.PI * 2);
      const r = 0.25 + ((i * 37) % 10) / 16;
      dots.push(`<circle cx="${f(x + Math.cos(a) * rx * r * 0.85)}" cy="${f(y + Math.sin(a) * ry * r * 0.7)}" r="${f(Math.max(2, ry * 0.14))}" fill="${c}" stroke="none"/>`);
    }
    return dots.join('');
  }
  return '';
}

/** A frog or toad: squat, big back legs folded, eyes on top. */
function frog(m: Mini): Drawn {
  const c = m.coat;
  const light = shade(c, 0.35);
  const y = FEET - 22;
  const out = [
    shape.path(`M${f(30)},${f(FEET)} Q${f(14)},${f(FEET - 6)} ${f(22)},${f(y - 4)} Q${f(40)},${f(y - 16)} ${f(52)},${f(y + 4)} L${f(46)},${f(FEET)} Z`, shade(c, -0.15)),
    shape.ellipse(62, y, 34, 22, c),
    shape.path(`M${f(36)},${f(y + 10)} Q${f(64)},${f(y + 26)} ${f(94)},${f(y + 8)} Q${f(66)},${f(y + 16)} ${f(36)},${f(y + 10)} Z`, light),
    shape.path(`M${f(26)},${f(y + 2)} Q${f(20)},${f(FEET - 2)} ${f(40)},${f(FEET)} L${f(60)},${f(FEET)} Q${f(44)},${f(FEET - 6)} ${f(46)},${f(y + 6)} Z`, c),
    shape.rect(78, y + 8, 7, FEET - y - 8, c, 3),
    shape.circle(86, y - 18, 8, c),
    eye(m, 88, y - 19, 2.6),
    shape.detail(`M${f(70)},${f(y + 2)} Q${f(84)},${f(y + 8)} ${f(96)},${f(y - 4)}`, INK, 1.4),
  ];
  return { art: out.join(''), top: y - 28, left: 12, right: 100 };
}

/** A turtle: a domed, plated shell, a head out front, flippers. */
function turtle(m: Mini): Drawn {
  const c = m.coat;
  const shell = shade(c, -0.2);
  const y = FEET - 26;
  const out = [
    shape.path(`M${f(18)},${f(y + 16)} L${f(6)},${f(FEET)} L${f(30)},${f(FEET)} Z`, c),
    shape.path(`M${f(84)},${f(y + 10)} L${f(108)},${f(FEET - 2)} L${f(84)},${f(FEET)} Z`, c),
    shape.path(`M${f(90)},${f(y + 4)} Q${f(112)},${f(y - 10)} ${f(122)},${f(y + 2)} Q${f(124)},${f(y + 14)} ${f(108)},${f(y + 14)} L${f(90)},${f(y + 16)} Z`, c),
    eye(m, 113, y + 1, 2),
    shape.path(`M${f(12)},${f(y + 18)} Q${f(20)},${f(y - 30)} ${f(56)},${f(y - 34)} Q${f(92)},${f(y - 30)} ${f(98)},${f(y + 18)} Z`, shell),
    shape.rect(10, y + 14, 90, 8, shade(c, 0.2), 3),
    shape.detail(`M${f(36)},${f(y - 22)} L${f(30)},${f(y + 12)} M${f(56)},${f(y - 30)} L${f(56)},${f(y + 12)} M${f(76)},${f(y - 22)} L${f(82)},${f(y + 12)} M${f(22)},${f(y - 4)} L${f(92)},${f(y - 4)}`, shade(shell, -0.35), 2),
  ];
  return { art: out.join(''), top: y - 36, left: 2, right: 126 };
}

/** A big two-legged dinosaur (a tyrannosaurus, an allosaurus): body level, tail out behind, huge head. */
function raptor(m: Mini): Drawn {
  const c = m.coat;
  const dark = shade(c, -0.3);
  const cy = FEET - 62;
  const out = [
    shape.path(`M${f(40)},${f(cy - 14)} Q${f(0)},${f(cy - 4)} ${f(-26)},${f(cy + 14)} Q${f(0)},${f(cy + 8)} ${f(42)},${f(cy + 16)} Z`, c),
    shape.path(`M${f(52)},${f(cy + 8)} L${f(46)},${f(FEET - 20)} L${f(54)},${f(FEET)} L${f(66)},${f(FEET)} L${f(60)},${f(FEET - 22)} L${f(66)},${f(cy + 8)} Z`, dark),
    shape.ellipse(56, cy, 34, 22, c),
    bodyMarks(m, 56, cy, 34, 22),
    shape.path(`M${f(58)},${f(cy + 6)} Q${f(40)},${f(cy + 30)} ${f(52)},${f(cy + 44)} L${f(48)},${f(FEET - 4)} L${f(44)},${f(FEET)} L${f(64)},${f(FEET)} L${f(62)},${f(cy + 44)} Q${f(76)},${f(cy + 26)} ${f(70)},${f(cy + 4)} Z`, c),
    shape.poly([[80, cy + 4], [96, cy + 10], [86, cy + 14]], c),
    shape.poly([[72, cy - 16], [92, cy - 40], [100, cy - 30], [84, cy - 6]], c),
  ];
  const h = sideHead('raptor', 104, cy - 42, 16, m);
  out.push(h.art);
  return { art: out.join(''), top: h.top, left: -30, right: h.right };
}
