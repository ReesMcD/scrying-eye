import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, renameSync } from 'node:fs';
import { DamagedFileError } from '../util/files.js';
import { readJson, writeJson } from '../session/layout.js';
import type { Poll, PollAnswers, PollPost, PollResults, PollSchedule } from '../shared/types.js';
import { answersFor, dueSlot, MAX_ANSWERS, parseLocal } from './schedule.js';

/** What a poll needs from Discord (the bot), so the scheduler can be tested without it. */
export interface PollPoster {
  post(channelId: string, poll: { question: string; answers: string[]; hours: number; multiSelect: boolean; note?: string }): Promise<{ messageId: string; channelName: string }>;
  /** The votes so far, or null if the message or poll is gone. */
  results(channelId: string, messageId: string): Promise<PollResults | null>;
  say(channelId: string, text: string, roleId?: string): Promise<void>;
}

export class PollError extends Error {}

/** What the app sends to create or change a poll. */
export type PollInput = Pick<Poll, 'question' | 'channelId' | 'answers' | 'schedule' | 'hours' | 'multiSelect' | 'announce' | 'enabled'>;

const KEPT_POSTS = 10;
const RECHECK_MS = 5 * 60_000;
/** Discord's limits. */
const QUESTION_MAX = 300;
const ANSWER_MAX = 55;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const intIn = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

function readAnswers(v: unknown): PollAnswers {
  if (isObject(v) && v.kind === 'fixed' && Array.isArray(v.list)) {
    const list = v.list.map((a) => (typeof a === 'string' ? a.trim() : '')).filter(Boolean);
    if (list.length < 1 || list.length > MAX_ANSWERS) throw new PollError(`Give 1 to ${MAX_ANSWERS} answers`);
    if (list.some((a) => a.length > ANSWER_MAX)) throw new PollError(`Answers are up to ${ANSWER_MAX} characters`);
    return { kind: 'fixed', list };
  }
  if (isObject(v) && v.kind === 'days') {
    if (!intIn(v.count, 1, MAX_ANSWERS)) throw new PollError(`Offer 1 to ${MAX_ANSWERS} days`);
    if (!intIn(v.startInDays, 0, 14)) throw new PollError('Start 0 to 14 days after posting');
    const weekdays = Array.isArray(v.weekdays) ? [...new Set(v.weekdays)] : [];
    if (!weekdays.every((d) => intIn(d, 0, 6))) throw new PollError('Weekdays are 0 (Sunday) to 6');
    return { kind: 'days', count: v.count as number, startInDays: v.startInDays as number, ...(weekdays.length ? { weekdays: (weekdays as number[]).sort() } : {}) };
  }
  throw new PollError('Answers are typed ones or the coming days');
}

function readSchedule(v: unknown): PollSchedule {
  if (isObject(v) && v.kind === 'once' && typeof v.at === 'string' && parseLocal(v.at)) return { kind: 'once', at: v.at };
  if (isObject(v) && v.kind === 'weekly' && intIn(v.weekday, 0, 6) && typeof v.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.time)) return { kind: 'weekly', weekday: v.weekday as number, time: v.time };
  throw new PollError('Post it once at a date and time, or every week on a day at a time');
}

/** Checks what the app sent: Discord's limits, a real schedule. Throws PollError saying what's wrong. */
export function readPollInput(raw: unknown): PollInput {
  if (!isObject(raw)) throw new PollError('Send a poll');
  const question = typeof raw.question === 'string' ? raw.question.trim() : '';
  if (!question || question.length > QUESTION_MAX) throw new PollError(`The question is 1 to ${QUESTION_MAX} characters`);
  if (typeof raw.channelId !== 'string' || !/^\d{5,25}$/.test(raw.channelId)) throw new PollError('Pick a channel');
  if (!intIn(raw.hours, 1, 768)) throw new PollError('Polls stay open 1 hour to 32 days');
  const announce = isObject(raw.announce) ? raw.announce : {};
  const roleId = typeof announce.roleId === 'string' && /^\d{5,25}$/.test(announce.roleId) ? announce.roleId : undefined;
  return {
    question,
    channelId: raw.channelId,
    answers: readAnswers(raw.answers),
    schedule: readSchedule(raw.schedule),
    hours: raw.hours as number,
    multiSelect: raw.multiSelect === true,
    announce: { on: announce.on === true, ...(roleId ? { roleId } : {}) },
    enabled: raw.enabled !== false,
  };
}

/** "📊 Which day? Sat 25 Oct (4 votes)", or a tie, or nobody voting. */
export function winnerText(question: string, results: PollResults): string {
  const top = Math.max(0, ...results.answers.map((a) => a.votes));
  if (top === 0) return `📊 **${question}**: nobody voted.`;
  const winners = results.answers.filter((a) => a.votes === top).map((a) => a.text);
  return `📊 **${question}**: ${winners.length > 1 ? `a tie between ${winners.join(' and ')}` : `**${winners[0]}**`} (${top} vote${top === 1 ? '' : 's'}).`;
}

/**
 * Scheduled Discord polls (#43), kept in <data>/polls.json so they survive restarts. Every minute
 * it posts what's due (late ones once, saying so) and collects results of polls that closed,
 * announcing the winner when asked. Emits "polls" after every change.
 */
export class PollService extends EventEmitter {
  private polls: Poll[];
  private timer: NodeJS.Timeout | undefined;
  private ticking = false;

  constructor(
    private readonly file: string,
    private readonly deps: { poster: () => PollPoster | null; timeZone: () => string | undefined; now?: () => number; log?: (msg: string) => void },
  ) {
    super();
    this.polls = this.load();
  }

