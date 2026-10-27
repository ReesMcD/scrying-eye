import { useState } from 'react';
import { api } from '../../api';
import { Field, Toggle } from '../../ui';
import type { FunnelStatus } from '../../types';
import type { SectionProps } from './shared';

/** Encounter settings: where players join from their phones (the address Tailscale Funnel gives this Mac), and the monster-turn assistant. */
export function PlayersSection({ config, update, err }: SectionProps) {
  const p = config.players;
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [funnel, setFunnel] = useState<FunnelStatus | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  /** Turns Funnel on from here and fills in its address (the server saves it too). */
  const setUp = async () => {
    setSettingUp(true);
    setCheck(null);
    try {
      const f = await api<FunnelStatus>('/players/funnel', { method: 'POST', json: {} });
      setFunnel(f);
      if (f.on) update((c) => void (c.players.public_url = f.publicUrl));
    } catch (e) {
      setFunnel(null);
      setCheck({ ok: false, message: (e as Error).message });
    } finally {
      setSettingUp(false);
    }
  };
  const runCheck = async () => {
    setChecking(true);
    setCheck(null);
    try {
      setCheck(await api<{ ok: boolean; message: string }>('/players/check', { method: 'POST', json: { public_url: p.public_url } }));
    } catch (e) {
      setCheck({ ok: false, message: (e as Error).message });
    } finally {
      setChecking(false);
    }
  };
  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Players’ link</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          Players join an encounter from a link in Discord, on their phone or in a browser, with nothing to install. Scrying Eye serves only the players’ page on its
          own port, on this Mac alone; <strong>Tailscale Funnel</strong> makes that one port public. The app itself and its password never are.
        </p>
        <div className="row">
          <button className="primary" onClick={() => void setUp()} disabled={settingUp}>
            {settingUp ? 'Setting up…' : 'Set it up for me'}
          </button>
          {funnel && (
            <span className={`small ${funnel.on ? 'good-text' : 'bad-text'}`} role="status">
              {funnel.on ? `✓ ${funnel.message} (${funnel.publicUrl})` : funnel.message}
              {funnel.approve && (
                <>
                  {' '}
                  <a href={funnel.approve} target="_blank" rel="noreferrer">
                    Approve Funnel in Tailscale
                  </a>
                  , then press it again.
                </>
              )}
            </span>
          )}
        </div>
        <p className="muted small">Or by hand:</p>
        <ol className="small setup-steps">
          <li>
            In the Tailscale admin console: turn on <strong>MagicDNS</strong> and <strong>HTTPS certificates</strong> (DNS page).
          </li>
          <li>
            On this Mac, in Terminal: <code>tailscale funnel --bg {p.port}</code>. The first time, it asks you to approve Funnel in the browser.
          </li>
          <li>Paste the https address it prints below, save, and check.</li>
        </ol>
        <Field label="Public address" hint="Like https://your-mac.tail1234.ts.net" error={err('players.public_url')}>
          <input
            type="url"
            inputMode="url"
            value={p.public_url ?? ''}
            placeholder="https://your-mac.tail1234.ts.net"
            onChange={(e) => update((c) => void (c.players.public_url = e.target.value.trim() || undefined))}
          />
        </Field>
        <Field label="Port" hint="The players' page listens here (this Mac only). Restart the app after changing it." error={err('players.port')}>
          <input inputMode="numeric" value={p.port} onChange={(e) => update((c) => void (c.players.port = Number(e.target.value.replace(/\D/g, '')) || 4410))} />
        </Field>
        <div className="row">
          <button disabled={!p.public_url || checking} onClick={() => void runCheck()}>
            {checking ? 'Checking…' : 'Check it works'}
          </button>
          {check && (
            <span className={`small ${check.ok ? 'good-text' : 'bad-text'}`} role="status">
              {check.message}
            </span>
          )}
        </div>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Monster turns</h2>
        <Toggle
          checked={config.encounters.assistant}
          onChange={(v) => update((c) => void (c.encounters.assistant = v))}
          label="Suggest monsters’ moves"
          hint="On a monster’s turn, the tracker’s Suggest button asks Claude what it would do, from its stat block, the wiki’s tactics and the map. You decide; nothing happens by itself. Uses the recap’s model and Anthropic key (a few cents a fight)."
        />
      </div>
    </>
  );
}
