import { onBoard, solidAt, type BattleMap, type Cell, type MapToken } from '../../../src/shared/battlemap.js';

/**
 * Dropping a token on the map (2D and 3D alike). A dropped token is drawn where it landed until the
 * map from the server catches up.
 */
export type PendingMove = { tokenId: string; from: Cell; to: Cell; until: number };

/** How long a drop waits for the server before the token goes back (the move failed or was lost). */
export const PENDING_MS = 3000;

const same = (a: Cell, b: Cell) => a[0] === b[0] && a[1] === b[1];

/** Whether a drop at `to` is sent: it moved, it's on the board and not inside anything solid. */
export function dropAllowed(map: BattleMap, t: Pick<MapToken, 'size'>, from: Cell, to: Cell): boolean {
  return (to[0] !== from[0] || to[1] !== from[1]) && onBoard(map, t.size, to) && !solidAt(map, t.size, to);
}

export function pendingMove(tokenId: string, from: Cell, to: Cell, now: number): PendingMove {
  return { tokenId, from, to, until: now + PENDING_MS };
}

/**
 * Where to draw a token. Without this, a dropped token flashes back to where it started for the
 * moment before the server's answer arrives. Done once the map shows it moved (there or anywhere
 * else) or the wait runs out.
 */
export function shownAt(t: Pick<MapToken, 'id' | 'at'>, pending: PendingMove | null, now: number): Cell {
  if (!pending || pending.tokenId !== t.id || !same(t.at, pending.from) || now > pending.until) return t.at;
  return pending.to;
}

/** Whether the pending drop is over and can be forgotten. */
export function settled(map: { tokens: ReadonlyArray<Pick<MapToken, 'id' | 'at'>> }, pending: PendingMove, now: number): boolean {
  const t = map.tokens.find((x) => x.id === pending.tokenId);
  return !t || !same(t.at, pending.from) || now > pending.until;
}
