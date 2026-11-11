import { EventEmitter } from 'node:events';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { EndBehaviorType, type VoiceConnection } from '@discordjs/voice';
import { paths, readJson, writeJson, type Participant, type RollNote, type SessionInfo } from '../session/layout.js';
import type { RecordingStatus } from '../bot/types.js';
import { skipReason, type RecordFilterConfig } from './filters.js';
import { UtteranceRecorder, type UtteranceRecord } from './UtteranceRecorder.js';
import type { VoiceLink, VoiceLinkState } from './VoiceLink.js';

export interface SessionRecorderOptions {
  sessionId: string;
  sessionDir: string;
  /** The bot's place in the voice channel to record (connected before `start`). */
  voice: VoiceLink;
  filter: RecordFilterConfig;
  silenceMs: number;
  log?: (msg: string) => void;
  /** Written to session.json; "bot" sessions are recovered by the app after a crash. */
  source?: string;
  /** The campaign picked for this recording (an ID under `campaigns`). */
  campaign?: string;
}

interface ParticipantState {
  name: string;
  utterances: number;
  audioMs: number;
  speaking: boolean;
}

const RECORDING_STATE: Record<VoiceLinkState, RecordingStatus['state']> = { connecting: 'connecting', connected: 'recording', reconnecting: 'reconnecting' };

/**
 * One recording, on a voice channel the bot is already in: records each allowed speaker's
 * utterances to audio/<userId>/<startMs>.ogg and keeps session.json / participants.json /
 * utterances.jsonl up to date (so a crash loses at most the utterance in progress). Stopping it
 * leaves the bot in the channel. Events: "update" (status changed), "utterance" (UtteranceRecord),
 * "resubscribe" (userId, error).
 */
export class SessionRecorder extends EventEmitter {
  readonly startedAt = Date.now();
  private state: RecordingStatus['state'] = 'connecting';
  private readonly participants = new Map<string, ParticipantState>();
  private readonly participantFile: Record<string, Participant> = {};
  private readonly skipped = new Map<string, { name: string; reason: string }>();
  private readonly active = new Map<string, Promise<void>>();
  private readonly resolving = new Set<string>();
  private stopping = false;
  /** Removes this recording's listeners from the voice link and its connection. */
  private unwire: () => void = () => {};
  private readonly info: SessionInfo & { source: string };
  private readonly log: (msg: string) => void;

  constructor(private readonly opts: SessionRecorderOptions) {
    super();
    this.log = opts.log ?? (() => {});
    const { guild, channel } = opts.voice;
    this.info = {
      id: opts.sessionId,
      startedAt: this.startedAt,
      guildId: guild.id,
      guildName: guild.name,
      channelId: channel.id,
      channelName: channel.name,
      source: opts.source ?? 'bot',
      ...(opts.campaign ? { campaign: opts.campaign } : {}),
    };
  }

  status(): RecordingStatus {
    const { guild, channel } = this.opts.voice;
    return {
      sessionId: this.opts.sessionId,
      guildId: guild.id,
      guildName: guild.name,
      channelId: channel.id,
      channelName: channel.name,
      startedAt: this.startedAt,
      state: this.state,
      participants: [...this.participants].map(([id, p]) => ({ id, ...p })),
      skipped: [...this.skipped].map(([id, s]) => ({ id, ...s })),
      reconnects: this.opts.voice.reconnectCount,
    };
  }

  /** Notes a /roll so the transcript can show it where it happened. */
  noteRoll(note: RollNote): void {
    appendFileSync(paths.rolls(this.opts.sessionDir), JSON.stringify(note) + '\n');
  }

  start(): void {
    mkdirSync(this.opts.sessionDir, { recursive: true });
    writeJson(paths.session(this.opts.sessionDir), this.info);
    const { voice } = this.opts;
    this.wire(voice.voice);
    const onState = (state: VoiceLinkState) => this.setState(RECORDING_STATE[state]);
    voice.on('state', onState);
    const unwireReceiver = this.unwire;
    this.unwire = () => (voice.off('state', onState), unwireReceiver());
    this.setState(RECORDING_STATE[voice.state]);
    this.log(`Recording #${voice.channel.name} in ${voice.guild.name} → ${this.opts.sessionId}`);
  }

