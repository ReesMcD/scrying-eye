import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Three pages: the DM app (index.html), the players' join page (play.html) and a player's mini
// link (mini.html); the last two are small bundles
// that the public player server serves. `npm run web:dev` proxies to a running `npm run app`.
export default defineConfig({
  root: here('.'),
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: { input: { main: here('index.html'), play: here('play.html'), mini: here('mini.html') } },
    // The 3D map (three.js, ~600 kB) is its own chunk, fetched only when someone switches to 3D.
    chunkSizeWarningLimit: 700,
  },
  server: { proxy: { '/api': 'http://localhost:4400', '/p/': 'http://localhost:4410', '/m/': 'http://localhost:4410' } },
});
