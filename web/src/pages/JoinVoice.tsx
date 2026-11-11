import { useEffect, useState } from 'react';
import { api } from '../api';
import { href } from '../router';
import type { GuildInfo, VoiceStatus } from '../types';

/**
 * Puts the bot in a voice channel without recording, for music: the channel with the most people
 * is picked first. Recording is on the Record page.
 */
export function JoinVoice({ onError }: { onError: (message: string) => void }) {
  const [guilds, setGuilds] = useState<GuildInfo[] | null>(null);
  const [channelId, setChannelId] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<GuildInfo[]>('/bot/guilds').then(setGuilds, () => setGuilds([]));
  }, []);
  if (!guilds) return null;
  const channels = guilds.flatMap((g) => g.channels.map((c) => ({ ...c, guild: g.name }))).sort((a, b) => b.members.length - a.members.length);
  if (!channels.length) return <a href={href('record')}>Set up the Discord bot on the Record page</a>;
  const picked = channelId || channels[0]!.id;
  const join = async () => {
    setBusy(true);
    try {
      await api<VoiceStatus>('/bot/join', { method: 'POST', json: { channelId: picked } });
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const many = guilds.filter((g) => g.channels.length).length > 1;
  return (
    <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <select aria-label="Voice channel" value={picked} onChange={(e) => setChannelId(e.target.value)} style={{ width: 'auto' }}>
        {channels.map((c) => (
          <option key={c.id} value={c.id}>
            #{c.name}
            {many ? ` (${c.guild})` : ''}
            {c.members.length ? ` · ${c.members.length} here` : ''}
          </option>
        ))}
      </select>
      <button className="primary" disabled={busy} onClick={() => void join()}>
        {busy ? 'Joining…' : 'Join (no recording)'}
      </button>
    </span>
  );
}
