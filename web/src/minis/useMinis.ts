import { useEffect, useState } from 'react';
import { api } from '../api';
import { miniForCreature, miniNameKey, type MiniSpec } from '../../../src/shared/minis';
import type { MiniFigure } from '../types';

/**
 * The DM's map: each creature's paper mini by name (made on the Minis page), else one from its
 * name and stat block type. Fetched again when the window comes back into focus.
 */
export function useMiniFor(): (name: string, type?: string) => MiniSpec {
  const [saved, setSaved] = useState<Map<string, MiniSpec>>(new Map());
  useEffect(() => {
    const load = () =>
      api<{ figures: MiniFigure[] }>('/minis').then(
        (r) => setSaved(new Map(r.figures.flatMap((f) => (f.mini ? [[miniNameKey(f.name), f.mini] as const] : [])))),
        () => undefined,
      );
    void load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, []);
  return (name, type) => saved.get(miniNameKey(name)) ?? miniForCreature({ name, type });
}
