/**
 * Turns every bookmaker's `bookmaker.json` into the arrays the manifest needs.
 *
 * Every address a bookmaker serves from: the named ones in `sites`, and the
 * numbered mirrors in `siteRanges` written out one by one. A match pattern
 * cannot wildcard anything but the leftmost label, so `bah24.si` and
 * `stake1001.com` have to be named or they are not matched at all.
 *
 * They were left out once, on the argument that a manifest naming a hundred
 * hosts reads badly. What it cost was the whole extension in the countries
 * where the plain address is blocked: the numbered mirror is the only address
 * those users ever reach, no content script loaded on it, and so nothing was
 * captured, nothing synced, and no amount of reloading changed that. A popup
 * grant covered it in theory and in practice nobody found it.
 *
 * Each folder's `capture.ts` matches the same hosts with a regex at runtime and
 * is the narrower gate; this list only has to be wide enough to let the content
 * script load.
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

const catalog = readCatalog();

/** `{ prefix: 'bah', from: 20, to: 45, suffixes: ['si'] }` → `https://*.bah20.si/*`, … */
const rangeMatches = ({ prefix, from, to, suffixes }) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i).flatMap((n) =>
    suffixes.map((suffix) => `https://*.${prefix}${n}.${suffix}/*`),
  );

/** The addresses a supported bookmaker really serves its site from. */
export const SITE_MATCHES = catalog.flatMap((meta) => [
  ...(meta.sites ?? []),
  ...(meta.siteRanges ?? []).flatMap(rangeMatches),
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
