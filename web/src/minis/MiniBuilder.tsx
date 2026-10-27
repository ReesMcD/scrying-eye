import { useEffect, useMemo, useState } from 'react';
import { BEARDS, BODIES, colour, EARS, FORMS, HEADS, LOWERS, HAIR, HEADGEAR, HORNS, MARKINGS, OFFHAND, OUTFITS, renderMini, resolveMini, SPECIES, SPECIES_LOOKS, STARTER_MINIS, TAILS, TUSKS, WEAPONS, WINGS, miniForCreature, withLook, type FeatureSpec, type Features, type Mini, type MiniSpec } from '../../../src/shared/minis';
import './minis.css';

/**
 * The paper mini builder, shared by the DM's Minis page, a player's link and the encounter page:
 * start from a ready-made figure or from scratch, pick the parts, see the mini next to a human for
 * scale, save. Nothing is saved until Save.
 */

const SKINS = [
  'skin-pale', 'skin-light', 'skin-tan', 'skin-olive', 'skin-brown', 'skin-deep', 'skin-gold', 'skin-silver', 'skin-cloud', 'skin-frost', 'skin-stone', 'skin-grey', 'skin-storm', 'skin-ash', 'skin-drow', 'skin-violet', 'skin-ember',
  'skin-red', 'skin-blue', 'skin-green', 'skin-grey-green', 'skin-bone',
  'scales-red', 'scales-blue', 'scales-green', 'scales-black', 'scales-white', 'scales-gold', 'scales-silver', 'scales-bronze', 'scales-brass', 'scales-copper',
];
const EYES = ['eye-ink', 'hair-brown', 'eye-gold', 'eye-green', 'eye-ice', 'eye-violet', 'eye-red', 'eye-ember', 'eye-white'];
const MARKS = ['white', 'bone', 'charcoal', 'black', 'navy', 'crimson', 'eye-ember', 'eye-ice', 'gold', 'skin-deep'];
/** The species first; goblins, skeletons and 2014 half-orcs for the DM's monsters and old minis. */
const ANCESTRY_CHOICES = [...SPECIES, 'goblin', 'skeleton'] as const;
const HAIR_COLOURS = ['hair-black', 'hair-brown', 'hair-auburn', 'hair-copper', 'hair-blond', 'hair-grey', 'hair-white'];
const CLOTH = ['crimson', 'maroon', 'rust', 'ochre', 'moss', 'forest', 'teal', 'sky', 'navy', 'violet', 'plum', 'brown', 'tan', 'grey', 'charcoal', 'bone', 'white', 'black', 'steel', 'iron', 'bronze', 'gold', 'silver'];

type Group =
  | { kind: 'chips'; title: string; values: readonly string[]; get: (m: Mini) => string; set: (s: MiniSpec, v: string) => MiniSpec }
  | { kind: 'swatches'; title: string; values: readonly string[]; get: (m: Mini) => string | null; set: (s: MiniSpec, v: string | null) => MiniSpec; none?: boolean };

/** Sets one feature, keeping the others. */
const feature = <K extends keyof FeatureSpec>(s: MiniSpec, key: K, value: FeatureSpec[K]): MiniSpec => ({ ...s, features: { ...s.features, [key]: value } });
const chipsOf = <K extends keyof Features>(title: string, key: K, values: readonly string[]): Group => ({ kind: 'chips', title, values, get: (m) => String(m.features[key]), set: (s, v) => feature(s, key, (v === 'on' ? true : v === 'off' ? false : v) as never) });
const ON_OFF = ['off', 'on'] as const;
const onOff = (title: string, key: 'halo' | 'glow'): Group => ({ kind: 'chips', title, values: ON_OFF, get: (m) => (m.features[key] ? 'on' : 'off'), set: (s, v) => feature(s, key, v === 'on') });

