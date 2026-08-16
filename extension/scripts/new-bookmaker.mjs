#!/usr/bin/env node
/**
 * Start a bookmaker folder: `pnpm new-bookmaker <id> [site] [name]`.
 *
 * Everything this does was a manual instruction before, and each one was a way
 * to lose an hour: the folder name has to equal the `id` in three files, the
 * three collector lines are easy to write two of, and a folder copied from
 * `stake/` still answers to the name `stake` in the places the registry looks.
 * None of that is thinking work, and all of it fails late, in a test that names
 * a file rather than the mistake.
 *
 * What is left over is the part that needs the recording: the endpoints, the
 * paging, the shape of a bet, the fixtures and the logo.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BOOKMAKERS = fileURLToPath(new URL('../src/bookmakers/', import.meta.url));

/** `my-site` is the folder and the id; `mySite` is what the code calls it. */
export const camelId = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

/** Insert a line after the last import of its own kind, so like sits with like. */
const addImport = (source, kind, line) => {
  const last = [...source.matchAll(kind)].pop();
  if (last === undefined)
    throw new Error(`${line}: no import to follow — the collector has changed shape`);
  const at = last.index + last[0].length;
  return `${source.slice(0, at)}\n${line}${source.slice(at)}`;
};

export const registerCapture = (source, id) =>
  source.includes(`'./${id}/capture'`)
    ? source
    : addImport(
        source,
        /^import \{ rule as .+ \} from '\.\/.+\/capture';$/gm,
        `import { rule as ${camelId(id)} } from './${id}/capture';`,
      ).replace(
        /(export const CAPTURE_RULES: readonly CaptureRule\[\] = \[[^\]]*)\]/,
        `$1, ${camelId(id)}]`,
      );

export const registerRegistry = (source, id) =>
  source.includes(`'./${id}/adapter'`)
    ? source
    : addImport(
        source,
        /^import \{ .+ \} from '\.\/.+\/adapter';$/gm,
        `import { ${camelId(id)} } from './${id}/adapter';`,
      ).replace(
        /(const ADAPTERS: Record<Bookmaker, BookmakerAdapter> = \{[\s\S]*?)\n\};/,
        `$1\n  ${id === camelId(id) ? id : `'${id}': ${camelId(id)}`},\n};`,
      );

export const registerCatalog = (source, id) =>
  source.includes(`'./${id}/bookmaker.json'`)
    ? source
    : addImport(
        source,
        /^import .+ from '\.\/.+\/bookmaker\.json';$/gm,
        `import ${camelId(id)} from './${id}/bookmaker.json';`,
      ).replace(
        /(export const CATALOG: readonly BookmakerMeta\[\] = \[[^\]]*)\]/,
        `$1, ${camelId(id)}]`,
      );

/**
 * Make a copy of the example answer to its own name. Only the three places the
 * code identifies itself are touched: `stake` also means the money on a slip,
 * and a blind rename would rewrite the arithmetic along with the label.
 */
export const retarget = (source, from, to) =>
  source
    .replaceAll(`export const ${camelId(from)}:`, `export const ${camelId(to)}:`)
    .replaceAll(`const BOOKMAKER: Bookmaker = '${from}'`, `const BOOKMAKER: Bookmaker = '${to}'`)
    .replaceAll(`id: '${from}'`, `id: '${to}'`)
    .replaceAll(`bookmaker: '${from}'`, `bookmaker: '${to}'`);

/** The declaration the manifest and `privacy.test.ts` both read. Hosts are the contributor's to fill. */
const meta = (id, site, name) => ({
  id,
  name,
  site,
  brand: '#1f2937',
  color: '#6366f1',
  mirrors: [],
  sites: [`https://${site}/*`, `https://*.${site}/*`],
  apiHosts: [],
});

const title = (id) =>
  id
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const main = () => {
  const [id, site, ...rest] = process.argv.slice(2);
  if (id === undefined || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
    console.error(
      'Usage: pnpm new-bookmaker <id> [site] [name]\n' +
        '  <id> is lowercase and hyphenated, and becomes the folder name: bet365, william-hill.',
    );
    process.exit(1);
  }

  const folder = join(BOOKMAKERS, id);
  if (existsSync(folder)) {
    console.error(`${folder} already exists — nothing written.`);
    process.exit(1);
  }

  const from = 'stake';
  const host = (site ?? `${id}.com`).replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, '');

  mkdirSync(folder);
  for (const file of readdirSync(join(BOOKMAKERS, from), { withFileTypes: true })) {
    // The fixtures are the recording and the logo is the site's own mark:
    // neither can be copied off another bookmaker without saying something false.
    if (!file.isFile() || file.name === 'logo.png' || file.name === 'bookmaker.json') continue;
    const source = readFileSync(join(BOOKMAKERS, from, file.name), 'utf8');
    writeFileSync(join(folder, file.name), retarget(source, from, id));
  }
  writeFileSync(
    join(folder, 'bookmaker.json'),
    `${JSON.stringify(meta(id, host, rest.join(' ') || title(id)), null, 2)}\n`,
  );
  mkdirSync(join(folder, '__fixtures__'));

  for (const [file, register] of [
    ['capture.ts', registerCapture],
    ['registry.ts', registerRegistry],
    ['catalog.ts', registerCatalog],
  ]) {
    const path = join(BOOKMAKERS, file);
    writeFileSync(path, register(readFileSync(path, 'utf8'), id));
  }

  console.log(
    `extension/src/bookmakers/${id}/ — registered in capture.ts, registry.ts and catalog.ts.\n` +
      `It is a copy of ${from}/ answering to its own name, so it compiles and does the wrong thing.\n` +
      'What it still needs, none of which can be guessed:\n' +
      `  __fixtures__/*.json  the site's own answers, from har/<site>.sanitized.har\n` +
      "  logo.png             the site's mark, ~128px square, transparent\n" +
      `  bookmaker.json       its real hosts — sites, siteRanges, apiHosts\n` +
      `  capture.ts           the host and fingerprint patterns, and where the session lives\n` +
      `  adapter.ts           the endpoints, the paging and the bet shape — and the '${from}-' id prefix\n` +
      '  README.md            what is odd about this site\n' +
      'Then: pnpm lint && pnpm test && pnpm build',
  );
};

if (process.argv[1]?.endsWith('new-bookmaker.mjs')) main();
