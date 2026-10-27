import type { Mini } from '../spec.js';
import type { Drawn } from './index.js';
import { f, FEET, INK, PALETTE, shade, shape } from './draw.js';
import { eye, flightPost, sideHead, sideWing, strand } from './parts.js';

/**
 * Birds and other fliers. Birds perch side on, facing right (a raptor with its wings up, an owl
 * or a raven folded); bats, pteranodons and stirges fly face on, wings spread, on a post.
 */
export function bird(m: Mini): Drawn {
  switch (m.body) {
    case 'bat':
    case 'stirge':
      return batlike(m);
    case 'pteranodon':
      return pteranodon(m);
    case 'flightless':
      return axeBeak(m);
    default:
      return perched(m);
  }
}

function perched(m: Mini): Drawn {
  const c = m.coat;
  const dark = shade(c, -0.3);
  const light = shade(c, 0.35);
  const owl = m.body === 'owl';
  const vulture = m.body === 'vulture';
  const cockatrice = m.body === 'cockatrice';
  const cy = FEET - 44;
  const out: string[] = [];
  let top = cy - 70;
  let left = 14;
  // Raptors and vultures spread their wings; owls and ravens keep them folded.
  const spread = m.body === 'raptor' || vulture || m.features.wings !== 'none';
  if (spread) {
    const kind = cockatrice || m.features.wings === 'bat' ? 'bat' : 'feathered';
    out.push(sideWing(kind, 66, cy - 10, 62, shade(cockatrice ? m.features.wingColour : c, -0.15)));
    top = Math.min(top, cy - 74);
    left = 10;
  }
  // Tail feathers (a cockatrice's is a lizard's), legs and talons.
  if (cockatrice) out.push(shape.path(`M${f(44)},${f(cy + 4)} Q${f(18)},${f(cy + 10)} ${f(10)},${f(FEET - 8)} Q${f(26)},${f(cy + 24)} ${f(48)},${f(cy + 16)} Z`, light));
  else out.push(shape.poly([[46, cy + 6], [20, cy + 30], [26, cy + 36], [52, cy + 18]], dark));
  for (const x of [56, 66]) out.push(strand(`M${f(x)},${f(cy + 20)} L${f(x + 2)},${f(FEET - 4)}`, PALETTE.ochre!, 2.4) + shape.poly([[x - 4, FEET], [x + 9, FEET], [x + 2, FEET - 5]], PALETTE.ochre!));
  // The body, a folded wing over it, the head.
  out.push(shape.ellipse(60, cy, owl ? 26 : 20, owl ? 32 : 28, c));
  if (owl) out.push(shape.ellipse(66, cy + 6, 14, 22, light));
  if (!spread) out.push(shape.path(`M${f(52)},${f(cy - 16)} Q${f(36)},${f(cy + 4)} ${f(40)},${f(cy + 30)} Q${f(56)},${f(cy + 18)} ${f(62)},${f(cy - 6)} Z`, dark));
  if (vulture) {
    // A bare head on a long neck, a ruff at its base.
    out.push(shape.path(`M${f(62)},${f(cy - 20)} Q${f(70)},${f(cy - 44)} ${f(80)},${f(cy - 50)} L${f(86)},${f(cy - 44)} Q${f(76)},${f(cy - 36)} ${f(72)},${f(cy - 16)} Z`, PALETTE['skin-light']!));
    out.push(shape.ellipse(66, cy - 20, 13, 7, light));
    out.push(shape.circle(84, cy - 52, 7, PALETTE['skin-light']!));
    out.push(shape.path(`M${f(88)},${f(cy - 56)} Q${f(98)},${f(cy - 54)} ${f(96)},${f(cy - 44)} L${f(89)},${f(cy - 48)} Z`, PALETTE.bone!));
    out.push(eye(m, 85, cy - 54, 1.4));
    return { art: out.join(''), top, left, right: 104 };
  }
  if (m.body === 'raven') {
    out.push(shape.circle(72, cy - 30, 11, c));
    out.push(shape.poly([[80, cy - 34], [98, cy - 28], [80, cy - 24]], shade(c, -0.2)));
    out.push(eye(m, 74, cy - 32, 1.5));
    return { art: out.join(''), top, left, right: 102 };
  }
  if (cockatrice) {
    out.push(shape.circle(72, cy - 30, 11, c));
    out.push(shape.path(`M${f(64)},${f(cy - 40)} q2,-8 6,-2 q2,-8 6,-1 q4,-6 5,3 Z`, PALETTE.crimson!));
    out.push(shape.poly([[80, cy - 32], [92, cy - 28], [80, cy - 24]], PALETTE.ochre!));
    out.push(shape.ellipse(80, cy - 18, 3, 5, PALETTE.crimson!));
    out.push(eye(m, 74, cy - 32, 1.5));
    return { art: out.join(''), top, left, right: 96 };
  }
  const h = sideHead(owl ? 'owl' : 'eagle', 70, cy - 34, owl ? 15 : 12, m, m.body === 'raptor' ? light : c);
  out.push(h.art);
  return { art: out.join(''), top: Math.min(top, h.top), left, right: h.right };
}

