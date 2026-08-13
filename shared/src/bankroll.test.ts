import { describe, expect, it } from 'vitest';
import { stakeShare } from './bankroll';
import type { Bet, Transaction } from './types';

const deposit = (occurredAt: string, amount: number): Transaction => ({
  id: `d-${occurredAt}`,
  bookmaker: 'bet-at-home',
  accountId: 'acc-1',
  kind: 'deposit',
  amount,
  currency: 'EUR',
  occurredAt,
  note: null,
});

const bet = (placedAt: string, settledAt: string, stake: number, actualReturn: number): Bet => ({
  betId: `b-${placedAt}`,
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
  actualReturn,
  status: actualReturn > 0 ? 'won' : 'lost',
  betType: 'single',
  legs: [],
  currency: 'EUR',
});

describe('stakeShare', () => {
  it('measures each stake against the balance held when it was placed', () => {
    const share = stakeShare(
      [bet('2026-01-02T10:00:00Z', '2026-01-02T20:00:00Z', 100, 0)],
      [deposit('2026-01-01T00:00:00Z', 1000)],
    );
    expect(share.average).toBeCloseTo(10, 6);
    expect(share.max).toBeCloseTo(10, 6);
    expect(share.sample).toBe(1);
  });

  it('tracks a flat stake growing as a share of a shrinking bankroll', () => {
    // 100 deposited, then two losing 25s: the second rides a 75 balance.
    const share = stakeShare(
      [
        bet('2026-01-02T10:00:00Z', '2026-01-02T20:00:00Z', 25, 0),
        bet('2026-01-03T10:00:00Z', '2026-01-03T20:00:00Z', 25, 0),
      ],
      [deposit('2026-01-01T00:00:00Z', 100)],
    );
    expect(share.max).toBeCloseTo(33.33, 1);
  });

  it('skips bets with no recorded bankroll behind them', () => {
    const share = stakeShare([bet('2026-01-02T10:00:00Z', '2026-01-02T20:00:00Z', 50, 0)], []);
    expect(share.sample).toBe(0);
    expect(share.average).toBe(0);
  });
});
