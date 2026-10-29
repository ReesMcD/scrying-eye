import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionRecorder } from '../src/recording/SessionRecorder.js';
import { ReconnectBudget } from '../src/recording/reconnect.js';
import type { VoiceLink } from '../src/recording/VoiceLink.js';
import { paths, readJson, type SessionInfo } from '../src/session/layout.js';

/** A bot in a channel, as far as a recording sees it: Discord at the boundary. */
function fakeLink() {
  const link = Object.assign(new EventEmitter(), {
    guild: { id: 'g1', name: 'The Table', members: { cache: new Map() } },
    channel: { id: 'c1', name: 'game-night' },
    state: 'connected',
    reconnects: new ReconnectBudget(),
    connection: { receiver: { speaking: Object.assign(new EventEmitter(), { users: new Map() }), subscriptions: new Map() } },
    closed: false,
    close() {
      this.closed = true;
    },
  });
  return link;
}

const sessionDir = () => join(mkdtempSync(join(tmpdir(), 'rec-')), 's1');
const recorderOn = (link: ReturnType<typeof fakeLink>, dir = sessionDir()) =>
  new SessionRecorder({ sessionId: 's1', sessionDir: dir, link: link as unknown as VoiceLink, filter: { ignoreUserIds: new Set(), ignoreBots: true, selfId: 'bot' }, silenceMs: 800 });

test('stopping a recording leaves the bot in the channel and stops listening to it', async () => {
  const link = fakeLink();
  const dir = sessionDir();
  const recorder = recorderOn(link, dir);
  recorder.start();
  assert.equal(link.connection.receiver.speaking.listenerCount('start'), 1);
  await recorder.stop();
  assert.equal(link.closed, false, 'the link stays open (music keeps playing)');
  assert.equal(link.connection.receiver.speaking.listenerCount('start'), 0);
  assert.equal(link.listenerCount('state'), 0);
  assert.ok(readJson<SessionInfo>(paths.session(dir))?.stoppedAt);
});

test('a recording follows the link: reconnecting, then recording; reconnects counted from its start', () => {
  const link = fakeLink();
  link.reconnects.attempt();
  const recorder = recorderOn(link);
  recorder.start();
  assert.equal(recorder.status().reconnects, 0, 'drops before the recording started are not its own');
  link.reconnects.attempt();
  link.emit('state', 'reconnecting');
  assert.equal(recorder.status().state, 'reconnecting');
  link.emit('state', 'connected');
  assert.equal(recorder.status().state, 'recording');
  assert.equal(recorder.status().reconnects, 1);
});
