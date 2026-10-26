import type { Poll, PollAnswers, PollSchedule } from '../shared/types.js';

/**
 * When polls post, and the answers generated for scheduling ones (#43). Times are wall-clock in
 * the configured time zone (transcript.timezone), so "Monday 10:00" stays 10:00 across daylight
 * saving. No Node imports.
 */

const MINUTE = 60_000;
const DAY = 86_400_000;
/** A post this long after its time says it's late (the app was off or asleep). */
export const LATE_AFTER_MS = 10 * MINUTE;

interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday. */
  weekday: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The wall-clock time at an instant in a time zone. */
export function wallTime(epochMs: number, timeZone: string | undefined): WallTime {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short', hourCycle: 'h23' })
      .formatToParts(epochMs)
      .map((p) => [p.type, p.value]),
  );
  return { year: +parts.year!, month: +parts.month!, day: +parts.day!, hour: +parts.hour!, minute: +parts.minute!, weekday: WEEKDAYS.indexOf(parts.weekday!) };
}

/** The instant a wall-clock time happens in a time zone (a time skipped by daylight saving moves forward by the gap). */
export function fromWallTime(t: Omit<WallTime, 'weekday'>, timeZone: string | undefined): number {
  const asUtc = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute);
  const shift = (epoch: number) => {
    const w = wallTime(epoch, timeZone);
    return asUtc - Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  };
  // Two rounds settle the zone's offset at that moment.
  let guess = asUtc;
  guess += shift(guess);
  guess += shift(guess);
  // Still off: the time doesn't exist that day (clocks jumped past it). Move past the gap.
  const off = shift(guess);
  return off > 0 ? guess + off : guess;
}

/** "2026-10-27T10:00" → its parts; null when it isn't one. */
export function parseLocal(text: string): Omit<WallTime, 'weekday'> | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(text);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number) as [number, number, number, number, number];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  return { year, month, day, hour, minute };
}

const parseHHMM = (text: string) => {
  const m = /^(\d{2}):(\d{2})$/.exec(text);
  return m && +m[1]! < 24 && +m[2]! < 60 ? { hour: +m[1]!, minute: +m[2]! } : null;
};

/** The latest time the schedule says to post at or before `now`, or null if there's none yet. */
export function latestSlot(schedule: PollSchedule, now: number, timeZone: string | undefined): number | null {
  if (schedule.kind === 'once') {
    const at = parseLocal(schedule.at);
    const when = at ? fromWallTime(at, timeZone) : null;
    return when !== null && when <= now ? when : null;
  }
  return weeklySlot(schedule, now, timeZone, -1);
}

/** The weekly slot nearest `from` going back (-1: at or before) or forward (1: after). */
function weeklySlot(schedule: Extract<PollSchedule, { kind: 'weekly' }>, from: number, timeZone: string | undefined, direction: 1 | -1): number | null {
  const time = parseHHMM(schedule.time);
  if (!time) return null;
  for (let k = 0; k <= 8; k++) {
    const day = wallTime(from + direction * k * DAY, timeZone);
    if (day.weekday !== schedule.weekday) continue;
    const slot = fromWallTime({ year: day.year, month: day.month, day: day.day, ...time }, timeZone);
    if (direction < 0 ? slot <= from : slot > from) return slot;
  }
  return null;
}

/** The next time the schedule posts after `now`, for the app to show; null when it won't again. */
export function nextSlot(poll: Pick<Poll, 'schedule' | 'lastSlot'>, now: number, timeZone: string | undefined): number | null {
  const s = poll.schedule;
  if (s.kind === 'once') {
    const at = parseLocal(s.at);
    return at && poll.lastSlot === undefined ? fromWallTime(at, timeZone) : null;
  }
  return weeklySlot(s, now, timeZone, 1);
}

/**
 * Whether a poll should post now: its latest slot hasn't been posted yet, and isn't from before
 * the poll was set up. Several missed slots post once (the latest), never one each.
 */
export function dueSlot(poll: Pick<Poll, 'schedule' | 'lastSlot' | 'createdAt' | 'enabled'>, now: number, timeZone: string | undefined): { slot: number; late: boolean } | null {
  if (!poll.enabled) return null;
  const slot = latestSlot(poll.schedule, now, timeZone);
  if (slot === null || (poll.lastSlot !== undefined && slot <= poll.lastSlot)) return null;
  // A weekly slot from before the poll existed isn't owed; a one-off is, if it was set in the past.
  if (poll.schedule.kind === 'weekly' && slot < poll.createdAt) return null;
  return { slot, late: now - slot > LATE_AFTER_MS };
}

/** Discord allows 10 answers of up to 55 characters. */
export const MAX_ANSWERS = 10;

/** "Fri 24 Oct" in the time zone. */
export function dayLabel(epochMs: number, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short' }).format(epochMs).replace(',', '');
}

/** The answers a poll posted at `postAt` offers: typed ones, or the coming days (optionally only some weekdays). */
export function answersFor(answers: PollAnswers, postAt: number, timeZone: string | undefined): string[] {
  if (answers.kind === 'fixed') return answers.list.slice(0, MAX_ANSWERS);
  const out: string[] = [];
  const start = wallTime(postAt, timeZone);
  // Noon avoids DST edges when stepping day by day.
  const noon = fromWallTime({ year: start.year, month: start.month, day: start.day, hour: 12, minute: 0 }, timeZone);
  for (let d = answers.startInDays; out.length < Math.min(answers.count, MAX_ANSWERS) && d < answers.startInDays + 35; d++) {
    const day = noon + d * DAY;
    if (!answers.weekdays?.length || answers.weekdays.includes(wallTime(day, timeZone).weekday)) out.push(dayLabel(day, timeZone));
  }
  return out;
}
