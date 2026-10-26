import { useEffect, useMemo, useState } from 'react';
import { BEARDS, colour, HAIR, HEADGEAR, OFFHAND, OUTFITS, renderMini, resolveMini, STARTER_MINIS, WEAPONS, ANCESTRIES, miniForCreature, type Mini, type MiniSpec } from '../../../src/shared/minis';
import './minis.css';

/**
 * The paper mini builder, shared by the DM's Minis page, a player's link and the encounter page:
 * start from a ready-made figure or from scratch, pick the parts, see the mini next to a human for
 * scale, save. Nothing is saved until Save.
 */

const SKINS = ['skin-pale', 'skin-light', 'skin-tan', 'skin-brown', 'skin-deep', 'skin-green', 'skin-grey-green', 'skin-red', 'skin-blue', 'skin-bone', 'scales-red', 'scales-bronze', 'scales-green', 'scales-blue', 'scales-black', 'scales-white', 'scales-gold'];
const HAIR_COLOURS = ['hair-black', 'hair-brown', 'hair-auburn', 'hair-copper', 'hair-blond', 'hair-grey', 'hair-white'];
const CLOTH = ['crimson', 'maroon', 'rust', 'ochre', 'moss', 'forest', 'teal', 'sky', 'navy', 'violet', 'plum', 'brown', 'tan', 'grey', 'charcoal', 'bone', 'white', 'black', 'steel', 'iron', 'bronze', 'gold', 'silver'];

type Group =
  | { kind: 'chips'; title: string; values: readonly string[]; get: (m: Mini) => string; set: (s: MiniSpec, v: string) => MiniSpec }
  | { kind: 'swatches'; title: string; values: readonly string[]; get: (m: Mini) => string | null; set: (s: MiniSpec, v: string | null) => MiniSpec; none?: boolean };

const GROUPS: Group[] = [
  { kind: 'chips', title: 'Ancestry', values: ANCESTRIES, get: (m) => m.ancestry, set: ({ skin: _s, build: _b, beard: _d, ...s }, v) => ({ ...s, ancestry: v as Mini['ancestry'] }) },
  { kind: 'chips', title: 'Build', values: ['slim', 'average', 'broad'], get: (m) => m.build, set: (s, v) => ({ ...s, build: v as Mini['build'] }) },
  { kind: 'swatches', title: 'Skin', values: SKINS, get: (m) => m.skin, set: (s, v) => ({ ...s, skin: v! }) },
  { kind: 'chips', title: 'Outfit', values: OUTFITS, get: (m) => m.outfit.kind, set: (s, v) => ({ ...s, outfit: { ...s.outfit, kind: v as Mini['outfit']['kind'] } }) },
  { kind: 'swatches', title: 'Outfit colour', values: CLOTH, get: (m) => m.outfit.colour, set: (s, v) => ({ ...s, outfit: { ...s.outfit, colour: v! } }) },
  { kind: 'swatches', title: 'Trim', values: CLOTH, get: (m) => m.outfit.trim, set: (s, v) => ({ ...s, outfit: { ...s.outfit, trim: v! } }) },
  { kind: 'swatches', title: 'Cloak', values: CLOTH, none: true, get: (m) => m.cloak, set: ({ cloak: _c, ...s }, v) => (v ? { ...s, cloak: v } : s) },
  { kind: 'chips', title: 'Hair', values: HAIR, get: (m) => m.hair.style, set: (s, v) => ({ ...s, hair: { ...s.hair, style: v as Mini['hair']['style'] } }) },
  { kind: 'swatches', title: 'Hair colour', values: HAIR_COLOURS, get: (m) => m.hair.colour, set: (s, v) => ({ ...s, hair: { ...s.hair, colour: v! } }) },
  { kind: 'chips', title: 'Beard', values: BEARDS, get: (m) => m.beard, set: (s, v) => ({ ...s, beard: v as Mini['beard'] }) },
  { kind: 'chips', title: 'Headgear', values: HEADGEAR, get: (m) => m.headgear, set: (s, v) => ({ ...s, headgear: v as Mini['headgear'] }) },
  { kind: 'chips', title: 'Main hand', values: WEAPONS, get: (m) => m.weapon, set: (s, v) => ({ ...s, weapon: v as Mini['weapon'] }) },
  { kind: 'chips', title: 'Off hand', values: OFFHAND, get: (m) => m.offhand, set: (s, v) => ({ ...s, offhand: v as Mini['offhand'] }) },
];

const label = (v: string) => v.replace(/-/g, ' ');
const swatchName = (values: readonly string[], value: string | null) => (value === null ? 'none' : label(values.find((v) => colour(v, '') === value) ?? value));

