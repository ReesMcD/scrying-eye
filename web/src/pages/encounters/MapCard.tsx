import { useState } from 'react';
import { api, apiBlob } from '../../api';
import { doorsAt, isDifficult, secretDoorsAt, type BattleMap, type Cell, type MapToken } from '../../../../src/shared/battlemap';
import { cellKey, roomAt } from '../../../../src/shared/mapSight';
import { useAreaTool } from '../../map/AreaTool';
import type { TokenInfo } from '../../map/BattleMapView';
import { MapView } from '../../map/MapView';
import { useArtPlan } from '../../map/useArtPlan';
import type { ArtPlan, EncounterAction, EncounterState } from '../../types';
import { Segmented } from '../../ui';

type Act = (action: EncounterAction) => Promise<void>;
type Tool = 'move' | 'doors' | 'difficult' | 'fog';

const NEXT_DOOR_STATE = { open: 'closed', closed: 'locked', locked: 'open' } as const;

/** The DM's battle map, or a way to add a blank one. */
export function MapCard({ state, act, onSelect }: { state: EncounterState; act: Act; onSelect: (combatantId: string) => void }) {
  return state.map ? <MapBoard state={state} map={state.map} act={act} onSelect={onSelect} /> : <NoMap act={act} />;
}

function NoMap({ act }: { act: Act }) {
  const [size, setSize] = useState({ width: '20', height: '15' });
  return (
      <details className="card">
        <summary>
          <strong>Battle map</strong> <span className="muted small">none yet</span>
        </summary>
        <p className="muted small">This encounter came without a map. Start a blank grid and place everyone on it.</p>
        <div className="row">
          <label className="row small">
            Width <input inputMode="numeric" value={size.width} style={{ width: 64 }} onChange={(e) => setSize({ ...size, width: e.target.value.replace(/\D/g, '') })} />
          </label>
          <label className="row small">
            Height <input inputMode="numeric" value={size.height} style={{ width: 64 }} onChange={(e) => setSize({ ...size, height: e.target.value.replace(/\D/g, '') })} />
          </label>
          <button className="primary" onClick={() => void act({ type: 'newMap', width: Number(size.width), height: Number(size.height) })}>
            Add a blank map
          </button>
        </div>
      </details>
  );
}

/**
 * Move any token, work doors (and find secret ones), mark difficult ground, reveal the fog, place
 * spell areas and measure, and put combatants on the map.
 */
