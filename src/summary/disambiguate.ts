import { writeFileAtomic } from '../util/files.js';
import { join } from 'node:path';
import { campaignFor, rosterAt, sharedAccounts, trackEpochs, type SharedIdentity } from '../config/roster.js';
import type { Config } from '../config/schema.js';
import { paths, readJson, writeJson, type SessionInfo } from '../session/layout.js';
import { formatOffset, joinLines, renderMarkdown, type TranscriptLine } from '../transcript/merge.js';
import { chunkTranscript, formatLine, type Chunk } from './chunk.js';
import { runChunkPass } from './chunkPass.js';
import { contextBlock } from './context.js';
import type { Labels, SummaryModel, Usage } from './model.js';
import { loadTemplate, render } from './prompts.js';

/** A shared account's identities, numbered globally so one answer can't pick another account's. */
interface NumberedIdentity extends SharedIdentity {
  number: number;
  /** The account, and from when (#71: who's on an account can change during a session). */
  track: string;
}

/** An account during one stretch of the session in which the same people were on it. */
interface Track {
  userId: string;
  fromMs: number;
  toMs: number | null;
  identities: NumberedIdentity[];
}

export interface DisambiguationResult {
  /** Lines with shared accounts relabelled, re-joined into turns for readability. */
  lines: TranscriptLine[];
  stats: { labelled: number; confident: number; guessed: number; unclear: number };
  modelsUsed: string[];
  usage: Usage;
  promptVersion: string;
  chunks: number;
  chunksFromCache: number;
}

export interface DisambiguateOptions {
  concurrency?: number;
  force?: boolean;
  log?: (msg: string) => void;
}

function accountsBlock(tracks: ReadonlyMap<string, Track>, names: ReadonlyMap<string, string>): string {
  const split = new Set([...tracks.values()].filter((t) => t.fromMs > 0 || t.toMs !== null).map((t) => t.userId));
  return [...tracks.values()]
    .map((t) => {
      const when = split.has(t.userId) ? ` (${t.fromMs ? `from ${formatOffset(t.fromMs)}` : 'from the start'}${t.toMs !== null ? ` until ${formatOffset(t.toMs)}` : ''})` : '';
      return [`Account "${names.get(t.userId) ?? t.userId}"${when}:`, ...t.identities.map((i) => `  ${i.number}. ${i.description}`)].join('\n');
    })
    .join('\n\n');
}

function formatSection(chunk: Chunk, total: number, ids: ReadonlyMap<TranscriptLine, number>, isTarget: (l: TranscriptLine) => boolean): string {
  const body = [
    ...chunk.context.map((l) => formatLine(l, '(context) ')),
    ...chunk.lines.map((l) => (isTarget(l) ? `#${ids.get(l)} ${formatLine(l)}` : formatLine(l))),
  ].join('\n');
  return `<transcript_section number="${chunk.index + 1}" of="${total}" from="${formatOffset(chunk.startMs)}" to="${formatOffset(chunk.endMs)}">\n${body}\n</transcript_section>`;
}

/**
 * Optional pass for Discord accounts shared by several people (or one person in several roles):
 * Claude reads the conversation and labels each of that account's lines with one of the identities
 * linked to it (the speakers whose `discord` lists it, or who the session says were on it at that
 * time). Other speakers pass through unchanged. Expects un-joined lines for shared accounts
 * (mergeSession keeps them separate).
 */