const BODY: Group[] = [
  { kind: 'chips', title: 'Species', values: ANCESTRY_CHOICES, get: (m) => m.ancestry, set: ({ skin: _s, build: _b, beard: _d, features: _f, ...s }, v) => ({ ...s, ancestry: v as Mini['ancestry'] }) },
  { kind: 'chips', title: 'Build', values: ['slim', 'average', 'broad'], get: (m) => m.build, set: (s, v) => ({ ...s, build: v as Mini['build'] }) },
  { kind: 'swatches', title: 'Skin', values: SKINS, get: (m) => m.skin, set: (s, v) => ({ ...s, skin: v! }) },
  { kind: 'chips', title: 'Outfit', values: OUTFITS, get: (m) => m.outfit.kind, set: (s, v) => ({ ...s, outfit: { ...s.outfit, kind: v as Mini['outfit']['kind'] } }) },
  { kind: 'swatches', title: 'Outfit colour', values: CLOTH, get: (m) => m.outfit.colour, set: (s, v) => ({ ...s, outfit: { ...s.outfit, colour: v! } }) },
  { kind: 'swatches', title: 'Trim', values: CLOTH, get: (m) => m.outfit.trim, set: (s, v) => ({ ...s, outfit: { ...s.outfit, trim: v! } }) },
  { kind: 'swatches', title: 'Cloak', values: CLOTH, none: true, get: (m) => m.cloak, set: ({ cloak: _c, ...s }, v) => (v ? { ...s, cloak: v } : s) },
  { kind: 'chips', title: 'Hair', values: HAIR, get: (m) => m.hair.style, set: (s, v) => ({ ...s, hair: { ...s.hair, style: v as Mini['hair']['style'] } }) },
  { kind: 'swatches', title: 'Hair colour', values: HAIR_COLOURS, get: (m) => m.hair.colour, set: (s, v) => ({ ...s, hair: { ...s.hair, colour: v! } }) },
  { kind: 'chips', title: 'Beard', values: BEARDS, get: (m) => m.beard, set: (s, v) => ({ ...s, beard: v as Mini['beard'] }) },
];

const FEATURES: Group[] = [
  chipsOf('Ears', 'ears', EARS),
  chipsOf('Horns', 'horns', HORNS),
  { kind: 'swatches', title: 'Horn colour', values: ['bone', 'charcoal', 'black', 'maroon', 'brown', 'tan', 'gold', 'silver'], get: (m) => m.features.hornColour, set: (s, v) => feature(s, 'hornColour', v!) },
  chipsOf('Tail', 'tail', TAILS),
  chipsOf('Tusks', 'tusks', TUSKS),
  chipsOf('Wings', 'wings', WINGS),
  { kind: 'swatches', title: 'Wing colour', values: CLOTH, get: (m) => m.features.wingColour, set: (s, v) => feature(s, 'wingColour', v!) },
  onOff('Halo', 'halo'),
  { kind: 'swatches', title: 'Eyes', values: EYES, get: (m) => m.features.eyes, set: (s, v) => feature(s, 'eyes', v!) },
  onOff('Glowing eyes', 'glow'),
  chipsOf('Markings', 'markings', MARKINGS),
  { kind: 'swatches', title: 'Marking colour', values: MARKS, get: (m) => m.features.markingColour, set: (s, v) => feature(s, 'markingColour', v!) },
];

/** The DM's monster parts: what kind of creature, its body, colour, head and lower half. */
const CREATURE: Group[] = [
  { kind: 'chips', title: 'Form', values: FORMS, get: (m) => m.form, set: ({ body: _b, ...s }, v) => ({ ...s, form: v as Mini['form'] }) },
  { kind: 'chips', title: 'Body', values: [], get: (m) => m.body, set: (s, v) => ({ ...s, body: v as Mini['body'] }) },
  { kind: 'swatches', title: 'Coat', values: CLOTH, get: (m) => m.coat, set: (s, v) => ({ ...s, coat: v! }) },
  { kind: 'chips', title: 'Head', values: HEADS, get: (m) => m.head, set: (s, v) => ({ ...s, head: v as Mini['head'] }) },
  { kind: 'chips', title: 'Lower body', values: LOWERS, get: (m) => m.lower, set: (s, v) => ({ ...s, lower: v as Mini['lower'] }) },
  { kind: 'chips', title: 'Arms', values: ['2', '4', '6'], get: (m) => String(m.arms), set: (s, v) => ({ ...s, arms: Number(v) as Mini['arms'] }) },
  { kind: 'chips', title: 'Heads', values: ['1', '2', '3', '5'], get: (m) => String(m.heads), set: (s, v) => ({ ...s, heads: Number(v) }) },
];

const GEAR: Group[] = [
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
  const species = (SPECIES_LOOKS as Partial<Record<string, typeof SPECIES_LOOKS.human>>)[resolved.ancestry];
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

  /** One part's choices: chips, or colour swatches. */
  const group = (g: Group) => {
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
        {group(BODY[0]!)}
        {species && (
          <fieldset className="mini-group">
            <legend>{label(resolved.ancestry)} looks</legend>
            <div className="chips">
              {species.map((l) => (
                <button key={l.name} type="button" className="chip" aria-pressed={JSON.stringify(withLook(draft, l.look)) === JSON.stringify(draft)} onClick={() => change(withLook(draft, l.look))}>
                  {l.name}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {BODY.slice(1).map(group)}
        <details className="mini-more">
          <summary>Ears, horns, wings and more</summary>
          {FEATURES.map(group)}
        </details>
        {GEAR.map(group)}
        <details className="mini-more">
          <summary>Monster parts</summary>
          {CREATURE.map((g) => (g.title === 'Body' ? group({ ...g, values: BODIES[resolved.form] }) : group(g)))}
        </details>
      </div>
    </div>
  );
}
