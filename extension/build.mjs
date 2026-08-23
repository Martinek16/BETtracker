import * as esbuild from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { expandSites } from './sites.mjs';

/**
 * A folder is only half of a bookmaker: it also has to be named in the capture
 * rules, the adapter registry and the catalogue. Miss one and nothing complains
 * — the popup still offers to read the site, the scripts still go in, and
 * absolutely nothing happens. That is indistinguishable from a broken adapter,
 * and it is where an evening goes. Said here rather than only in the test suite
 * because a build is what you run before loading the extension.
 */
const COLLECTORS = ['src/bookmakers/capture.ts', 'src/bookmakers/registry.ts', 'src/bookmakers/catalog.ts'];

const checkRegistered = () => {
  const folders = readdirSync('src/bookmakers', { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(`src/bookmakers/${entry.name}/bookmaker.json`))
    .map((entry) => entry.name);
  const missing = COLLECTORS.flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    return folders.filter((id) => !source.includes(`./${id}/`)).map((id) => `${id} → ${file}`);
  });
  if (missing.length === 0) return;
  console.error(`[build] bookmaker folders not registered:\n  ${missing.join('\n  ')}`);
  process.exit(1);
};

const watch = process.argv.includes('--watch');
/**
 * The copy uploaded to a web store. Recording is a contributor's tool: it needs
 * an unpacked checkout, a terminal and pnpm to be worth anything, so a store
 * reader can never reach it. Shipping the code anyway leaves a network recorder
 * in a package that has no use for one, which is a reviewer's question we do
 * not need to answer.
 */
const store = process.argv.includes('--store');
const outdir = 'dist';

checkRegistered();

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const common = {
  bundle: true,
  sourcemap: watch,
  target: ['chrome111'],
  platform: 'browser',
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': '"production"', __STORE_BUILD__: String(store) },
};

/** Each extension entry must be bundled separately with the right module format. */
const targets = [
  { in: 'src/background/background.ts', out: 'dist/background.js', format: 'esm' },
  { in: 'src/content/content.ts', out: 'dist/content.js', format: 'iife' },
  { in: 'src/inject/inject.ts', out: 'dist/inject.js', format: 'iife' },
  // Not in the manifest: it is registered from the popup, for one site, while
  // the user is recording it, and unregistered again when they stop.
  { in: 'src/inject/recorder.ts', out: 'dist/recorder.js', format: 'iife', store: false },
  { in: 'src/popup/popup.ts', out: 'dist/popup.js', format: 'esm' },
].filter((t) => !store || t.store !== false);

const dashboardDist = '../dashboard/dist';

const copyStatic = async () => {
  const manifest = expandSites(JSON.parse(await readFile('manifest.json', 'utf8')));
  await writeFile('dist/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  await cp('src/popup/popup.html', 'dist/popup.html');
  if (existsSync('icons')) await cp('icons', 'dist/icons', { recursive: true });
  if (existsSync(dashboardDist)) {
    // Straight into the root: the dashboard is the extension's page, and a
    // `/dashboard/index.html` in front of every link only made the address bar
    // longer. Nothing it ships collides with the files written above.
    await cp(dashboardDist, 'dist', { recursive: true });
  } else {
    console.warn('[build] ../dashboard/dist not found — run `pnpm build:dashboard` first');
  }
};

if (watch) {
  const contexts = await Promise.all(
    targets.map((t) =>
      esbuild.context({ ...common, entryPoints: [t.in], outfile: t.out, format: t.format }),
    ),
  );
  await Promise.all(contexts.map((c) => c.watch()));
  await copyStatic();
  console.log('[build] watching…');
} else {
  await Promise.all(
    targets.map((t) =>
      esbuild.build({ ...common, entryPoints: [t.in], outfile: t.out, format: t.format }),
    ),
  );
  await copyStatic();
  console.log(`[build] extension built → dist/${store ? ' (store copy, no recorder)' : ''}`);
}
