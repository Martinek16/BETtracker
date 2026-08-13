/**
 * Turns every bookmaker's `bookmaker.json` into the arrays the manifest needs.
 *
 * A match pattern can only wildcard the leftmost label — `bah*.com` is not
 * expressible — and both supported sites rotate numbered mirrors, so a folder
 * may declare a range and have it spelled out here. Each folder's `capture.ts`
 * matches the same hosts with a regex at runtime and is the narrower gate; this
 * list only has to be wide enough to let the content script load.
 *
 * Build-side only (it reads the folders off disk), which is why it is plain JS
 * and lives outside `src/`. Adding a bookmaker changes nothing in this file.
 */

import { readdirSync, readFileSync } from 'node:fs';

const BOOKMAKERS_DIR = new URL('./src/bookmakers/', import.meta.url);

/** Every `bookmaker.json` in the tree, in folder-name order. */
export const readCatalog = () =>
  readdirSync(BOOKMAKERS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => new URL(`${entry.name}/bookmaker.json`, BOOKMAKERS_DIR))
    .flatMap((path) => {
      try {
        return [JSON.parse(readFileSync(path, 'utf8'))];
      } catch {
        return [];
      }
    });

const expandRange = ({ prefix, from, to, suffixes }) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i).flatMap((n) =>
    suffixes.map((suffix) => `https://*.${prefix}${n}.${suffix}/*`),
  );

const catalog = readCatalog();

/** Every hostname pattern a supported bookmaker serves its site from. */
export const SITE_MATCHES = catalog.flatMap((meta) => [
  ...(meta.sites ?? []),
  ...(meta.siteRanges ?? []).flatMap(expandRange),
]);

/** The bookmakers' own API hosts, where those sit off the site's own domain. */
export const BOOKMAKER_API_HOSTS = catalog.flatMap((meta) => meta.apiHosts ?? []);

const PLACEHOLDERS = {
  $sites: SITE_MATCHES,
  $bookmakerApiHosts: BOOKMAKER_API_HOSTS,
};

/** Replaces every `$…` placeholder wherever the manifest uses one. */
export const expandSites = (value) =>
  Array.isArray(value)
    ? value.flatMap((v) => PLACEHOLDERS[v] ?? [expandSites(v)])
    : value !== null && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expandSites(v)]))
      : value;
