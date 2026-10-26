import { Hono, type Context } from 'hono';
import type { PollService } from '../polls/PollService.js';
import { PollError, readPollInput } from '../polls/PollService.js';
import { nextSlot } from '../polls/schedule.js';
import type { PollsState } from '../shared/types.js';

/**
 * Scheduled Discord polls (#43), behind the app password:
 *   GET    /polls                the polls, when each posts next, and where they can go
 *   POST   /polls                a new one
 *   PUT    /polls/:id            change one
 *   DELETE /polls/:id            delete one
 *   POST   /polls/:id/post       post it now (the schedule carries on)
 *   POST   /polls/:id/refresh    fetch the votes so far
 */
export function pollRoutes(polls: PollService, deps: { timeZone: () => string; targets: () => Pick<PollsState, 'channels' | 'roles'> }): Hono {
  const r = new Hono();
  const failed = (c: Context, err: unknown) => {
    if (err instanceof PollError) return c.json({ error: err.message }, 400);
    // Discord refused (no permission to post polls, channel gone): say so plainly.
    return c.json({ error: `Discord: ${(err as Error).message}` }, 502);
  };
  const state = (): PollsState => {
    const now = Date.now();
    const timeZone = deps.timeZone();
    return { polls: polls.list().map((p) => ({ ...p, next: p.enabled ? nextSlot(p, now, timeZone) : null })), timeZone, ...deps.targets() };
  };
  const body = async (c: Context) => readPollInput(await c.req.json().catch(() => null));

  r.get('/polls', (c) => c.json(state()));
  r.post('/polls', async (c) => {
    try {
      polls.create(await body(c));
      return c.json(state(), 201);
    } catch (err) {
      return failed(c, err);
    }
  });
  r.put('/polls/:id', async (c) => {
    try {
      polls.update(c.req.param('id'), await body(c));
      return c.json(state());
    } catch (err) {
      return failed(c, err);
    }
  });
  r.delete('/polls/:id', (c) => {
    try {
      polls.remove(c.req.param('id'));
      return c.json(state());
    } catch (err) {
      return failed(c, err);
    }
  });
  r.post('/polls/:id/post', async (c) => {
    try {
      await polls.postNow(c.req.param('id'));
      return c.json(state());
    } catch (err) {
      return failed(c, err);
    }
  });
  r.post('/polls/:id/refresh', async (c) => {
    try {
      await polls.refresh(c.req.param('id'));
      return c.json(state());
    } catch (err) {
      return failed(c, err);
    }
  });
  return r;
}
