import type { Mini } from '../spec.js';
import type { Drawn } from './index.js';
import { f, FEET, INK, PALETTE, shade, shape } from './draw.js';
import { eye, flightPost, strand } from './parts.js';

/**
 * The shapeless and the strange: oozes and cubes, gibbering mouthers, otyughs, ropers, xorns,
 * cloakers, floating eyes; elementals of air, fire and water and will-o'-wisps; swarms; plants;
 * animated objects.
 */

export function blob(m: Mini): Drawn {
  const c = m.coat;
  const dark = shade(c, -0.3);
  const light = shade(c, 0.35);
  const out: string[] = [];
  switch (m.body) {
    case 'cube': {
      // A see-through cube with things caught inside.
      out.push(`<rect x="14" y="${FEET - 90}" width="92" height="90" rx="6" fill="${c}" fill-opacity="0.55"/>`);
      out.push(`<path d="M14,${FEET - 90} l14,-14 l92,0 l-14,14 Z M106,${FEET - 90} l14,-14 l0,90 l-14,14 Z" fill="${light}" fill-opacity="0.6"/>`);
      out.push(shape.circle(48, FEET - 40, 9, PALETTE.bone!) + shape.circle(45, FEET - 42, 2, INK) + shape.circle(51, FEET - 42, 2, INK));
      out.push(shape.rect(70, FEET - 64, 16, 4, PALETTE.steel!, 1) + shape.circle(80, FEET - 22, 5, PALETTE.gold!));
      return { art: out.join(''), top: FEET - 106, left: 12, right: 122 };
    }
    case 'mouther': {
      out.push(shape.path(`M${f(10)},${f(FEET)} Q${f(4)},${f(FEET - 50)} ${f(40)},${f(FEET - 66)} Q${f(70)},${f(FEET - 80)} ${f(96)},${f(FEET - 56)} Q${f(118)},${f(FEET - 30)} ${f(108)},${f(FEET)} Z`, c));
      for (const [x, y, r] of [[32, 160, 6], [56, 148, 7], [80, 158, 5], [46, 178, 5], [92, 178, 6], [70, 136, 4]] as const) out.push(shape.circle(x, y, r, PALETTE.white!) + shape.circle(x + 1, y, r * 0.45, INK));
      for (const [x, y] of [[62, 172], [28, 186], [86, 144]] as const) out.push(shape.ellipse(x, y, 7, 4, '#5a1820') + shape.detail(`M${f(x - 5)},${f(y)} l10,0`, PALETTE.bone!, 1.4));
      return { art: out.join(''), top: FEET - 82, left: 4, right: 116 };
    }
    case 'otyugh': {
      for (const dx of [-14, 18]) out.push(strand(`M${f(60 + dx)},${f(FEET - 60)} Q${f(60 + dx * 3)},${f(FEET - 110)} ${f(60 + dx * 2.6)},${f(FEET - 120)}`, c, 7));
      out.push(shape.rect(60 + 18 * 2.6 - 7, FEET - 128, 14, 10, dark, 4) + shape.rect(60 - 14 * 2.6 - 7, FEET - 128, 14, 10, dark, 4));
      for (const x of [34, 50, 70, 86]) out.push(shape.rect(x - 5, FEET - 30, 10, 30, dark, 4));
      out.push(shape.ellipse(60, FEET - 46, 44, 32, c));
      out.push(shape.path(`M${f(32)},${f(FEET - 40)} Q${f(60)},${f(FEET - 20)} ${f(88)},${f(FEET - 40)} Q${f(60)},${f(FEET - 30)} ${f(32)},${f(FEET - 40)} Z`, '#5a1820'));
      out.push(strand(`M${f(60)},${f(FEET - 74)} Q${f(56)},${f(FEET - 100)} ${f(68)},${f(FEET - 104)}`, c, 5) + shape.circle(68, FEET - 106, 6, PALETTE.white!) + shape.circle(69, FEET - 106, 2.6, INK));
      return { art: out.join(''), top: FEET - 132, left: 8, right: 116 };
    }
    case 'roper': {
      out.push(shape.path(`M${f(36)},${f(FEET)} Q${f(40)},${f(FEET - 80)} ${f(60)},${f(FEET - 128)} Q${f(80)},${f(FEET - 80)} ${f(84)},${f(FEET)} Z`, c));
      out.push(shape.detail(`M${f(46)},${f(FEET - 60)} l6,4 M${f(70)},${f(FEET - 40)} l-6,4 M${f(58)},${f(FEET - 90)} l4,6`, dark, 1.6));
      out.push(shape.circle(60, FEET - 88, 7, PALETTE.ochre!) + shape.circle(60, FEET - 88, 3, INK));
      out.push(shape.ellipse(60, FEET - 60, 10, 6, '#5a1820'));
      for (const s of [-1, 1]) out.push(strand(`M${f(60 + s * 12)},${f(FEET - 74)} Q${f(60 + s * 40)},${f(FEET - 86)} ${f(60 + s * 48)},${f(FEET - 40)} q${f(s * 2)},${f(10)} ${f(-s * 6)},${f(12)}`, light, 2));
      return { art: out.join(''), top: FEET - 132, left: 4, right: 116 };
    }
    case 'xorn': {
      for (const s of [-1, 1]) out.push(strand(`M${f(60 + s * 26)},${f(FEET - 60)} L${f(60 + s * 40)},${f(FEET - 40)} L${f(60 + s * 46)},${f(FEET - 58)}`, c, 5));
      for (const x of [42, 60, 78]) out.push(shape.rect(x - 6, FEET - 28, 12, 28, dark, 3));
      out.push(shape.path(`M${f(30)},${f(FEET - 24)} Q${f(26)},${f(FEET - 96)} ${f(60)},${f(FEET - 98)} Q${f(94)},${f(FEET - 96)} ${f(90)},${f(FEET - 24)} Z`, c));
      out.push(shape.ellipse(60, FEET - 96, 22, 7, '#5a1820'));
      for (let i = 0; i < 7; i++) out.push(shape.poly([[42 + i * 6, FEET - 99], [45 + i * 6, FEET - 92], [48 + i * 6, FEET - 99]], PALETTE.bone!));
      for (const x of [44, 60, 76]) out.push(eye(m, x, FEET - 74, 2.2));
      out.push(shape.detail(`M${f(40)},${f(FEET - 50)} l8,-6 M${f(70)},${f(FEET - 44)} l8,4`, dark, 1.6));
      return { art: out.join(''), top: FEET - 108, left: 8, right: 112 };
    }
    case 'cloak': {
      // A cloaker, a darkmantle or a rug: a cape of a creature, gliding on a post.
      out.push(flightPost(60, 132));
      out.push(shape.path(`M${f(60)},${f(84)} Q${f(30)},${f(86)} ${f(4)},${f(124)} Q${f(18)},${f(122)} ${f(22)},${f(136)} Q${f(34)},${f(126)} ${f(40)},${f(140)} Q${f(50)},${f(128)} ${f(60)},${f(142)} Q${f(70)},${f(128)} ${f(80)},${f(140)} Q${f(86)},${f(126)} ${f(98)},${f(136)} Q${f(102)},${f(122)} ${f(116)},${f(124)} Q${f(90)},${f(86)} ${f(60)},${f(84)} Z`, c));
      out.push(shape.detail(`M${f(60)},${f(90)} L${f(60)},${f(138)} M${f(46)},${f(94)} L${f(30)},${f(130)} M${f(74)},${f(94)} L${f(90)},${f(130)}`, dark, 1.6));
      out.push(eye(m, 52, 102, 2.2) + eye(m, 68, 102, 2.2));
      return { art: out.join(''), top: 80, left: 0, right: 120 };
    }
    case 'eye': {
      out.push(flightPost(60, 150));
      out.push(shape.circle(60, 120, 30, c));
      out.push(shape.circle(60, 118, 14, PALETTE.white!) + shape.circle(60, 118, 7, m.features.eyes === INK ? PALETTE.crimson! : m.features.eyes) + shape.circle(60, 118, 3, INK));
      return { art: out.join(''), top: 86, left: 26, right: 94 };
    }
    default: {
      // An ooze: a heap with a drip or two, a bubble, things half dissolved.
      out.push(shape.path(`M${f(8)},${f(FEET)} Q${f(4)},${f(FEET - 30)} ${f(28)},${f(FEET - 40)} Q${f(36)},${f(FEET - 62)} ${f(60)},${f(FEET - 58)} Q${f(88)},${f(FEET - 60)} ${f(94)},${f(FEET - 36)} Q${f(116)},${f(FEET - 30)} ${f(112)},${f(FEET)} Z`, c));
      out.push(`<path d="M${f(30)},${f(FEET - 34)} Q${f(44)},${f(FEET - 50)} ${f(60)},${f(FEET - 48)}" fill="none" stroke="${light}" stroke-width="3"/>`);
      out.push(shape.circle(84, FEET - 24, 5, light) + shape.circle(40, FEET - 16, 3, light));
      out.push(shape.circle(64, FEET - 30, 6, PALETTE.bone!) + shape.circle(62, FEET - 31, 1.4, INK) + shape.circle(66, FEET - 31, 1.4, INK));
      return { art: out.join(''), top: FEET - 64, left: 4, right: 116 };
    }
  }
}

