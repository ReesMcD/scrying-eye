import type { Mini } from '../spec.js';
import type { Drawn } from './index.js';
import { proportionsOf } from '../style.js';
import { CX, f, FEET, INK, PALETTE, shade, shape } from './draw.js';

/** Where everything on a humanoid hangs, from its proportions. */
function skeletonOf(m: Mini) {
  const p = proportionsOf(m);
  const top = FEET - p.height;
  const head = { x: CX, y: top + p.head, r: p.head };
  const sy = top + p.head * 2 + 1;
  const hip = FEET - p.height * p.legs;
  const sw = p.width / 2;
  const armW = Math.max(6, sw * 0.34) * (m.ancestry === 'skeleton' ? 0.6 : 1);
  const armLen = hip - sy + 4;
  const tilt = 0.14;
  const rightHand = { x: CX + sw + Math.sin(tilt) * armLen - armW * 0.1, y: sy + Math.cos(tilt) * armLen };
  const leftHand = { x: CX - sw - Math.sin(tilt) * armLen + armW * 0.1, y: sy + Math.cos(tilt) * armLen };
  return { p, top, head, sy, hip, sw, armW, armLen, tilt, rightHand, leftHand };
}

type Bones = ReturnType<typeof skeletonOf>;

function cloakBack(m: Mini, b: Bones): string {
  if (!m.cloak) return '';
  const w = b.sw * 1.25;
  return shape.poly([[CX - b.sw * 0.9, b.sy - 2], [CX + b.sw * 0.9, b.sy - 2], [CX + w + 6, FEET - 8], [CX - w - 6, FEET - 8]], shade(m.cloak, -0.15));
}

function hairBack(m: Mini, b: Bones): string {
  const { x, y, r } = b.head;
  if (m.hair.style === 'long' || m.hair.style === 'wild') return shape.path(`M${f(x - r * 1.05)},${f(y - r * 0.2)} Q${f(x - r * 1.25)},${f(y + r * 2.2)} ${f(x - r * 0.4)},${f(y + r * 2.4)} L${f(x + r * 0.4)},${f(y + r * 2.4)} Q${f(x + r * 1.25)},${f(y + r * 2.2)} ${f(x + r * 1.05)},${f(y - r * 0.2)} Z`, m.hair.colour);
  return '';
}

function legs(m: Mini, b: Bones): string {
  const thin = m.ancestry === 'skeleton';
  const w = b.sw * (thin ? 0.32 : 0.52);
  const legColour = m.ancestry === 'skeleton' ? m.skin : m.outfit.kind === 'plate' ? PALETTE.steel! : m.outfit.kind === 'chain' ? PALETTE.iron! : shade(m.outfit.colour, -0.45);
  const boot = m.ancestry === 'skeleton' ? m.skin : PALETTE.brown!;
  const len = FEET - b.hip;
  const out: string[] = [];
  for (const side of [-1, 1]) {
    const x = side < 0 ? CX - b.sw * 0.08 - w : CX + b.sw * 0.08;
    out.push(shape.rect(x, b.hip - 2, w, len - len * 0.18 + 2, legColour, 1));
    out.push(shape.rect(x - (side < 0 ? 2 : 0), FEET - len * 0.2, w + 2, len * 0.2, boot, 2));
  }
  return out.join('');
}

