/**
 * The id is what the folder, the adapter and the three collector lines are all
 * named after, and the reader is asked for an address rather than an id. Getting
 * one from the other wrongly is a scaffold that has to be thrown away.
 */

import { describe, expect, it } from 'vitest';
import { hostFromInput, idFromHost } from './accounts';

describe('the site the reader is adding', () => {
  it('takes the host out of whatever was pasted', () => {
    expect(hostFromInput('https://www.e-stave.com/bets?page=2')).toBe('www.e-stave.com');
    expect(hostFromInput('  Stake.com  ')).toBe('stake.com');
  });

  it('names the folder after the site, without www or the suffix', () => {
    expect(idFromHost('www.e-stave.com')).toBe('e-stave');
    expect(idFromHost('stake.com')).toBe('stake');
    expect(idFromHost('bet-at-home.co.uk')).toBe('bet-at-home');
  });

  it('leaves nothing in an id that a folder name cannot hold', () => {
    expect(idFromHost('sports.My_Book.com')).toBe('sports-my-book');
  });
});
