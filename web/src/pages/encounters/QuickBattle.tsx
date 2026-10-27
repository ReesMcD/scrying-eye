import { useEffect, useState } from 'react';
import { api } from '../../api';
import { MiniFigure } from '../../minis/MiniBuilder';
import type { EncounterState, QuickBattleOptions, QuickBattleRequest } from '../../types';
import { Segmented } from '../../ui';
import { miniForCreature } from '../../../../src/shared/minis';

/**
 * Throw a fight together: a ready-made map, the party, and monsters from the 2024 rules. Everyone
 * is placed on the board; move them where you like, then start.
 */
export function QuickBattle({ onStarted }: { onStarted: (s: EncounterState) => void }) {
  const [options, setOptions] = useState<QuickBattleOptions | null>(null);
  const [map, setMap] = useState('dungeon');
  const [campaign, setCampaign] = useState('');
  const [party, setParty] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api<QuickBattleOptions>('/encounters/quick').then((o) => {
      setOptions(o);
      const first = o.campaigns[0];
      if (first) {
        setCampaign(first.id);
        setParty(new Set(first.party));
      }
    }, (e: Error) => setError(e.message));
  }, []);

  if (!options) return error ? <div className="error-box">{error}</div> : null;
  const roster = options.campaigns.find((c) => c.id === campaign)?.party ?? [];
  const monsters = Object.entries(counts).filter(([, n]) => n > 0).map(([name, count]) => ({ name, count }));
  const chosen = roster.filter((n) => party.has(n));
  const count = (name: string, by: number) => setCounts({ ...counts, [name]: Math.max(0, Math.min(30, (counts[name] ?? 0) + by)) });

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const quick: QuickBattleRequest = { map, party: chosen, monsters };
      onStarted(await api<EncounterState>('/encounter', { method: 'POST', json: { quick } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card quick-battle" aria-label="Quick battle">
      <h2 style={{ marginTop: 0 }}>Quick battle</h2>
      <p className="muted small" style={{ marginTop: 0 }}>
        A ready map, your party and some monsters, placed and ready to move.
      </p>

      <div className="quick-step">
        <span className="field-label">Map</span>
        <Segmented value={map} options={options.maps.map((m) => ({ value: m.id, label: m.name }))} onChange={setMap} />
      </div>

      <div className="quick-step">
        <span className="field-label">Party</span>
        {options.campaigns.length > 1 && (
          <select
            aria-label="Campaign"
            value={campaign}
            onChange={(e) => {
              setCampaign(e.target.value);
              setParty(new Set(options.campaigns.find((c) => c.id === e.target.value)?.party ?? []));
            }}
          >
            {options.campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        {roster.length ? (
          <div className="chips">
            {roster.map((name) => (
              <button
                key={name}
                type="button"
                className="chip"
                aria-pressed={party.has(name)}
                onClick={() => {
                  const next = new Set(party);
                  if (!next.delete(name)) next.add(name);
                  setParty(next);
                }}
              >
                {name}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted small">No characters yet: add them under Campaigns (or start with just monsters).</p>
        )}
      </div>

      <div className="quick-step">
        <span className="field-label">Monsters (2024 rules)</span>
        <ul className="quick-monsters">
          {options.monsters.map((m) => (
            <li key={m.name}>
              <MiniFigure mini={miniForCreature({ name: m.name, type: m.type })} id={`quick-${m.name}`} scale={0.32} />
              <span className="quick-monster-name">
                {m.name}
                <span className="muted small">
                  {' '}
                  CR {m.cr} · {m.size}
                </span>
              </span>
              <span className="quick-count">
                <button type="button" className="icon" aria-label={`One fewer ${m.name}`} disabled={!counts[m.name]} onClick={() => count(m.name, -1)}>
                  −
                </button>
                <span className="tabular" aria-label={`${counts[m.name] ?? 0} ${m.name}`}>
                  {counts[m.name] ?? 0}
                </span>
                <button type="button" className="icon" aria-label={`One more ${m.name}`} onClick={() => count(m.name, 1)}>
                  +
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {error && <div className="error-box">{error}</div>}
      <button className="primary" disabled={busy || (!chosen.length && !monsters.length)} onClick={() => void start()}>
        {busy ? 'Setting up…' : 'Set up the board'}
      </button>
    </section>
  );
}