function torso(m: Mini, b: Bones): string {
  const { sw, sy, hip } = b;
  const kind = m.outfit.kind;
  const hem = kind === 'robe' ? FEET - 6 : kind === 'rags' ? hip + (FEET - hip) * 0.35 : hip + (FEET - hip) * 0.18;
  const flare = kind === 'robe' ? 1.25 : kind === 'leather' ? 0.95 : 1.05;
  const fill = kind === 'plate' ? PALETTE.steel! : kind === 'chain' ? PALETTE.iron! : m.outfit.colour;
  const out: string[] = [];
  if (kind === 'rags') {
    // A torn hem: zigzag across the bottom.
    const pts: Array<[number, number]> = [[CX - sw, sy], [CX + sw, sy], [CX + sw * flare, hem]];
    for (let i = 1; i < 6; i++) pts.push([CX + sw * flare - (i * 2 * sw * flare) / 6, hem + (i % 2 ? 7 : 0)]);
    pts.push([CX - sw * flare, hem]);
    out.push(shape.poly(pts, fill));
  } else out.push(shape.poly([[CX - sw, sy], [CX + sw, sy], [CX + sw * flare, hem], [CX - sw * flare, hem]], fill));
  if (kind === 'plate') {
    out.push(shape.detail(`M${f(CX)},${f(sy + 3)} L${f(CX)},${f(hip - 2)}`, shade(fill, -0.3)));
    out.push(shape.poly([[CX - sw * 0.7, sy + 4], [CX - sw * 0.2, sy + 4], [CX - sw * 0.35, sy + (hip - sy) * 0.45]], shade(fill, 0.35)));
  }
  if (kind === 'chain') for (let y = sy + 5; y < hem - 2; y += 5) out.push(shape.detail(`M${f(CX - sw * 0.8)},${f(y)} L${f(CX + sw * 0.8)},${f(y)}`, shade(fill, -0.3), 1.1));
  if (kind === 'leather') out.push(shape.detail(`M${f(CX - sw * 0.5)},${f(sy + 4)} L${f(CX + sw * 0.4)},${f(hip - 6)}`, shade(fill, -0.35), 2.2));
  if (kind === 'robe') out.push(shape.rect(CX - 3, sy + 2, 6, FEET - 8 - sy, m.outfit.trim, 1));
  // The belt, with a buckle in the trim colour.
  if (kind !== 'rags') {
    out.push(shape.rect(CX - sw * 1.0, hip - 6, sw * 2.0, 6, PALETTE.brown!, 1));
    out.push(shape.rect(CX - 3.5, hip - 7, 7, 8, m.outfit.trim, 1));
  }
  if (m.ancestry === 'skeleton') for (let i = 0; i < 4; i++) out.push(shape.detail(`M${f(CX - sw * 0.6)},${f(sy + 6 + i * 6)} Q${f(CX)},${f(sy + 9 + i * 6)} ${f(CX + sw * 0.6)},${f(sy + 6 + i * 6)}`, PALETTE.bone!, 2.2));
  return out.join('');
}

function arms(m: Mini, b: Bones): string {
  const sleeve = m.ancestry === 'skeleton' ? m.skin : m.outfit.kind === 'plate' ? PALETTE.steel! : m.outfit.kind === 'chain' ? PALETTE.iron! : shade(m.outfit.colour, -0.08);
  const out: string[] = [];
  for (const side of [-1, 1]) {
    const sx = CX + side * (b.sw - b.armW * 0.45);
    const angle = (side * b.tilt * 180) / Math.PI;
    out.push(`<g transform="rotate(${f(-angle)} ${f(sx)} ${f(b.sy + 2)})">${shape.rect(sx - b.armW / 2, b.sy, b.armW, b.armLen, sleeve, b.armW / 2)}</g>`);
    const hand = side > 0 ? b.rightHand : b.leftHand;
    out.push(shape.circle(hand.x, hand.y, b.armW * 0.55, m.skin));
  }
  return out.join('');
}

