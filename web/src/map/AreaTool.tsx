import { useState, type ReactNode } from 'react';
import { distanceFeet, type BattleMap, type Cell } from '../../../src/shared/battlemap';
import { templateCells, type AreaTemplate, type TemplateShape } from '../../../src/shared/mapSight';
import type { PlacedTemplate } from '../../../src/shared/types';
import type { Overlay } from './BattleMapView';

type Mode = 'off' | 'measure' | TemplateShape;

const SHAPES: Array<{ mode: Mode; label: string }> = [
  { mode: 'measure', label: 'Measure' },
  { mode: 'sphere', label: 'Sphere' },
  { mode: 'cone', label: 'Cone' },
  { mode: 'line', label: 'Line' },
  { mode: 'cube', label: 'Cube' },
];

/** Feet between two grid corners, 2024 style (diagonals count 5 ft). */
const feet = (a: Cell, b: Cell) => distanceFeet(a, b);

/**
 * Measuring and spell areas (#55), for the DM and players alike: pick a shape and size, then drag
 * on the map. A sphere drags out from its centre (its radius follows), a cone or line points
 * where you drag. Areas are shared with the table; a measure is only yours.
 */
export function useAreaTool(opts: {
  map: BattleMap;
  templates: readonly PlacedTemplate[];
  /** Whose areas can be removed from this view ("dm" removes any). */
  me: string;
  onPlace: (t: AreaTemplate) => void;
  onClear: (id: string) => void;
}): { controls: ReactNode; overlays: Overlay[]; onCornerDrag: ((from: Cell, to: Cell, done: boolean) => void) | undefined; active: boolean } {
  const [mode, setMode] = useState<Mode>('off');
  const [size, setSize] = useState(20);
  const [drag, setDrag] = useState<{ from: Cell; to: Cell } | null>(null);
  const { map } = opts;

  const preview = (from: Cell, to: Cell): AreaTemplate | null => {
    if (mode === 'off' || mode === 'measure') return null;
    if (mode === 'sphere') return { shape: 'sphere', at: from, size: Math.max(5, feet(from, to) || size) };
    if (mode === 'cube') return { shape: 'cube', at: from, to, size };
    return { shape: mode, at: from, to, size };
  };

  const overlays: Overlay[] = opts.templates.map((t) => ({ cells: templateCells(t, map.width, map.height), tone: t.by === opts.me ? 'accent' : 'warn', label: `${t.label ?? 'DM'}: ${t.size} ft ${t.shape}` }));
  if (drag) {
    if (mode === 'measure') overlays.push({ cells: [], tone: 'accent', line: [drag.from, drag.to], label: `${feet(drag.from, drag.to)} ft` });
    const t = preview(drag.from, drag.to);
    if (t) overlays.push({ cells: templateCells(t, map.width, map.height), tone: 'accent', line: [drag.from, drag.to], label: `${t.size} ft ${t.shape}` });
  }

  const onCornerDrag =
    mode === 'off'
      ? undefined
      : (from: Cell, to: Cell, done: boolean) => {
          if (!done) return setDrag({ from, to });
          const t = preview(from, to);
          if (t) {
            opts.onPlace(t);
            setDrag(null);
          } else setDrag({ from, to }); // a measure stays until the next one
        };

  const mine = opts.templates.filter((t) => opts.me === 'dm' || t.by === opts.me);
  const controls = (
    <div className="map-tools">
      <span className="segmented" role="radiogroup" aria-label="Measure or place an area">
        {SHAPES.map((s) => (
          <button key={s.mode} type="button" role="radio" aria-checked={mode === s.mode} className={mode === s.mode ? 'on' : ''} onClick={() => (setMode(mode === s.mode ? 'off' : s.mode), setDrag(null))}>
            {s.label}
          </button>
        ))}
      </span>
      {mode !== 'off' && mode !== 'measure' && mode !== 'sphere' && (
        <label className="row small">
          Size
          <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
            {[5, 10, 15, 20, 30, 40, 60, 90, 100, 120].map((n) => (
              <option key={n} value={n}>
                {n} ft
              </option>
            ))}
          </select>
        </label>
      )}
      {mine.length > 0 && (
        <button type="button" className="link" onClick={() => mine.forEach((t) => opts.onClear(t.id))}>
          Clear {opts.me === 'dm' ? 'areas' : 'my area'}
        </button>
      )}
    </div>
  );
  return { controls, overlays, onCornerDrag, active: mode !== 'off' };
}
