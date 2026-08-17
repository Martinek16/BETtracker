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
import { findRecording } from './sanitize-har.mjs';

const BOOKMAKERS = fileURLToPath(new URL('../src/bookmakers/', import.meta.url));

/** `my-site` is the folder and the id; `mySite` is what the code calls it. */
export const camelId = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

/** Insert a line after the last import of its own kind, so like sits with like. */
const addImport = (source, kind, line) => {
  const last = [...source.matchAll(kind)].pop();
  if (last === undefined)
    throw new Error(`${line}: no import to follow - the collector has changed shape`);
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
const meta = (id, site, name, brand, color) => ({
  id,
  name,
  site,
  brand,
  color,
  mirrors: [],
  sites: [`https://${site}/*`, `https://*.${site}/*`],
  apiHosts: [],
});

const attr = (tag, name) => new RegExp(`${name}=["']([^"']+)["']`, 'i').exec(tag)?.[1];

const tags = (html, tag) =>
  [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'gi'))].map((m) => m[0]);

/**
 * What a site already says about itself in its own front page: how it writes its
 * name, the colour a browser paints its chrome, and the square icon a phone puts
 * on a home screen. All three are otherwise typed in by hand from looking at the
 * site, which is a slow way to copy something the site is already publishing.
 */
export const readIdentity = (html) => {
  const metas = tags(html, 'meta');
  const named = (name, key = 'name') =>
    metas
      .filter((tag) => attr(tag, key)?.toLowerCase() === name)
      .map((tag) => attr(tag, 'content'))[0];

  const icons = tags(html, 'link')
    .filter((tag) => /\bicon\b/i.test(attr(tag, 'rel') ?? ''))
    .map((tag) => ({
      href: attr(tag, 'href'),
      touch: /apple-touch/i.test(attr(tag, 'rel') ?? ''),
      size: Number.parseInt(attr(tag, 'sizes') ?? '0', 10) || 0,
    }))
    .filter((icon) => icon.href !== undefined && !icon.href.endsWith('.svg'))
    // A home-screen icon is a filled square; a favicon is often 16px of nothing.
    .sort((a, b) => Number(b.touch) - Number(a.touch) || b.size - a.size);

  return {
    name: named('og:site_name', 'property') ?? named('application-name'),
    brand: /^#[0-9a-f]{3,8}$/i.test(named('theme-color') ?? '') ? named('theme-color') : undefined,
    icon: icons[0]?.href,
  };
};

/** How light a hex colour reads, 0 to 1. */
const luminance = (hex) => {
  const full = hex.length < 6 ? hex.slice(1).replace(/./g, (c) => c + c) : hex.slice(1, 7);
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

/** Whatever the browser already downloaded, kept as a PNG worth using as a mark. */
export const pickIcon = (entries) =>
  entries
    .filter(
      (entry) =>
        entry.response?.content?.encoding === 'base64' &&
        /icon|logo|favicon|touch|apple|brand/i.test(entry.request?.url ?? ''),
    )
    .map((entry) => Buffer.from(entry.response.content.text, 'base64'))
    .filter((bytes) => bytes.subarray(0, 8).equals(PNG))
    .sort((a, b) => b.length - a.length)[0];

/**
 * Read the site's own identity out of the recording the contributor just made.
 *
 * Asked over the network instead, a bookmaker answers a script with 403 or with
 * nothing at all - they are behind exactly the sort of thing that tells a robot
 * from a browser. The recording was made by a real browser, signed in, and it
 * already holds the front page, the colour in its head and the icon a phone
 * would put on a home screen.
 */
const fromRecording = (id, host, folder) => {
  const path = findRecording(id);
  if (path === undefined) return {};
  const entries = JSON.parse(readFileSync(path, 'utf8')).log?.entries ?? [];
  const site = entries.filter((entry) => (entry.request?.url ?? '').includes(host));

  const html = site
    .filter((entry) => /text\/html/i.test(entry.response?.content?.mimeType ?? ''))
    .map((entry) => entry.response.content.text ?? '')
    .join('\n');

  const icon = pickIcon(site);
  if (icon !== undefined) writeFileSync(join(folder, 'logo.png'), icon);
  return { ...(html === '' ? {} : readIdentity(html)), logo: icon !== undefined };
};

/**
 * The same three things asked of the site directly, for the sites that answer.
 * Failing is the normal case and costs nothing but the wait.
 */
const fromSite = async (host, folder) => {
  const get = async (url) => {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'user-agent': 'Mozilla/5.0 (BETtracker new-bookmaker)' },
    });
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return response;
  };

  try {
    const found = readIdentity(await (await get(`https://${host}/`)).text());
    if (folder === undefined) return found;
    try {
      const icon = await get(new URL(found.icon ?? '/apple-touch-icon.png', `https://${host}/`));
      const bytes = Buffer.from(await icon.arrayBuffer());
      // Written only if it really is a PNG: an .ico or a challenge page saved
      // under that name breaks the build rather than the icon.
      if (!bytes.subarray(0, 8).equals(PNG)) return found;
      writeFileSync(join(folder, 'logo.png'), bytes);
      return { ...found, logo: true };
    } catch {
      return found;
    }
  } catch {
    return {};
  }
};

/** The recording first, the live site for whatever it did not hold. */
const identify = async (id, host, folder) => {
  const har = fromRecording(id, host, folder);
  const live =
    har.name !== undefined && har.brand !== undefined && har.logo
      ? {}
      : await fromSite(host, har.logo ? undefined : folder);
  const brand = har.brand ?? live.brand ?? '#1f2937';
  return {
    name: har.name ?? live.name,
    brand,
    // A near-black or near-white plate disappears into one theme or the other,
    // and a chart line drawn in it would be invisible half the time.
    color: luminance(brand) > 0.12 && luminance(brand) < 0.85 ? brand : '#6366f1',
    logo: har.logo || live.logo === true,
  };
};

const title = (id) =>
  id
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const main = async () => {
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
    console.error(`${folder} already exists - nothing written.`);
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
  const found = await identify(id, host, folder);
  writeFileSync(
    join(folder, 'bookmaker.json'),
    `${JSON.stringify(
      meta(id, host, rest.join(' ') || found.name || title(id), found.brand, found.color),
      null,
      2,
    )}\n`,
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
    `extension/src/bookmakers/${id}/ - registered in capture.ts, registry.ts and catalog.ts.\n` +
      `It is a copy of ${from}/ answering to its own name, so it compiles and does the wrong thing.\n` +
      `Taken from the site itself: ${
        [
          found.name && 'its name',
          found.brand !== '#1f2937' && 'its colour',
          found.logo && 'its icon',
        ]
          .filter(Boolean)
          .join(', ') || 'nothing - it answered neither the recording nor a request'
      }.\n` +
      'What it still needs, none of which can be guessed:\n' +
      `  __fixtures__/*.json  the site's own answers, from har/${id}/*.sanitized.har\n` +
      (found.logo ? '' : "  logo.png             the site's mark, ~128px square, transparent\n") +
      `  bookmaker.json       its real hosts - sites, siteRanges, apiHosts\n` +
      `  capture.ts           the host and fingerprint patterns, and where the session lives\n` +
      `  adapter.ts           the endpoints, the paging and the bet shape - and the '${from}-' id prefix\n` +
      '  README.md            what is odd about this site\n' +
      'Then: pnpm lint && pnpm test && pnpm build',
  );
};

if (process.argv[1]?.endsWith('new-bookmaker.mjs')) main();
