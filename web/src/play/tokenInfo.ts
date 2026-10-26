import type { PlayerView } from '../../../src/shared/types';
import { flankedTokens, flankPieces } from '../../../src/shared/tableAids';
import type { TokenInfo } from '../map/BattleMapView';

/** What players' maps show on each visible token: names, the party's HP, and in a fight the table aids. */
export function playerTokenInfo(view: PlayerView): Record<string, TokenInfo> {
  const map = view.map;
  const fighting = view.status === 'running';
  const pieces = view.order.map((c) => ({ ...c, tokenId: view.tokens[c.id], down: c.hp === 0 || c.health === 'down' }));
  const flanked = map && fighting ? flankedTokens(map, flankPieces(pieces)) : new Set<string>();
  const info: Record<string, TokenInfo> = {};
  for (const c of view.order) {
    const token = view.tokens[c.id];
    if (!token) continue;
    info[token] = {
      name: c.name,
      current: c.current,
      hp: c.hp,
      maxHp: c.maxHp,
      mine: c.id === view.me,
      speed: c.speed ?? null,
      ...(fighting ? { moved: view.moved[token] ?? 0, flanked: flanked.has(token) } : {}),
    };
  }
  return info;
}
