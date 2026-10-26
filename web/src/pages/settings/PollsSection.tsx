import { useEffect, useState } from 'react';
import { api } from '../../api';
import { when } from '../../format';
import type { Poll, PollAnswers, PollSchedule, PollsState } from '../../types';
import { Field, Segmented, Toggle } from '../../ui';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const OPEN_FOR = [
  { hours: 1, label: '1 hour' },
  { hours: 12, label: '12 hours' },
  { hours: 24, label: '1 day' },
  { hours: 48, label: '2 days' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '1 week' },
];

type Draft = Pick<Poll, 'question' | 'channelId' | 'answers' | 'schedule' | 'hours' | 'multiSelect' | 'announce' | 'enabled'>;

const blank = (channelId: string): Draft => ({
  question: 'Which day for the next session?',
  channelId,
  answers: { kind: 'days', count: 7, startInDays: 1 },
  schedule: { kind: 'weekly', weekday: 1, time: '10:00' },
  hours: 48,
  multiSelect: true,
  announce: { on: true },
  enabled: true,
});

/** The next whole hour, as "2026-10-27T10:00" wall-clock time in the polls' time zone (what the server reads). */
function nextHour(timeZone: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(Date.now() + 3_600_000)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:00`;
}

function describeSchedule(s: PollSchedule): string {
  return s.kind === 'weekly' ? `Every ${WEEKDAYS[s.weekday]} at ${s.time}` : `Once, ${s.at.replace('T', ' at ')}`;
}

/** Scheduled Discord polls (#43): "which day for the next session?", posted on a day and time you pick. */
export function PollsSection() {
  const [state, setState] = useState<PollsState | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api<PollsState>('/polls').then(setState, (e: Error) => setError(e.message));
  }, []);
  const run = async (key: string, f: () => Promise<PollsState>) => {
    setBusy(key);
    setError('');
    try {
      setState(await f());
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };
  if (!state) return error ? <div className="error-box">{error}</div> : <p className="muted">Loading…</p>;
  const channelName = (id: string) => {
    const c = state.channels.find((x) => x.id === id);
    return c ? `#${c.name}` : 'a channel the bot can’t see';
  };

  return (
    <div>
      <p className="muted small">
        The bot posts a Discord poll on a day and time you pick, e.g. every Monday morning: “Which day for the next session?” with the coming days as answers. Times are
        in {state.timeZone} (Settings → Transcription changes it). A poll due while the app was off posts when it starts, once, saying it’s late. The bot needs the{' '}
        <strong>Send Polls</strong> permission: if the Record page asks you to re-add the bot, do that first.
      </p>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {!state.channels.length && <div className="card notice small">The bot isn’t connected, so there are no channels to pick. Polls you set up post once it is.</div>}

      {state.polls.map((p) => {
        const last = p.posts.at(-1);
        const total = last?.results?.answers.reduce((s, a) => s + a.votes, 0) ?? 0;
        return (
          <div key={p.id} className="card poll">
            <div className="row spread">
              <strong>{p.question}</strong>
              <Toggle
                checked={p.enabled}
                onChange={(on) => void run(`on-${p.id}`, () => api<PollsState>(`/polls/${p.id}`, { method: 'PUT', json: { ...p, enabled: on } }))}
                label={p.enabled ? 'On' : 'Paused'}
              />
            </div>
            <p className="muted small" style={{ margin: '2px 0 8px' }}>
              {describeSchedule(p.schedule)} in {channelName(p.channelId)} · open {OPEN_FOR.find((o) => o.hours === p.hours)?.label ?? `${p.hours} hours`}
              {p.next ? ` · next ${when(p.next)}` : p.enabled ? ' · done' : ''}
            </p>
            {last && (
              <div className="poll-last">
                <div className="small muted">
                  Posted {when(last.postedAt)}
                  {last.late ? ' (late)' : ''}
                  {last.manual ? ' (by hand)' : ''} · {Date.now() < last.closesAt ? `closes ${when(last.closesAt)}` : 'closed'}
                  {last.announced ? ' · winner posted' : ''}
                </div>
                {last.results ? (
                  <ul className="poll-results">
                    {last.results.answers.map((a) => (
                      <li key={a.text}>
                        <span className="poll-bar" style={{ width: `${total ? (a.votes / total) * 100 : 0}%` }} />
                        <span>
                          <strong>{a.text}</strong> · {a.votes}
                          {a.voters.length > 0 && <span className="muted small"> ({a.voters.join(', ')})</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted small">Answers: {last.answers.join(', ')}</p>
                )}
              </div>
            )}
            <div className="row" style={{ marginTop: 8 }}>
              <button disabled={!!busy} onClick={() => void run(`post-${p.id}`, () => api<PollsState>(`/polls/${p.id}/post`, { method: 'POST' }))}>
                {busy === `post-${p.id}` ? 'Posting…' : 'Post now'}
              </button>
              {last && (
                <button disabled={!!busy} onClick={() => void run(`refresh-${p.id}`, () => api<PollsState>(`/polls/${p.id}/refresh`, { method: 'POST' }))}>
                  {busy === `refresh-${p.id}` ? 'Checking…' : 'See votes'}
                </button>
              )}
              <button className="link" onClick={() => setEditing({ id: p.id, draft: { ...p } })}>
                Edit
              </button>
              <button className="link danger" disabled={!!busy} onClick={() => void run(`del-${p.id}`, () => api<PollsState>(`/polls/${p.id}`, { method: 'DELETE' }))}>
                Delete
              </button>
            </div>
          </div>
        );
      })}

      {editing ? (
        <PollForm
          draft={editing.draft}
          isNew={!editing.id}
          state={state}
          busy={busy === 'save'}
          onCancel={() => setEditing(null)}
          onSave={async (draft) => {
            const ok = await run('save', () => (editing.id ? api<PollsState>(`/polls/${editing.id}`, { method: 'PUT', json: draft }) : api<PollsState>('/polls', { method: 'POST', json: draft })));
            if (ok) setEditing(null);
          }}
        />
      ) : (
        <button className="primary" onClick={() => setEditing({ id: null, draft: blank(state.channels[0]?.id ?? '') })}>
          New poll
        </button>
      )}
    </div>
  );
}

function PollForm({ draft: initial, isNew, state, busy, onSave, onCancel }: { draft: Draft; isNew: boolean; state: PollsState; busy: boolean; onSave: (d: Draft) => Promise<void>; onCancel: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const [typed, setTyped] = useState(initial.answers.kind === 'fixed' ? initial.answers.list.join('\n') : '');
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const days = d.answers.kind === 'days' ? d.answers : null;
  const setDays = (patch: Partial<Extract<PollAnswers, { kind: 'days' }>>) => set({ answers: { ...(days ?? { kind: 'days', count: 7, startInDays: 1 }), ...patch } });
  const answers = (): PollAnswers => (d.answers.kind === 'fixed' ? { kind: 'fixed', list: typed.split('\n').map((a) => a.trim()).filter(Boolean) } : d.answers);

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>{isNew ? 'New poll' : 'Edit poll'}</h2>
      <Field label="Question">
        <input value={d.question} maxLength={300} onChange={(e) => set({ question: e.target.value })} />
      </Field>
      <Field label="Channel">
        {state.channels.length ? (
          <select value={d.channelId} onChange={(e) => set({ channelId: e.target.value })}>
            {state.channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name} ({c.guild})
              </option>
            ))}
          </select>
        ) : (
          <input value={d.channelId} inputMode="numeric" placeholder="The channel's ID" onChange={(e) => set({ channelId: e.target.value.trim() })} />
        )}
      </Field>

      <span className="field-label">Answers</span>
      <Segmented
        value={d.answers.kind}
        options={[
          { value: 'days', label: 'The coming days' },
          { value: 'fixed', label: 'Typed' },
        ]}
        onChange={(kind) => set({ answers: kind === 'days' ? { kind: 'days', count: 7, startInDays: 1 } : { kind: 'fixed', list: [] } })}
      />
      {days ? (
        <div style={{ marginTop: 8 }}>
          <div className="row">
            <label className="small">
              Up to{' '}
              <input className="narrow" type="number" min={1} max={10} value={days.count} onChange={(e) => setDays({ count: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })} /> days,
            </label>
            <label className="small">
              starting{' '}
              <select value={days.startInDays} onChange={(e) => setDays({ startInDays: Number(e.target.value) })}>
                <option value={0}>the day it posts</option>
                <option value={1}>the day after</option>
                {[2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n} days after
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="chips">
            {WEEKDAYS.map((w, i) => {
              const on = !days.weekdays?.length || days.weekdays.includes(i);
              return (
                <button
                  key={w}
                  type="button"
                  className={`chip${on ? '' : ' off'}`}
                  aria-pressed={on}
                  onClick={() => {
                    const current = days.weekdays?.length ? days.weekdays : [0, 1, 2, 3, 4, 5, 6];
                    const next = current.includes(i) ? current.filter((x) => x !== i) : [...current, i];
                    setDays({ weekdays: next.length === 7 ? [] : next.sort() });
                  }}
                >
                  {w.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <Field label="" hint="One per line, up to 10 (55 characters each).">
          <textarea rows={4} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={'Pizza\nTacos'} />
        </Field>
      )}

      <span className="field-label">When</span>
      <Segmented
        value={d.schedule.kind}
        options={[
          { value: 'weekly', label: 'Every week' },
          { value: 'once', label: 'Once' },
        ]}
        onChange={(kind) => set({ schedule: kind === 'weekly' ? { kind: 'weekly', weekday: 1, time: '10:00' } : { kind: 'once', at: nextHour(state.timeZone) } })}
      />
      <div className="row" style={{ marginTop: 8 }}>
        {d.schedule.kind === 'weekly' ? (
          <>
            <select value={d.schedule.weekday} onChange={(e) => set({ schedule: { ...(d.schedule as Extract<PollSchedule, { kind: 'weekly' }>), weekday: Number(e.target.value) } })}>
              {WEEKDAYS.map((w, i) => (
                <option key={w} value={i}>
                  {w}
                </option>
              ))}
            </select>
            <input type="time" value={d.schedule.time} onChange={(e) => set({ schedule: { ...(d.schedule as Extract<PollSchedule, { kind: 'weekly' }>), time: e.target.value } })} />
          </>
        ) : (
          <input type="datetime-local" value={d.schedule.at} onChange={(e) => set({ schedule: { kind: 'once', at: e.target.value.slice(0, 16) } })} />
        )}
        <span className="muted small">{state.timeZone}</span>
      </div>

      <Field label="Open for">
        <select value={d.hours} onChange={(e) => set({ hours: Number(e.target.value) })}>
          {OPEN_FOR.map((o) => (
            <option key={o.hours} value={o.hours}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <Toggle checked={d.multiSelect} onChange={(multiSelect) => set({ multiSelect })} label="People can pick more than one" />
      <Toggle checked={d.announce.on} onChange={(on) => set({ announce: { ...d.announce, on } })} label="Post the winner when it closes" hint="e.g. “📊 Which day for the next session?: Sat 25 Oct (4 votes)”" />
      {d.announce.on && (
        <Field label="Mention a role" hint="Optional. The role must allow mentions (or the bot needs Mention @everyone).">
          <select value={d.announce.roleId ?? ''} onChange={(e) => set({ announce: { on: true, ...(e.target.value ? { roleId: e.target.value } : {}) } })}>
            <option value="">Nobody</option>
            {state.roles.map((r) => (
              <option key={r.id} value={r.id}>
                @{r.name} ({r.guild})
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="row">
        <button className="primary" disabled={busy} onClick={() => void onSave({ ...d, answers: answers() })}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
