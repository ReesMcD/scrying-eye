import type { Form, Mini } from '../spec.js';
import type { MiniArtStyle } from '../styles.js';
import { arthropod } from './arthropods.js';
import { beast } from './beasts.js';
import { bird } from './birds.js';
import { dragonKind as dragon } from './dragons.js';
import { blob, elemental, object, plant, swarm } from './oddities.js';
import { fish } from './sea.js';
import { serpent } from './serpents.js';
import { CX, f, FEET, INK, INK_WIDTH, PAPER, PAPER_EDGE } from './draw.js';
import { humanoid } from './humanoid.js';

/** A figure's art, and how far it reaches (card units) so the card fits it. */
export type Drawn = { art: string; top: number; left: number; right: number };

const FORMS: Record<Form, (m: Mini) => Drawn> = { humanoid, beast, dragon, bird, serpent, arthropod, fish, blob, elemental, swarm, plant, object };

/**
 * The house style (docs/minis-style-guide.md): a figure in flat colours with an ink outline, cut
 * out of cream card with a margin and a tab at its feet for the stand. The view box is trimmed to
 * the figure (with whatever it holds over its head), so a dwarf's card is shorter than an elf's.
 */
export const paperStyle: MiniArtStyle = {
  id: 'paper',
  name: 'Paper minis',
  render(m, { id, paper }) {
    const { art, top, left, right } = FORMS[m.form](m);
    const pad = 12;
    const vx = left - pad;
    const vy = Math.floor(top - pad);
    const width = right - left + pad * 2;
    const height = FEET + pad + 2 - vy;
    const tab = paper ? `<rect x="${f(CX - 26)}" y="${FEET - 2}" width="52" height="${pad + 4}" fill="${PAPER}"/>` : '';
    const figure = `<g stroke="${INK}" stroke-width="${INK_WIDTH}" stroke-linejoin="round" stroke-linecap="round">${art}</g>`;
    const body = paper
      ? `<defs><filter id="${id}-cut" x="-15%" y="-10%" width="130%" height="120%" color-interpolation-filters="sRGB"><feMorphology in="SourceAlpha" operator="dilate" radius="6.5" result="edgeShape"/><feFlood flood-color="${PAPER_EDGE}"/><feComposite in2="edgeShape" operator="in" result="edge"/><feMorphology in="SourceAlpha" operator="dilate" radius="5" result="paperShape"/><feFlood flood-color="${PAPER}"/><feComposite in2="paperShape" operator="in" result="paper"/><feMerge><feMergeNode in="edge"/><feMergeNode in="paper"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><g filter="url(#${id}-cut)">${tab}${figure}</g>`
      : figure;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(vx)} ${f(vy)} ${f(width)} ${f(height)}" width="${f(width * 2)}" height="${f(height * 2)}">${body}</svg>`;
    return { svg, width, height };
  },
};
