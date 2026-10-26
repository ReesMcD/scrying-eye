import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { serve, type ServerType } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { streamSSE } from 'hono/streaming';
import { clientAddress } from '../app/network.js';
import { EncounterError } from '../encounter/rules.js';
import type { EncounterStore } from '../encounter/store.js';
import type { EncounterState, PlayerRequest } from '../shared/types.js';
import { artImage, type MapArt } from '../battlemap/library.js';
import { MiniStoreError, type MiniStore } from '../minis/store.js';
import { MiniError, type MiniSpec } from '../shared/minis/index.js';
import { playerView } from './view.js';

/**
 * The public side of an encounter (#47): what Tailscale Funnel exposes. It serves the player page
 * and a narrow API for the encounter running now, and nothing else: no DM routes, no password,
 * no files but the page's own. It listens on 127.0.0.1 only; Funnel connects from this Mac.
 *
 *   GET  /play/:code              the player page
 *   GET  /p/:code/view            the encounter as this device may see it
 *   GET  /p/:code/events          the same, live (server-sent events)
 *   POST /p/:code/join            { combatantId | null } → { token }  (one device per PC)
 *   POST /p/:code/act             a PlayerRequest on your own PC (or moving any PC)
 *   PUT  /p/:code/mini            { mini }: your own character's paper mini, kept for next time
 *   GET  /p/:code/art             the map's pictures (from the DM's art folder), if any
 *   GET  /p/:code/art/:id         one of those pictures, and only those
 *   GET  /mini/:token             a player's page for their character's paper mini
 *   GET  /m/:token                that character's name and mini
 *   PUT  /m/:token                { mini }: saves it (the link opens that one character, nothing else)
 *
 * Devices send their token as `Authorization: Bearer <token>`.
 */

/** Counts requests per client in a sliding minute; also caps everyone together, since a forwarded address can be spoofed. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private all: number[] = [];
  constructor(
    private readonly perClient = 120,
    private readonly total = 1500,
    private readonly now: () => number = Date.now,
  ) {}

  allow(client: string): boolean {
    const cutoff = this.now() - 60_000;
    this.all = this.all.filter((t) => t > cutoff);
    const mine = (this.hits.get(client) ?? []).filter((t) => t > cutoff);
    if (mine.length >= this.perClient || this.all.length >= this.total) {
      this.hits.set(client, mine);
      return false;
    }
    mine.push(this.now());
    this.all.push(this.now());
    this.hits.set(client, mine);
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (!v.some((t) => t > cutoff)) this.hits.delete(k);
    return true;
  }
}

/** Funnel connects from this Mac and forwards the player's address; anything else is the socket's. */
function playerAddress(c: Context): string {
  const remote = clientAddress(c) ?? 'local';
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded && /^(127\.|::1$|::ffff:127\.)/.test(remote) ? forwarded : remote;
}

const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  // The join code is in the URL: never send it on as a referrer.
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'");
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
};

