import type { MapToken } from '../../../src/shared/battlemap';

/**
 * Paper standees (#97): each creature in 3D is a painted card in a stand, like the paper minis
 * on a real table. Until a creature has its own picture (the wiki's portrait, the art folder), its
 * card is a figure painted here, varied by its name so a group of bandits don't all look alike.
 */

const PAPER = '#fbf6ea';
const PAPER_EDGE = '#c9bea7';
const INK = '#2b2118';
const PAD = 16;
/** The art's size before the paper border, in canvas pixels (a tall card). */
const ART_W = 150;
const ART_H = 300;

const CLOAKS = { pc: ['#2f6f8f', '#4b3a6b', '#2f7a4f', '#8a5a2f', '#6b2f4f'], monster: ['#7c2a24', '#5a3a2a', '#3f3f46', '#6a5a3a', '#4a2a4a'], npc: ['#a07a2c', '#5e6f2f', '#6f5a8a'] } as const;
const SKINS = ['#e3b58f', '#c98f6a', '#8d5a3b', '#f0c9a8', '#b07a5a'];

/** A stable number from a name, so the same creature always gets the same look. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The base name of a numbered creature ("Bandit 2" → "Bandit"), so a group shares a look. */
const family = (name: string) => name.replace(/\s+\d+$/, '').trim() || name;

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** A picture cut out of card: a grey edge under a white margin, grown from its outline, and a flat foot for the stand. */
export function cutOut(art: HTMLCanvasElement): HTMLCanvasElement {
  const silhouette = (colour: string) => {
    const c = canvas(art.width, art.height);
    const x = c.getContext('2d')!;
    x.drawImage(art, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = colour;
    x.fillRect(0, 0, c.width, c.height);
    return c;
  };
  const out = canvas(art.width, art.height);
  const o = out.getContext('2d')!;
  for (const [img, r] of [[silhouette(PAPER_EDGE), 11], [silhouette(PAPER), 9]] as const)
    for (let t = 0; t < 360; t += 15) o.drawImage(img, Math.cos((t * Math.PI) / 180) * r, Math.sin((t * Math.PI) / 180) * r);
  o.fillStyle = PAPER;
  o.fillRect(art.width * 0.2, art.height - PAD - 2, art.width * 0.6, PAD + 2);
  o.drawImage(art, 0, 0);
  return out;
}

function blob(a: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  a.fillStyle = fill;
  a.beginPath();
  a.arc(x, y, r, 0, Math.PI * 2);
  a.fill();
}

/** A figure painted for a creature with no picture of its own. */
export function paintedFigure(t: Pick<MapToken, 'name' | 'kind' | 'size'>): HTMLCanvasElement {
  const h = hash(family(t.name));
  const pick = <T>(list: readonly T[], salt: number) => list[(h >>> salt) % list.length]!;
  const big = t.size === 'large' || t.size === 'huge' || t.size === 'gargantuan';
  const cloak = pick(CLOAKS[t.kind], 0);
  const skin = t.kind === 'monster' && big ? '#8fa36a' : pick(SKINS, 3);
  const head = pick(['hood', 'helm', 'bare'] as const, 6);
  const weapon = pick(['sword', 'mace', 'staff', 'daggers'] as const, 9);
  const shield = t.kind !== 'npc' && (h >>> 12) % 2 === 0;
  const bulk = big ? 1.8 : t.size === 'small' || t.size === 'tiny' ? 0.85 : 1;

  const art = canvas(ART_W + PAD * 2, ART_H + PAD * 2);
  const a = art.getContext('2d')!;
  a.translate(PAD, PAD);
  a.strokeStyle = INK;
  a.lineWidth = 4;
  a.lineJoin = 'round';
  a.lineCap = 'round';
  const w = ART_W;
  const cx = w / 2;
  const bw = w * 0.34 * bulk;
  const H = ART_H;
  // Legs.
  a.fillStyle = '#4a3a2c';
  for (const dx of [-0.42, 0.08]) {
    a.fillRect(cx + bw * dx, H * 0.62, bw * 0.34, H * 0.2);
    a.strokeRect(cx + bw * dx, H * 0.62, bw * 0.34, H * 0.2);
  }
  // A cloak that flares out, with a belt.
  a.fillStyle = cloak;
  a.beginPath();
  a.moveTo(cx - bw * 0.42, H * 0.3);
  a.lineTo(cx + bw * 0.42, H * 0.3);
  a.lineTo(cx + bw * 0.62, H * 0.68);
  a.lineTo(cx - bw * 0.62, H * 0.68);
  a.closePath();
  a.fill();
  a.stroke();
  a.fillStyle = '#3a2a1a';
  a.fillRect(cx - bw * 0.5, H * 0.46, bw, H * 0.04);
  // Head, then a hood or helm.
  const r = w * 0.13 * Math.min(bulk, 1.3);
  blob(a, cx, H * 0.22, r + 3, INK);
  blob(a, cx, H * 0.22, r, skin);
  if (head === 'hood') {
    a.fillStyle = cloak;
    a.beginPath();
    a.moveTo(cx - r * 1.3, H * 0.27);
    a.quadraticCurveTo(cx - r * 1.5, H * 0.04, cx, H * 0.05);
    a.quadraticCurveTo(cx + r * 1.5, H * 0.04, cx + r * 1.3, H * 0.27);
    a.lineTo(cx + r * 0.85, H * 0.26);
    a.quadraticCurveTo(cx, H * 0.12, cx - r * 0.85, H * 0.26);
    a.closePath();
    a.fill();
    a.stroke();
  } else if (head === 'helm') {
    a.fillStyle = '#9aa3ad';
    a.beginPath();
    a.arc(cx, H * 0.2, r * 1.08, Math.PI, 0);
    a.closePath();
    a.fill();
    a.stroke();
  }
  blob(a, cx - w * 0.045, H * 0.21, 3, INK);
  blob(a, cx + w * 0.045, H * 0.21, 3, INK);
  // What it carries.
  a.save();
  a.translate(cx + bw * 0.6, H * 0.5);
  if (weapon === 'sword') {
    a.rotate(-0.35);
    a.fillStyle = '#d7dde3';
    a.fillRect(-4, -H * 0.3, 8, H * 0.3);
    a.strokeRect(-4, -H * 0.3, 8, H * 0.3);
  } else if (weapon === 'mace') {
    a.rotate(-0.3);
    a.fillStyle = '#6b4526';
    a.fillRect(-4, -H * 0.22, 8, H * 0.24);
    a.strokeRect(-4, -H * 0.22, 8, H * 0.24);
    blob(a, 0, -H * 0.24, 13, INK);
    blob(a, 0, -H * 0.24, 10, '#9aa3ad');
  } else if (weapon === 'staff') {
    a.fillStyle = '#5a3d24';
    a.fillRect(-4, -H * 0.45, 8, H * 0.6);
    a.strokeRect(-4, -H * 0.45, 8, H * 0.6);
    blob(a, 0, -H * 0.45, 12, INK);
    blob(a, 0, -H * 0.45, 9, '#7fe0c0');
  } else {
    a.rotate(0.5);
    a.fillStyle = '#d7dde3';
    a.fillRect(-3, -H * 0.12, 6, H * 0.12);
    a.strokeRect(-3, -H * 0.12, 6, H * 0.12);
  }
  a.restore();
  if (shield) {
    blob(a, cx - bw * 0.55, H * 0.45, w * 0.16 + 3, INK);
    blob(a, cx - bw * 0.55, H * 0.45, w * 0.16, pick(['#b0413e', '#3d6f9a', '#6b5a3a'], 15));
    blob(a, cx - bw * 0.55, H * 0.45, w * 0.05, '#e8d48a');
  }
  return cutOut(art);
}

/**
 * How far a card leans back for a camera looking down at `down` radians (0 level, π/2 straight
 * down): upright at the table, lying flat from above so the top view reads like the 2D map.
 */
export function leanFor(down: number): number {
  const start = 0.75;
  return Math.max(0, Math.min(1, (down - start) / (Math.PI / 2 - start))) * 1.45;
}
