import { placeToken, readMap, SIZE_SQUARES, type BattleMap, type Cell, type TokenSize } from '../shared/battlemap.js';
import { roomCells } from '../shared/mapSight.js';
import type { Combatant, DungeonRun, EncounterAction, EncounterState, WikiDungeon } from '../shared/types.js';
import { applyAction, combatantId, EncounterError, makeCombatant, newEncounter, setRevealed, sortOrder, uniqueTokenId, type RuleDeps } from './rules.js';

/**
 * Running a dungeon from the wiki (ReesMcD/dnd-wiki#106): its floor plan is the map, with fog of
 * war that follows the party. The DM looks into rooms (read-aloud, traps, puzzles, treasure),
 * and starts a room's fight there; between fights the party explores. Room content stays with
 * the DM: the player view never includes `dungeon`.
 */

type DungeonAction = Extract<EncounterAction, { type: 'room' | 'fight' | 'endFight' }>;

const sizeOf = (size: string | undefined): TokenSize => {
  const s = size?.toLowerCase();
  return s && s in SIZE_SQUARES ? (s as TokenSize) : 'medium';
};

/** Where the party starts: the way in (stairs), else the first room, else the middle of the map. */
function entrance(map: BattleMap): Cell {
  const stairs = map.terrain.find((t) => t.kind === 'floor' && /\bstairs?\b/i.test(`${t.asset ?? ''} ${t.label ?? ''}`));
  if (stairs?.cells?.[0]) return stairs.cells[0];
  if (stairs?.rect) return [stairs.rect[0], stairs.rect[1]];
  const first = map.rooms?.[0];
  if (first) {
    const cells = roomCells(map, first);
    if (cells.length) return cells[Math.floor(cells.length / 2)]!;
  }
  return [Math.floor(map.width / 2), Math.floor(map.height / 2)];
}

/** A dungeon ready to explore: the party at the way in, fog that follows what they see. */
export function encounterFromDungeon(w: WikiDungeon, id: string, deps: RuleDeps): EncounterState {
  const map = readMap(w.map);
  if (!map) throw new EncounterError(w.map_error ? `The dungeon's floor plan can't be used: ${w.map_error}` : `"${w.title}" has no floor plan yet: make one in the wiki (wiki_dungeon, action map)`);
  let s: EncounterState = { ...newEncounter(id, w.title, deps.now()), status: 'exploring', map: { ...map, tokens: [] } };
  s.notes = { summary: w.summary, read_aloud: w.read_aloud, setup: w.overview, tactics: null, changes: null, treasure: null };
  s.dungeon = {
    wikiId: w.id,
    campaign: w.campaign,
    summary: w.summary,
    read_aloud: w.read_aloud,
    rooms: w.rooms.map((r) => ({ ...r, state: { ...r.state }, hintsShown: 0 })),
    current: w.rooms[0]?.key ?? null,
    fight: null,
    fights: [],
  };
  const taken = new Set<string>();
  const door = entrance(map);
  for (const p of w.party) {
    const c = makeCombatant(combatantId(p.name, taken), { name: p.name, kind: 'pc', ac: p.ac, hp: p.hp, player: p.player, ...(typeof p.dex === 'number' ? { dex: p.dex } : {}), ...(typeof p.initiative_bonus === 'number' ? { initiativeBonus: p.initiative_bonus } : {}) });
    taken.add(c.id);
    const tokenId = uniqueTokenId(s.map, c.id);
    s.map = placeToken(s.map!, { id: tokenId, name: c.name, kind: 'pc', size: 'medium' }, door);
    s.combatants.push({ ...c, tokenId });
  }
  s.order = sortOrder(s.combatants);
  s = applyAction(s, { type: 'fog', on: true, follow: true }, deps);
  s.log = [{ at: deps.now(), round: 0, text: `Entered ${w.title}` }];
  return s;
}

function roomOf(run: DungeonRun, key: string) {
  const room = run.rooms.find((r) => r.key === key);
  if (!room) throw new EncounterError('No such room');
  return room;
}

/** Shows a room to the party on the map (when fog is on). */
function revealRoom(s: EncounterState, key: string): void {
  const area = s.map?.rooms?.find((r) => r.id === key);
  if (s.fog && s.map && area) setRevealed(s.fog, roomCells(s.map, area), true);
}

