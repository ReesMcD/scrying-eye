import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder, type RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import type { BotControl, RecordingStatus } from './types.js';
import { ENCOUNTER_COMMAND } from './encounterCommand.js';
import { TABLE_COMMANDS } from './tableCommands.js';

/**
 * What the bot needs in a server: View Channels, Send Messages and Attach Files (notices and
 * transcripts), Embed Links (the encounter join post), Connect (to record), Speak (to play music)
 * and Send Polls and Read Message History (scheduled polls and their votes).
 */
export const BOT_PERMISSIONS =
  PermissionFlagsBits.ViewChannel |
  PermissionFlagsBits.SendMessages |
  PermissionFlagsBits.AttachFiles |
  PermissionFlagsBits.EmbedLinks |
  PermissionFlagsBits.Connect |
  PermissionFlagsBits.Speak |
  PermissionFlagsBits.SendPolls |
  PermissionFlagsBits.ReadMessageHistory;

const PERMISSION_NAMES: Array<[bigint, string]> = [
  [PermissionFlagsBits.ViewChannel, 'View Channels'],
  [PermissionFlagsBits.SendMessages, 'Send Messages'],
  [PermissionFlagsBits.AttachFiles, 'Attach Files'],
  [PermissionFlagsBits.EmbedLinks, 'Embed Links'],
  [PermissionFlagsBits.Connect, 'Connect'],
  [PermissionFlagsBits.Speak, 'Speak'],
  [PermissionFlagsBits.SendPolls, 'Send Polls'],
  [PermissionFlagsBits.ReadMessageHistory, 'Read Message History'],
];

/** Which of the permissions the bot needs it lacks, by name (#63). Administrator has them all. */
export function missingPermissions(have: bigint): string[] {
  if (have & PermissionFlagsBits.Administrator) return [];
  return PERMISSION_NAMES.filter(([bit]) => !(have & bit)).map(([, name]) => name);
}

/** The link that (re-)adds the bot with slash commands and every permission it needs. */
export function inviteUrl(applicationId: string): string {
  return `https://discord.com/oauth2/authorize?client_id=${applicationId}&scope=bot+applications.commands&permissions=${BOT_PERMISSIONS}`;
}

/**
 * /record, /stop, /join, /leave and /encounter default to people with Manage Server (who can allow other roles
 * under Server Settings → Integrations); /status is open to everyone, so anyone can check they're being
 * recorded, and so are the dice and rules lookups.
 */
export const COMMANDS: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
  new SlashCommandBuilder()
    .setName('record')
    .setDescription('Join a voice channel and start recording')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((o) => o.setName('channel').setDescription('Which voice channel (default: the one you are in)').addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice))
    .addStringOption((o) => o.setName('campaign').setDescription("Which campaign (default: the channel's)").setAutocomplete(true))
    .toJSON(),
  new SlashCommandBuilder().setName('stop').setDescription('Stop recording').setContexts(InteractionContextType.Guild).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).toJSON(),
  new SlashCommandBuilder()
    .setName('join')
    .setDescription('Join a voice channel without recording (for music)')
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((o) => o.setName('channel').setDescription('Which voice channel (default: the one you are in)').addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice))
    .toJSON(),
  new SlashCommandBuilder().setName('leave').setDescription('Leave the voice channel (stops a recording too)').setContexts(InteractionContextType.Guild).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).toJSON(),
  new SlashCommandBuilder().setName('status').setDescription('Is this server being recorded, and who is in it?').setContexts(InteractionContextType.Guild).toJSON(),
  ENCOUNTER_COMMAND,
  ...TABLE_COMMANDS,
];

export type CommandName = 'record' | 'stop' | 'status' | 'join' | 'leave';

export interface CommandRequest {
  name: CommandName;
  guildId: string;
  /** The voice channel the person is in, if any. */
  memberVoiceChannelId?: string;
  /** The channel picked in /record's or /join's option. */
  channelId?: string;
  /** The campaign picked in /record's option (an ID under `campaigns`). */
  campaign?: string;
  /** recording.after_stop, to say what happens next. */
  afterStop?: 'nothing' | 'transcribe' | 'summarize';
  now?: number;
}

const elapsed = (ms: number) => {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

function describe(rec: RecordingStatus, now: number): string {
  const lines = [`🔴 Recording **#${rec.channelName}** for ${elapsed(now - rec.startedAt)}.`];
  if (rec.participants.length) lines.push(`Recorded: ${rec.participants.map((p) => p.name).join(', ')}.`);
  if (rec.skipped.length) lines.push(`Not recorded: ${rec.skipped.map((p) => p.name).join(', ')}.`);
  return lines.join('\n');
}

/** Runs a slash command against the bot; the answer is shown only to whoever ran it. */
export async function runCommand(req: CommandRequest, bot: Pick<BotControl, 'status' | 'join' | 'record' | 'stop' | 'leave'>): Promise<string> {
  const now = req.now ?? Date.now();
  const { recording, voice } = bot.status();
  // The bot is in one voice channel at a time, maybe in another server.
  const here = voice?.guildId === req.guildId ? voice : undefined;
  const elsewhere = !!voice && !here;
  const wanted = req.channelId ?? req.memberVoiceChannelId;

  switch (req.name) {
    case 'status':
      if (recording && !elsewhere) return describe(recording, now);
      return here ? `In **#${here.channelName}**, not recording.` : 'Not recording in this server.';

    case 'record': {
      if (recording) return elsewhere ? 'The bot is already recording in another server.' : `Already recording **#${recording.channelName}**. Use /stop first.`;
      if (elsewhere) return 'The bot is in a voice channel in another server. /leave there first.';
      const channelId = wanted ?? here?.channelId;
      if (!channelId) return 'Join a voice channel first, or pick one: `/record channel:`';
      try {
        const started = await bot.record(channelId, req.campaign ? { campaign: req.campaign } : {});
        return `🔴 Recording **#${started.channelName}**. Use /stop when you're done.`;
      } catch (err) {
        return `Couldn't start: ${(err as Error).message}`;
      }
    }

    case 'stop': {
      if (!recording || elsewhere) return 'Not recording in this server.';
      try {
        await bot.stop();
        const next = { nothing: '', transcribe: ' The transcript follows in the app.', summarize: ' The transcript and recap follow in the app.' }[req.afterStop ?? 'transcribe'];
        const still = bot.status().voice;
        return `⏹️ Stopped after ${elapsed(now - recording.startedAt)}.${next}${still ? ` Still in **#${still.channelName}** for music: /leave when you're done.` : ''}`;
      } catch (err) {
        return `Couldn't stop: ${(err as Error).message}`;
      }
    }

    case 'join': {
      if (elsewhere) return 'The bot is in a voice channel in another server. /leave there first.';
      if (!wanted) return 'Join a voice channel first, or pick one: `/join channel:`';
      if (recording && wanted !== recording.channelId) return `Recording **#${recording.channelName}**. /stop first to move.`;
      try {
        const joined = await bot.join(wanted);
        return `🔊 In **#${joined.channelName}**, not recording. Music plays here; /record to record, /leave when you're done.`;
      } catch (err) {
        return `Couldn't join: ${(err as Error).message}`;
      }
    }

    case 'leave': {
      if (!here) return 'Not in a voice channel in this server.';
      try {
        await bot.leave();
        return recording ? `⏹️ Stopped recording after ${elapsed(now - recording.startedAt)} and left **#${here.channelName}**.` : `👋 Left **#${here.channelName}**.`;
      } catch (err) {
        return `Couldn't leave: ${(err as Error).message}`;
      }
    }
  }
}
