import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { FunnelState } from '../shared/types.js';

export type { FunnelState };

/**
 * The players' public link, through Tailscale Funnel: is it on, for our port, and what's the
 * address? And turning it on from the app, so the DM never has to open Terminal. Players outside
 * the tailnet can only open the link when Funnel serves the players' port publicly.
 */

/** Runs the Tailscale command-line tool; null when it isn't installed. */
export type TailscaleCli = (args: string[], timeoutMs: number) => Promise<{ code: number | null; stdout: string; stderr: string } | null>;

interface Status {
  BackendState?: string;
  Self?: { DNSName?: string };
  CertDomains?: string[] | null;
}

interface ServeConfig {
  Web?: Record<string, { Handlers?: Record<string, { Proxy?: string }> }>;
  AllowFunnel?: Record<string, boolean>;
}

/** What `tailscale status --json` and `tailscale funnel status --json` say about our port. Pure, for tests. */
export function readFunnel(status: Status | null, serve: ServeConfig | null, port: number): FunnelState {
  if (!status) return { on: false, problem: 'no-tailscale', publicUrl: null, message: 'Tailscale isn’t installed on this Mac. Install it from tailscale.com and log in.' };
  if (status.BackendState !== 'Running') return { on: false, problem: 'stopped', publicUrl: null, message: 'Tailscale isn’t connected: open Tailscale on this Mac and log in.' };
  const host = status.Self?.DNSName?.replace(/\.$/, '');
  if (!host || !status.CertDomains?.length)
    return { on: false, problem: 'no-https', publicUrl: host ? `https://${host}` : null, message: 'Tailscale needs your OK, once, to share the link publicly.' };
  const publicUrl = `https://${host}`;
  const site = `${host}:443`;
  const proxy = serve?.Web?.[site]?.Handlers?.['/']?.Proxy;
  const proxiedPort = proxy ? Number(new URL(proxy.includes('://') ? proxy : `http://${proxy}`).port || 80) : null;
  if (!serve?.AllowFunnel?.[site]) return { on: false, problem: 'off', publicUrl, message: 'Making the link public…' };
  if (proxiedPort !== port) return { on: false, problem: 'other-port', publicUrl, message: `Funnel is on, but for port ${proxiedPort ?? '?'}, not the players’ page (${port}).` };
  return { on: true, publicUrl, message: 'Anyone with the link can join.' };
}

const parse = <T>(text: string | undefined): T | null => {
  try {
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
};

/** Funnel's state for the players' port, from the Tailscale on this Mac. */
export async function funnelState(cli: TailscaleCli, port: number): Promise<FunnelState> {
  const status = await cli(['status', '--json'], 8000);
  if (!status) return readFunnel(null, null, port);
  const serve = await cli(['funnel', 'status', '--json'], 8000);
  return readFunnel(parse<Status>(status.stdout) ?? { BackendState: 'Stopped' }, parse<ServeConfig>(serve?.stdout), port);
}

/** Tailscale's page for approving Funnel on this tailnet, when the command asks for it. */
export function approvalLink(output: string): string | null {
  return output.match(/https:\/\/login\.tailscale\.com\/\S+/)?.[0] ?? null;
}

/**
 * Turns Funnel on for the players' port (`tailscale funnel --bg <port>`): it keeps running after
 * the app quits and across restarts. The first time on a tailnet, Tailscale asks the owner to
 * approve Funnel in the browser: that link comes back instead.
 */
export async function turnOnFunnel(cli: TailscaleCli, port: number): Promise<{ state: FunnelState; approve: string | null }> {
  const before = await funnelState(cli, port);
  // Without HTTPS on the tailnet, running Funnel is what asks to turn it on (the same approval page).
  if (before.on || before.problem === 'no-tailscale' || before.problem === 'stopped') return { state: before, approve: null };
  const run = await cli(['funnel', '--bg', String(port)], 20_000);
  const approve = approvalLink(`${run?.stdout ?? ''}\n${run?.stderr ?? ''}`);
  const after = await funnelState(cli, port);
  return { state: after, approve: after.on ? null : approve };
}

/**
 * Keeps the players' link public with nothing for the DM to do: when Funnel is off it turns it on
 * (at start, and whenever the link is wanted), saves the address, and remembers Tailscale's
 * one-time approval page if the tailnet hasn't allowed Funnel yet, trying again after. It never
 * replaces a Funnel that serves something else on this Mac (that's a choice for the DM).
 */
export class PublicLink {
  private last: FunnelState | null = null;
  private approve: string | null = null;
  private tried = -Infinity;
  private running: Promise<void> | null = null;

  constructor(
    private readonly opts: {
      cli: TailscaleCli;
      port: () => number;
      saved: () => string | undefined;
      save: (url: string) => void;
      now?: () => number;
      /** How long between automatic attempts (each can wait for Tailscale up to 20 s). */
      retryMs?: number;
    },
  ) {}

  /** Funnel's state now, turning it on first when it's off (at most once per retry interval). */
  async ensure(): Promise<FunnelState & { saved: string | null; approve: string | null }> {
    const now = (this.opts.now ?? Date.now)();
    const state = await funnelState(this.opts.cli, this.opts.port());
    const canFix = !state.on && (state.problem === 'off' || state.problem === 'no-https');
    if (canFix && !this.running && now - this.tried >= (this.opts.retryMs ?? 20_000)) {
      this.tried = now;
      this.running = turnOnFunnel(this.opts.cli, this.opts.port()).then(
        ({ state: after, approve }) => {
          this.last = after;
          this.approve = after.on ? null : (approve ?? this.approve);
          this.remember(after);
        },
        () => undefined,
      );
      await this.running;
      this.running = null;
    } else this.last = state;
    const current = this.last ?? state;
    if (current.on) this.approve = null;
    this.remember(current);
    return { ...current, saved: current.on ? current.publicUrl : (this.opts.saved() ?? null), approve: this.approve };
  }

  /** Turns Funnel on now, even over a Funnel serving another port (the DM asked for it). */
  async force(): Promise<FunnelState & { saved: string | null; approve: string | null }> {
    const { state, approve } = await turnOnFunnel(this.opts.cli, this.opts.port());
    this.last = state;
    this.approve = state.on ? null : approve;
    this.remember(state);
    return { ...state, saved: state.on ? state.publicUrl : (this.opts.saved() ?? null), approve: this.approve };
  }

  private remember(state: FunnelState) {
    if (state.on && state.publicUrl !== this.opts.saved()) this.opts.save(state.publicUrl);
  }
}

/** Where the Tailscale command is: on the PATH, from Homebrew, or inside the Mac app. */
const CANDIDATES = ['/opt/homebrew/bin/tailscale', '/usr/local/bin/tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale'];

/** The real command, run with fixed arguments (never a shell). */
export function systemTailscale(binary = process.env.TAILSCALE_CLI ?? CANDIDATES.find((p) => existsSync(p)) ?? 'tailscale'): TailscaleCli {
  return (args, timeoutMs) =>
    new Promise((resolve) => {
      execFile(binary, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') return resolve(null);
        const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? ((err as { code: number }).code) : null) : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      });
    });
}
