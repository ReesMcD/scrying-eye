import type { Mini } from '../spec.js';
import type { Drawn } from './index.js';
import { f, FEET, INK, PALETTE, shade, shape } from './draw.js';
import { eye, strand, waves } from './parts.js';

/**
 * Swimmers, rising out of a band of water at the foot of the card: sharks and whales leaping,
 * piranhas, a seahorse, a plesiosaur, an octopus or kraken, an aboleth.
 */
export function fish(m: Mini): Drawn {
  switch (m.body) {
    case 'octopus':
      return octopus(m);
    case 'seahorse':
      return seahorse(m);
    case 'plesiosaur':
      return plesiosaur(m);
    case 'aboleth':
      return aboleth(m);
    default:
      return leaping(m);
  }
}

/** A shark, a whale or a piranha arcing out of the water. */
function leaping(m: Mini): Drawn {
  const c = m.coat;
  const belly = m.body === 'whale' ? PALETTE.white! : shade(c, 0.45);
  const small = m.body === 'piranha';
  const k = small ? 0.6 : m.body === 'whale' ? 1.15 : 1;
  const cx = 60;
  const cy = FEET - 52 * k;
  const L = 50 * k;
  const H = (small ? 22 : 15) * k;
  const out: string[] = [];
  // Tail fin down into the water, the body, its belly, the fins.
  out.push(shape.path(`M${f(cx - L + 6)},${f(cy + 8)} L${f(cx - L - 14 * k)},${f(cy + 26 * k)} L${f(cx - L - 2)},${f(cy + 4)} L${f(cx - L - 16 * k)},${f(cy - 14 * k)} Z`, c));
  out.push(shape.path(`M${f(cx - L)},${f(cy + 4)} Q${f(cx - L * 0.2)},${f(cy - H * 1.6)} ${f(cx + L)},${f(cy - 2)} Q${f(cx + L * 0.4)},${f(cy + H * 1.5)} ${f(cx - L)},${f(cy + 8)} Z`, c));
  out.push(`<path d="M${f(cx - L * 0.6)},${f(cy + 8)} Q${f(cx + L * 0.2)},${f(cy + H * 1.1)} ${f(cx + L * 0.9)},${f(cy + 1)} Q${f(cx + L * 0.2)},${f(cy + H * 0.5)} ${f(cx - L * 0.6)},${f(cy + 8)} Z" fill="${belly}" stroke="none"/>`);
  if (m.body === 'whale') out.push(`<ellipse cx="${f(cx + L * 0.45)}" cy="${f(cy - H * 0.4)}" rx="${f(L * 0.14)}" ry="${f(H * 0.3)}" fill="${PALETTE.white}" stroke="none"/>`);
  if (!small) out.push(shape.poly([[cx - L * 0.1, cy - H * 1.05], [cx - L * 0.05, cy - H * 2.6], [cx + L * 0.22, cy - H * 0.95]], c));
  else out.push(shape.poly([[cx - L * 0.4, cy - H * 0.8], [cx - L * 0.2, cy - H * 1.5], [cx, cy - H * 0.9]], shade(c, -0.2)));
  out.push(shape.poly([[cx + L * 0.2, cy + H * 0.6], [cx + L * 0.02, cy + H * 1.6], [cx + L * 0.4, cy + H * 0.7]], shade(c, -0.15)));
  if (m.body === 'shark') out.push(shape.detail(`M${f(cx + L * 0.5)},${f(cy - 4)} l-2,8 M${f(cx + L * 0.44)},${f(cy - 4)} l-2,8`, shade(c, -0.35), 1.4));
  // Teeth for the hunters.
  if (m.body !== 'whale') {
    const teeth: string[] = [];
    for (let i = 0; i < 4; i++) teeth.push(`M${f(cx + L * (0.72 + i * 0.06))},${f(cy + 2)} l${f(1.5 * k)},${f(3.5 * k)}`);
    out.push(shape.detail(teeth.join(' '), PALETTE.bone!, 1.4));
  }
  out.push(eye(m, cx + L * 0.7, cy - H * 0.35, 1.5 * Math.max(1, k)));
  out.push(waves(cx - L - 18 * k, cx + L + 10));
  return { art: out.join(''), top: cy - H * 2.7, left: cx - L - 20 * k, right: cx + L + 12 };
}

