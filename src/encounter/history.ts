import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readJson, skipDamaged } from '../session/layout.js';
import type { EncounterOutcome } from '../shared/types.js';

/** Where the encounter store keeps ended encounters: <data>/encounters/history/<id>.json. */
export const historyDir = (dataDir: string) => join(dataDir, 'encounters', 'history');

/** Fights run in the tracker that overlap a stretch of time (a session), oldest first. */
export function fightsDuring(dataDir: string, from: number, to: number): EncounterOutcome[] {
  const dir = historyDir(dataDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => skipDamaged(`encounter ${f}`, () => readJson<{ outcome?: EncounterOutcome }>(join(dir, f))?.outcome) ?? [])
    .filter((o) => o.startedAt < to && o.endedAt > from)
    .sort((a, b) => a.startedAt - b.startedAt);
}
