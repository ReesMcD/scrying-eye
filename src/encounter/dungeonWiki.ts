import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../config/schema.js';
import type { DungeonRun, WikiDungeon, WikiDungeonSummary } from '../shared/types.js';
import { writeFileAtomic } from '../util/files.js';
import { dungeonProgress } from './dungeon.js';
import { getJson, wikiApiUrl, WikiEncountersError } from './wiki.js';

/** What a wiki without the dungeons API says (it's ReesMcD/dnd-wiki#106). */
const NOT_YET = 'This wiki doesn’t serve dungeons yet: update it (ReesMcD/dnd-wiki#106)';

const cacheFile = (dataDir: string, campaign: string | undefined, id: string) => join(dataDir, 'encounters', 'dungeons', `${(campaign ?? 'any').replace(/[^\w-]+/g, '_')}--${id.replace(/[^\w-]+/g, '_')}.json`);

/**
 * The wiki's dungeons (GET /api/dungeons), from the same address and key as its encounters. A
 * dungeon loaded once is kept, so a run can start again if the wiki is unreachable.
 */
export class WikiDungeons {
  constructor(
    private readonly dataDir: string,
    private readonly config: () => Config,
    private readonly token: () => string | undefined,
    private readonly doFetch: typeof fetch = fetch,
  ) {}

  async list(campaign?: string): Promise<WikiDungeonSummary[]> {
    const url = wikiApiUrl(this.config(), '/api/dungeons');
    if (campaign) url.searchParams.set('campaign', campaign);
    try {
      return (await getJson<{ dungeons: WikiDungeonSummary[] }>(url, this.token(), this.doFetch)).dungeons;
    } catch (err) {
      // A 404 with no JSON error is a wiki that has no such route (a missing campaign says so in JSON).
      if (err instanceof WikiEncountersError && err.status === 404 && /^The wiki answered 404/.test(err.message)) throw new WikiEncountersError(NOT_YET, 404);
      throw err;
    }
  }

  async get(id: string, campaign?: string): Promise<WikiDungeon & { cached?: true }> {
    const url = wikiApiUrl(this.config(), `/api/dungeons/${encodeURIComponent(id)}`);
    if (campaign) url.searchParams.set('campaign', campaign);
    const file = cacheFile(this.dataDir, campaign, id);
    try {
      const dungeon = await getJson<WikiDungeon>(url, this.token(), this.doFetch);
      writeFileAtomic(file, JSON.stringify(dungeon));
      return dungeon;
    } catch (err) {
      // Unreachable (not refused or missing): the copy from last time, if there is one.
      if (err instanceof WikiEncountersError && err.status === 502 && !/refused/.test(err.message) && existsSync(file)) return { ...(JSON.parse(readFileSync(file, 'utf8')) as WikiDungeon), cached: true };
      throw err;
    }
  }

  /**
   * Tells the wiki what's happened (POST /api/dungeons/<id>/progress): rooms entered, cleared,
   * looted and solved, and the fights. A wiki without it answers 404, which is only a log line.
   */
  async sendProgress(run: DungeonRun, at = Date.now()): Promise<string> {
    let url: URL;
    try {
      url = wikiApiUrl(this.config(), `/api/dungeons/${encodeURIComponent(run.wikiId)}/progress`);
    } catch (err) {
      if (err instanceof WikiEncountersError) return `Dungeon progress not sent: ${err.message}`;
      throw err;
    }
    url.searchParams.set('campaign', run.campaign);
    const token = this.token();
    if (!token) return 'Dungeon progress not sent: the wiki key is missing (Settings → Keys)';
    let res: Response;
    try {
      res = await this.doFetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'ScryingEye' }, body: JSON.stringify(dungeonProgress(run, at)), signal: AbortSignal.timeout(15_000) });
    } catch (err) {
      return `Couldn't send dungeon progress to the wiki: ${(err as Error).message}`;
    }
    if (res.ok) return 'Dungeon progress sent to the wiki';
    // A 404 with a JSON error is the wiki saying no (an unknown room); without one, it has no such route.
    const error = await res
      .json()
      .then((b: unknown) => ((b as { error?: unknown } | null)?.error ?? null))
      .then((e) => (typeof e === 'string' ? e : null))
      .catch(() => null);
    if (!error && (res.status === 404 || res.status === 405)) return 'The wiki doesn’t take dungeon progress yet; nothing sent';
    return `The wiki refused the dungeon progress (${res.status}${error ? `: ${error}` : ''})`;
  }
}