export function elemental(m: Mini): Drawn {
  const c = m.coat;
  const light = shade(c, 0.35);
  const dark = shade(c, -0.25);
  const out: string[] = [];
  switch (m.body) {
    case 'fire': {
      // A body of flame with arms and a burning head.
      out.push(shape.path(`M${f(30)},${f(FEET)} Q${f(20)},${f(FEET - 60)} ${f(40)},${f(FEET - 100)} Q${f(36)},${f(FEET - 130)} ${f(56)},${f(FEET - 160)} Q${f(60)},${f(FEET - 130)} ${f(70)},${f(FEET - 150)} Q${f(90)},${f(FEET - 110)} ${f(80)},${f(FEET - 90)} Q${f(100)},${f(FEET - 60)} ${f(90)},${f(FEET)} Z`, '#f08c2a'));
      out.push(`<path d="M${f(42)},${f(FEET)} Q${f(36)},${f(FEET - 60)} ${f(50)},${f(FEET - 90)} Q${f(56)},${f(FEET - 60)} ${f(64)},${f(FEET - 96)} Q${f(80)},${f(FEET - 50)} ${f(78)},${f(FEET)} Z" fill="#ffd36b" stroke="none"/>`);
      for (const s of [-1, 1]) out.push(shape.path(`M${f(60 + s * 14)},${f(FEET - 96)} Q${f(60 + s * 44)},${f(FEET - 100)} ${f(60 + s * 50)},${f(FEET - 130)} Q${f(60 + s * 36)},${f(FEET - 104)} ${f(60 + s * 12)},${f(FEET - 84)} Z`, '#f08c2a'));
      out.push(eye(m, 54, FEET - 116, 2.4) + eye(m, 66, FEET - 116, 2.4));
      return { art: out.join(''), top: FEET - 164, left: 4, right: 116 };
    }
    case 'water': {
      // A rising wave with a face in its crest.
      out.push(shape.path(`M${f(10)},${f(FEET)} Q${f(16)},${f(FEET - 80)} ${f(48)},${f(FEET - 130)} Q${f(80)},${f(FEET - 160)} ${f(104)},${f(FEET - 128)} Q${f(86)},${f(FEET - 132)} ${f(80)},${f(FEET - 110)} Q${f(100)},${f(FEET - 60)} ${f(110)},${f(FEET)} Z`, c));
      out.push(`<path d="M${f(28)},${f(FEET - 40)} Q${f(40)},${f(FEET - 100)} ${f(62)},${f(FEET - 128)}" fill="none" stroke="${light}" stroke-width="4"/>`);
      out.push(eye(m, 64, FEET - 112, 2.4) + eye(m, 78, FEET - 112, 2.4));
      return { art: out.join(''), top: FEET - 156, left: 6, right: 114 };
    }
    case 'wisp': {
      out.push(flightPost(60, 132));
      out.push(`<circle cx="60" cy="110" r="22" fill="${m.features.eyes === INK ? '#cfe8ff' : m.features.eyes}" stroke="none" opacity="0.45"/>`);
      out.push(shape.circle(60, 110, 12, m.features.eyes === INK ? '#e8f6ff' : m.features.eyes));
      return { art: out.join(''), top: 86, left: 36, right: 84 };
    }
    default: {
      // Air: a whirlwind narrowing to the ground, with a face in it.
      const rings: string[] = [];
      for (let i = 0; i < 5; i++) {
        const y = FEET - 140 + i * 28;
        const w = 50 - i * 8;
        rings.push(shape.ellipse(60 + (i % 2 ? 4 : -4), y, w, 13, i % 2 ? c : light));
      }
      out.push(rings.join(''));
      out.push(shape.detail(`M${f(20)},${f(FEET - 140)} q20,6 40,0 M${f(30)},${f(FEET - 84)} q20,6 36,0`, dark, 1.6));
      out.push(eye(m, 52, FEET - 140, 2.2) + eye(m, 68, FEET - 140, 2.2));
      out.push(shape.poly([[52, FEET - 24], [60, FEET], [68, FEET - 24]], light));
      return { art: out.join(''), top: FEET - 156, left: 8, right: 112 };
    }
  }
}