function head(m: Mini, b: Bones): string {
  const { x, y, r } = b.head;
  const out: string[] = [];
  const pointy = m.ancestry === 'elf' || m.ancestry === 'goblin' || m.ancestry === 'gnome' || m.ancestry === 'tiefling';
  if (pointy) {
    const reach = m.ancestry === 'goblin' ? r * 1.2 : m.ancestry === 'elf' ? r * 0.9 : r * 0.55;
    for (const s of [-1, 1]) out.push(shape.poly([[x + s * r * 0.8, y - r * 0.25], [x + s * (r * 0.8 + reach), y - r * (m.ancestry === 'goblin' ? 0.35 : 0.9)], [x + s * r * 0.85, y + r * 0.3]], m.skin));
  }
  if (m.ancestry === 'dragonborn') {
    // A long head with a snout to the right, a frill behind.
    out.push(shape.poly([[x - r * 0.9, y - r * 0.6], [x - r * 1.5, y - r * 1.2], [x - r * 1.05, y + r * 0.1]], shade(m.skin, -0.25)));
    out.push(shape.ellipse(x, y, r * 1.0, r * 1.05, m.skin));
    out.push(shape.path(`M${f(x + r * 0.5)},${f(y - r * 0.35)} L${f(x + r * 1.75)},${f(y + r * 0.05)} Q${f(x + r * 1.85)},${f(y + r * 0.45)} ${f(x + r * 1.5)},${f(y + r * 0.55)} L${f(x + r * 0.4)},${f(y + r * 0.7)} Z`, m.skin));
    out.push(shape.circle(x + r * 1.55, y + r * 0.12, 1.3, INK));
    out.push(shape.ellipse(x + r * 0.35, y - r * 0.15, 2.4, 1.6, PALETTE.gold!));
    for (let i = 0; i < 3; i++) out.push(shape.detail(`M${f(x - r * 0.6 + i * 4)},${f(y + r * 0.45)} l3,-2`, shade(m.skin, -0.3), 1.2));
    return out.join('');
  }
  out.push(shape.circle(x, y, r, m.skin));
  if (m.ancestry === 'skeleton') {
    out.push(shape.circle(x - r * 0.38, y - r * 0.05, r * 0.28, INK));
    out.push(shape.circle(x + r * 0.38, y - r * 0.05, r * 0.28, INK));
    out.push(shape.poly([[x, y + r * 0.2], [x - r * 0.12, y + r * 0.42], [x + r * 0.12, y + r * 0.42]], INK));
    out.push(shape.detail(`M${f(x - r * 0.45)},${f(y + r * 0.62)} L${f(x + r * 0.45)},${f(y + r * 0.62)} M${f(x - r * 0.2)},${f(y + r * 0.52)} l0,${f(r * 0.2)} M${f(x + r * 0.2)},${f(y + r * 0.52)} l0,${f(r * 0.2)}`, INK, 1.2));
    return out.join('');
  }
  // Eyes; a big nose on gnomes and goblins; tusks on half-orcs.
  out.push(shape.circle(x - r * 0.36, y - r * 0.02, Math.max(1.3, r * 0.11), INK));
  out.push(shape.circle(x + r * 0.36, y - r * 0.02, Math.max(1.3, r * 0.11), INK));
  if (m.ancestry === 'gnome' || m.ancestry === 'goblin') out.push(shape.ellipse(x, y + r * 0.28, r * 0.22, r * 0.3, shade(m.skin, -0.12)));
  if (m.ancestry === 'half-orc') for (const s of [-1, 1]) out.push(shape.poly([[x + s * r * 0.3, y + r * 0.62], [x + s * r * 0.42, y + r * 0.25], [x + s * r * 0.48, y + r * 0.62]], PALETTE.bone!));
  return out.join('');
}

function hairFront(m: Mini, b: Bones): string {
  const { x, y, r } = b.head;
  const c = m.hair.colour;
  const style = m.hair.style;
  if (style === 'none' || m.headgear === 'great-helm') return '';
  const out: string[] = [];
  // A cap of hair over the top of the head.
  const cap = `M${f(x - r * 1.02)},${f(y - r * 0.05)} Q${f(x - r * 1.05)},${f(y - r * 1.15)} ${f(x)},${f(y - r * 1.12)} Q${f(x + r * 1.05)},${f(y - r * 1.15)} ${f(x + r * 1.02)},${f(y - r * 0.05)} Q${f(x + r * 0.5)},${f(y - r * 0.6)} ${f(x)},${f(y - r * 0.55)} Q${f(x - r * 0.5)},${f(y - r * 0.6)} ${f(x - r * 1.02)},${f(y - r * 0.05)} Z`;
  if (style === 'wild') {
    // Curly puffs round the crown, rounded so it never reads as a crown.
    for (let i = 0; i <= 6; i++) {
      const a = Math.PI * 1.05 + (i / 6) * Math.PI * 0.9;
      out.push(shape.circle(x + Math.cos(a) * r * 0.98, y + Math.sin(a) * r * 0.98, r * 0.42, c));
    }
    out.push(shape.path(cap, c));
  } else out.push(shape.path(cap, c));
  if (style === 'topknot') out.push(shape.circle(x, y - r * 1.25, r * 0.38, c));
  if (style === 'braids') for (const s of [-1, 1]) out.push(shape.rect(x + s * r * 0.95 - 2.5, y - r * 0.1, 5, r * 1.9, c, 2.5));
  return out.join('');
}

function beard(m: Mini, b: Bones): string {
  if (m.beard === 'none') return '';
  const { x, y, r } = b.head;
  const c = m.hair.colour;
  if (m.beard === 'short') return shape.path(`M${f(x - r * 0.85)},${f(y + r * 0.1)} Q${f(x)},${f(y + r * 1.45)} ${f(x + r * 0.85)},${f(y + r * 0.1)} Q${f(x)},${f(y + r * 0.75)} ${f(x - r * 0.85)},${f(y + r * 0.1)} Z`, c);
  if (m.beard === 'forked') return shape.path(`M${f(x - r * 0.9)},${f(y + r * 0.1)} L${f(x - r * 0.45)},${f(y + r * 2.1)} L${f(x)},${f(y + r * 1.2)} L${f(x + r * 0.45)},${f(y + r * 2.1)} L${f(x + r * 0.9)},${f(y + r * 0.1)} Q${f(x)},${f(y + r * 0.75)} ${f(x - r * 0.9)},${f(y + r * 0.1)} Z`, c);
  return shape.path(`M${f(x - r * 0.95)},${f(y + r * 0.05)} Q${f(x - r * 0.7)},${f(y + r * 2.2)} ${f(x)},${f(y + r * 2.5)} Q${f(x + r * 0.7)},${f(y + r * 2.2)} ${f(x + r * 0.95)},${f(y + r * 0.05)} Q${f(x)},${f(y + r * 0.75)} ${f(x - r * 0.95)},${f(y + r * 0.05)} Z`, c);
}

