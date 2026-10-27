import type { Mini } from '../spec.js';
import type { Drawn } from './index.js';
import { f, FEET, INK, PALETTE, shade, shape } from './draw.js';
import { eye, flames, sideWing, strand } from './parts.js';

/**
 * Snakes and worms, side on, facing right: a coiled snake with its head raised (a cobra spreads
 * its hood; a couatl or a flying snake has wings), a great worm bursting out of the ground, and a
 * long many-legged serpent (a behir, a remorhaz).
 */
export function serpent(m: Mini): Drawn {
  if (m.body === 'worm') return worm(m);
  if (m.body === 'segmented') return segmented(m);
  return coiled(m);
}

function coiled(m: Mini): Drawn {
  const c = m.coat;
  const dark = shade(c, -0.3);
  const belly = shade(c, 0.35);
  const out: string[] = [];
  let top = FEET - 112;
  let left = 8;
  if (m.body === 'winged' || m.features.wings !== 'none') {
    const kind = m.features.wings === 'none' ? 'feathered' : m.features.wings;
    out.push(sideWing(kind, 56, FEET - 64, 66, m.features.wingColour === PALETTE.white ? shade(c, 0.1) : m.features.wingColour));
    top = FEET - 132;
    left = 0;
  }
  // Two coils on the ground, the body rising in an S to the head.
  out.push(shape.ellipse(58, FEET - 10, 44, 11, dark));
  out.push(shape.ellipse(58, FEET - 13, 30, 7, shade(dark, -0.2)));
  out.push(shape.ellipse(60, FEET - 24, 34, 10, c));
  out.push(shape.ellipse(60, FEET - 26, 20, 5, dark));
  const neck = `M${f(80)},${f(FEET - 26)} Q${f(100)},${f(FEET - 44)} ${f(80)},${f(FEET - 66)} Q${f(62)},${f(FEET - 86)} ${f(82)},${f(FEET - 100)}`;
  out.push(strand(neck, c, 12));
  out.push(`<path d="M${f(84)},${f(FEET - 28)} Q${f(102)},${f(FEET - 44)} ${f(84)},${f(FEET - 64)}" fill="none" stroke="${belly}" stroke-width="4"/>`);
  if (m.features.markings !== 'none') {
    const spots: string[] = [];
    for (const [x, y] of [[40, FEET - 26], [58, FEET - 30], [78, FEET - 22], [90, FEET - 46], [76, FEET - 72], [72, FEET - 88]]) spots.push(`<circle cx="${x}" cy="${y}" r="2.6" fill="${m.features.markingColour}" stroke="none"/>`);
    out.push(spots.join(''));
  }
  if (m.body === 'cobra') out.push(shape.ellipse(84, FEET - 98, 13, 18, c) + shape.ellipse(86, FEET - 96, 7, 12, belly));
  // The head: a wedge with a forked tongue.
  out.push(shape.path(`M${f(76)},${f(FEET - 108)} Q${f(92)},${f(FEET - 116)} ${f(104)},${f(FEET - 104)} Q${f(94)},${f(FEET - 96)} ${f(78)},${f(FEET - 98)} Z`, c));
  out.push(strand(`M${f(103)},${f(FEET - 103)} l8,2 m-3,-1 l4,-3 m-4,3 l4,3`, PALETTE.crimson!, 1));
  out.push(eye(m, 88, FEET - 107, 1.6));
  if (m.features.horns !== 'none') out.push(shape.poly([[80, FEET - 110], [76, FEET - 124], [86, FEET - 112]], m.features.hornColour));
  if (m.features.flames) out.push(flames([[70, FEET - 30], [50, FEET - 32], [90, FEET - 60]], 14));
  return { art: out.join(''), top: Math.min(top, FEET - 126), left, right: 116 };
}

/** A great worm reared out of the ground, its round mouth full of teeth. */
function worm(m: Mini): Drawn {
  const c = m.coat;
  const dark = shade(c, -0.25);
  const out = [
    shape.ellipse(54, FEET - 6, 50, 8, PALETTE.brown!),
    shape.path(`M${f(26)},${f(FEET - 4)} Q${f(20)},${f(FEET - 80)} ${f(60)},${f(FEET - 128)} L${f(96)},${f(FEET - 106)} Q${f(60)},${f(FEET - 70)} ${f(72)},${f(FEET - 4)} Z`, c),
  ];
  for (let i = 1; i < 7; i++) {
    const y = FEET - 4 - i * 17;
    out.push(shape.detail(`M${f(24 + i * 2)},${f(y)} Q${f(48 + i * 4)},${f(y + 8)} ${f(70 + i * 1.5)},${f(y + 2)}`, dark, 2));
  }
  out.push(shape.ellipse(80, FEET - 118, 18, 12, dark));
  out.push(shape.ellipse(80, FEET - 118, 12, 7, '#3a1418'));
  const teeth: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    teeth.push(shape.poly([[80 + Math.cos(a) * 15, FEET - 118 + Math.sin(a) * 10], [80 + Math.cos(a) * 9, FEET - 118 + Math.sin(a) * 6], [80 + Math.cos(a + 0.3) * 15, FEET - 118 + Math.sin(a + 0.3) * 10]], PALETTE.bone!));
  }
  out.push(teeth.join(''));
  return { art: out.join(''), top: FEET - 134, left: 2, right: 104 };
}

/** A long serpent on many legs, its front raised: a behir, a remorhaz. */
function segmented(m: Mini): Drawn {
  const c = m.coat;
  const dark = shade(c, -0.3);
  const out: string[] = [];
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= 8; i++) pts.push([-10 + i * 13, FEET - 22 - (i > 5 ? (i - 5) * 18 : 0)]);
  for (const [x, y] of pts.slice(0, 7)) out.push(strand(`M${f(x)},${f(y)} L${f(x + 4)},${f(FEET - 8)} L${f(x + 8)},${f(FEET)}`, dark, 2.4));
  for (const [x, y] of pts) out.push(shape.ellipse(x, y, 11, 12, c));
  if (m.features.flames) out.push(flames(pts.slice(0, 7).map(([x, y]) => [x, y - 9] as [number, number]), 12));
  else for (const [x, y] of pts) out.push(shape.poly([[x - 5, y - 10], [x, y - 18], [x + 5, y - 10]], dark));
  const [hx, hy] = pts[8]!;
  out.push(shape.path(`M${f(hx - 6)},${f(hy - 10)} L${f(hx + 24)},${f(hy - 4)} L${f(hx + 22)},${f(hy + 8)} L${f(hx - 4)},${f(hy + 10)} Z`, c));
  out.push(shape.detail(`M${f(hx + 4)},${f(hy + 3)} L${f(hx + 22)},${f(hy + 2)}`, INK, 1.4));
  out.push(eye(m, hx + 8, hy - 3, 1.6));
  if (m.features.horns !== 'none') out.push(shape.poly([[hx - 2, hy - 8], [hx - 10, hy - 24], [hx + 6, hy - 9]], m.features.hornColour));
  return { art: out.join(''), top: hy - 28, left: -24, right: hx + 30 };
}
