import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { copyText } from '../clipboard';
import { MiniBuilder, MiniFigure } from '../minis/MiniBuilder';
import { href } from '../router';
import type { MiniFigure as Figure, MiniKind } from '../types';
import { Badge, Empty, Segmented } from '../ui';
import { miniForCreature } from '../../../src/shared/minis';

/**
 * Paper minis for the table: the party's characters (from Settings → Campaigns), and the NPCs and
 * monsters the DM adds. Players edit their own character's mini from a private link.
 */
export function MinisPage({ selected }: { selected: string | undefined }) {
  const [figures, setFigures] = useState<Figure[] | null>(null);
  const [error, setError] = useState('');
  const load = () => api<{ figures: Figure[] }>('/minis').then((r) => setFigures(r.figures), (e: Error) => setError(e.message));
  useEffect(() => {
    void load();
    // A player may save theirs while this is open.
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  if (error) return <div className="error-box">{error}</div>;
  if (!figures) return <p className="muted">Loading…</p>;
  const current = figures.find((f) => f.id === selected) ?? figures[0];
  const replace = (f: Figure) => setFigures(figures.map((x) => (x.id === f.id ? f : x)));
  const party = figures.filter((f) => f.kind === 'pc');
  const others = figures.filter((f) => f.kind !== 'pc');

  return (
    <div>
      <h1>Minis</h1>
      <p className="muted small" style={{ marginTop: 0 }}>
        Paper minis for the 3D map. Creatures without one get a figure from their name and stat block.
      </p>

      <div className="card minis-roster">
        <h2 className="small-heading">The party</h2>
        {party.length === 0 ? (
          <p className="muted small">
            No characters yet: add them under <a href={href('settings', 'campaigns')}>Campaigns</a>.
          </p>
        ) : (
          <FigureList figures={party} current={current} />
        )}
        <h2 className="small-heading">NPCs and monsters</h2>
        {others.length > 0 && <FigureList figures={others} current={current} />}
        <AddFigure
          onAdded={(f) => {
            setFigures([...figures, f]);
            window.location.hash = href('minis', f.id);
          }}
        />
      </div>

      {current ? (
        <div className="card">
          <div className="row spread">
            <span className="display session-title">{current.name}</span>
            <Badge tone={current.kind === 'pc' ? 'accent' : current.kind === 'npc' ? 'warn' : 'bad'}>{current.kind === 'pc' ? 'Player character' : current.kind === 'npc' ? 'NPC' : 'Monster'}</Badge>
          </div>
          {current.kind === 'pc' ? (
            <PlayerLink figure={current} onChange={replace} />
          ) : (
            <button
              type="button"
              className="link danger"
              onClick={() =>
                void api(`/minis/${encodeURIComponent(current.id)}`, { method: 'DELETE' }).then(() => {
                  setFigures(figures.filter((f) => f.id !== current.id));
                  window.location.hash = href('minis');
                }, (e: Error) => setError(e.message))
              }
            >
              Remove {current.name}
            </button>
          )}
          <div style={{ marginTop: 14 }}>
            <MiniBuilder
              name={current.name}
              value={current.mini}
              onSave={async (mini) => replace(await api<Figure>(`/minis/${encodeURIComponent(current.id)}`, { method: 'PUT', json: { mini } }))}
            />
          </div>
        </div>
      ) : (
        <Empty title="No minis yet">Add your party under Campaigns, or an NPC or monster above.</Empty>
      )}
    </div>
  );
}

function FigureList({ figures, current }: { figures: Figure[]; current: Figure | undefined }) {
  return (
    <div className="minis-list">
      {figures.map((f) => (
        <a key={f.id} href={href('minis', f.id)} className={`minis-item ${f.id === current?.id ? 'on' : ''}`} aria-current={f.id === current?.id ? 'page' : undefined}>
          <MiniFigure mini={f.mini ?? miniForCreature({ name: f.name })} id={`list-${f.id}`} scale={0.42} />
          <span>{f.name}</span>
          {!f.mini && <span className="muted small">default</span>}
        </a>
      ))}
    </div>
  );
}

function AddFigure({ onAdded }: { onAdded: (f: Figure) => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Exclude<MiniKind, 'pc'>>('npc');
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      onAdded(await api<Figure>('/minis', { method: 'POST', json: { name, kind } }));
      setName('');
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <form className="minis-add" onSubmit={(e) => void submit(e)}>
      <input id="mini-new-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Sister Maren or Goblin" aria-label="Name" />
      <Segmented
        value={kind}
        options={[
          { value: 'npc', label: 'NPC' },
          { value: 'monster', label: 'Monster' },
        ]}
        onChange={setKind}
      />
      <button type="submit" disabled={!name.trim()}>
        Add
      </button>
      {error && <p className="bad small">{error}</p>}
    </form>
  );
}

/** A character's private link: the player opens it to make their own mini. Shown once, when made. */
function PlayerLink({ figure, onChange }: { figure: Figure; onChange: (f: Figure) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => {
    setUrl(null);
    setNote('');
  }, [figure.id]);
  const path = `/minis/${encodeURIComponent(figure.id)}/link`;
  const make = async () => {
    setNote('');
    try {
      const r = await api<{ url: string }>(path, { method: 'POST' });
      setUrl(r.url);
      onChange({ ...figure, hasLink: true });
    } catch (err) {
      setNote((err as Error).message);
    }
  };
  const turnOff = async () => {
    await api(path, { method: 'DELETE' });
    setUrl(null);
    onChange({ ...figure, hasLink: false });
    setNote('Link turned off.');
  };
  return (
    <div className="minis-link">
      <p className="muted small" style={{ margin: '6px 0' }}>
        {figure.hasLink ? 'Their player has a link to edit this mini. A new link turns the old one off.' : 'Send their player a private link so they can make this mini themselves.'}
      </p>
      {url && (
        <div className="row">
          <input readOnly value={url} aria-label="Player link" onFocus={(e) => e.currentTarget.select()} />
          <button type="button" onClick={() => void copyText(url).then(() => setNote('Copied. Send it to them privately: anyone with it can edit this mini.'), (e: Error) => setNote(e.message))}>
            Copy
          </button>
        </div>
      )}
      <div className="row">
        <button type="button" onClick={() => void make()}>
          {figure.hasLink ? 'Make a new link' : 'Make a player link'}
        </button>
        {figure.hasLink && (
          <button type="button" className="link danger" onClick={() => void turnOff()}>
            Turn the link off
          </button>
        )}
      </div>
      {note && <p className="muted small">{note}</p>}
    </div>
  );
}