/** A swarm: a cloud of small creatures over the ground, on a post. */
export function swarm(m: Mini): Drawn {
  const c = m.coat;
  const out: string[] = [];
  const spots: Array<[number, number, number]> = [[30, 120, 1], [56, 104, 1.1], [84, 116, 1], [42, 146, 0.9], [72, 140, 1.1], [98, 150, 0.8], [22, 162, 0.9], [58, 172, 1], [90, 182, 0.9], [36, 186, 0.8]];
  const ground = m.body === 'rats' || m.body === 'snakes' || m.body === 'claws' || m.body === 'insects';
  if (!ground && m.body !== 'piranhas') out.push(flightPost(60, 150));
  for (const [x, y, k] of spots) {
    const yy = ground ? FEET - 10 - (FEET - y) * 0.45 : y;
    switch (m.body) {
      case 'bats':
        out.push(shape.path(`M${f(x)},${f(yy)} l${f(-12 * k)},${f(-6 * k)} l${f(4 * k)},${f(6 * k)} l${f(-6 * k)},${f(2 * k)} Z M${f(x)},${f(yy)} l${f(12 * k)},${f(-6 * k)} l${f(-4 * k)},${f(6 * k)} l${f(6 * k)},${f(2 * k)} Z`, c) + shape.circle(x, yy, 3 * k, c));
        break;
      case 'ravens':
        out.push(shape.path(`M${f(x - 12 * k)},${f(yy - 4 * k)} Q${f(x)},${f(yy - 8 * k)} ${f(x + 12 * k)},${f(yy - 4 * k)} L${f(x)},${f(yy + 3 * k)} Z`, c));
        break;
      case 'piranhas':
        out.push(shape.path(`M${f(x - 10 * k)},${f(yy)} Q${f(x)},${f(yy - 9 * k)} ${f(x + 10 * k)},${f(yy)} Q${f(x)},${f(yy + 9 * k)} ${f(x - 10 * k)},${f(yy)} Z M${f(x - 10 * k)},${f(yy)} l${f(-5 * k)},${f(-5 * k)} l0,${f(10 * k)} Z`, c));
        break;
      case 'rats':
        out.push(shape.ellipse(x, yy, 9 * k, 5 * k, c) + shape.poly([[x + 8 * k, yy - 3 * k], [x + 14 * k, yy], [x + 8 * k, yy + 2 * k]], c) + strand(`M${f(x - 9 * k)},${f(yy)} q-6,0 -8,5`, c, 1));
        break;
      case 'snakes':
        out.push(strand(`M${f(x - 10 * k)},${f(yy + 3)} q5,-8 10,0 q5,8 10,0`, c, 3) + shape.circle(x + 11 * k, yy, 3, c));
        break;
      case 'claws':
        out.push(shape.ellipse(x, yy, 6 * k, 4 * k, PALETTE['skin-grey-green']!) + strand(`M${f(x + 4)},${f(yy - 2)} l6,-4 M${f(x + 4)},${f(yy)} l7,-1 M${f(x + 4)},${f(yy + 2)} l6,3`, PALETTE['skin-grey-green']!, 1.4));
        break;
      default:
        out.push(`<circle cx="${f(x)}" cy="${f(yy)}" r="${f(3 * k)}" fill="${c}" stroke="${INK}" stroke-width="1"/>`);
    }
  }
  if (m.body === 'piranhas') out.push(`<path d="M0,${FEET} L0,${FEET - 12} q8,-7 16,0 q8,7 16,0 q8,-7 16,0 q8,7 16,0 q8,-7 16,0 q8,7 16,0 q8,-7 16,0 q8,7 16,0 L120,${FEET} Z" fill="#3d7ea6"/>`);
  return { art: out.join(''), top: ground ? FEET - 64 : 92, left: 4, right: 116 };
}

