import type { Mini } from '../spec.js';
import type { Drawn } from './index.js';
import { f, FEET, INK, PALETTE, shade, shape } from './draw.js';
import { strand, waves } from './parts.js';

/** A dragon, side on: wings up, neck raised, tail curling behind. Scales in its coat colour. */
export function dragon(m: Mini): Drawn {
  const c = m.coat;
  const dark = shade(c, -0.32);
  const belly = shade(c, 0.4);
  const wing = shade(c, -0.15);
  const y = 160;
  const horn = PALETTE.bone!;
  const out = [
    // Tail, then the far wing and far legs (darker, behind).
    shape.path(`M${f(52)},${f(y - 4)} Q${f(20)},${f(y + 2)} ${f(10)},${f(y - 20)} Q${f(6)},${f(y - 34)} ${f(-6)},${f(y - 30)} L${f(2)},${f(y - 22)} Q${f(4)},${f(y - 8)} ${f(30)},${f(y + 10)} Q${f(44)},${f(y + 14)} ${f(56)},${f(y + 10)} Z`, c),
    shape.path(`M${f(92)},${f(y - 14)} L${f(66)},${f(y - 92)} L${f(40)},${f(y - 70)} Q${f(52)},${f(y - 50)} ${f(48)},${f(y - 30)} Q${f(64)},${f(y - 36)} ${f(72)},${f(y - 20)} Z`, dark),
    shape.rect(56, y + 4, 11, 34, dark, 4),
    shape.rect(98, y + 4, 11, 34, dark, 4),
    // Body, belly, near legs with claws.
    shape.ellipse(82, y, 40, 19, c),
    shape.path(`M${f(52)},${f(y + 8)} Q${f(82)},${f(y + 24)} ${f(114)},${f(y + 6)} Q${f(84)},${f(y + 14)} ${f(52)},${f(y + 8)} Z`, belly),
    shape.rect(64, y + 6, 13, 34, c, 4),
    shape.rect(106, y + 4, 13, 35, c, 4),
    shape.poly([[62, y + 40], [66, y + 34], [70, y + 40]], horn),
    shape.poly([[104, y + 40], [108, y + 34], [112, y + 40]], horn),
    // Neck rising to the head.
    shape.path(`M${f(104)},${f(y - 14)} Q${f(128)},${f(y - 30)} ${f(128)},${f(y - 62)} L${f(144)},${f(y - 60)} Q${f(142)},${f(y - 20)} ${f(118)},${f(y + 2)} Z`, c),
    shape.path(`M${f(120)},${f(y - 6)} Q${f(136)},${f(y - 26)} ${f(136)},${f(y - 58)}`, 'none'),
    // Head: skull, snout, jaw, horns, eye.
    shape.poly([[130, y - 74], [124, y - 92], [138, y - 78]], horn),
    shape.poly([[138, y - 76], [140, y - 96], [146, y - 76]], horn),
    shape.path(`M${f(124)},${f(y - 66)} Q${f(130)},${f(y - 82)} ${f(148)},${f(y - 78)} L${f(172)},${f(y - 70)} Q${f(176)},${f(y - 64)} ${f(170)},${f(y - 60)} L${f(144)},${f(y - 56)} Q${f(128)},${f(y - 54)} ${f(124)},${f(y - 66)} Z`, c),
    shape.path(`M${f(146)},${f(y - 58)} L${f(168)},${f(y - 58)} Q${f(162)},${f(y - 50)} ${f(146)},${f(y - 52)} Z`, belly),
    shape.circle(144, y - 70, 2.6, '#f6d04d'),
    shape.circle(168, y - 67, 1.4, INK),
    // Near wing, raised: bones and a scalloped edge.
    shape.path(`M${f(98)},${f(y - 14)} L${f(78)},${f(y - 104)} L${f(124)},${f(y - 112)} Q${f(122)},${f(y - 92)} ${f(112)},${f(y - 84)} Q${f(110)},${f(y - 64)} ${f(98)},${f(y - 58)} Q${f(100)},${f(y - 38)} ${f(98)},${f(y - 14)} Z`, wing),
    shape.detail(`M${f(98)},${f(y - 14)} L${f(78)},${f(y - 104)} M${f(86)},${f(y - 70)} L${f(124)},${f(y - 112)} M${f(90)},${f(y - 52)} L${f(112)},${f(y - 84)}`, dark, 2),
  ];
  // Each colour's own head: a horn on the nose (blue), horns curling forward (black), a crest (green), a frill (white).
  if (m.features.horns === 'straight') out.push(shape.poly([[158, y - 74], [164, y - 92], [166, y - 72]], horn));
  if (m.features.horns === 'curved') out.push(shape.path(`M${f(128)},${f(y - 76)} Q${f(136)},${f(y - 104)} ${f(158)},${f(y - 96)} Q${f(142)},${f(y - 94)} ${f(136)},${f(y - 76)} Z`, horn));
  if (m.features.horns === 'swept') for (let i = 0; i < 5; i++) out.push(shape.poly([[118 + i * 3, y - 14 - i * 10], [108 + i * 3, y - 20 - i * 10], [116 + i * 3, y - 24 - i * 10]], dark));
  if (m.features.horns === 'ram') out.push(shape.path(`M${f(122)},${f(y - 60)} Q${f(110)},${f(y - 78)} ${f(118)},${f(y - 92)} Q${f(126)},${f(y - 76)} ${f(132)},${f(y - 66)} Z`, belly));
  return { art: out.join(''), top: y - 114, left: -10, right: 180 };
}

