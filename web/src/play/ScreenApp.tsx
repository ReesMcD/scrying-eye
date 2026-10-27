import { lazy, Suspense, useEffect, useState } from 'react';
import type { PlayerCombatant, PlayerView } from '../../../src/shared/types';
import { RollList } from '../dice/DicePanel';
import { OrbMark } from '../icons';
import { BattleMapView } from '../map/BattleMapView';
import { useArtPlan } from '../map/useArtPlan';
import { follow, play, PlayError } from './client';
import { playerTokenInfo } from './tokenInfo';

const Map3D = lazy(() => import('../map/Map3D'));

/**
 * The screen the DM shares on Discord (`/play/<code>?screen`): the map in 3D, filling the window,
 * following whoever's turn it is, with the turn order and the latest rolls on top. It sees what
 * the players see (the same fog, no hidden creatures) and controls nothing.
 */
export function ScreenApp() {
  const [view, setView] = useState<PlayerView | null>(null);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let stop: (() => void) | undefined;
    play.view().then(
      (v) => {
        setView(v);
        stop = follow({ onView: setView, onEnded: () => setEnded(true), onRejoin: () => undefined });
      },
      (e: unknown) => (e instanceof PlayError && (e.status === 410 || e.status === 404) ? setEnded(true) : setError((e as Error).message)),
    );
    return () => stop?.();
  }, []);

  if (ended) return <Message title="This encounter has ended" text="Start a new one in Scrying Eye, then open its screen view again." />;
  if (error) return <Message title="Couldn’t open the encounter" text={error} />;
  if (!view) return <Message title="Opening the encounter…" />;
  return <Screen view={view} />;
}

function Screen({ view }: { view: PlayerView }) {
  const [flat, setFlat] = useState(false);
  const art = useArtPlan(view.map, play.art);
  const current = view.order.find((c) => c.current);
  const info = playerTokenInfo({ ...view, me: null });
  const map = view.map;
  const props = map && {
    map,
    info,
    canMove: () => false,
    onMove: () => undefined,
    fog: view.fog ? { revealed: new Set(view.fog), solid: true } : null,
    art,
    loadArt: play.artImage,
    label: `${view.title}: battle map`,
  };

  return (
    <div className="screen">
      {props ? (
        flat ? (
          <BattleMapView {...props} />
        ) : (
          <Suspense fallback={<div className="battle-map map3d-loading">Loading the 3D map…</div>}>
            <Map3D {...props} follow onUnavailable={() => setFlat(true)} />
          </Suspense>
        )
      ) : (
        <div className="screen-empty muted">No map yet</div>
      )}
      <header className="screen-top">
        <OrbMark size={22} />
        <span className="screen-title">{view.title}</span>
        <span className="screen-status">{view.status === 'running' ? `Round ${view.round}` : view.status === 'exploring' ? 'Exploring' : view.status === 'setup' ? 'Roll initiative' : ''}</span>
        {current && <span className="screen-turn">{current.name}’s turn</span>}
      </header>
      {view.status !== 'exploring' && view.order.length > 0 && (
        <ol className="screen-order" aria-label="Turn order">
          {view.order.map((c) => (
            <Turn key={c.id} c={c} />
          ))}
        </ol>
      )}
      {view.rolls.length > 0 && (
        <div className="screen-rolls" aria-label="Latest rolls">
          <RollList rolls={view.rolls.slice(-3)} />
        </div>
      )}
    </div>
  );
}

function Turn({ c }: { c: PlayerCombatant }) {
  return (
    <li className={`screen-chip ${c.kind}${c.current ? ' current' : ''}`}>
      <span>{c.name}</span>
    </li>
  );
}

function Message({ title, text }: { title: string; text?: string }) {
  return (
    <div className="play">
      <div className="empty">
        <strong>{title}</strong>
        {text}
      </div>
    </div>
  );
}