/** A mini as an inline SVG, sized by its card height so small folk stand shorter. */
export function MiniFigure({ mini, id, scale = 1.5, className }: { mini: MiniSpec; id: string; scale?: number; className?: string }) {
  const { svg, width, height } = useMemo(() => renderMini(mini, { id }), [mini, id]);
  // The SVG is built from checked parts and palette colours only (no text from the spec).
  const sized = svg.replace(/ width="[^"]+" height="[^"]+"/, ` width="${Math.round(width * scale)}" height="${Math.round(height * scale)}"`);
  return <span className={`mini-figure ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: sized }} />;
}

const HUMAN: MiniSpec = { ancestry: 'human', outfit: { kind: 'tunic', colour: 'grey' } };

export function MiniBuilder({ name, value, onSave }: { name: string; value: MiniSpec | null; onSave: (mini: MiniSpec | null) => Promise<void> }) {
  const start = () => value ?? miniForCreature({ name });
  const [draft, setDraft] = useState<MiniSpec>(start);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | { error: string }>('idle');
  useEffect(() => {
    setDraft(start());
    setStatus('idle');
    // A different figure, or its mini changed elsewhere: start from what's saved.
  }, [name, JSON.stringify(value)]);
  const resolved = resolveMini(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(value ?? miniForCreature({ name }));

  const change = (next: MiniSpec) => {
    setDraft(next);
    setStatus('idle');
  };
  const save = async (mini: MiniSpec | null) => {
    setStatus('saving');
    try {
      await onSave(mini);
      setStatus('saved');
    } catch (err) {
      setStatus({ error: (err as Error).message });
    }
  };

  return (
    <div className="mini-builder">
      <div className="mini-stage">
        <div className="mini-mat" aria-label={`${name}'s mini, next to a human for scale`}>
          <span className="mini-mat-label">1 square = 5 ft</span>
          <figure className="mini-ref">
            <MiniFigure mini={HUMAN} id="mini-ref" />
            <figcaption>human, for scale</figcaption>
          </figure>
          <figure>
            <MiniFigure mini={draft} id="mini-draft" />
            <figcaption>{name}</figcaption>
          </figure>
        </div>
        <div className="row">
          <button className="primary" type="button" disabled={(!dirty && !!value) || status === 'saving'} onClick={() => void save(draft)}>
            {status === 'saving' ? 'Saving…' : 'Save'}
          </button>
          <button type="button" disabled={!dirty} onClick={() => change(start())}>
            Undo changes
          </button>
          {value && (
            <button type="button" className="link" onClick={() => void save(null)}>
              Back to the default figure
            </button>
          )}
        </div>
        <p className="muted small" role="status">
          {status === 'saved' ? 'Saved. It shows on the 3D map from now on.' : typeof status === 'object' ? <span className="bad">{status.error}</span> : dirty ? 'Not saved yet.' : value ? 'This is the saved mini.' : 'No mini saved yet: this is the default figure.'}
        </p>
      </div>

      <div className="mini-parts">
        <fieldset className="mini-group">
          <legend>Start from a ready-made one</legend>
          <div className="chips">
            {STARTER_MINIS.map((starter) => (
              <button key={starter.name} type="button" className="chip" aria-pressed={JSON.stringify(draft) === JSON.stringify(starter.mini)} onClick={() => change(starter.mini)}>
                {starter.name}
              </button>
            ))}
          </div>
        </fieldset>
        {GROUPS.map((g) => {
          const current = g.get(resolved);
          return (
            <fieldset key={g.title} className="mini-group">
              <legend>
                {g.title}
                <span className="muted">{g.kind === 'chips' ? label(current as string) : swatchName(g.values, current)}</span>
              </legend>
              {g.kind === 'chips' ? (
                <div className="chips">
                  {g.values.map((v) => (
                    <button key={v} type="button" className="chip" aria-pressed={current === v} onClick={() => change(g.set(draft, v))}>
                      {label(v)}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mini-swatches">
                  {g.none && <button type="button" className="mini-sw none" aria-label={`${g.title}: none`} title="none" aria-pressed={current === null} onClick={() => change(g.set(draft, null))} />}
                  {g.values.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className="mini-sw"
                      style={{ background: colour(v, '#000') }}
                      aria-label={`${g.title}: ${label(v)}`}
                      title={label(v)}
                      aria-pressed={current === colour(v, '')}
                      onClick={() => change(g.set(draft, v))}
                    />
                  ))}
                </div>
              )}
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