/** A wyvern: two legs, great wings, a barbed tail; a hydra: many necks; a dragon turtle: a shell. */
export function dragonKind(m: Mini): Drawn {
  if (m.body === 'wyvern') return wyvern(m);
  if (m.body === 'hydra') return hydra(m);
  if (m.body === 'turtle') return dragonTurtle(m);
  return dragon(m);
}

function wyvern(m: Mini): Drawn {
  const c = m.coat;
  const dark = shade(c, -0.32);
  const y = 150;
  const out = [
    shape.path(`M${f(50)},${f(y + 4)} Q${f(10)},${f(y + 20)} ${f(0)},${f(y - 6)} Q${f(-8)},${f(y - 22)} ${f(-16)},${f(y - 18)} L${f(-6)},${f(y - 4)} Q${f(4)},${f(y + 30)} ${f(54)},${f(y + 16)} Z`, c),
    shape.poly([[-16, y - 18], [-28, y - 30], [-8, y - 24]], PALETTE.bone!),
    shape.path(`M${f(84)},${f(y - 10)} L${f(52)},${f(y - 104)} L${f(8)},${f(y - 70)} Q${f(26)},${f(y - 56)} ${f(26)},${f(y - 36)} Q${f(48)},${f(y - 42)} ${f(60)},${f(y - 20)} Z`, dark),
    shape.rect(64, y + 10, 12, 42, dark, 4),
    shape.ellipse(74, y, 34, 18, c),
    shape.rect(74, y + 10, 13, 42, c, 4),
    shape.poly([[72, FEET], [80, FEET - 6], [90, FEET]], PALETTE.bone!),
    shape.path(`M${f(96)},${f(y - 10)} Q${f(116)},${f(y - 26)} ${f(116)},${f(y - 54)} L${f(130)},${f(y - 52)} Q${f(128)},${f(y - 18)} ${f(104)},${f(y + 6)} Z`, c),
    shape.path(`M${f(112)},${f(y - 58)} Q${f(118)},${f(y - 74)} ${f(136)},${f(y - 70)} L${f(156)},${f(y - 62)} Q${f(158)},${f(y - 54)} ${f(150)},${f(y - 52)} L${f(128)},${f(y - 48)} Q${f(114)},${f(y - 46)} ${f(112)},${f(y - 58)} Z`, c),
    shape.poly([[120, y - 68], [112, y - 84], [128, y - 70]], PALETTE.bone!),
    shape.circle(132, y - 62, 2.4, '#f6d04d'),
    shape.path(`M${f(92)},${f(y - 12)} L${f(80)},${f(y - 118)} L${f(132)},${f(y - 110)} Q${f(124)},${f(y - 88)} ${f(116)},${f(y - 80)} Q${f(112)},${f(y - 58)} ${f(100)},${f(y - 50)} Z`, shade(c, -0.12)),
    shape.detail(`M${f(92)},${f(y - 12)} L${f(80)},${f(y - 118)} M${f(86)},${f(y - 80)} L${f(132)},${f(y - 110)}`, dark, 2),
  ];
  return { art: out.join(''), top: y - 122, left: -32, right: 162 };
}