export function plant(m: Mini): Drawn {
  const c = m.coat;
  const dark = shade(c, -0.3);
  const out: string[] = [];
  switch (m.body) {
    case 'shrub': {
      for (const [x, y, r] of [[38, 170, 20], [60, 152, 24], [84, 168, 20], [60, 180, 22]] as const) out.push(shape.circle(x, y, r, c));
      out.push(eye(m, 52, 156, 2.2) + eye(m, 66, 156, 2.2));
      out.push(strand(`M${f(42)},${f(FEET - 6)} L${f(36)},${f(FEET)} M${f(78)},${f(FEET - 6)} L${f(84)},${f(FEET)}`, PALETTE.brown!, 3));
      return { art: out.join(''), top: 126, left: 14, right: 106 };
    }
    case 'mound': {
      out.push(shape.path(`M${f(16)},${f(FEET)} Q${f(10)},${f(FEET - 80)} ${f(60)},${f(FEET - 100)} Q${f(110)},${f(FEET - 80)} ${f(104)},${f(FEET)} Z`, c));
      for (let i = 0; i < 7; i++) out.push(shape.detail(`M${f(22 + i * 12)},${f(FEET - 70 + (i % 2) * 10)} q-4,30 2,60`, dark, 2));
      out.push(eye(m, 50, FEET - 70, 2.2) + eye(m, 70, FEET - 70, 2.2));
      return { art: out.join(''), top: FEET - 104, left: 8, right: 112 };
    }
    case 'mushroom': {
      out.push(shape.path(`M${f(50)},${f(FEET)} L${f(52)},${f(FEET - 70)} L${f(68)},${f(FEET - 70)} L${f(70)},${f(FEET)} Z`, PALETTE.bone!));
      out.push(shape.path(`M${f(14)},${f(FEET - 66)} Q${f(20)},${f(FEET - 130)} ${f(60)},${f(FEET - 132)} Q${f(100)},${f(FEET - 130)} ${f(106)},${f(FEET - 66)} Z`, c));
      for (const [x, y] of [[38, 92], [62, 80], [84, 96], [52, 110]] as const) out.push(`<circle cx="${x}" cy="${y}" r="5" fill="${shade(c, 0.4)}" stroke="none"/>`);
      if (m.features.tail !== 'none') for (const s of [-1, 1]) out.push(strand(`M${f(60 + s * 8)},${f(FEET - 50)} Q${f(60 + s * 40)},${f(FEET - 50)} ${f(60 + s * 44)},${f(FEET - 16)}`, m.features.markingColour, 3));
      return { art: out.join(''), top: FEET - 136, left: 10, right: 110 };
    }
    default: {
      // A walking tree with a face in its bark.
      const bark = PALETTE.brown!;
      out.push(shape.path(`M${f(38)},${f(FEET)} L${f(44)},${f(FEET - 30)} L${f(46)},${f(FEET - 120)} L${f(74)},${f(FEET - 120)} L${f(76)},${f(FEET - 30)} L${f(84)},${f(FEET)} L${f(64)},${f(FEET - 20)} L${f(56)},${f(FEET - 20)} Z`, bark));
      for (const s of [-1, 1]) out.push(strand(`M${f(60 + s * 12)},${f(FEET - 100)} L${f(60 + s * 34)},${f(FEET - 120)} L${f(60 + s * 44)},${f(FEET - 140)}`, bark, 6));
      for (const [x, y, r] of [[34, 50, 22], [60, 34, 28], [88, 50, 22], [46, 66, 18], [76, 66, 18]] as const) out.push(shape.circle(x, y, r, c));
      out.push(shape.detail(`M${f(50)},${f(FEET - 90)} q4,4 8,0 M${f(62)},${f(FEET - 90)} q4,4 8,0 M${f(52)},${f(FEET - 70)} q8,6 16,0`, shade(bark, -0.4), 2));
      out.push(eye(m, 54, FEET - 92, 1.8) + eye(m, 66, FEET - 92, 1.8));
      return { art: out.join(''), top: 4, left: 10, right: 112 };
    }
  }
}

