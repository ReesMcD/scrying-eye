import { createHash, randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { writeJson } from '../session/layout.js';
import { miniNameKey as nameKey, readMiniSpec, type MiniSpec } from '../shared/minis/index.js';
import type { MiniFigure, MiniKind } from '../shared/types.js';

/**
 * The table's paper minis, kept in <data>/minis.json. The party's characters come from the roster
 * (Settings → Campaigns) and are always listed; NPCs and monsters are the ones the DM adds. A
 * character can have a private link that lets its player edit its mini, and nothing else.
 * Emits "change" after every save, so open maps redraw their standees.
 */

export class MiniStoreError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 = 400,
  ) {
    super(message);
  }
}

/** A roster character: its ID in the config, its name and campaign. */
export interface RosterCharacter {
  id: string;
  name: string;
  campaign?: string | undefined;
}

interface Saved {
  name: string;
  kind: MiniKind;
  mini: MiniSpec | null;
  /** The SHA-256 of the player's link token; the token itself is shown once and never stored. */
  link?: string;
}

const PARTY = 'pc-';
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export class MiniStore extends EventEmitter {
  private readonly file: string;
  private saved: Record<string, Saved>;

  constructor(
    dataDir: string,
    private readonly roster: () => RosterCharacter[],
    private readonly log: (msg: string) => void = console.log,
  ) {
    super();
    // Every player's open map listens for changes.
    this.setMaxListeners(200);
    this.file = join(dataDir, 'minis.json');
    this.saved = this.load();
  }

  private load(): Record<string, Saved> {
    if (!existsSync(this.file)) return {};
    try {
      return (JSON.parse(readFileSync(this.file, 'utf8')) as { figures: Record<string, Saved> }).figures ?? {};
    } catch (err) {
      const aside = `${this.file}.damaged-${Date.now()}`;
      renameSync(this.file, aside);
      this.log(`The saved minis couldn't be read (${(err as Error).message}); moved them to ${aside}`);
      return {};
    }
  }

  private save(): void {
    writeJson(this.file, { figures: this.saved });
    this.emit('change');
  }

  /** The party first (in roster order), then NPCs and monsters by name. */
  list(): MiniFigure[] {
    const party = this.roster().map((c): MiniFigure => {
      const s = this.saved[PARTY + c.id];
      return { id: PARTY + c.id, name: c.name, kind: 'pc', campaign: c.campaign ?? null, mini: s?.mini ?? null, hasLink: !!s?.link };
    });
    const others = Object.entries(this.saved)
      .filter(([id]) => !id.startsWith(PARTY))
      .map(([id, s]): MiniFigure => ({ id, name: s.name, kind: s.kind, campaign: null, mini: s.mini, hasLink: false }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...party, ...others];
  }

  private figure(id: string): MiniFigure {
    const found = this.list().find((f) => f.id === id);
    if (!found) throw new MiniStoreError('No such mini (was the character removed from the roster?)', 404);
    return found;
  }

  /** Adds an NPC or a monster. */
  add(name: string, kind: MiniKind, mini: unknown = null): MiniFigure {
    const clean = name.trim();
    if (!clean) throw new MiniStoreError('Give it a name');
    if (kind === 'pc') throw new MiniStoreError('Player characters come from the roster (Settings → Campaigns)');
    if (this.list().some((f) => nameKey(f.name) === nameKey(clean))) throw new MiniStoreError(`There's already a mini called ${clean}`);
    const id = `${kind}-${randomBytes(4).toString('hex')}`;
    this.saved[id] = { name: clean, kind, mini: mini === null ? null : readMiniSpec(mini) };
    this.save();
    return this.figure(id);
  }

  /** Saves a figure's mini (null clears it back to the default figure). */
  setMini(id: string, mini: unknown): MiniFigure {
    const f = this.figure(id);
    const spec = mini === null ? null : readMiniSpec(mini);
    this.saved[id] = { ...(this.saved[id] ?? { name: f.name, kind: f.kind }), mini: spec };
    this.save();
    return this.figure(id);
  }

  /** Removes an NPC or monster; a character's mini is cleared instead (the roster owns it), its link kept. */
  remove(id: string): void {
    const f = this.figure(id);
    const link = this.saved[id]?.link;
    if (f.kind === 'pc' && link) this.saved[id] = { name: f.name, kind: 'pc', mini: null, link };
    else delete this.saved[id];
    this.save();
  }

  /** A new private link token for a character's player; any earlier link stops working. */
  newLink(id: string): string {
    const f = this.figure(id);
    if (f.kind !== 'pc') throw new MiniStoreError('Only player characters get a player link');
    const token = randomBytes(16).toString('base64url');
    this.saved[id] = { ...(this.saved[id] ?? { name: f.name, kind: 'pc', mini: null }), link: hash(token) };
    this.save();
    return token;
  }

  /** Turns a character's link off. */
  revokeLink(id: string): void {
    this.figure(id);
    const s = this.saved[id];
    if (s?.link) {
      delete s.link;
      this.save();
    }
  }

  /** The character a player's link opens, or null for an unknown or revoked one. */
  byLink(token: string): MiniFigure | null {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
    const h = hash(token);
    const id = Object.entries(this.saved).find(([, s]) => s.link === h)?.[0];
    if (!id) return null;
    return this.list().find((f) => f.id === id) ?? null;
  }

  /** A creature's mini by its name on the map ("Goblin 2" finds "Goblin"), when one was made. */
  forName(name: string): MiniSpec | null {
    const key = nameKey(name);
    return this.list().find((f) => f.mini && nameKey(f.name) === key)?.mini ?? null;
  }
}
