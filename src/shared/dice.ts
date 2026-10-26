/**
 * Dice notation and fair rolls, for /roll in Discord (#44) and players' phones (#58). No Node
 * imports: the web page uses it to check what's typed.
 *
 *   1d20+5, 2d6+1d4+3, 4d6kh3 (keep highest 3), 2d20kl1, 8d6dl2 (drop lowest 2),
 *   1d6ro1 (reroll 1s once), 2d6r<2 (reroll 1s and 2s until they stop), 3d6! (exploding),
 *   d20 (one die), d% (1d100), "adv" / "dis" (a d20 test rolled twice).
 */

export type RandomInt = (sides: number) => number;

/** 1…sides from the platform's secure generator (never Math.random). */
export const secureDie: RandomInt = (sides) => {
  // Rejection sampling: no bias toward low numbers.
  const limit = Math.floor(0x1_0000_0000 / sides) * sides;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0]! < limit) return (buf[0]! % sides) + 1;
  }
};

interface DiceTerm {
  kind: 'dice';
  sign: 1 | -1;
  count: number;
  sides: number;
  keep?: { high: boolean; n: number };
  drop?: { high: boolean; n: number };
  /** Reroll at or below this: once, or until it stops. */
  reroll?: { atMost: number; once: boolean };
  explode?: boolean;
}
interface ConstTerm {
  kind: 'const';
  sign: 1 | -1;
  value: number;
}
type Term = DiceTerm | ConstTerm;

export interface ParsedRoll {
  terms: Term[];
  /** "adv" or "dis": the first d20 is rolled twice. */
  mode?: 'adv' | 'dis';
}

export class DiceError extends Error {}

const MAX_DICE = 100;
const MAX_SIDES = 1000;

/** Reads dice notation. Throws DiceError saying what's wrong. */
export function parseRoll(input: string): ParsedRoll {
  let text = input.toLowerCase().replace(/\s+/g, '');
  let mode: ParsedRoll['mode'];
  const flag = /(adv(?:antage)?|dis(?:advantage)?)$/.exec(text);
  if (flag) {
    mode = flag[1]!.startsWith('adv') ? 'adv' : 'dis';
    text = text.slice(0, -flag[1]!.length);
  }
  if (!text) text = '1d20';
  const terms: Term[] = [];
  const re = /([+-]?)(?:(\d*)d(\d+|%)((?:k[hl]?\d+|d[hl]\d+|ro?[<]?\d+|!)*)|(\d+))/gy;
  let pos = 0;
  while (pos < text.length) {
    re.lastIndex = pos;
    const m = re.exec(text);
    if (!m || (pos > 0 && !m[1])) throw new DiceError(`I can't read "${input}" at "${text.slice(pos)}". Try 1d20+5, 2d6+3 or 4d6kh3.`);
    pos = re.lastIndex;
    const sign = m[1] === '-' ? -1 : 1;
    if (m[5] !== undefined) {
      terms.push({ kind: 'const', sign, value: Number(m[5]) });
      continue;
    }
    const count = m[2] ? Number(m[2]) : 1;
    const sides = m[3] === '%' ? 100 : Number(m[3]);
    if (count < 1 || count > MAX_DICE) throw new DiceError(`Roll 1 to ${MAX_DICE} dice at a time`);
    if (sides < 2 || sides > MAX_SIDES) throw new DiceError(`Dice have 2 to ${MAX_SIDES} sides`);
    const term: DiceTerm = { kind: 'dice', sign, count, sides };
    for (const mod of m[4]!.match(/k[hl]?\d+|d[hl]\d+|ro?<?\d+|!/g) ?? []) {
      if (mod === '!') term.explode = true;
      else if (mod.startsWith('k')) term.keep = { high: mod[1] !== 'l', n: Number(mod.replace(/\D/g, '')) };
      else if (mod.startsWith('d')) term.drop = { high: mod[1] === 'h', n: Number(mod.replace(/\D/g, '')) };
      else term.reroll = { atMost: Number(mod.replace(/\D/g, '')), once: mod.startsWith('ro') };
    }
    if ((term.keep && (term.keep.n < 1 || term.keep.n > count)) || (term.drop && term.drop.n >= count)) throw new DiceError('Keep or drop fewer dice than you roll');
    if (term.reroll && term.reroll.atMost >= sides) throw new DiceError('Rerolling every result would never stop');
    if (term.explode && sides < 3) throw new DiceError('Exploding dice need at least 3 sides');
    terms.push(term);
  }
  if (!terms.length) throw new DiceError('Nothing to roll');
  if (mode && !terms.some((t) => t.kind === 'dice' && t.sides === 20)) throw new DiceError('Advantage and disadvantage apply to a d20 roll');
  return { terms, ...(mode ? { mode } : {}) };
}

