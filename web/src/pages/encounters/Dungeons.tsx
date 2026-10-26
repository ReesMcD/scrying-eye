import { useEffect, useState } from 'react';
import { ApiError, api } from '../../api';
import type { WikiDungeon, WikiDungeonSummary } from '../../types';
import { Badge } from '../../ui';

/** The wiki's dungeons, to run room by room (ReesMcD/dnd-wiki#106). */
export function Dungeons({ onRun, busy }: { onRun: (id: string, campaign: string) => void; busy: boolean }) {
  const [list, setList] = useState<WikiDungeonSummary[] | null>(null);
  const [error, setError] = useState<{ message: string; quiet: boolean } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    // Not set up (409) is already explained above, for encounters.
    api<WikiDungeonSummary[]>('/encounters/dungeons').then(setList, (e: Error) => setError({ message: e.message, quiet: e instanceof ApiError && e.status === 409 }));
  }, []);
  if (error?.quiet) return null;

  return (
    <section aria-label="Dungeons">
      <h2>Dungeons</h2>
      {error && <p className="muted small">{error.message}</p>}
      {!list && !error && <p className="muted">Loading the wiki’s dungeons…</p>}
      {list && !list.length && <p className="muted small">None yet. In a Claude chat with your wiki: “plan a dungeon under the old mill”, then ask for its floor plan.</p>}
      {list?.map((d) => (
        <DungeonCard key={`${d.campaign}/${d.id}`} summary={d} open={open === d.id} onToggle={() => setOpen(open === d.id ? null : d.id)} onRun={() => onRun(d.id, d.campaign)} busy={busy} />
      ))}
    </section>
  );
}

const ROLE: Record<string, string> = { guardian: 'guardian', puzzle: 'puzzle', trick: 'trick', trap: 'trap', explore: 'explore', climax: 'climax', reward: 'reward' };

function DungeonCard({ summary, open, onToggle, onRun, busy }: { summary: WikiDungeonSummary; open: boolean; onToggle: () => void; onRun: () => void; busy: boolean }) {
  const [detail, setDetail] = useState<WikiDungeon | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open || detail) return;
    api<WikiDungeon>(`/encounters/dungeons/${encodeURIComponent(summary.id)}?campaign=${encodeURIComponent(summary.campaign)}`).then(setDetail, (e: Error) => setError(e.message));
  }, [open, detail, summary.id, summary.campaign]);

  return (
    <div className="card encounter-card">
      <div className="row spread">
        <button type="button" className="link encounter-title" aria-expanded={open} onClick={onToggle}>
          {summary.title}
        </button>
        <div className="row">
          {summary.run && <Badge tone="good">run</Badge>}
          <button className="primary" onClick={onRun} disabled={busy || !summary.has_map} title={summary.has_map ? undefined : 'Make its floor plan in the wiki first'}>
            Run
          </button>
        </div>
      </div>
      <div className="muted small">
        {[summary.place, summary.campaign, `${summary.rooms} room${summary.rooms === 1 ? '' : 's'}`, summary.party_level ? `level ${summary.party_level}` : null, summary.has_map ? null : 'no floor plan yet'].filter(Boolean).join(' · ')}
      </div>
      {open && (
        <div className="encounter-preview">
          {error && <div className="error-box">{error}</div>}
          {!detail && !error && <p className="muted small">Loading…</p>}
          {detail && (
            <>
              {detail.summary && <p>{detail.summary}</p>}
              {detail.read_aloud && <blockquote className="read-aloud">{detail.read_aloud}</blockquote>}
              <ol className="dungeon-rooms small">
                {detail.rooms.map((r) => (
                  <li key={r.key}>
                    <strong>{r.name}</strong>
                    {r.role && ROLE[r.role] && <span className="muted"> · {ROLE[r.role]}</span>}
                    {r.encounter && <span> · ⚔ {r.encounter.creatures.length ? r.encounter.creatures.map((c) => `${c.count} × ${c.name}`).join(', ') : r.encounter.text}</span>}
                    {r.trap && <span> · trap</span>}
                    {r.puzzle && <span> · puzzle: {r.puzzle.name}</span>}
                    {r.treasure && <span> · treasure</span>}
                  </li>
                ))}
              </ol>
              {detail.map_error && <p className="small bad-text">The floor plan has a problem: {detail.map_error}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