/** A tall running bird with a huge hatchet beak. */
function axeBeak(m: Mini): Drawn {
  const c = m.coat;
  const cy = FEET - 62;
  const out = [
    shape.poly([[36, cy - 4], [12, cy - 14], [16, cy + 4], [36, cy + 8]], shade(c, -0.3)),
    strand(`M${f(54)},${f(cy + 16)} L${f(48)},${f(FEET - 26)} L${f(56)},${f(FEET - 2)}`, PALETTE.ochre!, 3.4),
    strand(`M${f(64)},${f(cy + 16)} L${f(70)},${f(FEET - 26)} L${f(66)},${f(FEET - 2)}`, PALETTE.ochre!, 3.4),
    shape.ellipse(56, cy, 26, 22, c),
    shape.path(`M${f(64)},${f(cy - 10)} Q${f(68)},${f(cy - 40)} ${f(78)},${f(cy - 56)} L${f(88)},${f(cy - 52)} Q${f(78)},${f(cy - 36)} ${f(76)},${f(cy - 4)} Z`, c),
    shape.circle(84, cy - 60, 9, c),
    shape.path(`M${f(90)},${f(cy - 68)} L${f(112)},${f(cy - 66)} Q${f(116)},${f(cy - 54)} ${f(106)},${f(cy - 50)} L${f(90)},${f(cy - 54)} Z`, PALETTE.bone!),
    eye(m, 85, cy - 62, 1.6),
  ];
  return { art: out.join(''), top: cy - 72, left: 8, right: 118 };
}

/** A bat (or a stirge): face on, wings spread, on a post. */
function batlike(m: Mini): Drawn {
  const c = m.coat;
  const wing = shade(c, -0.15);
  const cy = 120;
  const stirge = m.body === 'stirge';
  const out: string[] = [flightPost(60, cy + 10)];
  for (const s of [-1, 1]) {
    const x = (d: number) => 60 + s * d;
    out.push(shape.path(`M${f(x(6))},${f(cy - 6)} L${f(x(24))},${f(cy - 26)} L${f(x(56))},${f(cy - 18)} Q${f(x(50))},${f(cy - 6)} ${f(x(54))},${f(cy + 4)} Q${f(x(42))},${f(cy - 2)} ${f(x(36))},${f(cy + 10)} Q${f(x(24))},${f(cy + 2)} ${f(x(16))},${f(cy + 12)} Q${f(x(10))},${f(cy + 6)} ${f(x(6))},${f(cy + 8)} Z`, wing));
    out.push(shape.detail(`M${f(x(10))},${f(cy - 4)} L${f(x(24))},${f(cy - 26)} M${f(x(22))},${f(cy - 22)} L${f(x(36))},${f(cy + 8)} M${f(x(30))},${f(cy - 22)} L${f(x(52))},${f(cy + 2)}`, shade(wing, -0.3), 1.4));
    if (stirge) out.push(strand(`M${f(x(4))},${f(cy + 8)} L${f(x(12))},${f(cy + 22)} L${f(x(10))},${f(cy + 32)}`, shade(c, -0.3), 1.6));
  }
  out.push(shape.ellipse(60, cy + 2, 9, 13, c));
  if (!stirge) for (const s of [-1, 1]) out.push(shape.poly([[60 + s * 3, cy - 14], [60 + s * 9, cy - 26], [60 + s * 9, cy - 12]], c));
  out.push(shape.circle(60, cy - 10, stirge ? 6 : 7, c));
  if (stirge) out.push(shape.poly([[58.5, cy - 6], [60, cy + 14], [61.5, cy - 6]], INK));
  out.push(eye(m, 57, cy - 11, 1.3) + eye(m, 63, cy - 11, 1.3));
  return { art: out.join(''), top: cy - 30, left: 2, right: 118 };
}

/** A pteranodon gliding: wings out to the sides, a long beak and a crest, on a post. */
function pteranodon(m: Mini): Drawn {
  const c = m.coat;
  const cy = 118;
  const out = [
    flightPost(58, cy + 8),
    shape.path(`M${f(44)},${f(cy)} L${f(-8)},${f(cy - 12)} L${f(28)},${f(cy + 14)} Z`, shade(c, -0.12)),
    shape.path(`M${f(70)},${f(cy)} L${f(124)},${f(cy - 14)} L${f(88)},${f(cy + 14)} Z`, shade(c, -0.12)),
    shape.ellipse(58, cy + 2, 16, 9, c),
    shape.path(`M${f(66)},${f(cy - 4)} L${f(74)},${f(cy - 16)} L${f(80)},${f(cy - 10)} Z`, c),
    shape.path(`M${f(74)},${f(cy - 16)} L${f(60)},${f(cy - 34)} L${f(78)},${f(cy - 20)} Z`, PALETTE.crimson!),
    shape.path(`M${f(78)},${f(cy - 16)} L${f(108)},${f(cy - 8)} L${f(78)},${f(cy - 10)} Z`, PALETTE.bone!),
    eye(m, 76, cy - 14, 1.3),
  ];
  return { art: out.join(''), top: cy - 36, left: -12, right: 128 };
}
