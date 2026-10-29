import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError, mapLimit, parseRetryAfter, withRetry } from '../src/util/retry.js';

const noSleep = { sleep: async () => {} };

test('retries retryable errors then succeeds', async () => {
  let calls = 0;
  const delays: number[] = [];
  const result = await withRetry(
    async () => {
      if (++calls < 3) throw new HttpError(429, 'slow down', 1500);
      return 'ok';
    },
    { ...noSleep, onRetry: (_e, _a, d) => delays.push(d) },
  );
  assert.equal(result, 'ok');
  assert.deepEqual(delays, [1500, 1500]); // honours Retry-After
});

test('does not retry client errors', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => {
      calls++;
      throw new HttpError(400, 'bad request');
    }, noSleep),
    /bad request/,
  );
  assert.equal(calls, 1);
});

test('gives up after the retry budget', async () => {
  let calls = 0;
  await assert.rejects(withRetry(async () => { calls++; throw new HttpError(503, 'down'); }, { ...noSleep, retries: 2 }));
  assert.equal(calls, 3);
});

test('parses Retry-After seconds and dates', () => {
  assert.equal(parseRetryAfter('2'), 2000);
  assert.equal(parseRetryAfter(new Date(10_000).toUTCString(), 4000), 6000);
  assert.equal(parseRetryAfter(null), undefined);
});

test('mapLimit preserves order and caps concurrency', async () => {
  let inFlight = 0;
  let peak = 0;
  const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
    peak = Math.max(peak, ++inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return n * 10;
  });
  assert.deepEqual(out, [10, 20, 30, 40, 50]);
  assert.equal(peak, 2);
});

test('an hourly quota (429) is waited out for as long as the server says, without using up retries', async () => {
  let calls = 0;
  const delays: number[] = [];
  const result = await withRetry(
    async () => {
      if (++calls <= 8) throw new HttpError(429, 'seconds of audio per hour', 5 * 60_000);
      return 'ok';
    },
    { ...noSleep, retries: 2, rateLimitBudgetMs: 75 * 60_000, onRetry: (_e, _a, d) => delays.push(d) },
  );
  assert.equal(result, 'ok');
  assert.deepEqual(delays, Array(8).fill(5 * 60_000)); // not capped at maxDelayMs (60 s)
});

test('gives up on a rate limit once its wait budget is spent', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => { calls++; throw new HttpError(429, 'quota', 30 * 60_000); }, { ...noSleep, retries: 0, rateLimitBudgetMs: 60 * 60_000 }),
    /quota/,
  );
  assert.equal(calls, 3); // waits 30 + 30 min, then no budget and no retries left
});

test('without a rate-limit budget, a 429 counts as an ordinary retry', async () => {
  let calls = 0;
  await assert.rejects(withRetry(async () => { calls++; throw new HttpError(429, 'slow down', 1000); }, { ...noSleep, retries: 2 }));
  assert.equal(calls, 3);
});
