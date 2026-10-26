import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../config/schema.js';
import type { Combatant, EncounterOutcome, EncounterState, WikiEncounter, WikiEncounterSummary } from '../shared/types.js';
import { readMap } from '../shared/battlemap.js';
import { writeFileAtomic } from '../util/files.js';
import { combatantId, makeCombatant, newEncounter, sortOrder } from './rules.js';

/**
 * The Ardent Weave wiki's encounters (ReesMcD/dnd-wiki, mcp/src/encounters-api.ts). It's the
 * same wiki recaps are uploaded to, and it takes the same key (its ENCOUNTERS_TOKEN falls back
 * to SESSION_INGEST_TOKEN).
 */
export class WikiEncountersError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

/** An API on the wiki recaps go to (/api/encounters, /api/dungeons), or an explanation of what to set up. */
export function wikiApiUrl(config: Config, path: string): URL {
  const { url, format } = config.upload;
  if (!url || format !== 'ardent-weave') throw new WikiEncountersError('Set Settings → Upload to your Ardent Weave wiki first: encounters come from the same wiki and key', 409);
  return new URL(path, url);
}

/** /api/encounters on the wiki recaps go to, or an explanation of what to set up. */
export const encountersUrl = (config: Config): URL => wikiApiUrl(config, '/api/encounters');

export async function getJson<T>(url: URL, token: string | undefined, doFetch: typeof fetch): Promise<T> {
  if (!token) throw new WikiEncountersError('The wiki key is missing: add it under Settings → Keys (the same key as recap uploads)', 409);
  let res: Response;
  try {
    res = await doFetch(url, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'ScryingEye' }, signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    throw new WikiEncountersError(`Couldn't reach the wiki: ${(err as Error).message}`);
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: unknown }) | null;
  if (res.status === 401 || res.status === 403) throw new WikiEncountersError('The wiki refused the key (Settings → Keys)', 502);
  if (!res.ok || !body) throw new WikiEncountersError(typeof body?.error === 'string' ? body.error : `The wiki answered ${res.status}`, res.status === 404 ? 404 : 502);
  return body;
}

const cacheFile = (dataDir: string, campaign: string | undefined, id: string) => join(dataDir, 'encounters', 'wiki', `${(campaign ?? 'any').replace(/[^\w-]+/g, '_')}--${id.replace(/[^\w-]+/g, '_')}.json`);

export class WikiEncounters {
  constructor(
    private readonly dataDir: string,
    private readonly config: () => Config,
    private readonly token: () => string | undefined,
    private readonly doFetch: typeof fetch = fetch,
  ) {}

  async list(campaign?: string): Promise<WikiEncounterSummary[]> {
    const url = encountersUrl(this.config());
    if (campaign) url.searchParams.set('campaign', campaign);
    return (await getJson<{ encounters: WikiEncounterSummary[] }>(url, this.token(), this.doFetch)).encounters;
  }

  /** One encounter. Kept on disk, so one loaded before is still there if the wiki is unreachable. */
  async get(id: string, campaign?: string): Promise<WikiEncounter & { cached?: true }> {
    const url = encountersUrl(this.config());
    url.pathname += `/${encodeURIComponent(id)}`;
    if (campaign) url.searchParams.set('campaign', campaign);
    const file = cacheFile(this.dataDir, campaign, id);
    try {
      const encounter = await getJson<WikiEncounter>(url, this.token(), this.doFetch);
      writeFileAtomic(file, JSON.stringify(encounter));
      return encounter;
    } catch (err) {
      // Unreachable (not refused or missing): use the copy from last time, if there is one.
      if (err instanceof WikiEncountersError && err.status === 502 && !/refused/.test(err.message) && existsSync(file)) {
        return { ...(JSON.parse(readFileSync(file, 'utf8')) as WikiEncounter), cached: true };
      }
      throw err;
    }
  }

