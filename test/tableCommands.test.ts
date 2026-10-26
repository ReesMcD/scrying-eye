import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS } from '../src/bot/commands.js';
import { lookupCard, lookupChoices, rollReply, TABLE_COMMANDS } from '../src/bot/tableCommands.js';
import { suggest, SRD_CREDIT, type LookupKind } from '../src/srd/lookup.js';

const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

test('/roll shows who rolled, what for, every die and the total; the note is plain text', () => {
  const r = rollReply('Thorin', '1d20+5', { label: 'Longsword', die: seq(20) });
  assert.equal(r.content, '**Thorin** rolls *Longsword*: 1d20 [20] + 5 = **25** (natural 20!)');
  assert.equal(r.note, 'Longsword: 1d20+5 = 25 (natural 20)');
  assert.equal(r.error, undefined);
  assert.match(rollReply('Sam', undefined, { die: seq(7) }).content, /^\*\*Sam\*\* rolls: 1d20 \[7\] = \*\*7\*\*$/, 'no dice typed: a d20');
});

test('/rr repeats a roll, numbers each and adds them up', () => {
  const r = rollReply('Sam', '4d6kh3', { count: 2, die: seq(1, 5, 3, 6, 2, 2, 2, 2) });
  assert.equal(r.content, '**Sam** rolls 2 × `4d6kh3`:\n1. 4d6 [~~1~~, 5, 3, 6] = **14**\n2. 4d6 [~~2~~, 2, 2, 2] = **6**\nTotal: **20**');
  assert.equal(r.note, '2 × 4d6kh3 = 14, 6');
});

test('bad notation answers with what went wrong and notes nothing', () => {
  const r = rollReply('Sam', '1d20+banana');
  assert.equal(r.error, true);
  assert.match(r.content, /can't read/);
  assert.equal(r.note, undefined);
});

test('a huge /rr stays inside Discord\'s message limit', () => {
  assert.ok(rollReply('Sam', '100d6', { count: 12 }).content.length <= 2000);
});

test('/spell fireball: the SRD entry with its credit', () => {
  const card = lookupCard('spell', 'fireball');
  assert.ok(!('notFound' in card));
  assert.equal(card.title, 'Fireball');
  assert.match(card.description, /Level 3 evocation/);
  assert.match(card.description, /\*\*Range\*\* 150 feet/);
  assert.match(card.description, /8d6/);
  assert.equal(card.footer, SRD_CREDIT);
});

test('/monster: a stat block with scores, modifiers and each kind of action', () => {
  const card = lookupCard('monster', 'Adult Red Dragon');
  assert.ok(!('notFound' in card));
  assert.match(card.description, /\*\*AC\*\* 19 \(natural armor\) · \*\*HP\*\* 256/);
  assert.match(card.description, /STR 27 \(\+8\) · DEX 10 \(\+0\)/);
  assert.match(card.description, /\*\*CR\*\* 17 \(18,000 XP\)/);
  assert.match(card.description, /__Actions__[\s\S]*Rend[\s\S]*__Legendary Actions__[\s\S]*Pounce/);
});

test('lookups: conditions, rules with repeated names, and a name that isn\'t there', () => {
  const prone = lookupCard('condition', 'prone');
  assert.ok(!('notFound' in prone) && /crawl/.test(prone.description));
  const checks = suggest('rule', 'ability checks');
  assert.equal(new Set(checks).size, checks.length, 'each rule name is distinct');
  assert.ok(checks.includes('Ability Checks (social interaction)'));
  const social = lookupCard('rule', 'Ability Checks (social interaction)');
  assert.ok(!('notFound' in social) && /Social interaction/.test(social.description));
  assert.match((lookupCard('spell', 'zzzz') as { notFound: string }).notFound, /No spell called "zzzz"/);
});

test('every SRD entry fits a Discord embed', () => {
  for (const kind of ['spell', 'monster', 'item', 'rule', 'condition'] as LookupKind[]) {
    for (const name of suggest(kind, '', 10_000)) {
      const card = lookupCard(kind, name);
      assert.ok(!('notFound' in card), `${kind} ${name}`);
      assert.equal(card.title, name, `${kind} "${name}" finds itself`);
      assert.ok(card.description.length <= 4096 && card.title.length <= 256, `${kind} ${name}`);
    }
  }
});

test('autocomplete: names starting with what\'s typed come first, 25 at most', () => {
  const fire = lookupChoices('spell', 'fire').map((c) => c.name);
  assert.deepEqual(fire.slice(0, 3), ['Fire Bolt', 'Fire Shield', 'Fire Storm']);
  assert.ok(fire.includes('Delayed Blast Fireball'));
  assert.equal(lookupChoices('monster', '').length, 25);
});

test('the table commands are registered and open to everyone', () => {
  const names = COMMANDS.map((c) => c.name);
  for (const c of TABLE_COMMANDS) {
    assert.ok(names.includes(c.name));
    assert.equal(c.default_member_permissions, undefined, `/${c.name} needs no permission`);
  }
  assert.deepEqual(TABLE_COMMANDS.map((c) => c.name), ['roll', 'rr', 'spell', 'monster', 'item', 'condition', 'rule']);
});
