import { useEffect, useState } from 'react';
import { api } from '../../api';
import { copyText } from '../../clipboard';
import { href } from '../../router';
import type { EncounterState, FunnelStatus, JoinLink } from '../../types';

/**
 * The players' link for this encounter: copy it, replace it, and who has joined. It only hands out
 * a link that works for everyone: until Tailscale Funnel makes the players' page public, it says
 * what's missing and turns Funnel on with one button.
 */
export function JoinPanel({ state }: { state: EncounterState }) {
  const [link, setLink] = useState<JoinLink | null>(null);
  const [funnel, setFunnel] = useState<FunnelStatus | null>(null);
  const [turningOn, setTurningOn] = useState(false);
  const [note, setNote] = useState('');
  const [confirmNew, setConfirmNew] = useState(false);
  const code = state.join?.code;
  const loadLink = () => api<JoinLink>('/encounter/link').then(setLink, (e: Error) => setNote(e.message));
  useEffect(() => {
    void loadLink();
    // Funnel's state also saves its address when it's on, so load the link again after.
    api<FunnelStatus>('/players/funnel').then(
      (f) => {
        setFunnel(f);
        if (f.on) void loadLink();
      },
      () => setFunnel(null),
    );
  }, [code]);
  const makePublic = async () => {
    setTurningOn(true);
    setNote('');
    try {
      const f = await api<FunnelStatus>('/players/funnel', { method: 'POST', json: {} });
      setFunnel(f);
      if (f.on) {
        await loadLink();
        setNote('The link is public: anyone with it can join');
      }
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setTurningOn(false);
    }
  };

  const players = state.join?.players ?? [];
  const names = players.map((p) => state.combatants.find((c) => c.id === p.combatantId)?.name ?? 'a guest');
  const pcs = state.combatants.filter((c) => c.kind === 'pc');
  const joinedPcs = pcs.filter((c) => players.some((p) => p.combatantId === c.id));
  // Tailscale says Funnel is off: the saved address won't open for players, whatever the settings say.
  const blocked = funnel !== null && !funnel.on && funnel.problem !== 'no-tailscale';
  const shown = blocked ? null : (link?.url ?? null);
  const copy = async () => {
    if (!shown) return;
    try {
      await copyText(shown);
      setNote('Copied');
    } catch (e) {
      setNote((e as Error).message);
    }
  };
  const post = async () => {
    try {
      setNote((await api<{ message: string }>('/encounter/post', { method: 'POST', json: {} })).message);
    } catch (e) {
      setNote((e as Error).message);
    }
  };
  const replace = async () => {
    setConfirmNew(false);
    try {
      setLink(await api<JoinLink>('/encounter/link', { method: 'POST', json: {} }));
      setNote('New link made: the old one no longer works');
    } catch (e) {
      setNote((e as Error).message);
    }
  };

  return (
    <details className="card join-panel" open={players.length === 0 || (link !== null && !shown)}>
      <summary>
        <strong>Players’ link</strong>{' '}
        <span className="muted small">
          {pcs.length ? `${joinedPcs.length} of ${pcs.length} joined` : `${players.length} joined`}
          {names.length > 0 && ` · ${names.join(', ')}`}
        </span>
      </summary>
      {shown && <code className="join-url">{shown}</code>}
      {shown && funnel?.on && <p className="small good-text">✓ {funnel.message}</p>}
      {!shown && (
        <div className="join-blocked">
          <p className="small" style={{ margin: 0 }}>
            <strong>Players can’t open a link yet.</strong> {funnel && !funnel.on ? funnel.message : 'It needs a public address (Tailscale Funnel).'}
          </p>
          {(!funnel || (!funnel.on && (funnel.problem === 'off' || funnel.problem === 'other-port'))) && (
            <button className="primary" onClick={() => void makePublic()} disabled={turningOn}>
              {turningOn ? 'Turning on Funnel…' : 'Make the link public'}
            </button>
          )}
          {funnel?.approve && (
            <p className="small" style={{ margin: 0 }}>
              Tailscale asks you to allow Funnel once:{' '}
              <a href={funnel.approve} target="_blank" rel="noreferrer">
                approve it here
              </a>
              , then press <em>Make the link public</em> again.
            </p>
          )}
          {funnel && !funnel.on && funnel.problem === 'no-tailscale' && !link?.publicUrlSet && (
            <p className="small muted" style={{ margin: 0 }}>
              Or set the address by hand in <a href={href('settings', 'players')}>Settings → Encounters</a>.
            </p>
          )}
        </div>
      )}
      <div className="row">
        <button className="primary" onClick={() => void post()} disabled={!shown} title={link?.url ? 'Into the voice channel being recorded, or where /encounter was last used' : 'Set the public address first'}>
          Post to Discord
        </button>
        <button onClick={() => void copy()} disabled={!shown} title={shown ? 'Anyone with this link can join' : 'Make the link public first'}>
          Copy link
        </button>
        {link?.local && (
          <a className="button" href={`${link.local}?screen`} target="_blank" rel="noreferrer" title="The map in 3D, following the turns, as players see it: open it in a browser and share that tab or window on Discord">
            Screen view
          </a>
        )}
        {link?.local && (
          <a className="small" href={link.local} target="_blank" rel="noreferrer" title="Opens the players’ page on this Mac only, to try it yourself">
            Try it on this Mac
          </a>
        )}
        <button onClick={() => (confirmNew ? void replace() : setConfirmNew(true))} onBlur={() => setConfirmNew(false)}>
          {confirmNew ? 'Tap again: everyone rejoins' : 'New link'}
        </button>
        {note && (
          <span className="small muted" role="status">
            {note}
          </span>
        )}
      </div>
    </details>
  );
}