function octopus(m: Mini): Drawn {
  const c = m.coat;
  const dark = shade(c, -0.25);
  const out: string[] = [];
  for (let i = 0; i < 6; i++) {
    const x = 32 + i * 11;
    const dir = i < 3 ? -1 : 1;
    out.push(strand(`M${f(x)},${f(FEET - 52)} Q${f(x + dir * 6)},${f(FEET - 30)} ${f(x + dir * 20)},${f(FEET - 16)} q${f(dir * 8)},-4 ${f(dir * 4)},-12`, i % 2 ? dark : c, 6));
  }
  out.push(shape.path(`M${f(30)},${f(FEET - 50)} Q${f(26)},${f(FEET - 120)} ${f(60)},${f(FEET - 122)} Q${f(94)},${f(FEET - 120)} ${f(90)},${f(FEET - 50)} Q${f(60)},${f(FEET - 40)} ${f(30)},${f(FEET - 50)} Z`, c));
  out.push(shape.ellipse(48, FEET - 64, 7, 8, PALETTE.white!) + shape.ellipse(72, FEET - 64, 7, 8, PALETTE.white!));
  out.push(eye(m, 49, FEET - 63, 2.6) + eye(m, 71, FEET - 63, 2.6));
  out.push(waves(4, 116));
  return { art: out.join(''), top: FEET - 124, left: 2, right: 118 };
}

function seahorse(m: Mini): Drawn {
  const c = m.coat;
  const out = [
    strand(`M${f(54)},${f(FEET - 40)} Q${f(46)},${f(FEET - 20)} ${f(60)},${f(FEET - 18)} q8,-2 4,-8`, c, 6),
    shape.path(`M${f(50)},${f(FEET - 40)} Q${f(40)},${f(FEET - 80)} ${f(56)},${f(FEET - 104)} Q${f(76)},${f(FEET - 96)} ${f(68)},${f(FEET - 70)} Q${f(66)},${f(FEET - 50)} ${f(60)},${f(FEET - 38)} Z`, c),
    shape.path(`M${f(56)},${f(FEET - 104)} L${f(84)},${f(FEET - 100)} L${f(84)},${f(FEET - 94)} L${f(62)},${f(FEET - 92)} Z`, c),
    shape.poly([[48, FEET - 74], [36, FEET - 70], [46, FEET - 62]], shade(c, 0.3)),
    shape.poly([[52, FEET - 108], [50, FEET - 120], [58, FEET - 110]], shade(c, -0.2)),
    eye(m, 62, FEET - 100, 1.6),
    waves(20, 100),
  ];
  return { art: out.join(''), top: FEET - 124, left: 18, right: 102 };
}

function plesiosaur(m: Mini): Drawn {
  const c = m.coat;
  const out = [
    shape.path(`M${f(16)},${f(FEET - 20)} L${f(-4)},${f(FEET - 26)} L${f(18)},${f(FEET - 12)} Z`, c),
    shape.ellipse(42, FEET - 22, 30, 14, c),
    shape.poly([[34, FEET - 16], [18, FEET - 4], [40, FEET - 10]], shade(c, -0.2)),
    shape.path(`M${f(62)},${f(FEET - 30)} Q${f(84)},${f(FEET - 70)} ${f(80)},${f(FEET - 104)} L${f(90)},${f(FEET - 106)} Q${f(96)},${f(FEET - 66)} ${f(70)},${f(FEET - 16)} Z`, c),
    shape.path(`M${f(78)},${f(FEET - 112)} Q${f(90)},${f(FEET - 118)} ${f(108)},${f(FEET - 106)} L${f(92)},${f(FEET - 100)} Z`, c),
    eye(m, 88, FEET - 110, 1.4),
    waves(-8, 116),
  ];
  return { art: out.join(''), top: FEET - 122, left: -10, right: 118 };
}

/** A great fish with a mouth of tentacles and three eyes stacked up its head. */
function aboleth(m: Mini): Drawn {
  const c = m.coat;
  const out: string[] = [];
  for (let i = 0; i < 4; i++) out.push(strand(`M${f(78 + i * 3)},${f(FEET - 40 + i * 4)} Q${f(96 + i * 4)},${f(FEET - 30 + i * 6)} ${f(90 + i * 8)},${f(FEET - 12)}`, shade(c, -0.15), 4));
  out.push(shape.path(`M${f(12)},${f(FEET - 52)} L${f(-6)},${f(FEET - 80)} L${f(2)},${f(FEET - 40)} L${f(-6)},${f(FEET - 14)} Z`, c));
  out.push(shape.path(`M${f(6)},${f(FEET - 42)} Q${f(30)},${f(FEET - 94)} ${f(84)},${f(FEET - 70)} Q${f(98)},${f(FEET - 52)} ${f(80)},${f(FEET - 30)} Q${f(36)},${f(FEET - 14)} ${f(6)},${f(FEET - 42)} Z`, c));
  out.push(shape.poly([[34, FEET - 82], [44, FEET - 104], [58, FEET - 80]], shade(c, -0.2)));
  for (let i = 0; i < 3; i++) out.push(shape.ellipse(72 - i * 2, FEET - 72 + i * 12, 4, 3, PALETTE.crimson!) + `<circle cx="${f(73 - i * 2)}" cy="${f(FEET - 72 + i * 12)}" r="1.4" fill="${INK}" stroke="none"/>`);
  out.push(waves(-8, 112));
  return { art: out.join(''), top: FEET - 106, left: -10, right: 114 };
}