const bearer = (c: Context) => {
  const h = c.req.header('authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
};

export function playerApp(store: EncounterStore, opts: { webDist: string; limiter?: RateLimiter; art?: MapArt; minis?: MiniStore }): Hono {
  const app = new Hono();
  const limiter = opts.limiter ?? new RateLimiter();
  const webDist = resolve(opts.webDist);
  const gone = (c: Context) => c.json({ error: 'This encounter has ended, or the DM made a new link.' }, 410);
  const miniFor = (name: string): MiniSpec | null => opts.minis?.forName(name) ?? null;
  const view = (state: EncounterState, me: string | null) => playerView(state, me, miniFor);

  app.use('*', securityHeaders);
  app.use('*', async (c, next) => {
    if (!limiter.allow(playerAddress(c))) {
      c.header('Retry-After', '60');
      return c.json({ error: 'Too many requests: wait a minute' }, 429);
    }
    await next();
  });
  const small = bodyLimit({ maxSize: 4 * 1024, onError: (c) => c.json({ error: 'Too large' }, 413) });
  app.use('/p/*', small);
  app.use('/m/*', small);

  app.get('/health', (c) => c.json({ ok: true }));

  /** The view for this device: as its PC, as a guest, or 401 when its token is stale (it joins again). */
  const viewFor = (c: Context, code: string): { state: EncounterState; me: string | null } | Response => {
    if (!store.isOpen(code)) return gone(c);
    const token = bearer(c);
    if (!token) return { state: store.current()!, me: null };
    const found = store.player(code, token);
    if (!found) return c.json({ error: 'Join again' }, 401);
    return { state: found.state, me: found.player.combatantId };
  };

  app.get('/p/:code/view', (c) => {
    const v = viewFor(c, c.req.param('code'));
    return v instanceof Response ? v : c.json(view(v.state, v.me));
  });

  app.get('/p/:code/events', (c) => {
    const code = c.req.param('code');
    const v = viewFor(c, code);
    if (v instanceof Response) return v;
    const token = bearer(c);
    return streamSSE(c, async (stream) => {
      let done = false;
      const finish = () => {
        done = true;
        // Say so before closing, or the player's page just sees the connection drop.
        void stream.writeSSE({ event: 'ended', data: '{}' }).then(() => stream.abort());
      };
      const send = () => {
        if (done) return;
        if (!store.isOpen(code)) return finish();
        const me = token ? store.player(code, token)?.player.combatantId : null;
        if (me === undefined) return finish();
        void stream.writeSSE({ event: 'view', data: JSON.stringify(view(store.current()!, me)) });
      };
      store.on('encounter', send);
      // A mini changed: standees on the map redraw.
      opts.minis?.on('change', send);
      send();
      const ping = setInterval(() => void stream.writeSSE({ event: 'ping', data: '' }), 25_000);
      await new Promise<void>((r) => stream.onAbort(r));
      clearInterval(ping);
      store.off('encounter', send);
      opts.minis?.off('change', send);
    });
  });

  app.get('/p/:code/art', (c) => {
    const v = viewFor(c, c.req.param('code'));
    return v instanceof Response ? v : c.json(opts.art?.plan(v.state.map) ?? null);
  });
  app.get('/p/:code/art/:id', (c) => {
    const v = viewFor(c, c.req.param('code'));
    if (v instanceof Response) return v;
    const plan = opts.art?.plan(v.state.map);
    return artImage(plan ? opts.art!.file(c.req.param('id'), new Set(plan.ids)) : undefined);
  });

  app.post('/p/:code/join', async (c) => {
    const code = c.req.param('code');
    if (!store.isOpen(code)) return gone(c);
    const body = (await c.req.json().catch(() => null)) as { combatantId?: unknown } | null;
    const combatantId = typeof body?.combatantId === 'string' ? body.combatantId : null;
    try {
      const { token, state } = store.join(code, combatantId);
      return c.json({ token, view: view(state, combatantId) });
    } catch (err) {
      if (err instanceof EncounterError) return c.json({ error: err.message }, 409);
      throw err;
    }
  });

  app.post('/p/:code/act', async (c) => {
    const code = c.req.param('code');
    if (!store.isOpen(code)) return gone(c);
    const token = bearer(c);
    const found = token ? store.player(code, token) : null;
    if (!found) return c.json({ error: 'Join again' }, 401);
    const request = (await c.req.json().catch(() => null)) as PlayerRequest | null;
    if (!request || typeof request !== 'object') return c.json({ error: 'Bad request' }, 400);
    try {
      return c.json(view(store.playerAct(code, token, request), found.player.combatantId));
    } catch (err) {
      if (err instanceof EncounterError) return c.json({ error: err.message }, 400);
      throw err;
    }
  });

  app.put('/p/:code/mini', async (c) => {
    const code = c.req.param('code');
    if (!store.isOpen(code)) return gone(c);
    const token = bearer(c);
    const found = token ? store.player(code, token) : null;
    if (!found) return c.json({ error: 'Join again' }, 401);
    const mine = found.state.combatants.find((x) => x.id === found.player.combatantId && x.kind === 'pc');
    if (!mine) return c.json({ error: 'Pick your character first' }, 400);
    if (!opts.minis) return c.json({ error: 'Minis are off on this table' }, 404);
    const body = (await c.req.json().catch(() => null)) as { mini?: unknown } | null;
    if (!body || !('mini' in body)) return c.json({ error: 'Bad request' }, 400);
    try {
      opts.minis.setCharacterMini(mine.name, body.mini);
      return c.json(view(store.current()!, mine.id));
    } catch (err) {
      if (err instanceof MiniError || err instanceof MiniStoreError) return c.json({ error: err.message }, 400);
      throw err;
    }
  });

  // A player's link to their character's mini.
  const linkGone = (c: Context) => c.json({ error: 'This link was turned off: ask the DM for a new one.' }, 410);
  app.get('/m/:token', (c) => {
    const figure = opts.minis?.byLink(c.req.param('token'));
    return figure ? c.json({ name: figure.name, mini: figure.mini }) : linkGone(c);
  });
  app.put('/m/:token', async (c) => {
    const figure = opts.minis?.byLink(c.req.param('token'));
    if (!figure) return linkGone(c);
    const body = (await c.req.json().catch(() => null)) as { mini?: unknown } | null;
    if (!body || !('mini' in body)) return c.json({ error: 'Bad request' }, 400);
    try {
      const saved = opts.minis!.setMini(figure.id, body.mini);
      return c.json({ name: saved.name, mini: saved.mini });
    } catch (err) {
      if (err instanceof MiniError || err instanceof MiniStoreError) return c.json({ error: err.message }, 400);
      throw err;
    }
  });

  // The page and its own files. Unknown codes get the page too; it says the link has expired.
  if (existsSync(resolve(webDist, 'play.html'))) {
    app.get('/play/:code', serveStatic({ root: webDist, path: 'play.html' }));
    app.get('/mini/:token', serveStatic({ root: webDist, path: 'mini.html' }));
    app.use('/assets/*', async (c, next) => {
      await next();
      if (c.res.ok) c.header('Cache-Control', 'public, max-age=31536000, immutable');
    });
    app.get('/assets/*', serveStatic({ root: webDist }));
  }
  app.all('*', (c) => c.text('Not found', 404));
  return app;
}

/** Starts the player server on 127.0.0.1:<port>. */
export function startPlayerServer(store: EncounterStore, opts: { port: number; webDist: string; art?: MapArt; minis?: MiniStore }): Promise<{ port: number; close(): Promise<void> }> {
  const app = playerApp(store, { webDist: opts.webDist, ...(opts.art ? { art: opts.art } : {}), ...(opts.minis ? { minis: opts.minis } : {}) });
  return new Promise((resolvePromise, reject) => {
    let server: ServerType;
    try {
      server = serve({ fetch: app.fetch, port: opts.port, hostname: '127.0.0.1' }, (info: AddressInfo) =>
        resolvePromise({ port: info.port, close: () => new Promise<void>((r) => server.close(() => r())) }),
      );
      server.once('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}