  private now() {
    return (this.deps.now ?? Date.now)();
  }

  private log(msg: string) {
    (this.deps.log ?? console.log)(msg);
  }

  private load(): Poll[] {
    if (!existsSync(this.file)) return [];
    try {
      return readJson<{ polls: Poll[] }>(this.file)?.polls ?? [];
    } catch (err) {
      if (!(err instanceof DamagedFileError)) throw err;
      const aside = `${this.file}.damaged-${this.now()}`;
      renameSync(this.file, aside);
      this.log(`The saved polls couldn't be read; moved them to ${aside}`);
      return [];
    }
  }

  private save() {
    writeJson(this.file, { polls: this.polls });
    this.emit('polls', this.polls);
  }

  list(): Poll[] {
    return this.polls;
  }

  private find(id: string): Poll {
    const poll = this.polls.find((p) => p.id === id);
    if (!poll) throw new PollError('No such poll');
    return poll;
  }

  create(input: PollInput): Poll {
    const poll: Poll = { ...input, id: randomBytes(6).toString('hex'), createdAt: this.now(), posts: [] };
    this.polls.push(poll);
    this.save();
    return poll;
  }

  /** Changes a poll. Changing when it posts, or turning it back on, starts its schedule afresh. */
  update(id: string, input: PollInput): Poll {
    const poll = this.find(id);
    // A new schedule, or switching a paused poll back on, starts afresh: nothing missed meanwhile is owed.
    const rescheduled = JSON.stringify(poll.schedule) !== JSON.stringify(input.schedule) || (!poll.enabled && input.enabled);
    Object.assign(poll, input);
    if (rescheduled) {
      poll.createdAt = this.now();
      delete poll.lastSlot;
    }
    this.save();
    return poll;
  }

  remove(id: string): void {
    this.find(id);
    this.polls = this.polls.filter((p) => p.id !== id);
    this.save();
  }

  private poster(): PollPoster {
    const poster = this.deps.poster();
    if (!poster) throw new PollError('The Discord bot isn’t connected');
    return poster;
  }

  private async post(poll: Poll, how: { late?: boolean; manual?: boolean }): Promise<PollPost> {
    const postedAt = this.now();
    const answers = answersFor(poll.answers, postedAt, this.deps.timeZone());
    if (!answers.length) throw new PollError('No answers to offer: check the weekdays');
    const note = how.late ? 'This poll was due while the app was off, so it’s a little late.' : undefined;
    const { messageId, channelName } = await this.poster().post(poll.channelId, { question: poll.question, answers, hours: poll.hours, multiSelect: poll.multiSelect, ...(note ? { note } : {}) });
    const post: PollPost = { messageId, channelId: poll.channelId, channelName, postedAt, closesAt: postedAt + poll.hours * 3_600_000, answers, ...(how.late ? { late: true } : {}), ...(how.manual ? { manual: true } : {}) };
    poll.posts = [...poll.posts, post].slice(-KEPT_POSTS);
    return post;
  }

  /** "Post now": outside the schedule, which carries on as before. */
  async postNow(id: string): Promise<PollPost> {
    const poll = this.find(id);
    const post = await this.post(poll, { manual: true });
    this.save();
    return post;
  }

  /** Fetches the votes so far for a poll's latest post. */
  async refresh(id: string): Promise<Poll> {
    const poll = this.find(id);
    const post = poll.posts.at(-1);
    if (!post) throw new PollError('It hasn’t been posted yet');
    await this.collect(poll, post);
    this.save();
    return poll;
  }

  private async collect(poll: Poll, post: PollPost): Promise<void> {
    // Gone (the message was deleted): nothing more to collect.
    const results = (await this.poster().results(post.channelId, post.messageId)) ?? { answers: post.results?.answers ?? [], final: true, checkedAt: this.now() };
    post.results = results;
    if (results.final && poll.announce.on && !post.announced) {
      await this.poster().say(post.channelId, winnerText(poll.question, results), poll.announce.roleId);
      post.announced = true;
    }
  }

  /** One run of the clock: post what's due, collect results of polls that have closed. */
  async tick(): Promise<void> {
    if (this.ticking || !this.deps.poster()) return;
    this.ticking = true;
    let changed = false;
    try {
      const now = this.now();
      for (const poll of this.polls) {
        const due = dueSlot(poll, now, this.deps.timeZone());
        if (due) {
          try {
            await this.post(poll, { late: due.late });
            this.log(`Posted the poll "${poll.question}"${due.late ? ' (late)' : ''}`);
          } catch (err) {
            this.log(`Couldn't post the poll "${poll.question}": ${(err as Error).message}`);
          }
          // Tried once per slot: a failure is logged, not retried every minute.
          poll.lastSlot = due.slot;
          changed = true;
        }
        for (const post of poll.posts) {
          // Discord finalises results shortly after closing: look again every few minutes until it has.
          if (post.results?.final || now < post.closesAt || (post.results && now - post.results.checkedAt < RECHECK_MS)) continue;
          try {
            await this.collect(poll, post);
            changed = true;
          } catch (err) {
            post.results = { answers: post.results?.answers ?? [], final: false, checkedAt: now };
            changed = true;
            this.log(`Couldn't read the results of "${poll.question}": ${(err as Error).message}`);
          }
        }
      }
    } finally {
      this.ticking = false;
      if (changed) this.save();
    }
  }

  start(intervalMs = 60_000): void {
    this.stop();
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
