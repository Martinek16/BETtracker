import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const BOOKMAKERS_DIR = new URL('../extension/src/bookmakers/', import.meta.url);

/** Every `<bookmaker>/logo.png` that exists, keyed by the bookmaker's id. */
const bookmakerLogos = (): { id: string; bytes: Buffer }[] =>
  readdirSync(BOOKMAKERS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      try {
        return [{ id: entry.name, bytes: readFileSync(new URL(`${entry.name}/logo.png`, BOOKMAKERS_DIR)) }];
      } catch {
        return [];
      }
    });

/**
 * Serves each bookmaker's logo at `logos/<id>.png`, straight out of the folder
 * the bookmaker is implemented in.
 *
 * A plugin rather than a file in `public/`: a bookmaker is meant to be one
 * self-contained folder anyone can add, and an asset that had to be dropped in a
 * second place would be the one thing a contributor forgets. The name is fixed
 * rather than hashed because the dashboard builds the path from the id.
 */
const bookmakerLogosPlugin = (): Plugin => ({
  name: 'bookmaker-logos',
  generateBundle() {
    for (const { id, bytes } of bookmakerLogos()) {
      this.emitFile({ type: 'asset', fileName: `logos/${id}.png`, source: bytes });
    }
  },
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const id = /^\/logos\/([^/]+)\.png$/.exec(req.url ?? '')?.[1];
      const logo = id === undefined ? undefined : bookmakerLogos().find((l) => l.id === id);
      if (logo === undefined) return next();
      res.setHeader('Content-Type', 'image/png');
      res.end(logo.bytes);
    });
  },
});

// base './' so built asset paths are relative — required when the dashboard is
// loaded from chrome-extension://<id>/dashboard/index.html.
export default defineConfig({
  base: './',
  plugins: [react(), bookmakerLogosPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The catalogue lives beside the adapters so one folder holds everything a
      // bookmaker needs. Only its JSON metadata is read from here — the adapters
      // themselves never enter the dashboard bundle.
      '@bookmakers': fileURLToPath(new URL('../extension/src/bookmakers', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
