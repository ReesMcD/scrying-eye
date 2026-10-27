import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { approvalLink, PublicLink, readFunnel, turnOnFunnel, type TailscaleCli } from '../src/app/funnel.js';
import { createApi } from '../src/app/api.js';
import { ConfigStore } from '../src/app/configStore.js';
import { JobRunner } from '../src/app/jobs.js';
import type { FunnelStatus } from '../src/shared/types.js';

const HOST = 'reess-mac-mini.tailf204d4.ts.net';
const running = { BackendState: 'Running', Self: { DNSName: `${HOST}.` }, CertDomains: [HOST] };
const funnelOn = (port: number) => ({ TCP: { '443': { HTTPS: true } }, Web: { [`${HOST}:443`]: { Handlers: { '/': { Proxy: `http://127.0.0.1:${port}` } } } }, AllowFunnel: { [`${HOST}:443`]: true } });

test('the public link works only when Funnel serves the players’ port publicly', () => {
  assert.deepEqual(readFunnel(running, funnelOn(4410), 4410), { on: true, publicUrl: `https://${HOST}`, message: 'Anyone with the link can join.' });
  const problem = (status: Parameters<typeof readFunnel>[0], serve: Parameters<typeof readFunnel>[1]) => {
    const s = readFunnel(status, serve, 4410);
    return s.on ? 'on' : s.problem;
  };
  assert.equal(problem(null, null), 'no-tailscale');
  assert.equal(problem({ BackendState: 'Stopped' }, null), 'stopped', 'logged out or disconnected');
  assert.equal(problem({ ...running, CertDomains: [] }, null), 'no-https', 'HTTPS certificates are off in the admin console');
  assert.equal(problem(running, {}), 'off', 'nothing served');
  assert.equal(problem(running, { ...funnelOn(4410), AllowFunnel: {} }), 'off', 'served on the tailnet only (tailscale serve), not public');
  assert.equal(problem(running, funnelOn(4400)), 'other-port', 'Funnel pointing at the DM app, not the players’ page');
});

test('Tailscale’s approval page is found in what the command prints', () => {
  const out = 'Funnel is not enabled on your tailnet.\nTo enable, visit:\n\n         https://login.tailscale.com/f/funnel?node=nABC123\n';
  assert.equal(approvalLink(out), 'https://login.tailscale.com/f/funnel?node=nABC123');
  assert.equal(approvalLink('Available on the internet: https://x.ts.net'), null);
});

/** A pretend Tailscale: Funnel turns on when asked, unless the tailnet hasn't approved it yet. */
function fakeTailscale(opts: { approved: boolean; installed?: boolean; serving?: object }): { cli: TailscaleCli; calls: string[][]; approve(): void } {
  let serve: object = opts.serving ?? {};
  const calls: string[][] = [];
  const cli: TailscaleCli = async (args) => {
    calls.push(args);
    if (opts.installed === false) return null;
    if (args[0] === 'status') return { code: 0, stdout: JSON.stringify(running), stderr: '' };
    if (args.join(' ') === 'funnel status --json') return { code: 0, stdout: JSON.stringify(serve), stderr: '' };
    if (args[0] === 'funnel' && args[1] === '--bg') {
      if (!opts.approved) return { code: null, stdout: 'Funnel is not enabled on your tailnet.\nTo enable, visit:\n  https://login.tailscale.com/f/funnel?node=n1\n', stderr: '' };
      serve = funnelOn(Number(args[2]));
      return { code: 0, stdout: `Available on the internet:\n\nhttps://${HOST}/\n|-- proxy http://127.0.0.1:${args[2]}\n`, stderr: '' };
    }
    return { code: 1, stdout: '', stderr: 'unknown' };
  };
  return { cli, calls, approve: () => void (opts.approved = true) };
}

test('turning Funnel on: it runs in the background for the players’ port, or hands back Tailscale’s approval page', async () => {
  const yes = fakeTailscale({ approved: true });
  const on = await turnOnFunnel(yes.cli, 4410);
  assert.equal(on.state.on, true);
  assert.equal(on.approve, null);
  assert.ok(yes.calls.some((a) => a.join(' ') === 'funnel --bg 4410'));

  const notYet = await turnOnFunnel(fakeTailscale({ approved: false }).cli, 4410);
  assert.equal(notYet.state.on, false);
  assert.equal(notYet.approve, 'https://login.tailscale.com/f/funnel?node=n1');

  const none = fakeTailscale({ approved: true, installed: false });
  const missing = await turnOnFunnel(none.cli, 4410);
  assert.equal(missing.state.on ? 'on' : missing.state.problem, 'no-tailscale');
  assert.ok(!none.calls.some((a) => a[1] === '--bg'), 'nothing to run without Tailscale');
});

test('the link goes public by itself: Funnel turns on when the link is wanted, after Tailscale’s one-time OK if needed', async () => {
  let saved: string | undefined;
  let now = 0;
  const tailscale = fakeTailscale({ approved: false });
  const link = new PublicLink({ cli: tailscale.cli, port: () => 4410, saved: () => saved, save: (url) => void (saved = url), now: () => now, retryMs: 20_000 });

  const first = await link.ensure();
  assert.equal(first.on, false);
  assert.equal(first.approve, 'https://login.tailscale.com/f/funnel?node=n1', 'the page to allow it, once');
  const again = await link.ensure();
  assert.equal(again.approve, first.approve, 'still shown while waiting');
  assert.equal(tailscale.calls.filter((a) => a[1] === '--bg').length, 1, 'not tried again within the retry interval');

  tailscale.approve();
  now += 20_000;
  const ready = await link.ensure();
  assert.equal(ready.on, true);
  assert.equal(ready.approve, null);
  assert.equal(saved, `https://${HOST}`, 'its address is saved for every link from now on');
});

test('a Funnel already serving something else on this Mac is left alone unless the DM asks', async () => {
  const tailscale = fakeTailscale({ approved: true, serving: funnelOn(8080) });
  const link = new PublicLink({ cli: tailscale.cli, port: () => 4410, saved: () => undefined, save: () => undefined });
  const state = await link.ensure();
  assert.equal(state.on ? 'on' : state.problem, 'other-port');
  assert.ok(!tailscale.calls.some((a) => a[1] === '--bg'));
  assert.equal((await link.force()).on, true, 'the DM chose to use it for the players’ page');
});

test('asking the app for the link makes it public and saves its address, so the link is the one that works', async () => {
  const root = mkdtempSync(join(tmpdir(), 'funnel-'));
  const configPath = join(root, 'config.yaml');
  writeFileSync(configPath, '# my settings\ncampaigns: {}\n');
  const api = createApi({ password: 'pw', dataDir: join(root, 'data'), configStore: new ConfigStore(configPath), jobs: new JobRunner(async () => {}), tailscale: fakeTailscale({ approved: true }).cli });
  const call = async (method: 'GET' | 'POST') => (await api.request('/players/funnel', { method, headers: { Authorization: 'Bearer pw', 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: '{}' } : {}) })).json() as Promise<FunnelStatus>;

  const after = await call('GET');
  assert.equal(after.on, true);
  assert.equal(after.saved, `https://${HOST}`);
  const yaml = readFileSync(configPath, 'utf8');
  assert.match(yaml, new RegExp(`public_url: https://${HOST.replace(/\./g, '\\.')}`));
  assert.match(yaml, /# my settings/, 'the rest of the file is kept');
});
