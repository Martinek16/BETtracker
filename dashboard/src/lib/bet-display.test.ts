import { describe, expect, it } from 'vitest';
import type { KnownAccount } from '@betanal/shared';
import { emptyBetsMessage, pickLabel } from './bet-display';

const login = (bookmaker: string): KnownAccount =>
  ({
    bookmaker,
    accountId: `${bookmaker}-1`,
    firstSeenAt: '2026-01-01T00:00:00.000Z',
    lastSeenAt: '2026-01-02T00:00:00.000Z',
  }) as KnownAccount;

describe('emptyBetsMessage', () => {
  it('names no site at all when the extension has seen no login', () => {
    expect(emptyBetsMessage([])).not.toMatch(/bet-at-home|stake/i);
  });

  it('names the site the reader is signed in at, and no other', () => {
    const said = emptyBetsMessage([login('stake')]);
    expect(said).toContain('Stake');
    expect(said).not.toContain('bet-at-home');
  });

  it('names each connected site once, however many logins it has', () => {
    const said = emptyBetsMessage([login('stake'), login('bet-at-home'), login('stake')]);
    expect(said).toContain('bet-at-home');
    expect(said.match(/Stake/g)).toHaveLength(1);
  });
});

describe('pickLabel', () => {
  it('names what a priced line is counted in', () => {
    expect(pickLabel('Napoli to score Over/Under 0.5', 'Napoli Over 0.5')).toBe(
      'Napoli score Over 0.5',
    );
    expect(pickLabel('Total Corners Over/Under 9.5', 'Over 9.5')).toBe('Corners Over 9.5');
    expect(pickLabel('Player Shots On Target Over/Under 2.5', 'Ferran Torres Over 2.5')).toBe(
      'Ferran Torres Shots On Target Over 2.5',
    );
  });

  it('adds nothing the selection already says', () => {
    expect(pickLabel('Matchbet And Over/Under 1.5', 'Bayern Munich and Over 1.5')).toBe(
      'Bayern Munich and Over 1.5',
    );
    expect(pickLabel('Over/Under 2.5', 'Over 2.5')).toBe('Over 2.5');
  });

  it('leaves markets that are not a line alone', () => {
    expect(pickLabel('Both Teams To Score', 'Yes')).toBe('Yes');
    expect(pickLabel('1X2', 'Genoa')).toBe('Genoa');
    expect(pickLabel('Correct Score', null)).toBe('Correct Score');
  });
});
