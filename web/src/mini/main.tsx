import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MiniBuilder } from '../minis/MiniBuilder';
import type { MiniSpec, PlayerMini } from '../types';
import '../styles.css';

/**
 * A player's private link (/mini/<token>): their character's paper mini, to build and save. The
 * link opens this one character and nothing else; the DM can make a new one or turn it off.
 */
const token = decodeURIComponent(window.location.pathname.split('/')[2] ?? '');

async function call(init?: RequestInit): Promise<PlayerMini> {
  const res = await fetch(`/m/${encodeURIComponent(token)}`, { ...init, headers: { 'Content-Type': 'application/json' } });
  const body = (await res.json().catch(() => ({}))) as PlayerMini & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `The table didn't answer (${res.status})`);
  return body;
}

function PlayerMiniApp() {
  const [figure, setFigure] = useState<PlayerMini | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    call().then(setFigure, (e: Error) => setError(e.message));
  }, []);
  if (error) return <div className="error-box">{error}</div>;
  if (!figure) return <p className="muted">Loading…</p>;
  return (
    <>
      <h1>{figure.name}'s mini</h1>
      <p className="muted small" style={{ marginTop: 0 }}>
        Pick the parts, then Save. It stands on the table's 3D map as your character.
      </p>
      <MiniBuilder name={figure.name} value={figure.mini} onSave={async (mini: MiniSpec | null) => setFigure(await call({ method: 'PUT', body: JSON.stringify({ mini }) }))} />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="content mini-page">
      <PlayerMiniApp />
    </main>
  </StrictMode>,
);