  /**
   * Sends how a fight went back to the wiki it came from (#58): POST /api/encounters/<id>/result,
   * so the wiki can mark it run and log it. A wiki without that endpoint yet answers 404 or 405,
   * which isn't an error worth more than a line in the log. Returns that line.
   */
  async sendResult(outcome: EncounterOutcome): Promise<string> {
    if (!outcome.source) return 'Not from the wiki: nothing to send';
    let url: URL;
    try {
      url = encountersUrl(this.config());
    } catch (err) {
      // The wiki settings changed since the fight started.
      if (err instanceof WikiEncountersError) return `Not sent to the wiki: ${err.message}`;
      throw err;
    }
    url.pathname += `/${encodeURIComponent(outcome.source.wikiId)}/result`;
    url.searchParams.set('campaign', outcome.source.campaign);
    const token = this.token();
    if (!token) return 'Not sent to the wiki: its key is missing (Settings → Keys)';
    const body = {
      title: outcome.title,
      rounds: outcome.rounds,
      started_at: new Date(outcome.startedAt).toISOString(),
      ended_at: new Date(outcome.endedAt).toISOString(),
      defeated: outcome.defeated,
      standing: outcome.standing,
      downed: outcome.downed,
      xp: outcome.xp,
      summary: outcome.text,
    };
    let res: Response;
    try {
      res = await this.doFetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'ScryingEye' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    } catch (err) {
      return `Couldn't send the result to the wiki: ${(err as Error).message}`;
    }
    if (res.ok) return `Sent "${outcome.title}" to the wiki`;
    if (res.status === 404 || res.status === 405) return "The wiki doesn't take encounter results yet; nothing sent";
    return `The wiki refused the result (${res.status})`;
  }
}


/** An encounter ready to set up: the party, every creature (one per copy), stat blocks, the map and the DM's notes. */
export function encounterFromWiki(w: WikiEncounter, id: string, now: number): EncounterState {
  const s = newEncounter(id, w.title, now);
  s.source = { wikiId: w.id, campaign: w.campaign };
  s.notes = { summary: w.summary, read_aloud: w.read_aloud, setup: w.setup, tactics: w.tactics, changes: w.changes, treasure: w.treasure };
  s.map = readMap(w.map);
  const tokens = s.map?.tokens ?? [];
  const used = new Set<string>();
  /** The map token for a combatant: the same name, else the next unused one of its kind whose name starts the same. */
  const tokenFor = (name: string, base: string, kind: string) => {
    const exact = tokens.find((t) => !used.has(t.id) && t.name === name);
    const t = exact ?? tokens.find((t) => !used.has(t.id) && t.kind === kind && t.name.toLowerCase().startsWith(base.toLowerCase()));
    if (t) used.add(t.id);
    return t;
  };
  const taken = new Set<string>();
  const add = (c: Combatant) => {
    taken.add(c.id);
    s.combatants.push(c);
  };
  for (const p of w.party) {
    const t = tokenFor(p.name, p.name, 'pc');
    add(
      makeCombatant(combatantId(p.name, taken), {
        name: p.name,
        kind: 'pc',
        ac: p.ac,
        hp: p.hp,
        player: p.player,
        ...(typeof p.dex === 'number' ? { dex: p.dex } : {}),
        // The sheet's own initiative bonus wins over one worked out from Dexterity (feats, Alert, items).
        ...(typeof p.initiative_bonus === 'number' ? { initiativeBonus: p.initiative_bonus } : {}),
        ...(t ? { tokenId: t.id } : {}),
      }),
    );
  }
  for (const creature of w.creatures) {
    const { count, ...block } = creature;
    s.statBlocks[block.name] = block;
    for (let i = 1; i <= count; i++) {
      const name = count > 1 ? `${block.name} ${i}` : block.name;
      const t = tokenFor(name, block.name, 'monster');
      add(
        makeCombatant(combatantId(name, taken), {
          name,
          kind: 'monster',
          ac: block.ac ?? null,
          hp: block.hp ?? null,
          ...(block.initiative !== undefined ? { initiativeBonus: block.initiative } : {}),
          dex: block.abilities?.[1] ?? null,
          ref: block.name,
          hidden: t?.hidden === true,
          ...(t ? { tokenId: t.id } : {}),
        }),
      );
    }
  }
  s.order = sortOrder(s.combatants);
  return s;
}
