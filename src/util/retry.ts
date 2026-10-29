export class HttpError extends Error {
  override name = 'HttpError';
  constructor(
    readonly status: number,
    message: string,
    /** Parsed from a Retry-After header, if the server sent one. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }

  get retryable(): boolean {
    return this.status === 408 || this.status === 409 || this.status === 429 || this.status >= 500;
  }
}

export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /**
   * How long in all to wait out rate limits (429s) on top of `retries`. A 429 then waits as long
   * as the server says (its Retry-After, not capped by `maxDelayMs`) and doesn't use up a retry.
   * Hourly quotas, like Groq's free tier's 2 hours of audio per hour, need minutes, not seconds.
   */
  rateLimitBudgetMs?: number;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  sleep?: (ms: number) => Promise<void>;
}

/** Network errors and retryable HTTP statuses are retried with exponential backoff + jitter. */
export function isRetryable(err: unknown): boolean {
  if (err instanceof HttpError) return err.retryable;
  // fetch() network failures surface as TypeError ("fetch failed"); aborts/timeouts as DOMException.
  return err instanceof TypeError || (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError'));
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = options.retries ?? 5;
  const base = options.baseDelayMs ?? 1000;
  const max = options.maxDelayMs ?? 60_000;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let rateLimitLeft = options.rateLimitBudgetMs ?? 0;
  for (let attempt = 0, tries = 0; ; tries++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryable(err)) throw err;
      const backoff = (n: number) => Math.min(max, base * 2 ** n) * (0.5 + Math.random() / 2);
      if (err instanceof HttpError && err.status === 429 && rateLimitLeft > 0) {
        const delay = Math.min(rateLimitLeft, Math.max(1000, err.retryAfterMs ?? backoff(tries)));
        rateLimitLeft -= delay;
        options.onRetry?.(err, tries + 1, delay);
        await sleep(delay);
        continue;
      }
      if (attempt >= retries) throw err;
      const delay = err instanceof HttpError && err.retryAfterMs !== undefined ? Math.min(max, err.retryAfterMs) : backoff(attempt);
      attempt++;
      options.onRetry?.(err, tries + 1, delay);
      await sleep(delay);
    }
  }
}

/** Runs tasks with at most `limit` in flight; results keep input order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}
