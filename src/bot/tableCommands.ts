import { InteractionContextType, SlashCommandBuilder, type RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import { DiceError, rollDice, secureDie, type RandomInt, type RollResult } from '../shared/dice.js';
import { lookup, suggest, SRD_CREDIT, type LookupKind, type LookupResult, type Monster, type Spell } from '../srd/lookup.js';

/**
 * Dice and rules at the table (#44): /roll, /rr and the SRD lookups. Open to everyone in the
 * server; replies are public unless `private` is set.
 */
const MAX_REPEATS = 12;

const LOOKUPS: Array<{ kind: LookupKind; description: string }> = [
  { kind: 'spell', description: 'Look up a spell (SRD 5.2)' },
  { kind: 'monster', description: "Look up a monster's stat block (SRD 5.2)" },
  { kind: 'item', description: 'Look up an item or piece of gear (SRD 5.2)' },
  { kind: 'condition', description: 'What a condition does' },
  { kind: 'rule', description: 'Look up a rule (SRD 5.2)' },
];

const command = (name: string, description: string) => new SlashCommandBuilder().setName(name).setDescription(description).setContexts(InteractionContextType.Guild);

export const TABLE_COMMANDS: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
  command('roll', 'Roll dice, e.g. 1d20+5, 4d6kh3, 1d20 adv')
    .addStringOption((o) => o.setName('dice').setDescription('Dice notation (default 1d20)').setMaxLength(100))
    .addStringOption((o) => o.setName('label').setDescription('What for, e.g. Longsword attack').setMaxLength(80))
    .addBooleanOption((o) => o.setName('private').setDescription('Only you see the result'))
    .toJSON(),
  command('rr', 'Repeat a roll, e.g. 6 × 4d6kh3 for ability scores')
    .addIntegerOption((o) => o.setName('count').setDescription('How many times').setMinValue(1).setMaxValue(MAX_REPEATS).setRequired(true))
    .addStringOption((o) => o.setName('dice').setDescription('Dice notation').setMaxLength(100).setRequired(true))
    .addStringOption((o) => o.setName('label').setDescription('What for').setMaxLength(80))
    .addBooleanOption((o) => o.setName('private').setDescription('Only you see the results'))
    .toJSON(),
  ...LOOKUPS.map(({ kind, description }) =>
    command(kind, description)
      .addStringOption((o) => o.setName('name').setDescription('Start typing a name').setAutocomplete(true).setRequired(true).setMaxLength(100))
      .addBooleanOption((o) => o.setName('private').setDescription('Only you see the reply'))
      .toJSON(),
  ),
];

export const isTableCommand = (name: string): boolean => name === 'roll' || name === 'rr' || isLookupCommand(name);
export const isLookupCommand = (name: string): name is LookupKind => LOOKUPS.some((l) => l.kind === name);

/** Discord's limits: message text, embed description. */
const MESSAGE_LIMIT = 2000;
const DESCRIPTION_LIMIT = 4096;

const clip = (text: string, limit: number) => (text.length <= limit ? text : `${text.slice(0, limit - 2).trimEnd()} …`);

export interface RollReply {
  content: string;
  /** Bad notation: shown only to whoever typed it. */
  error?: true;
  /** For the session transcript, e.g. "Longsword: 1d20+5 = 22 (natural 20)"; absent for a bad roll. */
  note?: string;
}

/** /roll and /rr: "**Sam** rolls *Longsword*: 1d20 [17] + 5 = **22**", one line per repeat. */
export function rollReply(who: string, expression: string | undefined, options: { label?: string; count?: number; die?: RandomInt } = {}): RollReply {
  const count = Math.min(Math.max(options.count ?? 1, 1), MAX_REPEATS);
  try {
    const rolls = Array.from({ length: count }, () => rollDice(expression ?? '', options.die ?? secureDie));
    const head = `**${who}** rolls${options.label ? ` *${options.label}*` : ''}`;
    const content =
      count === 1
        ? `${head}: ${rolls[0]!.text}`
        : `${head} ${count} × \`${rolls[0]!.expression}\`:\n${rolls.map((r, n) => `${n + 1}. ${r.text}`).join('\n')}\nTotal: **${rolls.reduce((s, r) => s + r.total, 0)}**`;
    return { content: clip(content, MESSAGE_LIMIT), note: rollNote(rolls, options.label) };
  } catch (err) {
    if (err instanceof DiceError) return { content: err.message, error: true };
    throw err;
  }
}

function rollNote(rolls: RollResult[], label: string | undefined): string {
  const crit = (r: RollResult) => (r.crit === 'success' ? ' (natural 20)' : r.crit === 'fail' ? ' (natural 1)' : '');
  const first = rolls[0]!;
  const result = rolls.length === 1 ? `${first.expression} = ${first.total}${crit(first)}` : `${rolls.length} × ${first.expression} = ${rolls.map((r) => `${r.total}${crit(r)}`).join(', ')}`;
  return `${label ? `${label}: ` : ''}${result}`;
}

