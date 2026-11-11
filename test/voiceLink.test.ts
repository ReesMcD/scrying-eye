import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionRecorder } from '../src/recording/SessionRecorder.js';
import type { VoiceLink } from '../src/recording/VoiceLink.js';
import { paths, readJson, type SessionInfo } from '../src/session/layout.js';

/** A voice channel the bot is in, without Discord: who speaks arrives on `speaking`. */
function fakeLink() {
  const speaking = Object.assign(new EventEmitter(), { users: new Map() });
  const link = Object.assign(new EventEmitter(), {
    guild: { id: 'g', name: 'The Table' },
    channel: { id: 'c', name: 'game-night' },
    state: 'connected',
    reconnectCount: 0,
    voice: { receiver: { speaking, subscriptions: new Map() } },
  });
  return { link, speaking, asLink: link as unknown as VoiceLink };
}

const dirs = new Map<string, string>();
const recorderOn = (voice: VoiceLink, sessionId: string) => {
  dirs.set(sessionId, join(mkdtempSync(join(tmpdir(), 'rec-')), sessionId));
  return new SessionRecorder({ sessionId, sessionDir: dirs.get(sessionId)!, voice, filter: { ignoreUserIds: new Set(), ignoreBots: true, selfId: 'bot' }, silenceMs: 800 });
};

test('a recording on a voice channel the bot is already in: follows its state, and stopping leaves it ready for the next', async () => {
  const { link, speaking, asLink } = fakeLink();
  link.reconnectCount = 2;
  const first = recorderOn(asLink, 's1');
  first.start();
  assert.equal(first.status().state, 'recording');
  assert.equal(first.status().channelName, 'game-night');
  link.emit('state', 'reconnecting');
  assert.equal(first.status().state, 'reconnecting', 'a drop shows on the recording');
  link.reconnectCount = 3;
  link.emit('state', 'connected');
  assert.equal(first.status().reconnects, 1, 'counted from the recording’s start, not the bot’s time in the channel');
  await first.stop();
  assert.ok(readJson<SessionInfo>(paths.session(dirs.get('s1')!))?.stoppedAt, 'saved as stopped');
  assert.equal(speaking.listenerCount('start') + speaking.listenerCount('end') + link.listenerCount('state'), 0, 'nothing left listening after stop');

  const second = recorderOn(asLink, 's2');
  second.start();
  assert.equal(speaking.listenerCount('start'), 1, 'the next recording listens on the same channel');
  await second.stop();
});
