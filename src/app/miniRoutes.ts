import { Hono, type Context } from 'hono';
import { MiniStoreError, type MiniStore } from '../minis/store.js';
import { MiniError } from '../shared/minis/index.js';
import type { MiniKind } from '../shared/types.js';

/**
 * The Minis page (the DM's side):
 *
 *   GET    /minis                  every figure: the party (from the roster), NPCs and monsters
 *   POST   /minis                  { name, kind: npc | monster, mini? }: adds one
 *   PUT    /minis/:id              { mini | null }: saves its mini (null: the default figure)
 *   DELETE /minis/:id              removes an NPC or monster, or clears a character's mini
 *   POST   /minis/:id/link         a new private link for the character's player (the old one stops)
 *   DELETE /minis/:id/link         turns the link off
 */
export function miniRoutes(minis: MiniStore, publicUrl: () => string | undefined): Hono {
  const r = new Hono();
  const failed = (c: Context, err: unknown) => {
    if (err instanceof MiniStoreError) return c.json({ error: err.message }, err.status);
    if (err instanceof MiniError) return c.json({ error: err.message }, 400);
    throw err;
  };
  const body = async (c: Context) => ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;

  r.get('/minis', (c) => c.json({ figures: minis.list() }));

  r.post('/minis', async (c) => {
    const b = await body(c);
    const kind = b.kind === 'npc' || b.kind === 'monster' ? (b.kind as MiniKind) : null;
    if (typeof b.name !== 'string' || !kind) return c.json({ error: 'Send { name, kind: npc | monster }' }, 400);
    try {
      return c.json(minis.add(b.name, kind, b.mini ?? null));
    } catch (err) {
      return failed(c, err);
    }
  });

  r.put('/minis/:id', async (c) => {
    const b = await body(c);
    if (!('mini' in b)) return c.json({ error: 'Send { mini }' }, 400);
    try {
      return c.json(minis.setMini(c.req.param('id'), b.mini));
    } catch (err) {
      return failed(c, err);
    }
  });

  r.delete('/minis/:id', (c) => {
    try {
      minis.remove(c.req.param('id'));
      return c.json({ ok: true });
    } catch (err) {
      return failed(c, err);
    }
  });

  r.post('/minis/:id/link', (c) => {
    const base = publicUrl();
    if (!base) return c.json({ error: 'Set the public address first (Settings → Encounters): players can’t open a link to this Mac' }, 409);
    try {
      const token = minis.newLink(c.req.param('id'));
      return c.json({ url: new URL(`/mini/${token}`, base).href });
    } catch (err) {
      return failed(c, err);
    }
  });

  r.delete('/minis/:id/link', (c) => {
    try {
      minis.revokeLink(c.req.param('id'));
      return c.json({ ok: true });
    } catch (err) {
      return failed(c, err);
    }
  });

  return r;
}