export function object(m: Mini): Drawn {
  const out: string[] = [];
  switch (m.body) {
    case 'chest': {
      // A mimic: a chest with a tongue and teeth.
      const wood = m.coat;
      out.push(shape.rect(20, FEET - 56, 80, 56, wood, 3));
      out.push(shape.path(`M${f(18)},${f(FEET - 60)} Q${f(20)},${f(FEET - 104)} ${f(60)},${f(FEET - 106)} Q${f(100)},${f(FEET - 104)} ${f(102)},${f(FEET - 60)} Z`, wood));
      out.push(shape.rect(18, FEET - 64, 84, 8, '#3a1418', 2));
      for (let i = 0; i < 9; i++) out.push(shape.poly([[22 + i * 9, FEET - 64], [26 + i * 9, FEET - 56], [30 + i * 9, FEET - 64]], PALETTE.bone!));
      out.push(shape.path(`M${f(56)},${f(FEET - 60)} Q${f(40)},${f(FEET - 30)} ${f(28)},${f(FEET - 20)} Q${f(48)},${f(FEET - 30)} ${f(64)},${f(FEET - 58)} Z`, PALETTE.crimson!));
      out.push(shape.rect(54, FEET - 52, 12, 14, PALETTE.gold!, 1));
      out.push(eye(m, 40, FEET - 82, 2.6) + eye(m, 80, FEET - 82, 2.6));
      return { art: out.join(''), top: FEET - 110, left: 14, right: 106 };
    }
    case 'rug': {
      // A rug rearing up off the floor, its fringe hanging, its pattern showing.
      const c = m.coat;
      out.push(shape.path(`M${f(14)},${f(FEET)} L${f(14)},${f(FEET - 20)} Q${f(10)},${f(FEET - 80)} ${f(40)},${f(FEET - 120)} L${f(96)},${f(FEET - 104)} Q${f(70)},${f(FEET - 64)} ${f(84)},${f(FEET - 20)} L${f(106)},${f(FEET)} Z`, c));
      out.push(shape.path(`M${f(30)},${f(FEET - 40)} Q${f(28)},${f(FEET - 80)} ${f(46)},${f(FEET - 104)} L${f(80)},${f(FEET - 94)} Q${f(62)},${f(FEET - 64)} ${f(70)},${f(FEET - 30)} Z`, shade(c, 0.3)));
      out.push(shape.poly([[42, FEET - 70], [52, FEET - 84], [62, FEET - 70], [52, FEET - 56]], PALETTE.gold!));
      const fringe: string[] = [];
      for (let i = 0; i < 8; i++) fringe.push(`M${f(42 + i * 7)},${f(FEET - 118 + i * 2)} l-2,-8`);
      out.push(shape.detail(fringe.join(' '), PALETTE.bone!, 1.8));
      return { art: out.join(''), top: FEET - 130, left: 8, right: 110 };
    }
    default: {
      out.push(flightPost(60, 170));
      out.push(shape.rect(56, 22, 8, 128, PALETTE.silver!, 1));
      out.push(shape.poly([[56, 22], [60, 8], [64, 22]], PALETTE.silver!));
      out.push(shape.rect(40, 148, 40, 7, PALETTE.gold!, 2));
      out.push(shape.rect(56, 155, 8, 18, PALETTE.brown!, 2) + shape.circle(60, 176, 5, PALETTE.gold!));
      return { art: out.join(''), top: 4, left: 36, right: 84 };
    }
  }
}
