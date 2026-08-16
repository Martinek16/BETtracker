/**
 * The scaffold edits three shared files by pattern. If a collector is rewritten
 * and a pattern stops matching, the folder is created and quietly registered
 * nowhere, which `plugin.test.ts` then reports as the contributor's mistake.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  camelId,
  registerCapture,
  registerCatalog,
  registerRegistry,
  retarget,
} from './new-bookmaker.mjs';

const collector = (name) =>
  readFileSync(fileURLToPath(new URL(`../src/bookmakers/${name}`, import.meta.url)), 'utf8');

describe('registering a new folder in the collectors', () => {
  it('adds the import and the list entry to each of the three', () => {
    const capture = registerCapture(collector('capture.ts'), 'my-site');
    expect(capture).toContain("import { rule as mySite } from './my-site/capture';");
    expect(capture).toMatch(/CAPTURE_RULES: readonly CaptureRule\[\] = \[.*mySite\]/);

    const registry = registerRegistry(collector('registry.ts'), 'my-site');
    expect(registry).toContain("import { mySite } from './my-site/adapter';");
    expect(registry).toContain("'my-site': mySite,");

    const catalog = registerCatalog(collector('catalog.ts'), 'my-site');
    expect(catalog).toContain("import mySite from './my-site/bookmaker.json';");
    expect(catalog).toMatch(/CATALOG: readonly BookmakerMeta\[\] = \[.*mySite\]/);
  });

  it('leaves a site that is already registered alone', () => {
    expect(registerCapture(collector('capture.ts'), 'stake')).toBe(collector('capture.ts'));
  });
});

describe('renaming the copied example', () => {
  it('renames what identifies the site and nothing that means money', () => {
    const source = [
      "const BOOKMAKER: Bookmaker = 'stake';",
      "export const stake: BookmakerAdapter = { id: 'stake' };",
      'const stake = toNumber(raw.amount, 0);',
      'potentialReturn: stake * odds,',
    ].join('\n');

    const out = retarget(source, 'stake', 'my-site');
    expect(out).toContain("const BOOKMAKER: Bookmaker = 'my-site';");
    expect(out).toContain("export const mySite: BookmakerAdapter = { id: 'my-site' };");
    expect(out).toContain('const stake = toNumber(raw.amount, 0);');
    expect(out).toContain('potentialReturn: stake * odds,');
  });

  it('reads a hyphenated id as the code would name it', () => {
    expect(camelId('william-hill')).toBe('williamHill');
    expect(camelId('bet365')).toBe('bet365');
  });
});
