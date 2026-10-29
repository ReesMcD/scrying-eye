import type { BotStatus, GuildInfo, LiveTranscript, LiveUpdate, PollsState, RecordingStatus, VoiceStatus } from '../shared/types.js';
import type { PollPoster } from '../polls/PollService.js';

export type { LiveUpdate };
import type { EncounterPost } from './encounterCommand.js';

export type { BotStatus, GuildInfo, RecordingStatus, VoiceChannelInfo, VoiceStatus } from '../shared/types.js';

/** What the API and menu bar need from the bot (a fake implements this in tests). */
export interface BotControl {
  status(): BotStatus;
  guilds(): GuildInfo[];
  /** Joins a voice channel without recording (music), moving from another unless recording. */
  connect(channelId: string): Promise<VoiceStatus>;
  /** Leaves the voice channel; refused while recording. */
  leave(): void;
  /** Starts recording, joining the channel if needed; `campaign` (an ID) overrides the channel's default campaign. */
  record(channelId: string, opts?: { campaign?: string }): Promise<RecordingStatus>;
  /** Stops recording; the bot stays in the channel. */
  stop(): Promise<{ sessionId: string }>;
  on(event: 'status', listener: (s: BotStatus) => void): unknown;
  off(event: 'status', listener: (s: BotStatus) => void): unknown;
  /** The current recording's live transcript; "live" events carry only the new lines. */
  liveTranscript?(): LiveSnapshot;
  on(event: 'live', listener: (u: LiveUpdate) => void): unknown;
  off(event: 'live', listener: (u: LiveUpdate) => void): unknown;
  /** Posts an encounter's join link in Discord; answers with where it went. */
  postEncounter?(post: EncounterPost): Promise<{ channelName: string }>;
  /** Posts and reads scheduled polls; null while not connected. */
  pollPoster?(): PollPoster | null;
  /** Channels polls can go to, and roles a winner can mention. */
  pollTargets?(): Pick<PollsState, 'channels' | 'roles'>;
}

export type LiveSnapshot = LiveTranscript & { sessionId: string | null };
