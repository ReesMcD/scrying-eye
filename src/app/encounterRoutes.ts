import type { PublicLink } from './funnel.js';
import { Hono, type Context } from 'hono';
import { EncounterError } from '../encounter/rules.js';
import type { EncounterStore } from '../encounter/store.js';
import { encounterFromWiki, WikiEncountersError, type WikiEncounters } from '../encounter/wiki.js';
import type { EncounterAction, QuickBattleOptions, QuickBattleRequest } from '../shared/types.js';
import { QUICK_MAPS, QUICK_MONSTERS, quickBattle, type QuickMap } from '../encounter/quick.js';
import { statBlock } from '../encounter/srdMonsters.js';
import type { BotControl } from '../bot/types.js';
import { joinPost } from '../bot/encounterCommand.js';
import { turnPrompt, type TurnAdvisor } from '../encounter/assistant.js';
import { encounterFromDungeon } from '../encounter/dungeon.js';
import type { WikiDungeons } from '../encounter/dungeonWiki.js';

/**
 * The DM's encounter API (behind the app password):
 *   GET  /encounters/wiki[?campaign=]       prepared encounters in the wiki
 *   GET  /encounters/wiki/:id[?campaign=]   one, to preview
 *   GET  /encounters/dungeons[?campaign=]   dungeons in the wiki
 *   GET  /encounters/dungeons/:id           one, to preview
 *   GET  /encounter                          the one running, or null
 *   GET  /encounters/quick                   quick battles: the maps, monsters and each campaign's party
 *   POST /encounter                          start: { wikiId, campaign? }, { dungeonId, campaign? }, { quick } or { title }
 *   POST /encounter/actions                  one change (EncounterAction)
 *   POST /encounter/end                      end it; answers with the summary
 *   GET  /encounter/link                     the players' join link
 *   POST /encounter/link                     a new link (the old one stops working)
 *   POST /encounter/post                     post the join link in Discord
 *   POST /players/check                      { public_url }: does the public address reach the players' page?
 *   GET  /players/funnel                     is the players' link public? (Turns Tailscale Funnel on when it's off.)
 *   POST /players/funnel                     turn Funnel on for the players' port even over another, and save its address
 *   POST /encounter/suggest                  { id }: Claude's idea for a monster's turn (when turned on)
 */
/** Where players join: the public address (Funnel) when set, and this Mac's own address for testing. */
export interface JoinLinks {
  publicUrl: string | undefined;
  port: number;
}

/** The public join link for a code, when a public address is set. */
export const publicJoinUrl = (links: JoinLinks, code: string) => (links.publicUrl ? new URL(`/play/${code}`, links.publicUrl).href : null);

/** The monster-turn assistant, or why it can't run (off in Settings, no key). */
export type AdvisorSource = () => TurnAdvisor | { off: string };

export interface EncounterRouteDeps {
  wiki: WikiEncounters;
  dungeons: WikiDungeons;
  links: () => JoinLinks;
  /** For tests: the HTTP client for the join link check. */
  doFetch?: typeof fetch;
  bot?: BotControl;
  advisor?: AdvisorSource;
  /** Each campaign's party, from the roster (for quick battles). */
  campaigns?: () => QuickBattleOptions['campaigns'];
  /** Keeps the players' link public (Tailscale Funnel on this Mac). */
  publicLink?: PublicLink;
}

