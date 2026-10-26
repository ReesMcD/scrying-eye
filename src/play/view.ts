import type { Combatant, EncounterAction, EncounterState, Health, MiniSpec, PlayerCombatant, PlayerRequest, PlayerView } from '../shared/types.js';
import { CONDITIONS, EncounterError } from '../encounter/rules.js';
import { playersMap } from '../shared/battlemap.js';
import { clipToRevealed } from '../shared/mapSight.js';
import { miniForCreature } from '../shared/minis/index.js';

/** How hurt a monster looks: down at 0, bloodied at half or less (the usual table call). */
export function healthOf(c: Combatant): Health | null {
  if (c.hp === null) return null;
  if (c.hp === 0) return 'down';
  return c.maxHp && c.hp <= c.maxHp / 2 ? 'bloodied' : 'healthy';
}

/** How many of the table's rolls a phone shows. */
const PLAYER_ROLLS = 12;

/**
 * One player's view of the encounter. Leaves out hidden combatants entirely, monsters' and NPCs'
 * numbers (only how hurt they look), initiative values, stat blocks, DM notes and the log. The
 * map leaves out hidden tokens and the DM's notes. `miniFor` finds a token's paper mini by name
 * (one made on the Minis page); the rest get one from their name and stat block.
 */
export function playerView(s: EncounterState, me: string | null, miniFor: (name: string) => MiniSpec | null = () => null): PlayerView {
  const visible = (c: Combatant | undefined): c is Combatant => !!c && !c.hidden;
  const byId = new Map(s.combatants.map((c) => [c.id, c]));
  const order = s.order.map((id) => byId.get(id)).filter(visible);
  const pc = (c: Combatant) => c.kind === 'pc';
  const mine = me ? byId.get(me) : undefined;
  const taken = new Set((s.join?.players ?? []).map((p) => p.combatantId).filter(Boolean));
  const map = s.map ? clipped(s) : null;
  return {
    title: s.title,
    status: s.status,
    round: s.round,
    turn: s.turn && visible(byId.get(s.turn)) ? s.turn : null,
    me: mine ? mine.id : null,
    order: order.map(
      (c): PlayerCombatant => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        current: c.id === s.turn,
        hp: pc(c) ? c.hp : null,
        maxHp: pc(c) ? c.maxHp : null,
        tempHp: pc(c) ? c.tempHp : 0,
        health: pc(c) ? null : healthOf(c),
        conditions: c.conditions.map((x) => ({ name: x.name, ...(x.level ? { level: x.level } : {}), ...(x.rounds ? { rounds: x.rounds } : {}) })),
        concentrating: pc(c) ? c.concentrating : null,
        ...(pc(c) && c.speed ? { speed: c.speed } : {}),
      }),
    ),
    party: s.combatants.filter(pc).map((c) => ({ id: c.id, name: c.name, taken: taken.has(c.id) })),
    myInitiative: mine?.initiative ?? null,
    myAc: mine?.ac ?? null,
    map,
    tokens: Object.fromEntries(order.filter((c) => c.tokenId).map((c) => [c.id, c.tokenId!])),
    fog: s.map && s.fog ? s.fog.revealed : null,
    // An area under the fog would give away what's there: players see only those they could see.
    templates: (s.templates ?? []).filter((t) => !s.fog || s.fog.revealed.includes(`${Math.min(t.at[0], (s.map?.width ?? 1) - 1)},${Math.min(t.at[1], (s.map?.height ?? 1) - 1)}`)),
    rolls: (s.rolls ?? []).filter((r) => !r.secret).slice(-PLAYER_ROLLS),
    moved: Object.fromEntries(order.flatMap((c) => (c.tokenId && s.moved?.[c.tokenId] ? [[c.tokenId, s.moved[c.tokenId]!.feet]] : []))),
    minis: Object.fromEntries(
      (map?.tokens ?? []).map((t) => {
        const ref = s.combatants.find((c) => c.tokenId === t.id)?.ref;
        return [t.id, miniFor(t.name) ?? miniForCreature({ name: t.name, type: ref ? s.statBlocks[ref]?.type : undefined })];
      }),
    ),
  };
}

/** The players' copy of the map: their rules (playersMap), then cut to what the fog has revealed. */
function clipped(s: EncounterState) {
  const map = playersMap(s.map!, new Set(s.combatants.filter((c) => c.hidden && c.tokenId).map((c) => c.tokenId!)));
  return s.fog ? clipToRevealed(map, new Set(s.fog.revealed)) : map;
}

/** A player's request as a tracker action, if they may make it: on their own PC (moving: any PC). */
export function playerAction(s: EncounterState, me: string | null, request: PlayerRequest): EncounterAction {
  const mine = me ? s.combatants.find((c) => c.id === me && c.kind === 'pc') : undefined;
  if (!mine) throw new EncounterError('Pick your character first');
  switch (request?.type) {
    case 'initiative':
      // Theirs to set while the DM collects them; after that the DM changes it.
      if (s.status !== 'setup' && mine.initiative !== null) throw new EncounterError('Initiative is set: ask the DM to change it');
      return { type: 'initiative', id: mine.id, value: request.value };
    case 'damage':
    case 'heal':
    case 'tempHp':
      return { type: request.type, id: mine.id, amount: request.amount };
    case 'condition':
      if (!CONDITIONS.includes(request.name)) throw new EncounterError('Unknown condition');
      return { type: 'condition', id: mine.id, name: request.name, ...(request.remove ? { remove: true } : {}) };
    case 'move': {
      // Any of the party's pieces, as at a real table (helping a friend, a shove); monsters are the DM's.
      if (request.token !== undefined) {
        const piece = s.combatants.find((c) => c.tokenId === request.token && c.kind === 'pc' && !c.hidden);
        if (!piece) throw new EncounterError('Only the DM moves that one');
        return { type: 'move', token: piece.tokenId!, at: request.at };
      }
      if (!mine.tokenId) throw new EncounterError('You’re not on the map yet: ask the DM to place you');
      return { type: 'move', token: mine.tokenId, at: request.at };
    }
    case 'template':
      return { type: 'template', template: { ...request.template, label: mine.name }, by: mine.id };
    case 'clearTemplate':
      return { type: 'clearTemplate', id: request.id, by: mine.id };
    case 'roll':
      return { type: 'roll', expression: request.expression, ...(request.label ? { label: request.label } : {}), by: mine.id };
    default:
      throw new EncounterError('Unknown request');
  }
}
