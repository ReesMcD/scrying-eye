import { placeToken, readMap, SIZE_SQUARES, type BattleMap, type Cell, type Terrain, type TokenSize } from '../shared/battlemap.js';
import { roomAt, roomCells, roomInView } from '../shared/mapSight.js';
import type { Combatant, DungeonRun, EncounterAction, EncounterState, WikiDungeon } from '../shared/types.js';
import { applyAction, combatantId, EncounterError, makeCombatant, newEncounter, setRevealed, sortOrder, uniqueTokenId, type RuleDeps } from './rules.js';

/**
 * Running a dungeon from the wiki (ReesMcD/dnd-wiki#106): its floor plan is the map, with fog of
 * war that follows the party. The DM looks into rooms (read-aloud, traps, puzzles, treasure),
 * and starts a room's fight there; between fights the party explores. Room content stays with
 * the DM: the player view never includes `dungeon`.
 */

type DungeonAction = Extract<EncounterAction, { type: 'room' | 'fight' | 'endFight' | 'stairs' }>;

const sizeOf = (size: string | undefined): TokenSize => {
  const s = size?.toLowerCase();
  return s && s in SIZE_SQUARES ? (s as TokenSize) : 'medium';
};

const isStairs = (t: Terrain) => t.kind === 'floor' && /\bstairs?\b/i.test(`${t.asset ?? ''} ${t.label ?? ''}`);

/** Where the party starts: the way in (stairs from outside), else the first room, else the middle of the map. */
function entrance(map: BattleMap): Cell {
  // On a plan with stairs down too, the way in is the pair that leads outside (level 0).
  const stairs = map.terrain.find((t) => isStairs(t) && (t.to?.level ?? 0) === 0);
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
  // Several levels (#110): a plan for each, starting on level 1.
  const levels = (w.maps ?? []).flatMap((x) => {
    const plan = readMap(x.map);
    return plan ? [{ level: x.level, map: { ...plan, tokens: [] }, revealed: [] as string[] }] : [];
  });
  const map = readMap(levels.length > 1 ? (levels.find((x) => x.level === 1) ?? levels[0]!).map : w.map);
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
    ...(levels.length > 1 ? { level: map.level ?? 1, levels } : {}),
  };
  const taken = new Set<string>();
  const door = entrance(map);
  for (const p of w.party) {
    const c = makeCombatant(combatantId(p.name, taken), { name: p.name, kind: 'pc', ac: p.ac, hp: p.hp, player: p.player, ...(typeof p.dex === 'number' ? { dex: p.dex } : {}), ...(typeof p.initiative_bonus === 'number' ? { initiativeBonus: p.initiative_bonus } : {}), speed: p.speed });
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

/** A room on another level than the party: say so, rather than act on the wrong plan. */
function onThisLevel(s: EncounterState, room: { name: string; level?: number }): void {
  const here = s.dungeon?.level;
  if (here !== undefined && (room.level ?? 1) !== here) throw new EncounterError(`${room.name} is on level ${room.level ?? 1}: take the stairs first`);
}

/** Shows a room to the party on the map (when fog is on). */
function revealRoom(s: EncounterState, key: string): void {
  const area = s.map?.rooms?.find((r) => r.id === key);
  if (s.fog && s.map && area) setRevealed(s.fog, roomInView(s.map, area), true);
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
      if (action.entered && (s.dungeon?.level === undefined || (room.level ?? 1) === s.dungeon.level)) revealRoom(s, room.key);
      if (action.hintsShown !== undefined) {
        if (!Number.isInteger(action.hintsShown) || action.hintsShown < 0) throw new EncounterError('Bad hint count');
        room.hintsShown = Math.min(action.hintsShown, room.puzzle?.hints.length ?? 0);
      }
      break;
    }
    case 'fight': {
      if (s.status !== 'exploring') throw new EncounterError('Finish this fight first');
      const room = roomOf(run, action.room);
      onThisLevel(s, room);
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
      delete s.moved;
      s.status = 'exploring';
      s.round = 0;
      s.turn = null;
      for (const c of s.combatants) c.initiative = null;
      s.order = sortOrder(s.combatants);
      break;
    }
    case 'stairs':
      takeStairs(s, run, action.index, log);
      break;
  }
}

/**
 * The party goes up or down (#110): this level's plan is put away as it is (with whoever stays
 * on it, and what the party saw), and the party comes out by the stairs' other end on the next.
 */
function takeStairs(s: EncounterState, run: DungeonRun, index: number, log: (text: string) => void): void {
  if (s.status !== 'exploring') throw new EncounterError('Finish this fight first');
  const stairs = s.map?.terrain[index];
  const target = stairs?.to?.level;
  if (!stairs || !isStairs(stairs) || !target) throw new EncounterError('Those stairs don’t lead to another level');
  const there = run.levels?.find((x) => x.level === target);
  if (!there || !run.levels || run.level === undefined) throw new EncounterError(`This dungeon has no level ${target}`);
  const party = new Set(s.combatants.filter((c) => c.kind === 'pc' && c.tokenId).map((c) => c.tokenId!));
  const leaving = s.map!.tokens.filter((t) => party.has(t.id));
  const here = run.levels.find((x) => x.level === run.level)!;
  here.map = { ...s.map!, tokens: s.map!.tokens.filter((t) => !party.has(t.id)) };
  here.revealed = s.fog?.revealed ?? [];
  // Out by the stairs' other end: where they say, else the stairs on that level leading back here.
  const back = there.map.terrain.find((t) => isStairs(t) && t.to?.level === run.level);
  const spot: Cell = stairs.to?.at ?? back?.cells?.[0] ?? (back?.rect ? [back.rect[0], back.rect[1]] : entrance(there.map));
  let map = there.map;
  for (const t of leaving) map = placeToken(map, { id: t.id, name: t.name, kind: t.kind, size: t.size }, spot);
  s.map = map;
  if (s.fog) s.fog = { ...s.fog, revealed: there.revealed };
  log(`The party takes the stairs ${stairs.rises ?? (target > run.level ? 'down' : 'up')} to level ${target}`);
  run.level = target;
  // The DM's panel opens the room they come out in.
  const arrived = roomAt(map, spot);
  if (arrived && run.rooms.some((r) => r.key === arrived.id)) run.current = arrived.id;
}

/** What the wiki is told about the run so far (POST /api/dungeons/<id>/progress). */
export function dungeonProgress(run: DungeonRun, at: number) {
  return {
    at: new Date(at).toISOString(),
    rooms: run.rooms.filter((r) => Object.values(r.state).some(Boolean)).map((r) => ({ key: r.key, ...r.state })),
    // The wiki files a fight under its room; one that started nowhere in particular isn't sent.
    fights: run.fights.flatMap((f) => (f.room ? [{ room: f.room, rounds: f.rounds, defeated: f.defeated, xp: f.xp }] : [])),
    secret_doors_found: run.secretDoorsFound ?? [],
  };
}