export function encounterRoutes(store: EncounterStore, deps: EncounterRouteDeps): Hono {
  const { wiki, dungeons, links, doFetch = fetch, bot, advisor, publicLink } = deps;
  const r = new Hono();
  const failed = (c: Context, err: unknown) => {
    if (err instanceof WikiEncountersError) return c.json({ error: err.message }, err.status as 404 | 409 | 502);
    if (err instanceof EncounterError) return c.json({ error: err.message }, 400);
    throw err;
  };

  r.get('/encounters/wiki', async (c) => {
    try {
      return c.json(await wiki.list(c.req.query('campaign') || undefined));
    } catch (err) {
      return failed(c, err);
    }
  });
  r.get('/encounters/wiki/:id', async (c) => {
    try {
      return c.json(await wiki.get(c.req.param('id'), c.req.query('campaign') || undefined));
    } catch (err) {
      return failed(c, err);
    }
  });

  r.get('/encounters/dungeons', async (c) => {
    try {
      return c.json(await dungeons.list(c.req.query('campaign') || undefined));
    } catch (err) {
      return failed(c, err);
    }
  });
  r.get('/encounters/dungeons/:id', async (c) => {
    try {
      return c.json(await dungeons.get(c.req.param('id'), c.req.query('campaign') || undefined));
    } catch (err) {
      return failed(c, err);
    }
  });

  r.get('/encounter', (c) => c.json(store.current()));
  r.get('/encounters/quick', (c) => {
    const options: QuickBattleOptions = {
      maps: Object.entries(QUICK_MAPS).map(([id, m]) => ({ id, name: m.name })),
      monsters: QUICK_MONSTERS.map((name) => {
        const b = statBlock(name);
        return { name: b.name, cr: b.cr ?? '', size: b.size ?? '', type: b.type ?? '' };
      }),
      campaigns: deps.campaigns?.() ?? [],
    };
    return c.json(options);
  });

  r.post('/encounter', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { wikiId?: unknown; dungeonId?: unknown; campaign?: unknown; title?: unknown; quick?: QuickBattleRequest };
    try {
      if (body.quick && typeof body.quick === 'object') {
        const q = body.quick;
        const names = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : []);
        const monsters = Array.isArray(q.monsters) ? q.monsters.filter((m) => m && typeof m.name === 'string' && typeof m.count === 'number') : [];
        return c.json(store.start(quickBattle({ map: q.map as QuickMap, party: names(q.party), monsters, ...(typeof q.title === 'string' ? { title: q.title } : {}) }, store.newId(), Date.now())), 201);
      }
      if (typeof body.dungeonId === 'string' && body.dungeonId) {
        const dungeon = await dungeons.get(body.dungeonId, typeof body.campaign === 'string' && body.campaign ? body.campaign : undefined);
        return c.json(store.start(encounterFromDungeon(dungeon, store.newId(), { now: Date.now, d20: () => 10 })), 201);
      }
      if (typeof body.wikiId === 'string' && body.wikiId) {
        const prepared = await wiki.get(body.wikiId, typeof body.campaign === 'string' && body.campaign ? body.campaign : undefined);
        return c.json(store.start(encounterFromWiki(prepared, store.newId(), Date.now())), 201);
      }
      if (typeof body.title !== 'string') return c.json({ error: 'Send wikiId (a prepared encounter), dungeonId (a dungeon), quick (a quick battle) or title (a blank one)' }, 400);
      return c.json(store.start({ title: body.title }), 201);
    } catch (err) {
      if (err instanceof EncounterError && /still running/.test(err.message)) return c.json({ error: err.message }, 409);
      return failed(c, err);
    }
  });
  r.post('/encounter/actions', async (c) => {
    let action = (await c.req.json().catch(() => null)) as EncounterAction | null;
    if (!action || typeof action !== 'object' || typeof action.type !== 'string') return c.json({ error: 'Send an action: { "type": "next" }' }, 400);
    try {
      // A room's prepared battle (#109) comes from the wiki, not from the page.
      if (action.type === 'fight' && action.prepared) {
        const room = action.room;
        const run = store.current()?.dungeon;
        const id = run?.rooms.find((r) => r.key === room)?.encounter?.encounter_id;
        if (!run || !id) return c.json({ error: 'That room has no prepared battle' }, 400);
        action = { type: 'fight', room, battle: await wiki.get(id, run.campaign) };
      }
      return c.json(store.act(action));
    } catch (err) {
      return failed(c, err);
    }
  });
  const linkFor = () => {
    const code = store.current()?.join?.code;
    const { publicUrl, port } = links();
    if (!code) return { url: null, local: null, publicUrlSet: !!publicUrl };
    return { url: publicJoinUrl({ publicUrl, port }, code), local: `http://localhost:${port}/play/${code}`, publicUrlSet: !!publicUrl };
  };
  r.get('/encounter/link', (c) => {
    // Wanting the link is the moment to make sure it's public (in the background: the answer comes now).
    void publicLink?.ensure().catch(() => undefined);
    return c.json(linkFor());
  });
  r.post('/encounter/link', (c) => {
    try {
      store.newJoinLink();
      return c.json(linkFor());
    } catch (err) {
      return failed(c, err);
    }
  });

  r.post('/encounter/post', async (c) => {
    const state = store.current();
    if (!state?.join) return c.json({ error: 'No encounter is running' }, 400);
    const url = publicJoinUrl(links(), state.join.code);
    if (!url) return c.json({ error: 'Set the public address first (Settings → Encounters): players can’t open a link to this Mac' }, 409);
    if (!bot?.postEncounter || bot.status().state !== 'ready') return c.json({ error: 'The Discord bot isn’t connected' }, 409);
    try {
      const where = await bot.postEncounter(joinPost(state, url));
      return c.json({ message: `Posted in #${where.channelName}` });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 409);
    }
  });

  r.post('/players/check', async (c) => {
    const { public_url } = (await c.req.json().catch(() => ({}))) as { public_url?: unknown };
    let url: URL;
    try {
      url = new URL('/health', typeof public_url === 'string' ? public_url : '');
      if (url.protocol !== 'https:') throw new Error();
    } catch {
      return c.json({ ok: false, message: 'Enter the https:// address Tailscale Funnel shows' });
    }
    try {
      const res = await doFetch(url, { signal: AbortSignal.timeout(10_000) });
      const body = (await res.json().catch(() => null)) as { ok?: unknown } | null;
      if (res.ok && body?.ok === true) return c.json({ ok: true, message: 'Players can reach it' });
      return c.json({ ok: false, message: `It answered ${res.status}, but not as the players' page: is Funnel pointing at port ${links().port}?` });
    } catch (err) {
      return c.json({ ok: false, message: `Couldn't reach it: ${(err as Error).message}. Is Funnel on? (tailscale funnel --bg ${links().port})` });
    }
  });

  // The public link: Funnel's state (turned on when it's off), and turning it on over another port.
  const noTailscale = () => ({ on: false, problem: 'no-tailscale', publicUrl: null, message: 'Tailscale isn’t available here', saved: links().publicUrl ?? null, approve: null });
  r.get('/players/funnel', async (c) => c.json(publicLink ? await publicLink.ensure() : noTailscale()));
  r.post('/players/funnel', async (c) => c.json(publicLink ? await publicLink.force() : noTailscale()));

  r.post('/encounter/suggest', async (c) => {
    const { id } = (await c.req.json().catch(() => ({}))) as { id?: unknown };
    const state = store.current();
    if (!state) return c.json({ error: 'No encounter is running' }, 400);
    const source = advisor?.() ?? { off: 'Monster-turn suggestions are off' };
    if ('off' in source) return c.json({ error: source.off }, 409);
    try {
      const prompt = turnPrompt(state, typeof id === 'string' ? id : (state.turn ?? ''));
      return c.json(await source.suggest(prompt));
    } catch (err) {
      if (err instanceof EncounterError) return failed(c, err);
      return c.json({ error: `Claude couldn't suggest a move: ${(err as Error).message}` }, 502);
    }
  });

  r.post('/encounter/end', (c) => {
    try {
      return c.json(store.end());
    } catch (err) {
      return failed(c, err);
    }
  });
  return r;
}
