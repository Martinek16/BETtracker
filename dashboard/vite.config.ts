import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';

const BOOKMAKERS_DIR = new URL('../extension/src/bookmakers/', import.meta.url);

const FLAGS_DIR = new URL(
  './flags/4x3/',
  pathToFileURL(createRequire(import.meta.url).resolve('flag-icons/package.json')),
);

/**
 * The four home nations fly their own flag under one country code, and every
 * other subdivision flag in the set - a Spanish region, a US state, an island
 * of Saint Helena - is one no competition is ever filed under.
 */
const SUBDIVISIONS = new Set(['gb-eng', 'gb-nir', 'gb-sct', 'gb-wls']);

const flagFiles = (): string[] =>
  readdirSync(FLAGS_DIR).filter((name) => {
    const code = name.replace(/\.svg$/, '');
    return name.endsWith('.svg') && (!code.includes('-') || SUBDIVISIONS.has(code));
  });

/**
 * Serves each country's flag at `flags/<code>.svg`, straight out of the
 * `flag-icons` package. Emitted as files rather than bundled: a flag is only
 * fetched by the rows that show one, so the ones nobody bets on cost nothing
 * beyond the disk they sit on.
 */
const countryFlagsPlugin = (): Plugin => ({
  name: 'country-flags',
  generateBundle() {
    for (const name of flagFiles()) {
      this.emitFile({
        type: 'asset',
        fileName: `flags/${name}`,
        source: readFileSync(new URL(name, FLAGS_DIR)),
      });
    }
  },
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const name = /^\/flags\/([a-z-]+\.svg)$/.exec(req.url ?? '')?.[1];
      if (name === undefined || !flagFiles().includes(name)) return next();
      res.setHeader('Content-Type', 'image/svg+xml');
      res.end(readFileSync(new URL(name, FLAGS_DIR)));
    });
  },
});

/** Every `<bookmaker>/logo.png` that exists, keyed by the bookmaker's id. */
const bookmakerLogos = (): { id: string; bytes: Buffer }[] =>
  readdirSync(BOOKMAKERS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      try {
        return [
          {
            id: entry.name,
            bytes: readFileSync(new URL(`${entry.name}/logo.png`, BOOKMAKERS_DIR)),
          },
        ];
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
  plugins: [react(), bookmakerLogosPlugin(), countryFlagsPlugin()],
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
