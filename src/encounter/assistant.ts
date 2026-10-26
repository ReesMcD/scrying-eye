import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { distanceFeet } from '../shared/battlemap.js';
import { canSee, sightBlockers } from '../shared/mapSight.js';
import type { Combatant, EncounterState, TurnSuggestion } from '../shared/types.js';
import { EncounterError } from './rules.js';

/**
 * The monster-turn assistant (#58): on a monster's or NPC's turn, Claude suggests what it does
 * from its stat block, the encounter's tactics and where everyone stands. The DM reads it and
 * runs the turn (or doesn't): nothing changes by itself. Off by default (encounters.assistant).
 */
export const turnSuggestionSchema: z.ZodType<TurnSuggestion> = z.object({
  suggestion: z.string().describe('What it does this turn in one to three short sentences the DM can read at a glance: movement, then action, then anything else'),
  action: z.string().describe("The stat block action it uses, by name, or '' if none"),
  target: z.string().describe("Who it targets, by name as listed, or '' if no one"),
});
export type { TurnSuggestion };

export interface TurnPrompt {
  system: string;
  user: string;
}

/** Asks a model; swapped for a fake in tests. */
export interface TurnAdvisor {
  suggest(prompt: TurnPrompt): Promise<TurnSuggestion>;
}

const SYSTEM = `You help a Dungeons & Dragons (2024 rules) DM run a monster's turn in combat.

Suggest what this creature does on its turn, using only its stat block, the DM's tactics notes and the positions given. Play it the way the creature would: clever foes focus on a weak or dangerous target and use cover; animals go for the nearest or weakest; cowards flee when hurt; follow the tactics notes when they say how it fights.

Keep to the rules: it moves up to its Speed (5 ft per square, diagonals count as 5 ft), takes one action, and a bonus action only if its stat block gives it one. It can't target what it can't see unless the stat block allows it. Don't roll dice or decide results; the DM does that. Name the action exactly as the stat block does.`;

const ACTION_KINDS: Record<string, string> = { action: 'Action', bonus: 'Bonus action', reaction: 'Reaction', legendary: 'Legendary action' };

const describe = (c: Combatant) =>
  [
    c.hp !== null ? `HP ${c.hp}${c.maxHp ? `/${c.maxHp}` : ''}${c.tempHp ? ` (+${c.tempHp} temp)` : ''}` : null,
    c.ac !== null ? `AC ${c.ac}` : null,
    c.conditions.length ? c.conditions.map((x) => x.name + (x.level ? ` ${x.level}` : '')).join(', ') : null,
    c.concentrating ? `concentrating on ${c.concentrating}` : null,
    c.hp === 0 ? 'down' : null,
  ]
    .filter(Boolean)
    .join('; ');

/** What Claude is told about one creature's turn. Throws for a PC (players run their own). */
export function turnPrompt(s: EncounterState, id: string): TurnPrompt {
  const me = s.combatants.find((c) => c.id === id);
  if (!me) throw new EncounterError('No such combatant');
  if (me.kind === 'pc') throw new EncounterError('Players run their own characters');
  const block = me.ref ? s.statBlocks[me.ref] : undefined;
  const tokenAt = (c: Combatant) => (c.tokenId ? s.map?.tokens.find((t) => t.id === c.tokenId)?.at : undefined);
  const here = tokenAt(me);
  const blockers = s.map ? sightBlockers(s.map) : undefined;
  const where = (c: Combatant) => {
    const at = tokenAt(c);
    if (!at || !here) return '';
    const sight = blockers && !canSee(blockers, here, at) ? ', out of sight' : '';
    return ` — ${distanceFeet(here, at)} ft away${sight}`;
  };

  const lines = [
    `## Round ${Math.max(s.round, 1)}: ${me.name}'s turn`,
    '',
    `${me.name} (${me.kind})${describe(me) ? `: ${describe(me)}` : ''}${here ? `, at square ${here[0]},${here[1]}` : ''}.`,
  ];
  if (block) {
    lines.push('', '## Stat block', '', `${block.name}${block.size || block.type ? ` (${[block.size, block.type].filter(Boolean).join(' ')})` : ''}`);
    if (block.speed) lines.push(`Speed: ${Object.entries(block.speed).map(([k, v]) => (v === true ? k : `${k} ${v} ft`)).join(', ')}`);
    if (block.senses) lines.push(`Senses: ${block.senses}`);
    for (const t of block.traits ?? []) lines.push(`Trait — ${t.name}: ${t.desc}`);
    for (const a of block.actions ?? []) lines.push(`${ACTION_KINDS[a.kind] ?? 'Action'} — ${a.name}: ${a.desc}`);
    if (!block.actions?.length && block.stat_block) lines.push(block.stat_block);
  } else {
    lines.push('', '(No stat block: suggest something sensible for its name.)');
  }
  const others = s.combatants.filter((c) => c.id !== me.id);
  const side = (pred: (c: Combatant) => boolean) => others.filter(pred).map((c) => `- ${c.name}${c.hidden ? ' (hidden from the players)' : ''}: ${describe(c) || 'no details'}${where(c)}`);
  lines.push('', '## The party', '', ...(side((c) => c.kind === 'pc').length ? side((c) => c.kind === 'pc') : ['(none listed)']));
  const allies = side((c) => c.kind !== 'pc');
  if (allies.length) lines.push('', '## Its side', '', ...allies);
  if (s.notes?.tactics) lines.push('', "## The DM's tactics notes", '', s.notes.tactics);
  if (s.notes?.changes) lines.push('', '## What changes the fight', '', s.notes.changes);
  if (!here && s.map) lines.push('', '(It has no token on the map: positions are unknown.)');
  return { system: SYSTEM, user: lines.join('\n') };
}

/** The assistant on Claude, with the recap's model at low effort (it should answer in seconds). */
export class ClaudeTurnAdvisor implements TurnAdvisor {
  private readonly client: Anthropic;

  constructor(
    private readonly model: string,
    client?: Anthropic,
  ) {
    this.client = client ?? new Anthropic({ maxRetries: 2 });
  }

  async suggest(prompt: TurnPrompt): Promise<TurnSuggestion> {
    const msg = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 4_000,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      output_config: { effort: 'low', format: betaZodOutputFormat(turnSuggestionSchema) },
    });
    if (msg.stop_reason === 'refusal') throw new Error('Claude declined to suggest a move');
    if (!msg.parsed_output) throw new Error('Claude gave no suggestion');
    return msg.parsed_output;
  }
}
