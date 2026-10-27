import { useState, type FormEvent } from 'react';
import type { Combatant, CombatantKind, EncounterAction, EncounterState, TurnSuggestion } from '../../types';
import { api } from '../../api';
import { DicePanel } from '../../dice/DicePanel';
import { Badge, Toggle } from '../../ui';
import { CombatantPanel } from './CombatantPanel';
import { DungeonPanel } from './DungeonPanel';
import { JoinPanel } from './JoinPanel';

type Act = (action: EncounterAction) => Promise<void>;

/**
 * The live encounter's details drawer: the dungeon's rooms, the players' link, the turn order to
 * arrange (and each piece's conditions and stat block), adding pieces, dice, notes and the log.
 * The map and the turn controls are the live page itself (LiveEncounter).
 */
export function EncounterDetails({ state, act, assistant, open, setOpen }: { state: EncounterState; act: Act; assistant: boolean; open: string | null; setOpen: (id: string | null) => void }) {
  const byId = new Map(state.combatants.map((c) => [c.id, c]));
  const ordered = state.order.map((id) => byId.get(id)).filter((c): c is Combatant => !!c);
  const running = state.status === 'running';
  const current = state.turn ? byId.get(state.turn) : undefined;

  return (
    <div className="encounter-details">
      {state.dungeon && <DungeonPanel state={state} act={act} />}

      {assistant && running && current && current.kind !== 'pc' && <TurnIdea key={`${state.round}-${current.id}`} combatant={current} />}

      <JoinPanel state={state} />

      <h2>Turn order</h2>
      <ol className="initiative" aria-label="Turn order">
        {ordered.map((c, i) => (
          <li key={c.id} id={`combatant-${c.id}`} className={`combatant ${c.id === state.turn ? 'current' : ''}`}>
            <CombatantRow
              c={c}
              place={i + 1}
              open={open === c.id}
              onToggle={() => setOpen(open === c.id ? null : c.id)}
              onMove={(by) => {
                const order = ordered.map((x) => x.id);
                const j = i + by;
                if (j < 0 || j >= order.length) return;
                [order[i], order[j]] = [order[j]!, order[i]!];
                void act({ type: 'reorder', order });
              }}
              first={i === 0}
              last={i === ordered.length - 1}
            />
            {open === c.id && <CombatantPanel c={c} state={state} act={act} />}
          </li>
        ))}
      </ol>

      <AddCombatant act={act} />

      <DmDice state={state} act={act} />

      {state.notes && Object.values(state.notes).some(Boolean) && (
        <details className="card">
          <summary>
            <strong>Notes from the wiki</strong>
          </summary>
          {state.notes.read_aloud && <blockquote className="read-aloud">{state.notes.read_aloud}</blockquote>}
          {(
            [
              ['Setup', state.notes.setup],
              ['Tactics', state.notes.tactics],
              ['What changes the fight', state.notes.changes],
              ['Treasure', state.notes.treasure],
            ] as const
          ).map(([label, text]) =>
            text ? (
              <div key={label}>
                <h3>{label}</h3>
                <p className="pre-line">{text}</p>
              </div>
            ) : null,
          )}
        </details>
      )}

      {state.log.length > 0 && (
        <details className="card">
          <summary>
            <strong>Log</strong>
          </summary>
          <ul className="encounter-log">
            {[...state.log]
              .reverse()
              .slice(0, 30)
              .map((l, i) => (
                <li key={i}>
                  <span className="muted tabular">R{l.round}</span> {l.text}
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}

const KIND_LABEL: Record<CombatantKind, string> = { pc: 'PC', monster: 'Monster', npc: 'NPC' };

/** One piece in the turn order: its place, name and reminders, and arrows to move it up or down. */
function CombatantRow({ c, place, open, onToggle, onMove, first, last }: { c: Combatant; place: number; open: boolean; onToggle: () => void; onMove: (by: -1 | 1) => void; first: boolean; last: boolean }) {
  return (
    <div className="combatant-row">
      <span className="init tabular" aria-hidden>
        {place}
      </span>
      <button type="button" className="combatant-main" aria-expanded={open} onClick={onToggle}>
        <span className="combatant-name">
          <span className={`kind-dot ${c.kind}`} aria-label={KIND_LABEL[c.kind]} />
          {c.name}
          {c.hidden && <Badge tone="warn">hidden</Badge>}
        </span>
        {c.conditions.length > 0 && (
          <span className="condition-chips">
            {c.conditions.map((x) => (
              <span key={x.name} className="condition">
                {x.name}
                {x.level ? ` ${x.level}` : ''}
                {x.rounds ? ` · ${x.rounds}r` : ''}
              </span>
            ))}
          </span>
        )}
      </button>
      <span className="order-moves">
        <button type="button" className="icon" aria-label={`Move ${c.name} earlier`} disabled={first} onClick={() => onMove(-1)}>
          ↑
        </button>
        <button type="button" className="icon" aria-label={`Move ${c.name} later`} disabled={last} onClick={() => onMove(1)}>
          ↓
        </button>
      </span>
    </div>
  );
}

/** Adds pieces: a name from the 2024 rules brings its stat block along. */
function AddCombatant({ act }: { act: Act }) {
  const [name, setName] = useState('');
  const [count, setCount] = useState('1');
  const [kind, setKind] = useState<CombatantKind>('monster');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    void act({ type: 'add', combatant: { name: name.trim(), kind, count: Number(count) || 1 } }).then(() => {
      setName('');
      setCount('1');
    });
  };
  return (
    <details className="card">
      <summary>
        <strong>Add to the board</strong>
      </summary>
      <form onSubmit={submit} className="add-combatant">
        <label>
          <span className="field-label">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Goblin Warrior" list="srd-monsters" />
          <datalist id="srd-monsters">
            {['Goblin Warrior', 'Goblin Boss', 'Guard', 'Guard Captain', 'Bandit', 'Wolf', 'Skeleton', 'Zombie', 'Ogre', 'Hill Giant', 'Adult Red Dragon'].map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
        <label>
          <span className="field-label">How many</span>
          <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label>
          <span className="field-label">Side</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as CombatantKind)}>
            <option value="monster">Monster</option>
            <option value="npc">NPC</option>
            <option value="pc">PC</option>
          </select>
        </label>
        <button className="primary" disabled={!name.trim()}>
          Add
        </button>
      </form>
      <p className="muted small">Any monster from the 2024 rules brings its stat block; place it on the map from the list.</p>
    </details>
  );
}

/** The DM's dice: shown to the table unless secret, and posted to Discord when that's on. */
function DmDice({ state, act }: { state: EncounterState; act: Act }) {
  const [secret, setSecret] = useState(false);
  return (
    <DicePanel
      rolls={state.rolls ?? []}
      onRoll={(expression, label) => act({ type: 'roll', expression, ...(label ? { label } : {}), ...(secret ? { secret: true } : {}) })}
      extra={
        <>
          <Toggle checked={secret} onChange={setSecret} label="Secret" hint="Only you see it" />
          <Toggle checked={!!state.postRolls} onChange={(on) => void act({ type: 'postRolls', on })} label="Post to Discord" hint="Public rolls go to the channel too" />
        </>
      }
    />
  );
}

/** On a monster's turn: ask Claude what it would do (#58). The DM decides; nothing changes by itself. */
function TurnIdea({ combatant }: { combatant: Combatant }) {
  const [idea, setIdea] = useState<TurnSuggestion | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ask = async () => {
    setBusy(true);
    setError('');
    try {
      setIdea(await api<TurnSuggestion>('/encounter/suggest', { method: 'POST', json: { id: combatant.id } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card turn-idea" aria-live="polite">
      {idea ? (
        <>
          <p style={{ margin: 0 }}>{idea.suggestion}</p>
          {(idea.action || idea.target) && (
            <p className="muted small" style={{ margin: '6px 0 0' }}>
              {[idea.action, idea.target && `at ${idea.target}`].filter(Boolean).join(' ')}
            </p>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <button className="link" onClick={() => void ask()} disabled={busy}>
              {busy ? 'Thinking…' : 'Another idea'}
            </button>
            <button className="link" onClick={() => setIdea(null)}>
              Dismiss
            </button>
          </div>
        </>
      ) : (
        <div className="row spread">
          <span className="muted small">What would {combatant.name} do?</span>
          <button onClick={() => void ask()} disabled={busy}>
            {busy ? 'Thinking…' : 'Suggest a move'}
          </button>
        </div>
      )}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}