function headgear(m: Mini, b: Bones): string {
  const { x, y, r } = b.head;
  const metal = PALETTE.steel!;
  switch (m.headgear) {
    case 'hood': {
      const c = m.cloak ?? m.outfit.colour;
      return shape.path(`M${f(x - r * 1.3)},${f(y + r * 0.9)} Q${f(x - r * 1.45)},${f(y - r * 1.6)} ${f(x)},${f(y - r * 1.45)} Q${f(x + r * 1.45)},${f(y - r * 1.6)} ${f(x + r * 1.3)},${f(y + r * 0.9)} L${f(x + r * 0.85)},${f(y + r * 0.75)} Q${f(x + r * 0.9)},${f(y - r * 0.85)} ${f(x)},${f(y - r * 0.85)} Q${f(x - r * 0.9)},${f(y - r * 0.85)} ${f(x - r * 0.85)},${f(y + r * 0.75)} Z`, c);
    }
    case 'helm':
      return shape.path(`M${f(x - r * 1.08)},${f(y - r * 0.05)} Q${f(x - r * 1.1)},${f(y - r * 1.25)} ${f(x)},${f(y - r * 1.25)} Q${f(x + r * 1.1)},${f(y - r * 1.25)} ${f(x + r * 1.08)},${f(y - r * 0.05)} Z`, metal) + shape.rect(x - 1.8, y - r * 0.3, 3.6, r * 0.75, metal, 1);
    case 'great-helm':
      return shape.rect(x - r * 1.08, y - r * 1.2, r * 2.16, r * 2.25, metal, r * 0.5) + shape.rect(x - r * 0.75, y - r * 0.18, r * 1.5, 2.6, INK, 1) + shape.detail(`M${f(x)},${f(y + r * 0.3)} L${f(x)},${f(y + r * 0.9)}`, INK, 1.4);
    case 'wizard-hat': {
      const c = m.cloak ?? m.outfit.colour;
      return shape.ellipse(x, y - r * 0.7, r * 1.6, r * 0.35, c) + shape.path(`M${f(x - r * 0.95)},${f(y - r * 0.75)} L${f(x + r * 0.3)},${f(y - r * 3.6)} Q${f(x + r * 1.1)},${f(y - r * 3.4)} ${f(x + r * 1.3)},${f(y - r * 2.9)} L${f(x + r * 0.6)},${f(y - r * 2.6)} L${f(x + r * 0.95)},${f(y - r * 0.75)} Z`, c) + shape.rect(x - r * 0.95, y - r * 1.05, r * 1.9, r * 0.32, m.outfit.trim, 1);
    }
    case 'circlet':
      return shape.rect(x - r * 0.98, y - r * 0.62, r * 1.96, 3, PALETTE.gold!, 1) + shape.circle(x, y - r * 0.55, 2.4, PALETTE.sky!);
    case 'crown':
      return shape.poly([[x - r * 0.95, y - r * 0.55], [x - r * 0.95, y - r * 1.35], [x - r * 0.45, y - r * 0.95], [x, y - r * 1.55], [x + r * 0.45, y - r * 0.95], [x + r * 0.95, y - r * 1.35], [x + r * 0.95, y - r * 0.55]], PALETTE.gold!);
    default:
      return '';
  }
}

function horns(m: Mini, b: Bones): string {
  if (m.ancestry !== 'tiefling') return '';
  const { x, y, r } = b.head;
  const c = shade(m.skin, -0.55);
  return [-1, 1].map((s) => shape.path(`M${f(x + s * r * 0.45)},${f(y - r * 0.75)} Q${f(x + s * r * 1.3)},${f(y - r * 1.6)} ${f(x + s * r * 0.95)},${f(y - r * 2.15)} Q${f(x + s * r * 0.85)},${f(y - r * 1.4)} ${f(x + s * r * 0.15)},${f(y - r * 0.9)} Z`, c)).join('');
}