/** Autocomplete choices for a lookup command. */
export const lookupChoices = (kind: LookupKind, typed: string) => suggest(kind, typed).map((name) => ({ name: name.slice(0, 100), value: name.slice(0, 100) }));

/** A Discord embed, as plain data (BotService turns it into an EmbedBuilder). */
export interface LookupCard {
  title: string;
  description: string;
  footer: string;
}

/** The embed for /spell, /monster, /item, /condition and /rule, or a "not found" message. */
export function lookupCard(kind: LookupKind, name: string): LookupCard | { notFound: string } {
  const found = lookup(kind, name);
  if (!found) return { notFound: `No ${kind} called "${name}" in the SRD 5.2. (Only the free rules are here, not every book.)` };
  return { title: found.entry.name, description: clip(cardText(found), DESCRIPTION_LIMIT), footer: kind === 'condition' ? 'A summary of the 2024 rules' : SRD_CREDIT };
}

function cardText(found: LookupResult): string {
  switch (found.kind) {
    case 'spell':
      return spellText(found.entry);
    case 'monster':
      return monsterText(found.entry);
    case 'item': {
      const e = found.entry;
      const sub = [e.category, e.rarity].filter(Boolean).join(', ');
      const facts = [e.cost && `**Cost** ${e.cost}`, e.weight && `**Weight** ${e.weight}`].filter(Boolean).join(' · ');
      return [sub && `*${capital(sub)}*`, facts, e.desc].filter(Boolean).join('\n\n');
    }
    case 'rule':
      return [found.entry.set && `*${capital(found.entry.set)}*`, found.entry.desc].filter(Boolean).join('\n\n');
    case 'condition':
      return found.entry.desc;
  }
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`);

function spellText(s: Spell): string {
  const level = s.level === 0 ? `${capital(s.school)} cantrip` : `Level ${s.level} ${s.school}`;
  return [
    `*${level}${s.ritual ? ' (ritual)' : ''}${s.classes?.length ? ` · ${s.classes.map(capital).join(', ')}` : ''}*`,
    `**Casting time** ${s.casting_time}\n**Range** ${s.range}\n**Components** ${s.components}\n**Duration** ${s.duration}`,
    s.desc ?? '',
    s.higher ? `**Using a higher-level slot.** ${s.higher}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
const ACTION_HEADINGS: Record<string, string> = { action: 'Actions', bonus: 'Bonus Actions', reaction: 'Reactions', legendary: 'Legendary Actions' };

function monsterText(m: Monster): string {
  const speed = Object.entries(m.speed)
    .map(([how, v]) => (v === true ? `(${how})` : how === 'walk' ? `${v} ft.` : `${how} ${v} ft.`))
    .join(', ');
  const scores = m.abilities.map((score, n) => `${ABILITIES[n]} ${score} (${signed(Math.floor((score - 10) / 2))})`).join(' · ');
  const bonuses = (label: string, list?: Record<string, number>) =>
    list && Object.keys(list).length ? `**${label}** ${Object.entries(list).map(([k, v]) => `${capital(k)} ${signed(v)}`).join(', ')}` : '';
  const lines = [
    `*${capital(m.size)} ${m.type}${m.alignment ? `, ${m.alignment}` : ''}*`,
    [
      `**AC** ${m.ac}${m.ac_detail ? ` (${m.ac_detail})` : ''} · **HP** ${m.hp}${m.hit_dice ? ` (${m.hit_dice})` : ''} · **Speed** ${speed}`,
      `${m.initiative !== undefined ? `**Initiative** ${signed(m.initiative)} · ` : ''}**CR** ${m.cr}${m.xp ? ` (${m.xp.toLocaleString('en-US')} XP)` : ''}`,
      scores,
      bonuses('Saves', m.saves),
      bonuses('Skills', m.skills),
      m.resistances && `**Resistances** ${m.resistances}`,
      m.immunities && `**Immunities** ${m.immunities}`,
      m.senses && `**Senses** ${m.senses}`,
      m.languages && `**Languages** ${m.languages}`,
    ]
      .filter(Boolean)
      .join('\n'),
  ];
  if (m.traits?.length) lines.push(m.traits.map((t) => `***${t.name}.*** ${t.desc}`).join('\n'));
  for (const [kind, heading] of Object.entries(ACTION_HEADINGS)) {
    const actions = (m.actions ?? []).filter((a) => (a.kind ?? 'action') === kind);
    if (actions.length) lines.push(`__${heading}__\n${actions.map((a) => `***${a.name}.*** ${a.desc}`).join('\n')}`);
  }
  return lines.join('\n\n');
}
