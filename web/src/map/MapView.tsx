import { lazy, Suspense, useState } from 'react';
import { BattleMapView, type MapViewProps } from './BattleMapView';

const Map3D = lazy(() => import('./Map3D'));

type Mode = '2d' | '3d';
const KEY = 'map-view';

function stored(): Mode {
  try {
    return localStorage.getItem(KEY) === '3d' ? '3d' : '2d';
  } catch {
    return '2d';
  }
}

/**
 * The battle map, flat or in 3D (#53). 2D is the default for play; this device remembers the
 * choice. Placing a spell area happens on the flat map, and 3D falls back to it where WebGL
 * isn't available.
 */
export function MapView(props: MapViewProps) {
  const [mode, setMode] = useState<Mode>(stored);
  const [unavailable, setUnavailable] = useState(false);
  const placingArea = !!props.onCornerDrag;
  const show3d = mode === '3d' && !unavailable && !placingArea;
  const choose = (m: Mode) => {
    setMode(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {
      // Private browsing: it just isn't remembered.
    }
  };

  return (
    <div className="map-view">
      <div className="segmented map-view-switch" role="radiogroup" aria-label="Map view">
        {(['2d', '3d'] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => choose(m)}>
            {m.toUpperCase()}
          </button>
        ))}
      </div>
      {show3d ? (
        <Suspense fallback={<div className="battle-map map3d-loading">Loading the 3D map…</div>}>
          <Map3D {...props} onUnavailable={() => setUnavailable(true)} />
        </Suspense>
      ) : (
        <BattleMapView {...props} />
      )}
      {mode === '3d' && placingArea && <p className="muted small map-hint">Areas are placed on the flat map; it switches back to 3D after.</p>}
      {mode === '3d' && unavailable && <p className="muted small map-hint">3D needs WebGL, which this browser doesn’t offer: showing the flat map.</p>}
    </div>
  );
}
