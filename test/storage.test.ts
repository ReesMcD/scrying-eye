import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chooseStorage, mergeStorage } from '../electron/storage.js';

const put = (path: string, text = 'x') => {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
};

test('the folder with the original data wins, and the app runs under its name (its Keychain entry)', () => {
  const appData = mkdtempSync(join(tmpdir(), 'appdata-'));
  assert.deepEqual(chooseStorage(appData), { name: 'Scrying Eye', dir: join(appData, 'Scrying Eye') }, 'a new install');
  mkdirSync(join(appData, 'Session Bot'));
  assert.equal(chooseStorage(appData).name, 'Scrying Eye', 'an empty folder Electron made is not data');
  put(join(appData, 'Session Bot', 'config.yaml'));
  assert.deepEqual(chooseStorage(appData), { name: 'Session Bot', dir: join(appData, 'Session Bot') }, 'installed at 0.4.1 or later');
  put(join(appData, 'discord-session-bot', 'secrets.bin'));
  assert.deepEqual(chooseStorage(appData), { name: 'discord-session-bot', dir: join(appData, 'discord-session-bot'), mergeFrom: join(appData, 'Session Bot') }, 'updated from 0.4.0 or older');
});

test('merging moves new sessions and missing settings, never the other folder’s keys, and only once', () => {
  const appData = mkdtempSync(join(tmpdir(), 'appdata-'));
  const legacy = join(appData, 'discord-session-bot');
  const mistaken = join(appData, 'Session Bot');
  put(join(legacy, 'config.yaml'), 'old settings');
  put(join(legacy, 'secrets.bin'), 'old keys');
  put(join(legacy, 'data', 'sessions', 'game-1', 'session.json'), 'game 1');
  put(join(mistaken, 'config.yaml'), 'new settings');
  put(join(mistaken, 'secrets.bin'), 'new keys');
  put(join(mistaken, 'data', 'sessions', 'game-1', 'session.json'), 'a copy');
  put(join(mistaken, 'data', 'sessions', 'game-2', 'session.json'), 'game 2');
  put(join(mistaken, 'data', 'music', 'library.json'), 'scenes');
  put(join(mistaken, 'Cache', 'x'));

  mergeStorage(mistaken, legacy, new Date('2026-10-26T00:00:00Z'));
  assert.equal(readFileSync(join(legacy, 'config.yaml'), 'utf8'), 'old settings');
  assert.equal(readFileSync(join(legacy, 'secrets.bin'), 'utf8'), 'old keys');
  assert.equal(readFileSync(join(legacy, 'data', 'sessions', 'game-1', 'session.json'), 'utf8'), 'game 1');
  assert.equal(readFileSync(join(legacy, 'data', 'sessions', 'game-2', 'session.json'), 'utf8'), 'game 2', 'recorded after the bad update');
  assert.equal(readFileSync(join(legacy, 'data', 'music', 'library.json'), 'utf8'), 'scenes');
  assert.equal(existsSync(join(legacy, 'Cache')), false);
  assert.equal(existsSync(mistaken), false);
  assert.deepEqual(readdirSync(appData).sort(), ['Session Bot (merged 2026-10-26)', 'discord-session-bot']);
  assert.equal(chooseStorage(appData).mergeFrom, undefined, 'nothing to merge next time');
});
