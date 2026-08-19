/**
 * The id derived here becomes a folder name, the JSON `id`, the storage key and
 * an argument on a shell command line. A host that slips through wrong is not a
 * typo, it is three files disagreeing and a test failing by filename.
 */

import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';
import { assistantCommand, parseSite, promptFor } from './add-bookmaker.mjs';

describe('reading the site off what the contributor typed', () => {
  it('takes a bare host, a url, and a url with paths and query', () => {
    for (const input of [
      'bet365.com',
      'https://www.bet365.com',
      'http://bet365.com/members/history?page=2',
    ])
      expect(parseSite(input)).toEqual({ host: 'bet365.com', id: 'bet365', name: 'Bet365' });
  });

  it('names the bookmaker, not the section of it the contributor was on', () => {
    expect(parseSite('https://www.bet-at-home.com').id).toBe('bet-at-home');
    expect(parseSite('https://sports.bet365.com').id).toBe('bet365');
    expect(parseSite('https://m.stake.com/casino/home').id).toBe('stake');
  });

  it('refuses anything that is not a site, rather than making a folder for it', () => {
    for (const input of ['', 'localhost', 'not a host', 'file:///etc/passwd', '../../etc'])
      expect(() => parseSite(input)).toThrow();
  });
});

/**
 * The assistant is started through a shell, and a shell takes an argument apart
 * on the spaces in it. That is not a theory: the whole prompt used to be the
 * argument, and everything after the first line was lost before the assistant
 * ran. So what is handed over is checked by handing it over.
 */
describe('starting the assistant', () => {
  it('gets its instruction whole, through the shell that runs it', () => {
    const echo = assistantCommand('bet-at-home').replace(
      /^claude/,
      `"${process.execPath}" -e "console.log(process.argv[1])"`,
    );
    const { stdout } = spawnSync(echo, { shell: true, encoding: 'utf8' });
    expect(stdout.trim()).toBe('Follow har/bet-at-home/PROMPT.md');
  });

  it('writes down the file to read and the command to run', () => {
    const prompt = promptFor(
      { host: 'bet365.com', id: 'bet365', name: 'Bet365' },
      'har/bet365/session.sanitized.har',
    );
    expect(prompt).toContain('har/bet365/session.sanitized.har');
    expect(prompt).toContain('pnpm new-bookmaker bet365 bet365.com "Bet365"');
    expect(prompt).toContain('AGENTS.md');
  });
});