function hydra(m: Mini): Drawn {
  const c = m.coat;
  const dark = shade(c, -0.3);
  const belly = shade(c, 0.35);
  const y = 166;
  const heads = Math.max(3, m.heads);
  const out = [
    shape.path(`M${f(30)},${f(y)} Q${f(0)},${f(y + 8)} ${f(-10)},${f(y + 28)} Q${f(14)},${f(y + 24)} ${f(34)},${f(y + 16)} Z`, c),
    shape.rect(36, y + 8, 12, 26, dark, 4),
    shape.rect(84, y + 8, 12, 26, dark, 4),
    shape.ellipse(64, y, 40, 20, c),
    shape.path(`M${f(34)},${f(y + 8)} Q${f(64)},${f(y + 24)} ${f(96)},${f(y + 8)} Q${f(64)},${f(y + 16)} ${f(34)},${f(y + 8)} Z`, belly),
    shape.rect(44, y + 10, 13, 24, c, 4),
    shape.rect(92, y + 8, 13, 26, c, 4),
  ];
  let top = y;
  for (let i = 0; i < heads; i++) {
    const t = heads === 1 ? 0.5 : i / (heads - 1);
    const bx = 48 + t * 50;
    const hx = 20 + t * 110;
    const hy = y - 70 - Math.sin(t * Math.PI) * 30;
    out.push(strand(`M${f(bx)},${f(y - 12)} Q${f((bx + hx) / 2)},${f(y - 30)} ${f(hx)},${f(hy + 6)}`, c, 9));
    out.push(shape.path(`M${f(hx - 8)},${f(hy - 6)} Q${f(hx + 2)},${f(hy - 12)} ${f(hx + 18)},${f(hy - 2)} L${f(hx + 18)},${f(hy + 4)} L${f(hx - 6)},${f(hy + 8)} Z`, c));
    out.push(shape.circle(hx + 2, hy - 4, 1.6, '#f6d04d'));
    top = Math.min(top, hy - 14);
  }
  return { art: out.join(''), top, left: -14, right: 152 };
}

function dragonTurtle(m: Mini): Drawn {
  const c = m.coat;
  const shell = shade(c, -0.25);
  const y = FEET - 34;
  const out = [
    shape.path(`M${f(14)},${f(y + 10)} L${f(-4)},${f(FEET - 10)} L${f(24)},${f(FEET - 12)} Z`, c),
    shape.path(`M${f(92)},${f(y + 2)} Q${f(112)},${f(y - 28)} ${f(110)},${f(y - 52)} L${f(124)},${f(y - 50)} Q${f(126)},${f(y - 16)} ${f(100)},${f(y + 14)} Z`, c),
    shape.path(`M${f(104)},${f(y - 58)} Q${f(110)},${f(y - 72)} ${f(128)},${f(y - 68)} L${f(146)},${f(y - 60)} Q${f(148)},${f(y - 52)} ${f(140)},${f(y - 50)} L${f(120)},${f(y - 46)} Q${f(106)},${f(y - 44)} ${f(104)},${f(y - 58)} Z`, c),
    shape.poly([[112, y - 66], [104, y - 80], [120, y - 68]], PALETTE.bone!),
    shape.circle(124, y - 61, 2.2, '#f6d04d'),
    shape.path(`M${f(6)},${f(y + 14)} Q${f(14)},${f(y - 50)} ${f(56)},${f(y - 56)} Q${f(98)},${f(y - 50)} ${f(104)},${f(y + 14)} Z`, shell),
  ];
  for (let i = 0; i < 5; i++) out.push(shape.poly([[24 + i * 16, y - 34 - (i === 2 ? 14 : i % 2 ? 10 : 4)], [30 + i * 16, y - 54 - (i === 2 ? 12 : i % 2 ? 8 : 0)], [36 + i * 16, y - 34 - (i === 2 ? 14 : i % 2 ? 10 : 4)]], PALETTE.bone!));
  out.push(shape.detail(`M${f(30)},${f(y - 30)} L${f(26)},${f(y + 8)} M${f(56)},${f(y - 40)} L${f(56)},${f(y + 8)} M${f(80)},${f(y - 30)} L${f(86)},${f(y + 8)}`, shade(shell, -0.35), 2));
  out.push(waves(-10, 130));
  return { art: out.join(''), top: y - 76, left: -12, right: 150 };
}
