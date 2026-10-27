import { useEffect, useRef } from 'react';
import type { MapViewProps } from './BattleMapView';
import { MapEngine3d } from './mapEngine3d';
import { loadPictures } from './paint';
import './map.css';

/** How close the screen view comes to whoever's turn it is: about a room's width around them. */
const FOLLOW_DISTANCE = 16;

/**
 * The battle map in 3D (#53): loaded only when someone switches to it, so three.js stays out of
 * the 2D map's download. Drag to turn the camera, pinch or scroll to zoom, two fingers (or the
 * right button) to pan; drag a token you may move, as on the 2D map.
 */
export default function Map3D(props: MapViewProps & { onUnavailable: () => void; follow?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const engine = useRef<MapEngine3d | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    let e: MapEngine3d;
    try {
      e = new MapEngine3d(wrap.current!, () => latest.current);
    } catch (err) {
      console.warn(`3D map unavailable: ${(err as Error).message}`);
      latest.current.onUnavailable();
      return;
    }
    engine.current = e;
    e.update();
    const scheme = window.matchMedia?.('(prefers-color-scheme: dark)');
    const restyle = () => e.restyle();
    scheme?.addEventListener?.('change', restyle);
    return () => {
      scheme?.removeEventListener?.('change', restyle);
      e.dispose();
      engine.current = null;
    };
  }, []);

  useEffect(() => {
    engine.current?.setLabel(`${props.label}, in 3D`);
    engine.current?.update();
  });

  // On a phone, start near my own character: the whole map is too small to play on there.
  const mineId = props.map.tokens.find((t) => props.info[t.id]?.mine)?.id;
  useEffect(() => {
    if (props.follow || !mineId || !wrap.current || wrap.current.clientWidth > 640) return;
    engine.current?.lookAt(mineId, 14);
  }, [mineId, props.follow]);

  // Following the action (the screen view): whoever's turn it is, else everything seen so far.
  const turn = props.map.tokens.find((t) => props.info[t.id]?.current);
  const focus = turn ? `${turn.id}@${turn.at.join(',')}` : `seen:${props.fog?.revealed.size ?? 0}`;
  useEffect(() => {
    if (!props.follow) return;
    if (turn) engine.current?.lookAt(turn.id, FOLLOW_DISTANCE);
    else engine.current?.resetView();
  }, [props.follow, focus]);

  // The art folder's pictures, painted on the floor as they arrive.
  const artIds = props.art?.ids.join(',') ?? '';
  useEffect(() => {
    const load = latest.current.loadArt;
    if (!load) return;
    return loadPictures(latest.current.art?.ids ?? [], load, () => engine.current?.update());
  }, [artIds]);

  const mine = props.map.tokens.find((t) => props.info[t.id]?.mine);
  return (
    <div className="battle-map map3d" ref={wrap}>
      <div className="battle-map-zoom">
        {turn && (
          <button type="button" aria-label={`Look at ${props.info[turn.id]?.name ?? turn.name}, whose turn it is`} title="Whose turn it is" onClick={() => engine.current?.lookAt(turn.id)}>
            ◎
          </button>
        )}
        {mine && mine.id !== turn?.id && (
          <button type="button" aria-label="Look at my character" title="My character" onClick={() => engine.current?.lookAt(mine.id)}>
            ☺
          </button>
        )}
        <button type="button" aria-label="Look straight down" title="From above" onClick={() => engine.current?.topView()}>
          ⊤
        </button>
        <button type="button" aria-label="See the whole map" title="The whole map" onClick={() => engine.current?.resetView()}>
          ⤢
        </button>
      </div>
    </div>
  );
}
