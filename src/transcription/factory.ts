import type { Config } from '../config/schema.js';
import { HttpError } from '../util/retry.js';
import { OpenAICompatibleTranscriber, PROVIDERS } from './openaiCompatible.js';
import type { Transcriber } from './types.js';

/** Long enough to wait out an hourly quota (Groq's free tier: 2 hours of audio per hour). */
const RATE_LIMIT_WAIT_MS = 75 * 60_000;

export interface TranscriberOptions {
  /** Wait out rate limits (a whole session's transcription); a live preview shouldn't. */
  waitForRateLimits?: boolean;
  log?: (msg: string) => void;
}

/** Builds the configured transcriber. API keys come from the environment, never the config file. */
export function createTranscriber(config: Config['transcription'], env: NodeJS.ProcessEnv = process.env, options: TranscriberOptions = {}): Transcriber {
  const provider = PROVIDERS[config.provider];
  const apiKey = env.TRANSCRIBE_API_KEY || env[provider.keyEnv];
  if (!apiKey) throw new Error(`No API key for ${config.provider}: set TRANSCRIBE_API_KEY (or ${provider.keyEnv}) in .env`);
  return new OpenAICompatibleTranscriber({
    provider: config.provider,
    apiKey,
    ...(config.model ? { model: config.model } : {}),
    ...(config.base_url ? { baseUrl: config.base_url } : {}),
    ...(options.waitForRateLimits ? { retry: { rateLimitBudgetMs: RATE_LIMIT_WAIT_MS, onRetry: (err, _attempt, delayMs) => logRetry(err, delayMs, options.log) } } : {}),
  });
}

function logRetry(err: unknown, delayMs: number, log: ((msg: string) => void) | undefined): void {
  if (!(err instanceof HttpError) || err.status !== 429) return log?.(`  retrying in ${Math.round(delayMs / 1000)}s: ${(err as Error).message.slice(0, 120)}`);
  log?.(`  rate limit reached (${/seconds of audio per hour/.test(err.message) ? "the provider's audio-per-hour quota" : 'too many requests'}); waiting ${Math.round(delayMs / 1000)}s`);
}
