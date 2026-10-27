import { useEffect, useRef, useState } from 'react';
import type { ConditionName, PlayerCombatant, PlayerView } from '../../../src/shared/types';
import { OrbMark } from '../icons';
import { MapView } from '../map/MapView';
import { useArtPlan } from '../map/useArtPlan';
import { useAreaTool } from '../map/AreaTool';
import { DicePanel, RollList } from '../dice/DicePanel';
import { device, follow, play, PlayError } from './client';
import { playerTokenInfo } from './tokenInfo';
import { MiniBuilder } from '../minis/MiniBuilder';

const CONDITIONS: ConditionName[] = ['Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious'];

type Screen = { kind: 'loading' } | { kind: 'ended' } | { kind: 'join'; view: PlayerView } | { kind: 'play'; view: PlayerView };

/** What a player sees after tapping the link in Discord: pick your character once, then follow the fight. */
export function PlayerApp() {
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });
  const [error, setError] = useState('');
  // Bumped after joining, so the live stream reconnects as this device.
  const [connection, setConnection] = useState(0);
  const [miniOpen, setMiniOpen] = useState(false);
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    const joined = !!device.token;
    let stop: (() => void) | undefined;
    const start = () => {
      stop?.();
      stop = follow({
        onView: (view) => setScreen(device.token ? { kind: 'play', view } : { kind: 'join', view }),
        onEnded: () => setScreen({ kind: 'ended' }),
        onRejoin: () => {
          device.token = '';
          start();
        },
      });
    };
    play.view().then(
      (view) => {
        setScreen(joined ? { kind: 'play', view } : { kind: 'join', view });
        start();
      },
      (e: unknown) => {
        if (e instanceof PlayError && e.status === 401) {
          device.token = '';
          start();
        } else if (e instanceof PlayError && (e.status === 410 || e.status === 404)) setScreen({ kind: 'ended' });
        else setError((e as Error).message);
      },
    );
    return () => stop?.();
  }, [connection]);

  const join = async (combatantId: string | null) => {
    setError('');
    try {
      const { token, view } = await play.join(combatantId);
      device.token = token;
      setScreen({ kind: 'play', view });
      setConnection((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const act = async (request: Parameters<typeof play.act>[0]) => {
    setError('');
    try {
      setScreen({ kind: 'play', view: await play.act(request) });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="play">
      <header className="play-top">
        <OrbMark size={24} /> <span>Scrying Eye</span>
      </header>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {screen.kind === 'loading' && !error && <p className="muted">Opening the encounter…</p>}
      {screen.kind === 'ended' && (
        <div className="empty">
          <strong>This encounter has ended</strong>
          Or the DM made a new link: ask for it in Discord.
        </div>
      )}
      {screen.kind === 'join' && <Join view={screen.view} onJoin={join} />}
      {screen.kind === 'play' &&
        (miniOpen || needsMini(screen.view, skipped) ? (
          <MiniStep
            view={screen.view}
            onSaved={(view) => {
              // Back to the default figure counts as an answer: don't ask again.
              rememberSkip(view);
              setSkipped(!view.myMini);
              setScreen({ kind: 'play', view });
              setMiniOpen(false);
            }}
            onClose={() => {
              rememberSkip(screen.view);
              setSkipped(true);
              setMiniOpen(false);
            }}
          />
        ) : (
          <Fight view={screen.view} act={act} onMini={() => setMiniOpen(true)} />
        ))}
    </div>
  );
}

function Join({ view, onJoin }: { view: PlayerView; onJoin: (id: string | null) => void }) {
  return (
    <div>
      <p className="muted small play-kicker">Round {Math.max(view.round, 1)}</p>
      <h1>{view.title}</h1>
      <p className="muted">Pick your character to follow the fight and take your turns. This device remembers it.</p>
      <ul className="join-list">
        {view.party.map((p) => (
          <li key={p.id}>
            <button className="join-pc" disabled={p.taken} onClick={() => onJoin(p.id)}>
              <span className="avatar">{p.name.slice(0, 2).toUpperCase()}</span>
              <span className="join-name">{p.name}</span>
              <span className="muted small">{p.taken ? 'Joined' : 'This is me'}</span>
            </button>
          </li>
        ))}
      </ul>
      <button className="link" onClick={() => onJoin(null)}>
        Just watch
      </button>
    </div>
  );
}

/** My character's name, once this device has picked one. */
const myName = (view: PlayerView) => view.party.find((p) => p.id === view.me)?.name ?? null;
const skipKey = (name: string) => `mini-skipped:${name.toLowerCase()}`;

/** Ask for a mini once: when my character has none and I haven't said "later" on this device. */
function needsMini(view: PlayerView, skippedNow: boolean): boolean {
  const name = myName(view);
  if (!name || view.myMini || skippedNow) return false;
  try {
    return !localStorage.getItem(skipKey(name));
  } catch {
    return true;
  }
}

function rememberSkip(view: PlayerView) {
  const name = myName(view);
  try {
    if (name && !view.myMini) localStorage.setItem(skipKey(name), '1');
  } catch {
    /* private mode: asks again next time */
  }
}

/** My character's paper mini: pick a ready-made one or build one. It's kept for every encounter. */
function MiniStep({ view, onSaved, onClose }: { view: PlayerView; onSaved: (view: PlayerView) => void; onClose: () => void }) {
  const name = myName(view) ?? 'Your character';
  return (
    <div className="stack">
      <div>
        <p className="muted small play-kicker">{view.title}</p>
        <h1>{name}'s mini</h1>
        <p className="muted">
          {view.myMini ? 'Change how you stand on the map.' : 'How you stand on the 3D map: pick a ready-made figure and change what you like, or build your own.'} It's saved to {name} for every
          encounter.
        </p>
      </div>
      <MiniBuilder
        name={name}
        value={view.myMini}
        onSave={async (mini) => {
          onSaved(await play.saveMini(mini));
        }}
      />
      <button type="button" className="link" onClick={onClose}>
        {view.myMini ? 'Back to the fight' : 'Not now'}
      </button>
    </div>
  );
}

function Fight({ view, act, onMini }: { view: PlayerView; act: (r: Parameters<typeof play.act>[0]) => Promise<void>; onMini: () => void }) {
  const me = view.order.find((c) => c.id === view.me) ?? null;
  const myTurn = !!view.me && view.turn === view.me;
  const current = view.order.find((c) => c.current);
  const wasMyTurn = useRef(false);
  useEffect(() => {
    if (myTurn && !wasMyTurn.current) navigator.vibrate?.([120, 60, 120]);
    wasMyTurn.current = myTurn;
  }, [myTurn]);

  return (
    <div className="stack">
      <div>
        <p className="muted small play-kicker">{view.status === 'running' ? `Round ${view.round}` : view.status === 'exploring' ? 'Exploring' : 'Getting ready'}</p>
        <h1>{view.title}</h1>
        {view.me && (
          <button type="button" className="link" onClick={onMini}>
            {view.myMini ? 'My mini' : 'Make my mini'}
          </button>
        )}
      </div>
      {myTurn ? (
        <div className="your-turn" role="status">
          Your turn
        </div>
      ) : (
        view.status === 'running' && <p className="muted">{current ? `${current.name}’s turn` : 'Someone is taking their turn…'}</p>
      )}
      {me && <MyCard me={me} act={act} />}
      {view.map && <PlayerMap view={view} act={act} />}
      {me ? (
        <DicePanel rolls={view.rolls} onRoll={(expression, label) => act({ type: 'roll', expression, ...(label ? { label } : {}) })} />
      ) : (
        view.rolls.length > 0 && (
          <section className="card" aria-label="Dice">
            <h2 style={{ marginTop: 0 }}>Dice</h2>
            <RollList rolls={view.rolls} />
          </section>
        )
      )}
      <section aria-label="Turn order">
        <h2>Turn order</h2>
        <ol className="play-order">
          {view.order.map((c) => (
            <OrderRow key={c.id} c={c} you={c.id === view.me} />
          ))}
        </ol>
      </section>
    </div>
  );
}

/** The map: what's revealed, the party's HP, my own token to drag, and spell areas. */
function PlayerMap({ view, act }: { view: PlayerView; act: (r: Parameters<typeof play.act>[0]) => Promise<void> }) {
  const map = view.map!;
  const art = useArtPlan(map, play.art);
  const area = useAreaTool({
    map,
    templates: view.templates,
    me: view.me ?? 'guest',
    onPlace: (template) => void act({ type: 'template', template }),
    onClear: (id) => void act({ type: 'clearTemplate', id }),
  });
  const myToken = view.me ? view.tokens[view.me] : undefined;
  // Any of the party's pieces can be moved, as at a real table; monsters are the DM's.
  const partyTokens = new Set(view.order.filter((c) => c.kind === 'pc').map((c) => view.tokens[c.id]));
  const info = playerTokenInfo(view);
  return (
    <section aria-label="Battle map">
      <h2>Map</h2>
      {view.me && area.controls}
      <MapView
        map={map}
        info={info}
        canMove={(t) => !!view.me && partyTokens.has(t) && !area.active}
        onMove={(token, at) => void act(token === myToken ? { type: 'move', at } : { type: 'move', at, token })}
        fog={view.fog ? { revealed: new Set(view.fog), solid: true } : null}
        overlays={area.overlays}
        {...(view.me && area.onCornerDrag ? { onCornerDrag: area.onCornerDrag } : {})}
        art={art}
        loadArt={play.artImage}
        label={`Battle map, ${map.width} by ${map.height} squares`}
      />
      <p className="muted small map-hint">
        {area.active
          ? 'Drag on the map to place your spell’s area (everyone sees it) or to measure.'
          : myToken
            ? 'Drag your token (ringed), or a friend’s, to move it. Pinch to zoom, drag the map to look around.'
            : view.me
              ? 'The DM hasn’t put you on the map yet.'
              : 'Pinch to zoom, drag to look around.'}
      </p>
    </section>
  );
}

/** My character: just reminders (conditions) I can set myself. HP and AC stay on my sheet. */
function MyCard({ me, act }: { me: PlayerCombatant; act: (r: Parameters<typeof play.act>[0]) => Promise<void> }) {
  const [condition, setCondition] = useState<ConditionName>('Prone');
  return (
    <section className="card my-card" aria-label="Your character">
      <strong className="my-name">{me.name}</strong>
      {me.conditions.length > 0 && (
        <div className="chips">
          {me.conditions.map((x) => (
            <button key={x.name} className="chip" aria-label={`Remove ${x.name}`} onClick={() => void act({ type: 'condition', name: x.name, remove: true })}>
              {x.name}
              {x.level ? ` ${x.level}` : ''}
              {x.rounds ? ` · ${x.rounds}r` : ''} ✕
            </button>
          ))}
        </div>
      )}
      <div className="row">
        <label htmlFor="cond" className="visually-hidden">
          Condition
        </label>
        <select id="cond" value={condition} onChange={(e) => setCondition(e.target.value as ConditionName)} style={{ flex: 1 }}>
          {CONDITIONS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button onClick={() => void act({ type: 'condition', name: condition })}>Add condition</button>
      </div>
    </section>
  );
}

function OrderRow({ c, you }: { c: PlayerCombatant; you: boolean }) {
  return (
    <li className={`play-row ${c.current ? 'current' : ''}`}>
      <span className={`kind-dot ${c.kind}`} aria-hidden />
      <span className="play-row-main">
        <span className="play-row-name">
          {c.name}
          {you && <span className="badge accent">you</span>}
        </span>
        {c.conditions.length > 0 && <span className="muted small">{c.conditions.map((x) => x.name).join(', ')}</span>}
      </span>
    </li>
  );
}
