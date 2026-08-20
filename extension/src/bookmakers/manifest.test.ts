/**
 * What the extension asks the browser for, and what it waits to be given.
 *
 * No bookmaker is in the manifest. A site is granted one origin at a time, from
 * the popup, on the page the user is standing on - so the browser's own list of
 * what this extension may read starts empty and only ever holds sites somebody
 * chose. Listing them up front meant every mirror of every supported bookmaker,
 * most of them not yet in existence, shown to every reader as a site we read.
 *
 * Which leaves two things worth failing over: the manifest quietly growing a
 * site again, and a folder naming a host its own capture rule does not
 * recognise. The second is the silent one - the scripts go into a page nothing
 * then claims, and the site reads as unsupported on a browser that just granted
 * it.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { bookmakerForHost } from './capture';

const manifest = JSON.parse(
  readFileSync(new URL('../../manifest.json', import.meta.url), 'utf8'),
) as {
  permissions: string[];
  host_permissions: string[];
  optional_host_permissions: string[];
  content_scripts?: unknown;
};

const DIR = new URL('.', import.meta.url);

interface Meta {
  site?: string;
  sites?: string[];
  siteRanges?: { prefix: string; from: number; to: number; suffixes: string[] }[];
}

const CATALOG: Meta[] = readdirSync(DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => {
    try {
      return [JSON.parse(readFileSync(new URL(`${entry.name}/bookmaker.json`, DIR), 'utf8')) as Meta];
    } catch {
      return [];
    }
  });

/** `https://*.bah24.si/*` as a hostname a page would actually report. */
const hostOf = (match: string): string =>
  new URL(match.replace('://*.', '://www.')).hostname;

/** Every hostname a folder says the bookmaker serves its site from. */
const declaredSites = (meta: Meta): string[] => [
  ...(meta.site === undefined ? [] : [meta.site]),
  ...(meta.sites ?? []).map(hostOf),
  ...(meta.siteRanges ?? []).flatMap(({ prefix, from, to, suffixes }) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i).flatMap((n) =>
      suffixes.map((suffix) => `${prefix}${n}.${suffix}`),
    ),
  ),
];

describe('what the browser is asked for', () => {
  it('ships asking for no bookmaker at all', () => {
    for (const permission of manifest.host_permissions) {
      expect(permission).toMatch(/^https:\/\/api\./);
    }
    expect(manifest.content_scripts).toBeUndefined();
  });

  it('never asks for a permission over the whole web up front', () => {
    for (const perm of [...manifest.host_permissions, ...manifest.permissions]) {
      expect(perm).not.toBe('<all_urls>');
      expect(perm).not.toBe('https://*/*');
      expect(perm).not.toBe('tabs');
    }
    // Optional is the other half of the bargain: the request is made per site,
    // at a click, and the browser will only grant what was declared possible.
    expect(manifest.optional_host_permissions).toContain('https://*/*');
    expect(manifest.permissions).toContain('activeTab');
    expect(manifest.permissions).toContain('scripting');
  });

  it('holds permission for the rate feeds it actually calls', () => {
    const rates = readFileSync(new URL('../sync/rates.ts', import.meta.url), 'utf8');
    for (const [, host] of rates.matchAll(/https:\/\/([a-z0-9.-]+)\//g)) {
      expect(
        manifest.host_permissions.some((p) => p.startsWith(`https://${host}/`)),
      ).toBe(true);
    }
  });
});

describe('what a folder says it serves from', () => {
  it('recognises every site its own bookmaker.json names', () => {
    for (const meta of CATALOG) {
      for (const host of declaredSites(meta)) {
        expect(bookmakerForHost(host), host).not.toBeNull();
      }
    }
  });
});
