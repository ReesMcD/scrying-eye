import { canPlace, solidAt, type BattleMap, type Cell, type MapToken } from '../../../src/shared/battlemap';
import { pathFeet } from '../../../src/shared/tableAids';
import type { TokenInfo } from './BattleMapView';

const SOFTER: Record<string, string> = { 'Something is in the way there': 'in the way', 'Someone is already there': 'someone’s there' };

/**
 * The words beside a token being dragged: how far this move goes, and in a fight how far this
 * turn (against its speed, when known); plus anything odd about where it lands. It lands there
 * anyway (the DM rules on it, as at a real table), except inside something solid: it goes back.
 */
export function moveGuide(map: BattleMap, t: MapToken, from: Cell, to: Cell, info: TokenInfo | undefined): { text: string; warning: string | null } {
  const feet = pathFeet(map, t.size, from, to);
  let text = `${feet} ft`;
  if (info?.moved !== undefined && (info.moved > 0 || info.speed)) text += ` · ${info.moved + feet}${info.speed ? ` of ${info.speed}` : ''} ft this turn`;
  if (solidAt(map, t.size, to)) return { text, warning: 'solid: go around' };
  const check = canPlace(map, t.id, t.size, to);
  return { text, warning: check.ok ? null : (SOFTER[check.reason] ?? check.reason) };
}
