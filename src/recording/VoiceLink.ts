import { EventEmitter } from 'node:events';
import { VoiceConnectionStatus, entersState, joinVoiceChannel, type AudioPlayer, type VoiceConnection } from '@discordjs/voice';
import type { Guild, VoiceBasedChannel } from 'discord.js';
import { ReconnectBudget } from './reconnect.js';

export type VoiceLinkState = 'connecting' | 'connected' | 'reconnecting';

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
 * The bot's place in one voice channel: joins it, rejoins after drops, and plays audio into it.
 * A recording listens on it; music plays through it. Events: "state" (VoiceLinkState), "lost"
 * (gave up reconnecting; the link is gone).
 */
export class VoiceLink extends EventEmitter {
  readonly since = Date.now();
  private connection: VoiceConnection | undefined;
  private current: VoiceLinkState = 'connecting';
  private readonly reconnects = new ReconnectBudget();
  private leaving = false;
  private readonly log: (msg: string) => void;

  constructor(private readonly opts: VoiceLinkOptions) {
    super();
    this.log = opts.log ?? (() => {});
  }

  get guild(): Guild {
    return this.opts.guild;
  }

  get channel(): VoiceBasedChannel {
    return this.opts.channel;
  }

  get state(): VoiceLinkState {
    return this.current;
  }

  /** How many times it has rejoined after a drop. */
  get reconnectCount(): number {
    return this.reconnects.total;
  }

  /** The live connection, for listening to who speaks. Throws before `connect()` has worked. */
  get voice(): VoiceConnection {
    if (!this.connection) throw new Error('Not connected to a voice channel');
    return this.connection;
  }

  async connect(): Promise<void> {
    const { guild, channel } = this.opts;
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: this.opts.selfMute ?? true,
      debug: !!this.opts.debug,
    });
    this.connection = connection;
    this.wire(connection);
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    } catch {
      connection.destroy();
      this.connection = undefined;
      throw new Error(`Couldn't connect to #${channel.name} within 30s. Does the bot have View Channel and Connect there?`);
    }
    this.setState('connected');
  }

  /** Plays this player's audio into the channel. */
  play(player: AudioPlayer): void {
    this.connection?.subscribe(player);
  }

  leave(): void {
    this.leaving = true;
    this.connection?.destroy();
    this.connection = undefined;
  }

  private setState(state: VoiceLinkState): void {
    if (this.current === state) return;
    this.current = state;
    this.emit('state', state);
  }

  private wire(connection: VoiceConnection): void {
    connection.on('error', (err) => this.log(`voice connection error: ${err.message}`));
    if (this.opts.debug) connection.on('debug', this.opts.debug);
    connection.on('stateChange', async (oldState, newState) => {
      if (oldState.status === newState.status || this.leaving) return;
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
