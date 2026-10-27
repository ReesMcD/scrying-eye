import type { Mini } from '../spec.js';
import type { Drawn } from './index.js';
import { f, INK, PALETTE, shade, shape } from './draw.js';

/** A beast on four legs, side on: wolves, bears, boars, cats. */
export function beast(m: Mini): Drawn {
  const c = m.coat;
  const dark = shade(c, -0.3);
  const bodyY = 168;
  const out = [
    shape.path(`M${f(16)},${f(bodyY - 6)} Q${f(4)},${f(bodyY - 26)} ${f(2)},${f(bodyY - 14)}`, 'none'),
    shape.rect(26, bodyY + 4, 9, 28, dark, 3),
    shape.rect(80, bodyY + 4, 9, 28, dark, 3),
    shape.ellipse(58, bodyY, 40, 17, c),
    shape.rect(34, bodyY + 6, 9, 26, c, 3),
    shape.rect(70, bodyY + 6, 9, 26, c, 3),
    shape.path(`M${f(18)},${f(bodyY - 4)} Q${f(4)},${f(bodyY - 4)} ${f(6)},${f(bodyY - 22)} Q${f(14)},${f(bodyY - 12)} ${f(22)},${f(bodyY - 10)} Z`, c),
    shape.ellipse(98, bodyY - 18, 15, 13, c),
    shape.path(`M${f(106)},${f(bodyY - 22)} L${f(124)},${f(bodyY - 14)} Q${f(124)},${f(bodyY - 6)} ${f(108)},${f(bodyY - 8)} Z`, c),
    shape.poly([[90, bodyY - 28], [94, bodyY - 42], [100, bodyY - 29]], c),
    shape.circle(104, bodyY - 21, 1.8, INK),
    shape.circle(123, bodyY - 13, 2, INK),
  ];
  return { art: out.join(''), top: bodyY - 46, left: 0, right: 128 };
}

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
  return { art: out.join(''), top: y - 114, left: -10, right: 180 };
}
