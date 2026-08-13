/**
 * What the browser is asked for and what is actually read have to be one list.
 *
 * The manifest decides where the content script is injected; `capture.ts` decides
 * which bookmaker a loaded page belongs to. Nothing joins them at runtime, so a
 * mirror listed in one and not the other fails silently: the script loads and
 * then does nothing, or the adapter waits for a page it is never injected into.
 *
 * Both sides are now built from the `bookmaker.json` files, so this is the test
 * that catches a contributor's mirror list before it reaches anyone's browser.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { bookmakerForHost } from './capture';
// @ts-expect-error -- plain build-side module, no types
import { SITE_MATCHES, expandSites } from '../../sites.mjs';

const manifest = expandSites(
  JSON.parse(readFileSync(new URL('../../manifest.json', import.meta.url), 'utf8')),
) as {
  permissions: string[];
  host_permissions: string[];
  content_scripts: { matches: string[] }[];
};

/** `https://*.bah24.si/*` as the hostname a page would actually report. */
const hostOf = (match: string): string =>
  new URL(match.replace('://*.', '://www.')).hostname;

describe('manifest and capture rules', () => {
  it('recognises every site it asks to be injected into', () => {
    for (const match of SITE_MATCHES as string[]) {
      expect(bookmakerForHost(hostOf(match))).not.toBeNull();
    }
  });

  it('injects into every site it lists, in both worlds', () => {
    for (const script of manifest.content_scripts) {
      expect(script.matches).toEqual(SITE_MATCHES);
    }
  });

  it('never asks for a permission over the whole web up front', () => {
    for (const perm of [...manifest.host_permissions, ...manifest.permissions]) {
      expect(perm).not.toBe('<all_urls>');
      expect(perm).not.toBe('https://*/*');
      expect(perm).not.toBe('tabs');
    }
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
