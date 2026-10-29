import { EventEmitter } from 'node:events';
import { VoiceConnectionStatus, entersState, joinVoiceChannel, type AudioPlayer, type VoiceConnection } from '@discordjs/voice';
import type { Guild, VoiceBasedChannel } from 'discord.js';
import type { VoiceStatus } from '../shared/types.js';
import { ReconnectBudget } from './reconnect.js';

export interface VoiceLinkOptions {
  guild: Guild;
  channel: VoiceBasedChannel;
  /** Join muted (default). The app's bot joins unmuted so it can also play music. */
  selfMute?: boolean;
  log?: (msg: string) => void;
  /** Receives the voice connection's debug lines (DAVE, encryption); turns them on when set. */
  debug?: (msg: string) => void;
}

/**
 * The bot in a voice channel: joins, rides out drops, and plays music. Recording is separate
 * (SessionRecorder listens on a link), so the bot can sit in a channel just to play music.
 * Events: "state" (connected or reconnecting), "lost" (gave up reconnecting).
 */
export class VoiceLink extends EventEmitter {
  readonly since = Date.now();
  readonly reconnects = new ReconnectBudget();
  state: VoiceStatus['state'] = 'connecting';
  private closed = false;
  private readonly log: (msg: string) => void;

  private constructor(
    readonly connection: VoiceConnection,
    readonly guild: Guild,
    readonly channel: VoiceBasedChannel,
    log: ((msg: string) => void) | undefined,
  ) {
    super();
    this.log = log ?? (() => {});
  }

  /** Joins the channel; throws if it isn't connected within 30 s. */
  static async open(opts: VoiceLinkOptions): Promise<VoiceLink> {
    const { guild, channel } = opts;
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: opts.selfMute ?? true,
      debug: !!opts.debug,
    });
    const link = new VoiceLink(connection, guild, channel, opts.log);
    link.wire(opts.debug);
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    } catch {
      link.close();
      throw new Error(`Couldn't connect to #${channel.name} within 30s. Does the bot have View Channel and Connect there?`);
    }
    link.setState('connected');
    return link;
  }

  status(): VoiceStatus {
    return { guildId: this.guild.id, guildName: this.guild.name, channelId: this.channel.id, channelName: this.channel.name, since: this.since, state: this.state };
  }

  /** Plays this player's audio into the channel. */
  play(player: AudioPlayer): void {
    this.connection.subscribe(player);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.connection.destroy();
  }

  private setState(state: VoiceStatus['state']): void {
    this.state = state;
    this.emit('state', state);
  }

  private wire(debug: ((msg: string) => void) | undefined): void {
    const connection = this.connection;
    connection.on('error', (err) => this.log(`voice connection error: ${err.message}`));
    if (debug) connection.on('debug', debug);
    connection.on('stateChange', async (oldState, newState) => {
      if (oldState.status === newState.status || this.closed) return;
      this.log(`voice connection: ${oldState.status} → ${newState.status}`);
      if (newState.status === VoiceConnectionStatus.Ready) {
        this.reconnects.connected();
        this.setState('connected');
      }
      if (newState.status !== VoiceConnectionStatus.Disconnected) return;
      this.setState('reconnecting');
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        const keepTrying = this.reconnects.attempt();
        this.log(`voice disconnected; rejoining (reconnect ${this.reconnects.total})`);
        if (!keepTrying || !connection.rejoin()) {
          this.log('giving up on reconnecting');
          this.emit('lost');
        }
      }
    });
  }
}