export async function disambiguateLines(
  lines: readonly TranscriptLine[],
  config: Config,
  model: SummaryModel,
  sessionDir: string,
  session: SessionInfo,
  opts: DisambiguateOptions,
): Promise<DisambiguationResult> {
  const log = opts.log ?? console.log;
  const campaign = campaignFor(config, session);
  const epochs = trackEpochs(session.tracks);
  const epochOf = (offsetMs: number) => epochs.findLast((at) => at <= offsetMs) ?? 0;
  const trackOf = (l: TranscriptLine) => `${l.userId}@${epochOf(l.offsetMs)}`;
  const present = new Set(lines.map(trackOf));
  const tracks = new Map<string, Track>();
  const byNumber = new Map<number, NumberedIdentity>();
  let n = 0;
  epochs.forEach((fromMs, e) => {
    for (const [userId, identities] of sharedAccounts(rosterAt(config, session.tracks, fromMs), campaign)) {
      const track = `${userId}@${fromMs}`;
      if (!present.has(track)) continue;
      const numbered = identities.map((i) => ({ ...i, number: ++n, track }));
      tracks.set(track, { userId, fromMs, toMs: epochs[e + 1] ?? null, identities: numbered });
      for (const i of numbered) byNumber.set(i.number, i);
    }
  });
  const isTarget = (l: TranscriptLine) => tracks.has(trackOf(l));

  const template = loadTemplate('disambiguate', config.summary.prompts_dir);
  const promptVersion = `${template.version}#${template.hash}`;
  const empty: DisambiguationResult = {
    lines: [...lines],
    stats: { labelled: 0, confident: 0, guessed: 0, unclear: 0 },
    modelsUsed: [],
    usage: { inputTokens: 0, outputTokens: 0 },
    promptVersion,
    chunks: 0,
    chunksFromCache: 0,
  };
  if (tracks.size === 0) return empty;

  const names = new Map<string, string>();
  for (const l of lines) if (isTarget(l) && !names.has(l.userId)) names.set(l.userId, l.speaker);
  const context = contextBlock(session, lines, config);
  const system = render(template.text, { context, accounts: accountsBlock(tracks, names) });

  const ids = new Map<TranscriptLine, number>();
  lines.forEach((l, i) => ids.set(l, i + 1));
  const s = config.summary;
  const allChunks = chunkTranscript(lines, { chunkMs: s.chunk_minutes * 60_000, contextMs: 60_000, maxChars: 60_000 });
  const chunks = allChunks.filter((c) => c.lines.some(isTarget));
  log(`Labelling speakers on ${new Set([...tracks.values()].map((t) => t.userId)).size} shared account(s) in ${chunks.length} chunk(s)…`);

  const pass = await runChunkPass({
    chunks,
    model: s.model,
    effort: s.extract_effort,
    system,
    user: (chunk) => formatSection(chunk, allChunks.length, ids, isTarget),
    cacheFile: (chunk) => join(sessionDir, 'summary', 'disambiguate', `${String(chunk.index).padStart(3, '0')}.json`),
    call: (o) => model.disambiguate(o),
    ...(opts.force ? { force: true } : {}),
    ...(opts.concurrency ? { concurrency: opts.concurrency } : {}),
  });

  const labelFor = new Map<number, Labels['labels'][number]>();
  for (const l of pass.values.flatMap((v) => v.labels)) labelFor.set(l.line, l);

  const stats = { labelled: 0, confident: 0, guessed: 0, unclear: 0 };
  const relabelled = lines.map((line): TranscriptLine => {
    if (!isTarget(line)) return line;
    stats.labelled++;
    const label = labelFor.get(ids.get(line)!);
    const identity = label ? byNumber.get(label.speaker) : undefined;
    // Missing, 0, or an identity from a different account (or time) → unclear; keep the account's own name.
    if (!label || !identity || identity.track !== trackOf(line)) {
      stats.unclear++;
      return { ...line, inferred: { account: line.speaker, confidence: 'unclear' } };
    }
    if (label.confident) stats.confident++;
    else stats.guessed++;
    return { ...line, speaker: identity.label, ...(identity.player ? { player: identity.player } : {}), inferred: { account: line.speaker, confidence: label.confident ? 'high' : 'low' } };
  });

  return {
    lines: joinLines(relabelled, { mergeGapMs: config.transcript.merge_gap_seconds * 1000, maxLineMs: config.transcript.max_line_seconds * 1000 }),
    stats,
    modelsUsed: pass.modelsUsed,
    usage: pass.usage,
    promptVersion,
    chunks: chunks.length,
    chunksFromCache: pass.fromCache,
  };
}

/** Runs the pass on a session and writes segments.speakers.json + transcript.speakers.md. */
export async function disambiguateSession(
  sessionDir: string,
  config: Config,
  model: SummaryModel,
  opts: DisambiguateOptions,
): Promise<DisambiguationResult & { session: SessionInfo; file?: string }> {
  const data = readJson<{ session: SessionInfo; lines: TranscriptLine[] }>(paths.segments(sessionDir));
  if (!data) throw new Error(`No transcript in ${sessionDir}; run transcribe (or merge) first`);
  const result = await disambiguateLines(data.lines, config, model, sessionDir, data.session, opts);
  if (result.stats.labelled === 0) return { ...result, session: data.session };
  writeJson(paths.disambiguatedSegments(sessionDir), { session: data.session, lines: result.lines, stats: result.stats, promptVersion: result.promptVersion });
  const file = paths.disambiguatedTranscript(sessionDir);
  writeFileAtomic(file, renderMarkdown(data.session, result.lines, config.transcript.timezone));
  return { ...result, session: data.session, file };
}
