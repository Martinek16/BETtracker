/**
 * What the extension asks the browser for, and what it waits to be given.
 *
 * A supported site is in the manifest, so the scripts are already in the page
 * the moment the user opens it - nothing to click, nothing to grant. That only
 * holds while the list stays honest: an address that no longer resolves, or one
 * invented ahead of time, is a site this extension declares it reads and never
 * does. Anything not on the list is asked for one origin at a time, from the
 * popup, on the page the user is standing on.
 *
 * Which leaves three things worth failing over: the list quietly growing past
 * the sites the folders name, a folder naming a host its own capture rule does
 * not recognise, and a permission over the whole web slipping into the up-front
 * ask. The second is the silent one - the scripts go into a page nothing then
 * claims, and the site reads as unsupported on a browser already granting it.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { bookmakerForHost } from './capture';
// @ts-expect-error - build-side helper, plain JS on purpose (see sites.mjs).
import { SITE_MATCHES, expandSites } from '../../sites.mjs';

const manifest = expandSites(
  JSON.parse(readFileSync(new URL('../../manifest.json', import.meta.url), 'utf8')),
) as {
  permissions: string[];
  host_permissions: string[];
  optional_host_permissions: string[];
  content_scripts: { matches: string[]; js: string[] }[];
};

const DIR = new URL('.', import.meta.url);

interface Meta {
  site?: string;
  sites?: string[];
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
const hostOf = (match: string): string => new URL(match.replace('://*.', '://www.')).hostname;

describe('what the browser is asked for', () => {
  it('watches every site a folder names, and no other', () => {
    for (const script of manifest.content_scripts) {
      expect(script.matches).toEqual(SITE_MATCHES);
    }
    for (const match of SITE_MATCHES) {
      expect(manifest.host_permissions).toContain(match);
    }
  });

  it('never asks for a permission over the whole web up front', () => {
    for (const perm of [...manifest.host_permissions, ...manifest.permissions]) {
      expect(perm).not.toBe('<all_urls>');
      expect(perm).not.toBe('https://*/*');
      expect(perm).not.toBe('tabs');
    }
    // Optional is the other half of the bargain: a mirror nobody listed is
    // requested per site, at a click, and the browser will only grant what was
    // declared possible here.
    expect(manifest.optional_host_permissions).toContain('https://*/*');
    expect(manifest.permissions).toContain('activeTab');
    expect(manifest.permissions).toContain('scripting');
  });

  it('holds permission for the rate feeds it actually calls', () => {
    const rates = readFileSync(new URL('../sync/rates.ts', import.meta.url), 'utf8');
    for (const [, host] of rates.matchAll(/https:\/\/([a-z0-9.-]+)\//g)) {
      expect(manifest.host_permissions.some((p) => p.startsWith(`https://${host}/`))).toBe(true);
    }
  });
});

describe('what a folder says it serves from', () => {
  it('recognises every site its own bookmaker.json names', () => {
    for (const meta of CATALOG) {
      for (const host of [...(meta.site === undefined ? [] : [meta.site]), ...(meta.sites ?? []).map(hostOf)]) {
        expect(bookmakerForHost(host), host).not.toBeNull();
      }
    }
  });

  /**
   * A pattern can only wildcard the leftmost label, so `https://stake.com/*` and
   * `https://*.stake.com/*` are the same grant written twice - and the second
   * already covers the bare domain. Duplicates are how a list grows past what
   * anyone reads.
   */
  it('names each site once', () => {
    expect(new Set(SITE_MATCHES).size).toBe(SITE_MATCHES.length);
    for (const match of SITE_MATCHES) {
      expect(SITE_MATCHES).not.toContain(match.replace('://*.', '://'));
    }
  });
});
