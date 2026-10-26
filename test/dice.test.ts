import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DiceError, parseRoll, rollDice, secureDie } from '../src/shared/dice.js';

/** A die that returns these values in order. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

test('notation: dice, modifiers, keep/drop, rerolls, exploding, advantage', () => {
  assert.equal(rollDice('1d20+5', seq(12)).total, 17);
  assert.equal(rollDice('2d6 + 1d4 - 3', seq(3, 4, 2)).total, 6);
  assert.equal(rollDice('4d6kh3', seq(1, 5, 3, 6)).total, 14);
  assert.equal(rollDice('2d20kl1', seq(18, 4)).total, 4);
  assert.equal(rollDice('8d6dl2', seq(1, 2, 3, 4, 5, 6, 6, 6)).total, 30);
  assert.equal(rollDice('1d6ro1', seq(1, 1)).total, 1, 'reroll once: the second 1 stays');
  assert.equal(rollDice('1d6r<2', seq(1, 2, 5)).total, 5, 'reroll until above 2');
  assert.equal(rollDice('1d6!', seq(6, 6, 2)).total, 14);
  assert.equal(rollDice('d%', seq(42)).total, 42);
  assert.equal(rollDice('', seq(9)).total, 9, 'nothing typed: a d20');

  const adv = rollDice('1d20+3 adv', seq(4, 17));
  assert.equal(adv.total, 20);
  assert.equal(adv.dice.filter((d) => d.dropped).map((d) => d.value).join(), '4');
  assert.equal(rollDice('d20 dis', seq(4, 17)).total, 4);
  assert.equal(rollDice('1d20', seq(20)).crit, 'success');
  assert.equal(rollDice('1d20 adv', seq(1, 20)).crit, 'success', 'the kept die counts for crits');
  assert.equal(rollDice('1d20+2', seq(1)).crit, 'fail');
  assert.match(rollDice('4d6kh3', seq(1, 5, 3, 6)).text, /4d6 \[~~1~~, 5, 3, 6\] = \*\*14\*\*/);
});

test('bad notation says what to type', () => {
  for (const bad of ['1d', 'banana', '1d20+', '200d6', '1d1', '2d6kh3', '1d6r<6', '2d6 adv', '1d20 2d6']) {
    assert.throws(() => parseRoll(bad), DiceError, bad);
  }
});

test('the secure die covers every face, never outside', () => {
  const seen = new Set<number>();
  for (let i = 0; i < 2000; i++) {
    const v = secureDie(6);
    assert.ok(v >= 1 && v <= 6);
    seen.add(v);
  }
  assert.equal(seen.size, 6);
});
