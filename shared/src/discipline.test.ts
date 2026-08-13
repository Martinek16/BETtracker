import { describe, expect, it } from 'vitest';
import type { Bet } from './types';
import { tiltCheck } from './discipline';

const bet = (
  betId: string,
  placedAt: string,
  settledAt: string,
  stake: number,
  won: boolean,
): Bet => ({
  betId,
  bookmaker: 'bet-at-home',
  accountId: 'acc-1',
  placedAt,
  settledAt,
  cashedOutAt: null,
  sport: 'Football',
  league: 'Test',
  event: 'A - B',
  marketType: '1X2',
  selection: 'A',
  odds: 2,
  stake,
  potentialReturn: stake * 2,
  actualReturn: won ? stake * 2 : 0,
  status: won ? 'won' : 'lost',
  betType: 'single',
  legs: [],
  currency: 'EUR',
});

describe('tiltCheck', () => {
  it('reports nothing for an empty book', () => {
    const check = tiltCheck([]);
    expect(check.sample).toBe(0);
    expect(check.stakeLift).toBe(0);
  });

  it('never divides by an empty win side', () => {
    const check = tiltCheck([
      bet('a', '2026-01-01T10:00:00Z', '2026-01-01T12:00:00Z', 10, false),
      bet('b', '2026-01-01T13:00:00Z', '2026-01-01T15:00:00Z', 20, false),
    ]);
    expect(check.afterWin.bets).toBe(0);
    expect(check.afterLoss.bets).toBe(1);
    expect(check.afterLoss.meanStake).toBe(20);
    expect(check.stakeLift).toBe(0);
  });

  it('buckets by the last bet to settle, not the last one placed', () => {
    const check = tiltCheck([
      // Placed first but settles last, so it is not what the user saw.
      bet('slow-win', '2026-01-01T09:00:00Z', '2026-01-01T23:00:00Z', 10, true),
      bet('quick-loss', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z', 10, false),
      // Placed after the loss landed but before the win did.
      bet('reaction', '2026-01-01T12:00:00Z', '2026-01-01T14:00:00Z', 40, false),
    ]);

    expect(check.afterLoss.bets).toBe(1);
    expect(check.afterLoss.meanStake).toBe(40);
    expect(check.afterWin.bets).toBe(0);
    expect(check.sample).toBe(1);
  });

  it('measures the stake lift after a loss against the stake after a win', () => {
    const check = tiltCheck([
      bet('w', '2026-01-01T09:00:00Z', '2026-01-01T10:00:00Z', 10, true),
      bet('after-win', '2026-01-01T11:00:00Z', '2026-01-01T12:00:00Z', 10, false),
      bet('after-loss', '2026-01-01T13:00:00Z', '2026-01-01T14:00:00Z', 15, false),
    ]);

    expect(check.afterWin.meanStake).toBe(10);
    expect(check.afterLoss.meanStake).toBe(15);
    expect(check.stakeLift).toBeCloseTo(50);
    expect(check.sample).toBe(2);
  });
});