/** What the right hand holds. Returns the art and how far over the head it reaches (for the view box). */
function weapon(m: Mini, b: Bones): { art: string; reach: number } {
  const { x, y } = b.rightHand;
  const H = b.p.height;
  const steel = PALETTE.silver!;
  const wood = PALETTE.brown!;
  switch (m.weapon) {
    case 'sword': {
      const len = H * 0.42;
      return { art: shape.rect(x - 2.5, y - len, 5, len - 4, steel, 1) + shape.rect(x - 8, y - 6, 16, 4, PALETTE.bronze!, 1) + shape.circle(x, y + 4, 3, PALETTE.bronze!), reach: 0 };
    }
    case 'greatsword': {
      const len = H * 0.68;
      return { art: shape.rect(x - 3.5, y - len, 7, len - 5, steel, 1) + shape.rect(x - 11, y - 8, 22, 5, PALETTE.bronze!, 1) + shape.rect(x - 2, y - 3, 4, 10, wood, 1), reach: Math.max(0, len - (y - b.top)) };
    }
    case 'axe': {
      const len = H * 0.42;
      return { art: shape.rect(x - 2, y - len, 4, len + 6, wood, 1) + shape.path(`M${f(x + 2)},${f(y - len + 2)} Q${f(x + 16)},${f(y - len - 4)} ${f(x + 15)},${f(y - len + 16)} Q${f(x + 10)},${f(y - len + 11)} ${f(x + 2)},${f(y - len + 13)} Z`, steel), reach: 0 };
    }
    case 'warhammer': {
      const len = H * 0.46;
      return { art: shape.rect(x - 2, y - len, 4, len + 6, wood, 1) + shape.rect(x - 9, y - len - 4, 18, 11, PALETTE.iron!, 1.5), reach: 0 };
    }
    case 'club': {
      // A greatclub: a knotted log, wider at the head.
      const len = H * 0.42;
      return { art: shape.path(`M${f(x - 2.5)},${f(y + 6)} L${f(x - 7)},${f(y - len)} Q${f(x)},${f(y - len - 9)} ${f(x + 7)},${f(y - len)} L${f(x + 2.5)},${f(y + 6)} Z`, PALETTE.brown!) + shape.detail(`M${f(x - 3)},${f(y - len * 0.6)} l4,-2 M${f(x + 1)},${f(y - len * 0.8)} l3,2`, shade(PALETTE.brown!, -0.4)), reach: 0 };
    }
    case 'mace': {
      const len = H * 0.3;
      const spikes: string[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        spikes.push(shape.poly([[x + Math.cos(a) * 6, y - len + Math.sin(a) * 6], [x + Math.cos(a + 0.3) * 10, y - len + Math.sin(a + 0.3) * 10], [x + Math.cos(a + 0.6) * 6, y - len + Math.sin(a + 0.6) * 6]], PALETTE.iron!));
      }
      return { art: shape.rect(x - 2, y - len, 4, len + 6, wood, 1) + spikes.join('') + shape.circle(x, y - len, 7, PALETTE.iron!), reach: 0 };
    }
    case 'spear': {
      const top = b.top - 16;
      return { art: shape.rect(x - 1.8, top, 3.6, FEET - 6 - top, wood, 1) + shape.path(`M${f(x)},${f(top - 14)} Q${f(x + 6)},${f(top - 4)} ${f(x)},${f(top + 4)} Q${f(x - 6)},${f(top - 4)} ${f(x)},${f(top - 14)} Z`, steel), reach: 30 };
    }
    case 'staff': {
      const top = b.top - 8;
      return { art: shape.rect(x - 2.2, top, 4.4, FEET - 4 - top, wood, 2) + shape.circle(x, top - 2, 6, '#7fe0c0') + shape.circle(x - 1.5, top - 3.5, 1.8, '#e8fff8'), reach: 16 };
    }
    case 'bow': {
      const h = H * 0.62;
      return { art: shape.path(`M${f(x - 2)},${f(y - h * 0.55)} Q${f(x + 16)},${f(y)} ${f(x - 2)},${f(y + h * 0.45)} Q${f(x + 10)},${f(y)} ${f(x - 2)},${f(y - h * 0.55)} Z`, wood) + shape.line(x - 2, y - h * 0.55, x - 2, y + h * 0.45, 1, INK), reach: 0 };
    }
    case 'crossbow':
      return { art: shape.rect(x - 4, y - 20, 22, 6, wood, 1.5) + shape.path(`M${f(x + 14)},${f(y - 30)} Q${f(x + 22)},${f(y - 17)} ${f(x + 14)},${f(y - 4)}`, 'none'), reach: 0 };
    case 'daggers':
      return { art: dagger(x, y) + (m.offhand === 'none' ? dagger(b.leftHand.x, b.leftHand.y) : ''), reach: 0 };
    case 'wand':
      return { art: shape.rect(x - 1.5, y - 20, 3, 22, PALETTE.black!, 1) + shape.circle(x, y - 22, 3, '#ffe08a'), reach: 0 };
    default:
      return { art: '', reach: 0 };
  }
}