/** The room actions; `s` is already a copy (applyAction's). */
export function applyDungeonAction(s: EncounterState, action: DungeonAction, deps: RuleDeps, log: (text: string) => void): void {
  const run = s.dungeon;
  if (!run) throw new EncounterError('This encounter isn’t a dungeon');
  switch (action.type) {
    case 'room': {
      const room = roomOf(run, action.key);
      run.current = room.key;
      for (const flag of ['entered', 'cleared', 'looted', 'solved'] as const) {
        const value = action[flag];
        if (value === undefined || room.state[flag] === value) continue;
        room.state[flag] = value;
        if (value) log(`${room.key}. ${room.name}: ${flag}`);
      }
      if (action.entered) revealRoom(s, room.key);
      if (action.hintsShown !== undefined) {
        if (!Number.isInteger(action.hintsShown) || action.hintsShown < 0) throw new EncounterError('Bad hint count');
        room.hintsShown = Math.min(action.hintsShown, room.puzzle?.hints.length ?? 0);
      }
      break;
    }
    case 'fight': {
      if (s.status !== 'exploring') throw new EncounterError('Finish this fight first');
      const room = roomOf(run, action.room);
      // Its creatures appear once; fighting there again carries on with whoever is still about.
      const groups = room.spawned ? [] : (room.encounter?.creatures ?? []);
      if (!groups.length && !s.combatants.some((c) => c.kind !== 'pc')) throw new EncounterError(room.spawned ? `Nothing is left to fight in ${room.name}` : `No creatures are listed for ${room.name}: add them with Add combatant, then start the fight`);
      room.spawned = true;
      const area = s.map?.rooms?.find((r) => r.id === room.key);
      const cells = s.map && area ? roomCells(s.map, area) : [];
      // From the far corner of the room, so they start apart from a party at the door.
      const spot = cells.length ? cells[cells.length - 1]! : null;
      const taken = new Set(s.combatants.map((c) => c.id));
      for (const creature of groups) {
        const { count, ...block } = creature;
        s.statBlocks[block.name] = block;
        for (let i = 1; i <= count; i++) {
          const name = count > 1 ? `${block.name} ${i}` : block.name;
          const c: Combatant = makeCombatant(combatantId(name, taken), { name, kind: 'monster', ac: block.ac ?? null, hp: block.hp ?? null, ...(block.initiative !== undefined ? { initiativeBonus: block.initiative } : {}), dex: block.abilities?.[1] ?? null, ref: block.name });
          taken.add(c.id);
          if (s.map && spot) {
            const tokenId = uniqueTokenId(s.map, c.id);
            s.map = placeToken(s.map, { id: tokenId, name, kind: 'monster', size: sizeOf(block.size) }, spot);
            c.tokenId = tokenId;
          }
          s.combatants.push(c);
        }
      }
      // A new fight: everyone rolls initiative again.
      for (const c of s.combatants) c.initiative = null;
      s.status = 'setup';
      s.round = 0;
      s.turn = null;
      s.order = sortOrder(s.combatants);
      room.state.entered = true;
      run.current = room.key;
      run.fight = { room: room.key, startedAt: deps.now() };
      revealRoom(s, room.key);
      log(`Fight in ${room.key}. ${room.name}`);
      break;
    }
    case 'endFight': {
      if (!run.fight) throw new EncounterError('No fight is going on');
      const fallen = s.combatants.filter((c) => c.kind !== 'pc' && c.hp === 0);
      const xp = fallen.reduce((sum, c) => sum + ((c.ref && s.statBlocks[c.ref]?.xp) || 0), 0);
      run.fights.push({ room: run.fight.room, rounds: Math.max(0, s.round), defeated: fallen.map((c) => c.name), xp, at: deps.now() });
      const gone = new Set(fallen.map((c) => c.tokenId).filter(Boolean));
      s.combatants = s.combatants.filter((c) => !fallen.includes(c));
      if (s.map) s.map = { ...s.map, tokens: s.map.tokens.filter((t) => !gone.has(t.id)) };
      // Nothing left standing against the party: the room is cleared.
      if (run.fight.room && !s.combatants.some((c) => c.kind !== 'pc')) roomOf(run, run.fight.room).state.cleared = true;
      log(`Fight over after ${Math.max(0, s.round)} round${s.round === 1 ? '' : 's'}${fallen.length ? `: ${fallen.map((c) => c.name).join(', ')} defeated` : ''}`);
      run.fight = null;
      s.status = 'exploring';
      s.round = 0;
      s.turn = null;
      for (const c of s.combatants) c.initiative = null;
      s.order = sortOrder(s.combatants);
      break;
    }
  }
}

/** What the wiki is told about the run so far (POST /api/dungeons/<id>/progress). */
export function dungeonProgress(run: DungeonRun, at: number) {
  return {
    at: new Date(at).toISOString(),
    rooms: run.rooms.filter((r) => Object.values(r.state).some(Boolean)).map((r) => ({ key: r.key, ...r.state })),
    fights: run.fights.map((f) => ({ room: f.room, rounds: f.rounds, defeated: f.defeated, xp: f.xp })),
  };
}