function MapBoard({ state, map, act, onSelect }: { state: EncounterState; map: BattleMap; act: Act; onSelect: (combatantId: string) => void }) {
  const [tool, setTool] = useState<Tool>('move');
  const [placing, setPlacing] = useState<string | null>(null);
  const art = useArtPlan(map, () => api<ArtPlan | null>('/encounter/art'));
  const area = useAreaTool({
    map,
    templates: state.templates ?? [],
    me: 'dm',
    onPlace: (template) => void act({ type: 'template', template }),
    onClear: (id) => void act({ type: 'clearTemplate', id }),
  });
  const revealed = new Set(state.fog?.revealed ?? []);

  const byToken = new Map(state.combatants.filter((c) => c.tokenId).map((c) => [c.tokenId!, c]));
  const info: Record<string, TokenInfo> = {};
  for (const t of map.tokens) {
    const c = byToken.get(t.id);
    info[t.id] = c ? { name: c.name, current: c.id === state.turn, hp: c.hp, maxHp: c.maxHp, hidden: c.hidden } : { name: t.name, hidden: !!t.hidden };
  }
  const offMap = state.combatants.filter((c) => !c.tokenId || !map.tokens.some((t) => t.id === c.tokenId));
  const placingName = placing ? state.combatants.find((c) => c.id === placing)?.name : undefined;

  const onTap = (at: Cell, token: MapToken | undefined) => {
    if (placing) {
      void act({ type: 'place', id: placing, at }).then(() => setPlacing(null));
      return;
    }
    if (tool === 'doors') {
      const [secret] = secretDoorsAt(map, at);
      if (secret !== undefined) {
        void act({ type: 'secretDoor', index: secret });
        return;
      }
      const [door] = doorsAt(map, at);
      if (door !== undefined) {
        const current = map.terrain[door]!.state ?? 'closed';
        void act({ type: 'door', index: door, state: NEXT_DOOR_STATE[current] });
      }
      return;
    }
    if (tool === 'difficult') {
      void act({ type: 'difficult', at, on: !isDifficult(map, at) });
      return;
    }
    if (tool === 'fog') {
      // In a room: the whole room. Elsewhere: the square.
      const hide = revealed.has(cellKey(at));
      void act(roomAt(map, at) ? { type: 'fogRoom', at, hide } : { type: 'fogCells', cells: [at], hide });
      return;
    }
    const c = token ? byToken.get(token.id) : undefined;
    if (c) {
      onSelect(c.id);
      return;
    }
    // In a dungeon: tapping a room opens it in the room panel.
    const room = state.dungeon ? roomAt(map, at) : undefined;
    if (room && state.dungeon?.rooms.some((r) => r.key === room.id)) void act({ type: 'room', key: room.id });
  };

  return (
    <section className="card" aria-label="Battle map">
      <div className="map-tools">
        <Segmented
          value={tool}
          options={[
            { value: 'move', label: 'Move' },
            { value: 'doors', label: 'Doors' },
            { value: 'difficult', label: 'Difficult' },
            { value: 'fog', label: 'Fog' },
          ]}
          onChange={(t) => (setTool(t), setPlacing(null))}
        />
        {offMap.length > 0 && (
          <span className="row small">
            <span className="muted">Not on the map:</span>
            {offMap.map((c) => (
              <button key={c.id} type="button" className={`chip${placing === c.id ? ' on' : ''}`} onClick={() => setPlacing(placing === c.id ? null : c.id)}>
                {c.name}
              </button>
            ))}
          </span>
        )}
      </div>
      {tool === 'fog' && (
        <div className="map-tools">
          {state.fog ? (
            <>
              <label className="row small">
                <input type="checkbox" checked={state.fog.follow} onChange={(e) => void act({ type: 'fog', on: true, follow: e.target.checked })} />
                Reveal what the party sees
              </label>
              <button type="button" onClick={() => void act({ type: 'fogCells', cells: allCells(map) })}>
                Reveal all
              </button>
              <button type="button" onClick={() => void act({ type: 'fogCells', cells: allCells(map), hide: true })}>
                Hide all
              </button>
              <button type="button" className="link danger" onClick={() => void act({ type: 'fog', on: false })}>
                Turn off fog
              </button>
            </>
          ) : (
            <button type="button" className="primary" onClick={() => void act({ type: 'fog', on: true, follow: true })}>
              Turn on fog of war
            </button>
          )}
        </div>
      )}
      {area.controls}
      <MapView
        map={map}
        info={info}
        fog={state.fog ? { revealed, solid: false } : null}
        overlays={area.overlays}
        {...(area.onCornerDrag ? { onCornerDrag: area.onCornerDrag } : {})}
        canMove={() => tool === 'move' && !placing && !area.active}
        onMove={(token, at) => void act({ type: 'move', token, at })}
        onTap={onTap}
        showNotes
        art={art}
        loadArt={(id) => apiBlob(`/art/${encodeURIComponent(id)}`)}
        label={`Battle map, ${map.width} by ${map.height} squares`}
      />
      <p className="muted small map-hint">
        {placingName
          ? `Tap a square to put ${placingName} there.`
          : area.active
            ? 'Drag on the map: from the centre (sphere) or the point of origin (cone, line, cube). Everyone sees areas; a measure is only yours.'
            : tool === 'doors'
            ? 'Tap a door: open → closed → locked. Tap a secret door (dashed) when the party finds it.'
            : tool === 'fog'
              ? state.fog
                ? `Tap a square (or a room${map.rooms?.length ? ', by its key' : ''}) to reveal it or hide it again. Shaded: players can't see it.`
                : 'Players see only what you reveal, or what the party can see.'
            : tool === 'difficult'
              ? 'Tap a square to mark or clear difficult terrain.'
              : 'Drag a token to move it; tap one for its details. Pinch or scroll to zoom.'}
        {map.notes.length > 0 && tool === 'move' && !placing && ` ${map.notes.length} note${map.notes.length === 1 ? '' : 's'} (yellow dots): ${map.notes.map((n) => n.text).join(' · ')}`}
      </p>
    </section>
  );
}

function allCells(map: BattleMap): Cell[] {
  const out: Cell[] = [];
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) out.push([x, y]);
  return out;
}