function dagger(x: number, y: number): string {
  return shape.poly([[x - 2.2, y - 3], [x, y - 22], [x + 2.2, y - 3]], PALETTE.silver!) + shape.rect(x - 5, y - 4, 10, 3, PALETTE.bronze!, 1);
}

function offhand(m: Mini, b: Bones): string {
  const { x, y } = b.leftHand;
  const r = Math.max(9, b.sw * 0.62);
  switch (m.offhand) {
    case 'shield':
      return shape.circle(x - 2, y - r * 0.6, r, m.outfit.trim === PALETTE.ochre ? PALETTE.crimson! : m.outfit.trim) + shape.circle(x - 2, y - r * 0.6, r * 0.62, 'none') + shape.circle(x - 2, y - r * 0.6, r * 0.28, PALETTE.gold!);
    case 'kite-shield':
      return shape.path(`M${f(x - r - 2)},${f(y - r * 1.6)} L${f(x + r - 2)},${f(y - r * 1.6)} Q${f(x + r - 2)},${f(y + r * 0.2)} ${f(x - 2)},${f(y + r * 1.1)} Q${f(x - r - 2)},${f(y + r * 0.2)} ${f(x - r - 2)},${f(y - r * 1.6)} Z`, m.outfit.colour) + shape.rect(x - 4, y - r * 1.4, 4, r * 2.2, m.outfit.trim, 1) + shape.rect(x - r * 0.75, y - r * 0.6, r * 1.5, 4, m.outfit.trim, 1);
    case 'tome':
      return shape.rect(x - 9, y - 14, 15, 18, PALETTE.maroon!, 1.5) + shape.rect(x - 7, y - 12, 2, 14, PALETTE.gold!, 0.5);
    case 'torch':
      return shape.rect(x - 2, y - 24, 4, 28, PALETTE.brown!, 1) + shape.path(`M${f(x)},${f(y - 40)} Q${f(x + 8)},${f(y - 28)} ${f(x)},${f(y - 22)} Q${f(x - 8)},${f(y - 28)} ${f(x)},${f(y - 40)} Z`, '#f08c2a') + shape.circle(x, y - 28, 2.5, '#ffd36b');
    case 'orb':
      return shape.circle(x - 1, y - 9, 7, '#9a7fe0') + shape.circle(x - 3, y - 11, 2, '#efe8ff');
    case 'lantern':
      return shape.line(x, y, x, y + 6, 1.4) + shape.rect(x - 5, y + 6, 10, 12, PALETTE.iron!, 2) + shape.rect(x - 3, y + 8, 6, 8, '#ffd36b', 1);
    default:
      return '';
  }
}

/** How far above the head its headgear and horns reach. */
function above(m: Mini, b: Bones): number {
  const r = b.head.r;
  const hat = m.headgear === 'wizard-hat' ? r * 2.6 : m.headgear === 'crown' ? r * 0.6 : m.headgear === 'hood' ? r * 0.5 : 0;
  const horn = m.ancestry === 'tiefling' ? r * 1.2 : 0;
  const hair = m.hair.style === 'topknot' ? r * 0.65 : m.hair.style === 'wild' ? r * 0.45 : 0;
  return Math.max(hat, horn, hair);
}

/** A figure on two legs, front on: everything from the cloak behind to what it holds. */
export function humanoid(m: Mini): Drawn {
  const b = skeletonOf(m);
  const w = weapon(m, b);
  const art = [cloakBack(m, b), hairBack(m, b), legs(m, b), torso(m, b), arms(m, b), head(m, b), hairFront(m, b), beard(m, b), headgear(m, b), horns(m, b), w.art, offhand(m, b)].join('');
  return { art, top: b.top - Math.max(above(m, b), w.reach), left: 0, right: 120 };
}
