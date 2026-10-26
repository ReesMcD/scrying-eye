import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { hms } from '../format';
import type { ConfigState, SessionDetail, TrackSwitch } from '../types';

type Row = { time: string; speakers: string[] };
type Speakers = Record<string, { name: string; discord: string[] }>;

/** "1:10:00", "70:00" or "4200" (seconds) → ms; null if it isn't a time. */
export function parseTime(text: string): number | null {
  const parts = text.trim().split(':');
  if (!parts.length || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  return parts.reduce((s, p) => s * 60 + Number(p), 0) * 1000;
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * Who was on each Discord account in this session (#71), when it differs from Settings → Speakers:
 * "Sam was on his own today", or "from 1:10:00 Sam is on Rees's mic". Saving rebuilds the transcript.
 */
export function MicsCard({ s, onSaved }: { s: SessionDetail; onSaved: (d: SessionDetail) => void }) {
  const [speakers, setSpeakers] = useState<Speakers>({});
  useEffect(() => {
    api<ConfigState>('/config').then((c) => setSpeakers(c.config?.speakers ?? {}), () => {});
  }, []);
  const accounts = useMemo(() => [...new Set([...Object.keys(s.participants), ...s.tracks.map((t) => t.account)])], [s.participants, s.tracks]);
  const settingsFor = (account: string) => Object.entries(speakers).filter(([, sp]) => sp.discord.includes(account)).map(([id]) => id);

  const fromSession = () =>
    Object.fromEntries(
      accounts.map((a) => {
        const mine = s.tracks.filter((t) => t.account === a);
        const start = mine.find((t) => t.fromMs === 0)?.speakers ?? settingsFor(a);
        return [a, [{ time: '0:00:00', speakers: start }, ...mine.filter((t) => t.fromMs > 0).map((t) => ({ time: hms(t.fromMs), speakers: t.speakers }))]];
      }),
    ) as Record<string, Row[]>;
  const [draft, setDraft] = useState<Record<string, Row[]>>({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setDraft(fromSession()), [s.tracks, speakers, accounts]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const change = (account: string, f: (rows: Row[]) => Row[]) => setDraft((d) => ({ ...d, [account]: f(d[account] ?? []) }));
  const tracks = (): TrackSwitch[] =>
    accounts.flatMap((account) =>
      (draft[account] ?? []).flatMap((row, n) => {
        if (n === 0) return sameSet(row.speakers, settingsFor(account)) ? [] : [{ account, fromMs: 0, speakers: row.speakers }];
        const fromMs = parseTime(row.time);
        if (fromMs === null || fromMs <= 0) throw new Error(`"${row.time}" isn't a time like 1:10:00`);
        return [{ account, fromMs, speakers: row.speakers }];
      }),
    );
  const save = async (next: TrackSwitch[]) => {
    setBusy(true);
    setError('');
    try {
      onSaved(await api<SessionDetail>(`/sessions/${encodeURIComponent(s.id)}`, { method: 'PATCH', json: { tracks: next } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const nameOf = (account: string) => s.participants[account]?.displayName ?? account;
  if (!accounts.length || !Object.keys(speakers).length) return null;

  return (
    <details className="card" open={s.tracks.length > 0}>
      <summary>
        <strong>Who's on each mic</strong>
        <span className="muted small" style={{ marginLeft: 6 }}>· {s.tracks.length ? 'changed for this session' : 'as in Settings → Speakers'}</span>
      </summary>
      <p className="muted small">
        For when this session differs from your settings: someone on another person's mic, or switching mics partway (add a switch at the time from the transcript).
        Saving rebuilds the transcript; then label speakers or rewrite the recap.
      </p>
      {accounts.map((account) => (
        <div key={account} className="mic">
          <div className="field-label">{nameOf(account)}</div>
          {(draft[account] ?? []).map((row, n) => (
            <div key={n} className="row mic-row">
              {n === 0 ? (
                <span className="muted small mic-time">From the start</span>
              ) : (
                <label className="small mic-time">
                  From{' '}
                  <input
                    aria-label={`From when (${nameOf(account)})`}
                    value={row.time}
                    inputMode="numeric"
                    placeholder="1:10:00"
                    onChange={(e) => change(account, (rows) => rows.map((r, i) => (i === n ? { ...r, time: e.target.value } : r)))}
                  />
                </label>
              )}
              <div className="chips" style={{ margin: 0 }}>
                {Object.entries(speakers).map(([id, sp]) => (
                  <button
                    key={id}
                    type="button"
                    className={`chip${row.speakers.includes(id) ? '' : ' off'}`}
                    aria-pressed={row.speakers.includes(id)}
                    onClick={() => change(account, (rows) => rows.map((r, i) => (i === n ? { ...r, speakers: r.speakers.includes(id) ? r.speakers.filter((x) => x !== id) : [...r.speakers, id] } : r)))}
                  >
                    {sp.name}
                  </button>
                ))}
                {row.speakers.length === 0 && <span className="muted small">Nobody you know (its Discord name)</span>}
                {row.speakers.length > 1 && <span className="muted small">Shared: Claude works out who said each line</span>}
              </div>
              {n > 0 && (
                <button type="button" className="link danger" onClick={() => change(account, (rows) => rows.filter((_, i) => i !== n))}>
                  Remove
                </button>
              )}
            </div>
          ))}
          <button type="button" className="link" onClick={() => change(account, (rows) => [...rows, { time: '', speakers: rows.at(-1)?.speakers ?? [] }])}>
            + Add a switch
          </button>
        </div>
      ))}
      {error && <div className="field-error">{error}</div>}
      <div className="row" style={{ marginTop: 10 }}>
        <button
          className="primary"
          disabled={busy}
          onClick={() => {
            try {
              void save(tracks());
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Save and rebuild the transcript
        </button>
        {s.tracks.length > 0 && (
          <button disabled={busy} onClick={() => void save([])}>
            Back to the settings
          </button>
        )}
      </div>
    </details>
  );
}
