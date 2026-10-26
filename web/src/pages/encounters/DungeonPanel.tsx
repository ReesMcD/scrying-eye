import type { DungeonRun, EncounterAction, EncounterState } from '../../types';

type Act = (action: EncounterAction) => Promise<void>;
type Room = DungeonRun['rooms'][number];

/**
 * A dungeon run's rooms, for the DM (#106): pick a room (or tap one on the map), read what's
 * there, mark it entered (players see it on the map), cleared, looted or solved, give puzzle
 * hints one at a time, and start its fight.
 */
export function DungeonPanel({ state, act }: { state: EncounterState; act: Act }) {
  const run = state.dungeon!;
  const room = run.rooms.find((r) => r.key === run.current) ?? run.rooms[0];
  const levels = run.levels ? [...new Set(run.rooms.map((r) => r.level ?? 1))].sort((a, b) => a - b) : [null];
  // Stairs on this level that lead to another (#110).
  const stairs = run.levels ? (state.map?.terrain ?? []).flatMap((t, index) => (t.kind === 'floor' && t.to && t.to.level > 0 && /\bstairs?\b/i.test(`${t.asset ?? ''} ${t.label ?? ''}`) ? [{ index, to: t.to.level, rises: t.rises }] : [])) : [];
  return (
    <section className="card dungeon" aria-label="Dungeon rooms">
      {run.levels && (
        <div className="row dungeon-level">
          <strong>Level {run.level}</strong>
          {stairs.map((x) => (
            <button key={x.index} type="button" disabled={state.status !== 'exploring'} onClick={() => void act({ type: 'stairs', index: x.index })} title={state.status !== 'exploring' ? 'Finish the fight first' : 'The party’s tokens move to the stairs on that level'}>
              Take the stairs {x.rises ?? (x.to > (run.level ?? 1) ? 'down' : 'up')} to level {x.to}
            </button>
          ))}
        </div>
      )}
      {levels.map((level) => (
        <div key={level ?? 'all'} className="dungeon-rooms-nav" role="tablist" aria-label={level === null ? 'Rooms' : `Rooms on level ${level}`}>
          {level !== null && <span className="muted small">Level {level}</span>}
          {run.rooms
            .filter((r) => level === null || (r.level ?? 1) === level)
            .map((r) => (
              <button key={r.key} type="button" role="tab" aria-selected={r.key === room?.key} className={`chip room-chip${r.key === room?.key ? ' on' : ''}${r.state.cleared ? ' cleared' : r.state.entered ? ' entered' : ''}`} onClick={() => void act({ type: 'room', key: r.key })} title={roomStatus(r)}>
                {r.key}. {r.name}
                {r.state.cleared ? ' ✓' : ''}
              </button>
            ))}
        </div>
      ))}
      {run.read_aloud && !run.rooms.some((r) => r.state.entered) && (
        <blockquote className="read-aloud">{run.read_aloud}</blockquote>
      )}
      {room && <RoomCard room={room} run={run} state={state} act={act} />}
    </section>
  );
}

const roomStatus = (r: Room) => (r.state.cleared ? 'Cleared' : r.state.entered ? 'Entered' : 'Not entered yet');

