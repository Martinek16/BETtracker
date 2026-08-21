/**
 * Turns every bookmaker's `bookmaker.json` into the arrays the manifest needs.
 *
 * Only the addresses a bookmaker actually serves from - `sites`, never
 * `siteRanges`. A match pattern cannot wildcard anything but the leftmost label,
 * so a numbered mirror had to be guessed years ahead: the manifest carried 133
 * invented hostnames and every reader saw them as sites this extension reads.
 * Those are asked for one at a time instead, from the popup, on the page the
 * user is standing on. What is left here is the handful of real addresses, so
 * the site somebody actually opens is watched without them clicking anything.
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

/** The addresses a supported bookmaker really serves its site from. */
export const SITE_MATCHES = catalog.flatMap((meta) => meta.sites ?? []);

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