  async stop(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    this.setState('stopping');
    this.unwire();
    const receiver = this.opts.voice.voice.receiver;
    for (const userId of this.active.keys()) receiver.subscriptions.get(userId)?.destroy();
    await Promise.all(this.active.values());
    this.info.stoppedAt = Date.now();
    // The name and campaign can be changed in the app while recording: keep what's on disk.
    const { title, campaign, ...info } = this.info;
    const onDisk = readJson<SessionInfo>(paths.session(this.opts.sessionDir));
    const edited = onDisk ? { title: onDisk.title, campaign: onDisk.campaign } : { title, campaign };
    writeJson(paths.session(this.opts.sessionDir), { ...info, ...(edited.title ? { title: edited.title } : {}), ...(edited.campaign ? { campaign: edited.campaign } : {}) });
    this.log(`Stopped ${this.opts.sessionId}`);
  }

  private setState(state: RecordingStatus['state']): void {
    this.state = state;
    this.emit('update');
  }

  /** Listens for who speaks on the connection (until `unwire`). */
  private wire(connection: VoiceConnection): void {
    const speaking = connection.receiver.speaking;
    const onEnd = (userId: string) => {
      const p = this.participants.get(userId);
      if (p?.speaking) {
        p.speaking = false;
        this.emit('update');
      }
    };
    const onStart = (userId: string) => {
      const p = this.participants.get(userId);
      if (p && !p.speaking) {
        p.speaking = true;
        this.emit('update');
      }
      if (this.stopping || this.active.has(userId) || this.resolving.has(userId) || this.skipped.has(userId)) return;
      this.resolving.add(userId);
      void this.admit(connection, userId).finally(() => this.resolving.delete(userId));
    };
    speaking.on('end', onEnd);
    speaking.on('start', onStart);
    this.unwire = () => (speaking.off('end', onEnd), speaking.off('start', onStart));
  }

  /** Decides whether to record a speaker (ignore list, bots, self), then starts recording them. */
  private async admit(connection: VoiceConnection, userId: string): Promise<void> {
    const { guild } = this.opts.voice;
    const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => undefined));
    const name = member?.displayName ?? userId;
    const reason = skipReason({ id: userId, bot: member?.user.bot ?? false }, this.opts.filter);
    if (reason) {
      this.skipped.set(userId, { name, reason });
      this.log(`not recording ${name}: ${reason}`);
      this.emit('update');
      return;
    }
    if (!this.participants.has(userId)) {
      this.participants.set(userId, { name, utterances: 0, audioMs: 0, speaking: true });
      this.participantFile[userId] = { displayName: name, ...(member ? { username: member.user.username } : {}) };
      writeJson(paths.participants(this.opts.sessionDir), this.participantFile);
      this.emit('update');
    }
    this.record(connection, userId);
  }

  private record(connection: VoiceConnection, userId: string): void {
    if (this.stopping || this.active.has(userId)) return;
    const stream = connection.receiver.subscribe(userId, { end: { behavior: EndBehaviorType.AfterSilence, duration: this.opts.silenceMs } });
    const recorder = new UtteranceRecorder({ sessionDir: this.opts.sessionDir, userId, maxFillMs: this.opts.silenceMs + 500 });
    const done = recorder.record(stream).then((rec) => {
      this.active.delete(userId);
      if (rec) this.onUtterance(rec);
      // A decrypt error (e.g. during a DAVE key change) can end the stream while the person is still
      // talking; "speaking start" won't fire again until they pause, so resubscribe now.
      if (rec?.error && !this.stopping && connection.receiver.speaking.users.has(userId)) {
        this.log(`resubscribing ${this.participants.get(userId)?.name ?? userId} after stream error: ${rec.error}`);
        this.emit('resubscribe', userId, rec.error);
        this.record(connection, userId);
      }
    });
    this.active.set(userId, done);
  }

  private onUtterance(rec: UtteranceRecord): void {
    appendFileSync(join(this.opts.sessionDir, 'utterances.jsonl'), JSON.stringify(rec) + '\n');
    this.emit('utterance', rec);
    const p = this.participants.get(rec.userId);
    if (p) {
      p.utterances++;
      p.audioMs += rec.durationMs;
      this.emit('update');
    }
  }
}