function RoomCard({ room, run, state, act }: { room: Room; run: DungeonRun; state: EncounterState; act: Act }) {
  const mark = (flag: 'entered' | 'cleared' | 'looted' | 'solved', value: boolean) => void act({ type: 'room', key: room.key, [flag]: value });
  const fighting = !!run.fight;
  const monstersHere = state.combatants.some((c) => c.kind !== 'pc');
  const elsewhere = run.level !== undefined && (room.level ?? 1) !== run.level;
  const canFight = !fighting && !elsewhere && state.status === 'exploring' && ((!room.spawned && !!room.encounter?.creatures.length) || monstersHere);
  const nextHint = room.puzzle && room.hintsShown < room.puzzle.hints.length ? room.hintsShown + 1 : null;

  return (
    <div className="room-card">
      <div className="row spread">
        <h2 style={{ margin: 0 }}>
          {room.key}. {room.name}
          {room.role && <span className="muted small"> · {room.role}</span>}
          {elsewhere && <span className="muted small"> · level {room.level ?? 1}</span>}
        </h2>
        <div className="row room-flags">
          {!room.state.entered ? (
            <button className="primary" onClick={() => mark('entered', true)} title="Players see the room on the map">
              The party enters
            </button>
          ) : (
            <span className="badge good">entered</span>
          )}
          <Flag label="Cleared" on={!!room.state.cleared} set={(v) => mark('cleared', v)} />
          {room.treasure && <Flag label="Looted" on={!!room.state.looted} set={(v) => mark('looted', v)} />}
          {room.puzzle && <Flag label="Solved" on={!!room.state.solved} set={(v) => mark('solved', v)} />}
        </div>
      </div>

      {room.read_aloud && <blockquote className="read-aloud">{room.read_aloud}</blockquote>}
      {room.description && <p className="pre-line">{room.description}</p>}

      {room.encounter && (
        <div className="room-part">
          <h3>Fight</h3>
          <p className="pre-line">
            {room.encounter.creatures.length ? room.encounter.creatures.map((c) => `${c.count} × ${c.name}${c.cr ? ` (CR ${c.cr})` : ''}`).join(', ') : room.encounter.text}
            {room.encounter.difficulty ? <span className="muted"> · {room.encounter.difficulty}</span> : null}
          </p>
          {room.encounter.creatures.length > 0 && room.encounter.text && <p className="muted small pre-line">{room.encounter.text}</p>}
          <button className="primary" disabled={!canFight} onClick={() => void act({ type: 'fight', room: room.key })} title={fighting ? 'Finish the fight going on first' : elsewhere ? `On level ${room.level ?? 1}: take the stairs first` : undefined}>
            {room.spawned ? 'Fight again here' : 'Fight here'}
          </button>
          {room.spawned && !monstersHere && <span className="muted small"> Nothing left standing here.</span>}
        </div>
      )}

      {room.trap && (
        <div className="room-part">
          <h3>Trap</h3>
          <p className="pre-line">{room.trap.text}</p>
          <dl className="room-facts small">
            {room.trap.trigger && <Fact term="Trigger" text={room.trap.trigger} />}
            {room.trap.detect && <Fact term="Spot it" text={room.trap.detect} />}
            {room.trap.disarm && <Fact term="Disarm" text={room.trap.disarm} />}
            {room.trap.dc && <Fact term="Save DC" text={room.trap.dc} />}
            {room.trap.attack && <Fact term="Attack" text={room.trap.attack} />}
            {room.trap.damage && <Fact term="Damage" text={room.trap.damage} />}
          </dl>
        </div>
      )}

      {room.puzzle && (
        <div className="room-part">
          <h3>{room.puzzle.name ? `Puzzle: ${room.puzzle.name}` : 'Puzzle'}</h3>
          {room.puzzle.premise && <p className="pre-line">{room.puzzle.premise}</p>}
          {room.puzzle.solution && (
            <details>
              <summary className="small">Solution</summary>
              <p className="pre-line">{room.puzzle.solution}</p>
            </details>
          )}
          {room.puzzle.clues.length > 0 && (
            <>
              <h4>Clues</h4>
              <ul className="small">
                {room.puzzle.clues.map((c, i) => (
                  <li key={i}>
                    {c.text}
                    {c.where && <span className="muted"> ({c.where})</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
          {room.puzzle.hints.length > 0 && (
            <>
              <h4>Hints</h4>
              <ol className="small hint-ladder">
                {room.puzzle.hints.slice(0, room.hintsShown).map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ol>
              <div className="row">
                {nextHint && <button onClick={() => void act({ type: 'room', key: room.key, hintsShown: nextHint })}>Next hint ({nextHint} of {room.puzzle.hints.length})</button>}
                {room.hintsShown > 0 && (
                  <button className="link" onClick={() => void act({ type: 'room', key: room.key, hintsShown: 0 })}>
                    Hide hints
                  </button>
                )}
              </div>
            </>
          )}
          <dl className="room-facts small">
            {room.puzzle.bypass && <Fact term="Bypass" text={room.puzzle.bypass} />}
            {room.puzzle.fail && <Fact term="Wrong answer" text={room.puzzle.fail} />}
            {room.puzzle.reward && <Fact term="Reward" text={room.puzzle.reward} />}
          </dl>
        </div>
      )}

      {room.treasure && (
        <div className="room-part">
          <h3>Treasure</h3>
          <p className="pre-line">{room.treasure}</p>
        </div>
      )}

      {room.dm && <p className="small muted pre-line">DM: {room.dm}</p>}

      {room.exits.length > 0 && (
        <div className="row small room-exits">
          <span className="muted">Exits:</span>
          {room.exits.map((key) => {
            const to = run.rooms.find((r) => r.key === key);
            return (
              <button key={key} type="button" className="link" onClick={() => void act({ type: 'room', key })} disabled={!to}>
                {to ? `${to.key}. ${to.name}` : key}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Flag({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button type="button" className={`chip${on ? ' on' : ' off'}`} aria-pressed={on} onClick={() => set(!on)}>
      {on ? '✓ ' : ''}
      {label}
    </button>
  );
}

function Fact({ term, text }: { term: string; text: string }) {
  return (
    <>
      <dt>{term}</dt>
      <dd>{text}</dd>
    </>
  );
}
