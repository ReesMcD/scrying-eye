import { useEffect, useState } from 'react';
import type { Combatant, EncounterAction, EncounterState } from '../../types';
import { MapCard } from './MapCard';
import { EncounterDetails } from './Tracker';

type Act = (action: EncounterAction) => Promise<void>;

/**
 * The live encounter: the map fills the page (the screen you share on Discord), with the round and
 * turn controls on top. Map tools and the details drawer open on demand; "Hide controls" leaves
 * just the map, the turn order and Next. Keys: N / → next turn, P / ← previous, H hide controls.
 */
export function LiveEncounter({ state, act, onEnd, assistant }: { state: EncounterState; act: Act; onEnd: () => Promise<void>; assistant: boolean }) {
  const [drawer, setDrawer] = useState(false);
  const [tools, setTools] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const byId = new Map(state.combatants.map((c) => [c.id, c]));
  const ordered = state.order.map((id) => byId.get(id)).filter((c): c is Combatant => !!c);
  const running = state.status === 'running';
  const exploring = state.status === 'exploring';
  const current = state.turn ? byId.get(state.turn) : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) || target?.isContentEditable) return;
      const key = e.key.toLowerCase();
      if (key === 'h') setHidden((h) => !h);
      else if (running && (key === 'n' || e.key === 'ArrowRight')) void act({ type: 'next' });
      else if (running && (key === 'p' || e.key === 'ArrowLeft')) void act({ type: 'previous' });
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, act]);

  const select = (id: string) => {
    setOpen(id);
    setDrawer(true);
    requestAnimationFrame(() => document.getElementById(`combatant-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  };

  return (
    <div className={`live${hidden ? ' live-clean' : ''}${drawer ? ' live-drawer-open' : ''}`}>
      <MapCard state={state} act={act} onSelect={select} showTools={tools && !hidden} />

      <div className="live-top">
        <div className="live-pill live-title">
          <strong>{state.title}</strong>
          <span className="muted">{exploring ? 'Exploring' : running ? `Round ${state.round}${current ? ` · ${current.name}’s turn` : ''}` : 'Getting ready'}</span>
        </div>
        {!hidden && (
          <div className="live-actions">
            <button type="button" aria-pressed={tools} onClick={() => setTools(!tools)}>
              Map tools
            </button>
            <button type="button" aria-pressed={drawer} onClick={() => setDrawer(!drawer)}>
              Details
            </button>
            <button type="button" onClick={() => setHidden(true)} title="For sharing your screen (H)">
              Hide controls
            </button>
            <button type="button" className="danger" onClick={() => (confirmEnd ? void onEnd() : setConfirmEnd(true))} onBlur={() => setConfirmEnd(false)}>
              {confirmEnd ? 'Tap again to end' : state.dungeon ? 'Leave dungeon' : 'End'}
            </button>
          </div>
        )}
        {hidden && (
          <button type="button" className="live-show" onClick={() => setHidden(false)} title="Show controls (H)">
            Show controls
          </button>
        )}
      </div>

      {!exploring && ordered.length > 0 && (
        <ol className="live-order" aria-label="Turn order">
          {ordered.map((c) => (
            <li key={c.id}>
              <button type="button" className={`live-chip ${c.kind}${c.id === state.turn ? ' current' : ''}${c.hidden ? ' faded' : ''}`} onClick={() => select(c.id)}>
                <span className={`kind-dot ${c.kind}`} aria-hidden />
                <span className="live-chip-name">{c.name}</span>
                {c.conditions.length > 0 && <span className="live-chip-conditions">{c.conditions.map((x) => x.name).join(', ')}</span>}
              </button>
            </li>
          ))}
        </ol>
      )}

      {!exploring && (
        <div className="live-turns">
          {state.dungeon?.fight && !hidden && (
            <button type="button" onClick={() => void act({ type: 'endFight' })} title="Back to exploring; the fallen leave the map">
              End fight
            </button>
          )}
          {running ? (
            <>
              <button type="button" onClick={() => void act({ type: 'previous' })} aria-label="Previous turn (P)">
                ← Previous
              </button>
              <span className="live-round tabular">Round {state.round}</span>
              <button type="button" className="primary" onClick={() => void act({ type: 'next' })} aria-label="Next turn (N)">
                Next turn →
              </button>
            </>
          ) : (
            <button type="button" className="primary" onClick={() => void act({ type: 'begin' })} disabled={!state.combatants.length}>
              Start round 1
            </button>
          )}
        </div>
      )}

      {drawer && !hidden && (
        <aside className="live-drawer" aria-label="Encounter details">
          <div className="row spread live-drawer-head">
            <strong>Details</strong>
            <button type="button" className="icon" aria-label="Close details" onClick={() => setDrawer(false)}>
              ✕
            </button>
          </div>
          <EncounterDetails state={state} act={act} assistant={assistant} open={open} setOpen={setOpen} />
        </aside>
      )}
    </div>
  );
}