export interface DieResult {
  sides: number;
  value: number;
  /** Not counted: dropped, kept out, or rerolled away. */
  dropped?: boolean;
}

export interface RollResult {
  expression: string;
  total: number;
  dice: DieResult[];
  /** A natural 20 or 1 on the d20 that counted. */
  crit?: 'success' | 'fail';
  /** "17 (adv: 17, 4)" style text, for chat and the phone. */
  text: string;
}

/** Rolls parsed notation. `die` is injectable for tests. */
export function roll(parsed: ParsedRoll, expression: string, die: RandomInt = secureDie): RollResult {
  const dice: DieResult[] = [];
  let total = 0;
  let crit: RollResult['crit'];
  let modeUsed = false;
  const parts: string[] = [];
  for (const term of parsed.terms) {
    if (term.kind === 'const') {
      total += term.sign * term.value;
      parts.push(`${term.sign < 0 ? '−' : '+'} ${term.value}`);
      continue;
    }
    let rolled: DieResult[] = [];
    for (let i = 0; i < term.count; i++) {
      let value = die(term.sides);
      if (term.reroll) {
        let tries = 0;
        while (value <= term.reroll.atMost && tries++ < 100) {
          rolled.push({ sides: term.sides, value, dropped: true });
          value = die(term.sides);
          if (term.reroll.once) break;
        }
      }
      rolled.push({ sides: term.sides, value });
      if (term.explode) for (let n = 0; value === term.sides && n < 20; n++) rolled.push({ sides: term.sides, value: (value = die(term.sides)) });
    }
    // Advantage: the first single d20 is rolled twice and one kept.
    if (parsed.mode && !modeUsed && term.sides === 20 && term.count === 1 && !term.keep && !term.drop) {
      modeUsed = true;
      const other = { sides: 20, value: die(20) };
      const first = rolled.find((d) => !d.dropped)!;
      const keepOther = parsed.mode === 'adv' ? other.value > first.value : other.value < first.value;
      if (keepOther) first.dropped = true;
      else (other as DieResult).dropped = true;
      rolled.push(other);
    }
    const live = rolled.filter((d) => !d.dropped);
    const order = [...live].sort((a, b) => a.value - b.value);
    const discard = term.keep ? (term.keep.high ? order.slice(0, live.length - term.keep.n) : order.slice(term.keep.n)) : term.drop ? (term.drop.high ? order.slice(live.length - term.drop.n) : order.slice(0, term.drop.n)) : [];
    for (const d of discard) d.dropped = true;
    const sum = rolled.filter((d) => !d.dropped).reduce((s, d) => s + d.value, 0);
    total += term.sign * sum;
    if (term.sides === 20 && !crit) {
      const counted = rolled.filter((d) => !d.dropped);
      if (counted.length === 1) crit = counted[0]!.value === 20 ? 'success' : counted[0]!.value === 1 ? 'fail' : undefined;
    }
    parts.push(`${term.sign < 0 ? '−' : parts.length ? '+' : ''} ${term.count}d${term.sides} [${rolled.map((d) => (d.dropped ? `~~${d.value}~~` : String(d.value))).join(', ')}]`.trim());
    dice.push(...rolled);
    rolled = [];
  }
  const text = `${parts.join(' ')} = **${total}**${crit === 'success' ? ' (natural 20!)' : crit === 'fail' ? ' (natural 1)' : ''}`;
  return { expression, total, dice, ...(crit ? { crit } : {}), text };
}

/** Parses and rolls in one go. */
export function rollDice(expression: string, die: RandomInt = secureDie): RollResult {
  return roll(parseRoll(expression), expression.trim() || '1d20', die);
}
