import { useState, type ReactNode } from 'react';
import { DiceError, parseRoll } from '../../../src/shared/dice';
import type { EncounterRoll } from '../../../src/shared/types';

const QUICK = [
  { label: 'd20', expression: '1d20' },
  { label: 'Adv', expression: '1d20 adv' },
  { label: 'Dis', expression: '1d20 dis' },
  { label: 'd4', expression: '1d4' },
  { label: 'd6', expression: '1d6' },
  { label: 'd8', expression: '1d8' },
  { label: 'd10', expression: '1d10' },
  { label: 'd12', expression: '1d12' },
];

/** Why notation can't be rolled, checked as it's typed; null when it's fine. */
function problem(expression: string): string | null {
  try {
    parseRoll(expression);
    return null;
  } catch (err) {
    if (err instanceof DiceError) return err.message;
    throw err;
  }
}

/**
 * Dice for the table (#58): quick buttons, or any notation (1d20+5, 2d6+3, 4d6kh3), with an
 * optional label. The server rolls, so nobody's phone decides the result. `extra` goes under
 * the Roll button (the DM's switches).
 */
export function DicePanel({ rolls, onRoll, extra, title = 'Dice' }: { rolls: EncounterRoll[]; onRoll: (expression: string, label: string) => Promise<void>; extra?: ReactNode; title?: string }) {
  const [expression, setExpression] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const typedProblem = expression.trim() ? problem(expression) : null;
  const roll = async (what: string) => {
    setBusy(true);
    try {
      await onRoll(what, label.trim());
      setLabel('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card dice" aria-label={title}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <div className="dice-quick">
        {QUICK.map((q) => (
          <button key={q.label} type="button" disabled={busy} onClick={() => void roll(q.expression)}>
            {q.label}
          </button>
        ))}
      </div>
      <form
        className="row dice-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (expression.trim() && !typedProblem) void roll(expression.trim()).then(() => setExpression(''));
        }}
      >
        <input aria-label="Dice" value={expression} placeholder="1d20+5, 2d6+3, 4d6kh3" autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={(e) => setExpression(e.target.value)} />
        <input aria-label="What for" value={label} placeholder="What for (optional)" maxLength={60} onChange={(e) => setLabel(e.target.value)} />
        <button type="submit" className="primary" disabled={busy || !expression.trim() || !!typedProblem}>
          Roll
        </button>
      </form>
      {typedProblem && <div className="field-error">{typedProblem}</div>}
      {extra && <div className="row dice-extra">{extra}</div>}
      <RollList rolls={rolls} />
    </section>
  );
}

/** The latest rolls, newest first. */
export function RollList({ rolls }: { rolls: EncounterRoll[] }) {
  if (!rolls.length) return <p className="muted small">No rolls yet.</p>;
  return (
    <ol className="roll-list">
      {[...rolls].reverse().map((r) => (
        <li key={r.id} className={`roll${r.crit ? ` crit-${r.crit}` : ''}`}>
          <span className="roll-total">{r.total}</span>
          <span className="roll-main">
            <span>
              <strong>{r.who}</strong>
              {r.label ? ` · ${r.label}` : ''}
              {r.secret && <span className="badge">secret</span>}
              {r.crit === 'success' && <span className="badge good">natural 20</span>}
              {r.crit === 'fail' && <span className="badge bad">natural 1</span>}
            </span>
            <span className="muted small">
              <RollText text={r.text} />
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The dice text without its total: "**x**" is bold, "~~x~~" struck (a die that doesn't count). */
function RollText({ text }: { text: string }) {
  const detail = text.replace(/ = \*\*-?\d+\*\*.*$/, '');
  return (
    <>
      {detail.split(/(~~[^~]+~~)/).map((part, n) => (part.startsWith('~~') ? <s key={n}>{part.slice(2, -2)}</s> : <span key={n}>{part}</span>))}
    </>
  );
}
