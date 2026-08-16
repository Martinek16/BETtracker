/**
 * A bookmaker is a folder, and this is what makes it one.
 *
 * Half of adding a site is remembering the three collectors — the capture rules,
 * the adapter registry and the catalogue — and each omission fails somewhere
 * else entirely: an unregistered rule means the page is read and nothing
 * happens, a missing catalogue entry means a bookmaker with no name and no
 * colour on screen. Checked here so a contributor finds out from a test rather
 * than from a silent account that never fills in.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { CAPTURE_RULES } from './capture';
import { CATALOG } from './catalog';
import { adapters } from './registry';
import { RELEASED } from './released';

const DIR = new URL('.', import.meta.url);

/** Every folder under `bookmakers/`, which is the list of sites that exist. */
const FOLDERS = readdirSync(DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== '__fixtures__')
  .map((entry) => entry.name);

const read = (folder: string, file: string): string =>
  readFileSync(new URL(`${folder}/${file}`, DIR), 'utf8');

it('finds the bookmakers at all, so an empty tree cannot pass silently', () => {
  expect(FOLDERS.length).toBeGreaterThan(0);
});

describe.each(FOLDERS)('%s', (folder) => {
  const meta = JSON.parse(read(folder, 'bookmaker.json')) as { id: string; name: string };

  it('is named after the folder it lives in', () => {
    // Everything else keys off the id: the logo path, the stored records and the
    // catalogue lookup all assume the two agree.
    expect(meta.id).toBe(folder);
    expect(meta.name.length).toBeGreaterThan(0);
  });

  it('ships a logo, a capture rule and an adapter', () => {
    expect(() => readFileSync(new URL(`${folder}/logo.png`, DIR))).not.toThrow();
    expect(() => read(folder, 'capture.ts')).not.toThrow();
    expect(() => read(folder, 'adapter.ts')).not.toThrow();
  });

  it('hands its parsed bets over, or nothing holds them to the shared rules', () => {
    // Without this file `conformance.test.ts` cannot see the folder at all, and
    // the site would ship having proved only that its own tests agree with it.
    expect(() => read(folder, 'samples.ts')).not.toThrow();
  });

  it('is registered in all three collectors', () => {
    expect(CAPTURE_RULES.map((rule) => rule.bookmaker)).toContain(folder);
    expect(adapters().map((adapter) => adapter.id)).toContain(folder);
    expect(CATALOG.map((entry) => entry.id)).toContain(folder);
  });

  it('keeps a recorded payload to prove the parser against', () => {
    const fixtures = readdirSync(new URL(`${folder}/__fixtures__/`, DIR));
    expect(fixtures.filter((name) => name.endsWith('.json')).length).toBeGreaterThan(0);
  });
});

/**
 * The other direction: a collector entry with no folder behind it is a stale
 * import left over from a bookmaker that was removed.
 */
it('registers nothing that is not a folder', () => {
  for (const id of [
    ...CAPTURE_RULES.map((rule) => rule.bookmaker),
    ...adapters().map((adapter) => adapter.id),
    ...CATALOG.map((entry) => entry.id),
  ]) {
    expect(FOLDERS).toContain(id);
  }
});

/**
 * A released site that has left the tree would be announced to everyone who
 * updates as a bookmaker they cannot use, and drawn as one nobody added.
 */
it('calls nothing released that the build does not have', () => {
  for (const id of RELEASED) expect(FOLDERS).toContain(id);
});
