import { renderPortrait, type MiniSpec } from '../../../src/shared/minis';

/**
 * Token faces for the 2D map (#108): each mini drawn once as a small picture, framed on its head,
 * and kept, so painting the map every frame costs nothing. The first time a face is wanted it's
 * not ready yet: the token shows its initials, and `onReady` asks for a repaint when it is.
 */
const cache = new Map<string, HTMLImageElement | 'loading' | 'failed'>();
let next = 0;

export function portrait(mini: MiniSpec, onReady: () => void): HTMLImageElement | null {
  const key = JSON.stringify(mini);
  const hit = cache.get(key);
  if (hit instanceof HTMLImageElement) return hit;
  if (hit) return null;
  cache.set(key, 'loading');
  const image = new Image();
  image.onload = () => {
    cache.set(key, image);
    onReady();
  };
  image.onerror = () => cache.set(key, 'failed');
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderPortrait(mini, { id: `face-${next++}` }))}`;
  return null;
}
