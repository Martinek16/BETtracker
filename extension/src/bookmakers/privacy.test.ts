/**
 * The promise this extension makes is that your betting history stays on your
 * machine, and a bookmaker folder is the one part of the codebase strangers are
 * invited to write. So the promise is checked here rather than trusted to a
 * reviewer noticing one `fetch` among four hundred lines of parsing.
 *
 * Two things are checked, both derived from the folders on disk. Every host a
 * folder names in its own code must be one it declared in its `bookmaker.json`
 * - which is also the list of hosts the manifest asks permission for, so an
 * undeclared host is a host the extension could not reach anyway, and naming one
 * is a sign of intent worth failing over. And the handful of calls that can move
 * data somewhere the network tab does not show are refused outright.
 *
 * This does not make an adapter safe. It makes an exfiltrating one impossible to
 * write without also changing a file the guard workflow rejects.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const DIR = new URL('.', import.meta.url);

const FOLDERS = readdirSync(DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== '__fixtures__')
  .map((entry) => entry.name);

/**
 * The folder's own code. Tests are left out: they invent hosts to prove a
 * parser against, and inventing one is the point of a fixture.
 */
const sourcesOf = (folder: string): { file: string; text: string }[] =>
  readdirSync(new URL(`${folder}/`, DIR))
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .map((file) => ({
      file: `${folder}/${file}`,
      text: readFileSync(new URL(`${folder}/${file}`, DIR), 'utf8'),
    }));

/**
 * Comments are stripped so a link in prose is not read as a call. The line-comment
 * pattern requires a character other than `:` in front, or the `//` inside every
 * `https://` would swallow the rest of the line.
 */
const code = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `https://*.stake.com/*` as the hostnames it stands for. */
const hostPattern = (match: string): RegExp => {
  const host = match.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const bare = host.startsWith('*.') ? host.slice(2) : host;
  return new RegExp(`^(?:[a-z0-9-]+\\.)*${escape(bare)}$`);
};

interface Meta {
  site?: string;
  sites?: string[];
  apiHosts?: string[];
  siteRanges?: { prefix: string; from: number; to: number; suffixes: string[] }[];
}

/** Every host the folder told the manifest it needs, as patterns. */
const declaredHosts = (meta: Meta): RegExp[] => [
  ...(meta.site === undefined ? [] : [hostPattern(meta.site)]),
  ...(meta.sites ?? []).map(hostPattern),
  ...(meta.apiHosts ?? []).map(hostPattern),
  ...(meta.siteRanges ?? []).map(
    ({ prefix, suffixes }) =>
      new RegExp(
        `^(?:[a-z0-9-]+\\.)*${escape(prefix)}\\d+\\.(?:${suffixes.map(escape).join('|')})$`,
      ),
  ),
];

/**
 * Calls that reach the network or the disk without going through `fetch`, so a
 * reader watching requests would not see them. `chrome.storage.sync` is here
 * because it is not local storage: it copies whatever it holds to the browser
 * account, which for a betting history is exactly the thing being promised
 * against.
 */
const FORBIDDEN: [RegExp, string][] = [
  [/navigator\.sendBeacon|\bsendBeacon\s*\(/, 'sendBeacon posts without showing a response'],
  [/new\s+WebSocket|WebSocket\s*\(/, 'a socket carries data no request log would show'],
  [/new\s+XMLHttpRequest|XMLHttpRequest\s*\(/, 'use fetch, which the rest of the code can see'],
  [/new\s+Image\s*\(|new\s+EventSource/, 'an image or event source is a request in disguise'],
  [/\beval\s*\(|new\s+Function\s*\(/, 'code assembled at runtime cannot be reviewed'],
  [/chrome\.storage\.sync/, 'storage.sync copies to the browser account; use storage.local'],
  [/\bimportScripts\s*\(/, 'loads code from somewhere this file does not name'],
  [/navigator\.clipboard|document\.cookie\s*=/, 'reaches outside what the adapter was given'],
  [/createElement\(\s*['"`]script/, 'injecting a script tag runs code from off-site'],
];

it('found the bookmakers at all, so an empty tree cannot pass silently', () => {
  expect(FOLDERS.length).toBeGreaterThan(0);
});

describe.each(FOLDERS)('%s sends nothing anywhere', (folder) => {
  const meta = JSON.parse(readFileSync(new URL(`${folder}/bookmaker.json`, DIR), 'utf8')) as Meta;
  const allowed = declaredHosts(meta);
  const sources = sourcesOf(folder);

  it('names no host it did not declare in its own bookmaker.json', () => {
    for (const { file, text } of sources) {
      for (const match of code(text).matchAll(/https?:\/\/([a-z0-9.*-]+)/gi)) {
        const host = (match[1] ?? '').toLowerCase();
        expect(
          allowed.some((pattern) => pattern.test(host)),
          `${file} names ${host}, which is not a site or apiHost in ${folder}/bookmaker.json`,
        ).toBe(true);
      }
    }
  });

  it('uses none of the calls that could move data out unseen', () => {
    for (const { file, text } of sources) {
      const stripped = code(text);
      for (const [pattern, reason] of FORBIDDEN) {
        expect(pattern.test(stripped), `${file}: ${reason}`).toBe(false);
      }
    }
  });
});
