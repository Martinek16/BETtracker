import { describe, expect, it } from 'vitest';
import normalized from './__fixtures__/bets.normalized.json';
import {
  breakEvenWinRate,
  comboVsSingles,
  drawdown,
  edgeConfidence,
  equityCurve,
  luck,
  resolutionDate,
  resolvedStake,
  roi,
  stakeWeightedOdds,
} from './calculations';
import { groupBy } from './dimensions';
import type { Bet, BetStatus } from './types';

const fixture = normalized as Bet[];

const bet = (over: Partial<Bet> = {}): Bet => ({
  betId: Math.random().toString(36).slice(2),
  bookmaker: 'bet-at-home',
  accountId: 'acc-1',
  placedAt: '2026-01-01T10:00:00Z',
  settledAt: '2026-01-01T20:00:00Z',
  cashedOutAt: null,
  sport: 'Football',
  league: 'Test',
  event: 'A - B',
  marketType: '1X2',
  selection: 'A',
  odds: 2,
  stake: 10,
  potentialReturn: 20,
  actualReturn: 20,
  status: 'won',
  betType: 'single',
  legs: [],
  currency: 'EUR',
  ...over,
});

const settled = (status: BetStatus, stake: number, actualReturn: number, odds = 2): Bet =>
  bet({ status, stake, actualReturn, odds });

describe('roi', () => {
  it('excludes pending and void stake from the denominator', () => {
    // The fixture is all-decisive: 247.45 staked, 297.41 profit => 120.19%.
    const withNoise: Bet[] = [
      ...fixture,
      bet({ status: 'pending', stake: 100, actualReturn: 0, settledAt: null }),
      bet({ status: 'void', stake: 50, actualReturn: 50 }),
    ];

    expect(roi(fixture)).toBeCloseTo(120.19, 1);
    // Regression: counting the open + void stake as turnover reported 74.8%.
    expect(roi(withNoise)).toBeCloseTo(120.19, 1);
  });

  it('reports 0 when nothing has resolved', () => {
    expect(roi([bet({ status: 'pending', settledAt: null })])).toBe(0);
  });
});

describe('resolvedStake', () => {
  it('counts only stake that won, lost or cashed out', () => {
    const bets = [
      settled('won', 10, 20),
      settled('lost', 10, 0),
      settled('cashed_out', 10, 12),
      settled('void', 10, 10),
      bet({ status: 'pending', stake: 10, actualReturn: 0, settledAt: null }),
    ];
    expect(resolvedStake(bets)).toBe(30);
  });
});

describe('resolutionDate', () => {
  it('prefers settlement, then cash-out, then placement', () => {
    expect(resolutionDate(bet({ settledAt: '2026-02-02T00:00:00Z' }))).toBe('2026-02-02T00:00:00Z');
    expect(
      resolutionDate(bet({ settledAt: null, cashedOutAt: '2026-03-03T00:00:00Z' })),
    ).toBe('2026-03-03T00:00:00Z');
    expect(resolutionDate(bet({ settledAt: null, cashedOutAt: null }))).toBe(
      '2026-01-01T10:00:00Z',
    );
  });

  it('orders the equity curve by settlement, not placement', () => {
    const late = bet({
      betId: 'placed-first-settled-last',
      placedAt: '2026-01-01T00:00:00Z',
      settledAt: '2026-01-30T00:00:00Z',
    });
    const early = bet({
      betId: 'placed-last-settled-first',
      placedAt: '2026-01-10T00:00:00Z',
      settledAt: '2026-01-11T00:00:00Z',
    });
    expect(equityCurve([late, early]).map((p) => p.betId)).toEqual([
      'placed-last-settled-first',
      'placed-first-settled-last',
    ]);
  });
});

describe('drawdown', () => {
  it('finds the largest peak-to-trough fall', () => {
    // +30 (peak 30) -> -50 (trough -20) -> +10 (ends at -10)
    const bets = [
      bet({ settledAt: '2026-01-01T00:00:00Z', stake: 10, actualReturn: 40 }),
      bet({ settledAt: '2026-01-02T00:00:00Z', status: 'lost', stake: 50, actualReturn: 0 }),
      bet({ settledAt: '2026-01-03T00:00:00Z', stake: 10, actualReturn: 20 }),
    ];
    const dd = drawdown(bets);
    expect(dd.peak).toBe(30);
    expect(dd.maxDrawdown).toBe(50);
    expect(dd.currentDrawdown).toBe(40);
    expect(dd.troughAt).toBe('2026-01-02T00:00:00Z');
  });

  it('is zero for a curve that only rises', () => {
    const dd = drawdown([settled('won', 10, 20), settled('won', 10, 20)]);
    expect(dd.maxDrawdown).toBe(0);
    expect(dd.currentDrawdown).toBe(0);
  });
});

describe('breakEvenWinRate', () => {
  it('is 40% at stake-weighted odds of 2.50', () => {
    const bets = [settled('won', 100, 250, 2.5), settled('lost', 100, 0, 2.5)];
    expect(stakeWeightedOdds(bets)).toBeCloseTo(2.5, 6);
    expect(breakEvenWinRate(bets)).toBeCloseTo(40, 6);
  });

  it('weights by stake, so a big bet at short odds dominates', () => {
    // Unweighted mean odds is 3.0; the money is almost all at 1.5.
    const bets = [settled('won', 990, 1485, 1.5), settled('lost', 10, 0, 4.5)];
    expect(stakeWeightedOdds(bets)).toBeLessThan(1.6);
  });
});

describe('luck', () => {
  it('compares hits against the probability the prices implied', () => {
    // Four bets at 2.00 imply 2 wins; three landed.
    const bets = [
      settled('won', 10, 20),
      settled('won', 10, 20),
      settled('won', 10, 20),
      settled('lost', 10, 0),
    ];
    const result = luck(bets);
    expect(result.expectedWins).toBeCloseTo(2, 6);
    expect(result.actualWins).toBe(3);
    expect(result.delta).toBeCloseTo(1, 6);
  });
});

describe('edgeConfidence', () => {
  it('does not call a small-sample positive ROI significant', () => {
    const bets = [
      settled('won', 10, 20),
      settled('won', 10, 20),
      settled('lost', 10, 0),
      settled('lost', 10, 0),
      settled('won', 10, 20),
    ];
    const edge = edgeConfidence(bets);
    expect(edge.sample).toBe(5);
    expect(edge.yield).toBeGreaterThan(0);
    expect(edge.significant).toBe(false);
    expect(edge.ciLow).toBeLessThan(0);
  });

  it('flags a hit rate the prices cannot explain over a large sample', () => {
    // 1000 evens picks, 570 of them winners: 7 points clear of what 2.00 implies.
    const bets = Array.from({ length: 1000 }, (_, i) =>
      i < 570 ? settled('won', 10, 20) : settled('lost', 10, 0),
    );
    const edge = edgeConfidence(bets);
    expect(edge.yield).toBeCloseTo(14, 6);
    expect(edge.significant).toBe(true);
  });

  it('is inert on a single slip and on nothing at all', () => {
    expect(edgeConfidence([settled('won', 10, 20)]).significant).toBe(false);
    expect(edgeConfidence([]).sample).toBe(0);
  });

  it('does not call a short losing run a verdict', () => {
    // Regression: the sample variance of a straight-losing run is exactly zero,
    // which used to be reported as certainty. Three 5.00 shots missing is normal.
    const bets = Array.from({ length: 3 }, () => settled('lost', 10, 0, 5));
    expect(edgeConfidence(bets).yield).toBeCloseTo(-100, 6);
    expect(edgeConfidence(bets).significant).toBe(false);
  });

  it('does call a long losing run at short odds a verdict', () => {
    const bets = Array.from({ length: 100 }, () => settled('lost', 10, 0, 1.5));
    expect(edgeConfidence(bets).significant).toBe(true);
  });

  it('reads the yield off the money, not off the average slip', () => {
    // One big loser beside two small winners: the average slip is up, the account
    // is down, and the card quotes this next to the period ROI.
    const bets = [settled('lost', 100, 0), settled('won', 1, 2), settled('won', 1, 2)];
    expect(edgeConfidence(bets).yield).toBeCloseTo(roi(bets), 6);
    expect(edgeConfidence(bets).yield).toBeLessThan(0);
  });
});

describe('comboVsSingles', () => {
  it('prices the accumulator against the same stake spread over its legs', () => {
    // 10 staked on a 2-leg combo, one leg won at 2.0, the other lost: combo -10.
    // As singles: 5 @2.0 wins (+5), 5 loses (-5) => 0.
    const combo = bet({
      status: 'lost',
      stake: 10,
      actualReturn: 0,
      odds: 4,
      betType: 'accumulator',
      legs: [
        { sport: 'Football', league: null, event: null, marketType: null, selection: null, odds: 2, status: 'won', eventDate: null, isLive: false },
        { sport: 'Football', league: null, event: null, marketType: null, selection: null, odds: 2, status: 'lost', eventDate: null, isLive: false },
      ],
    });
    const result = comboVsSingles([combo]);
    expect(result.combos).toBe(1);
    expect(result.comboProfit).toBe(-10);
    expect(result.singlesProfit).toBe(0);
    expect(result.difference).toBe(-10);
  });

  it('ignores singles', () => {
    expect(comboVsSingles([settled('won', 10, 20)]).combos).toBe(0);
  });
});

describe('groupBy stats', () => {
  it('counts a profitable cash-out as a win', () => {
    const cashed = bet({
      status: 'cashed_out',
      stake: 10,
      actualReturn: 15,
      legs: [
        { sport: 'Tennis', league: null, event: null, marketType: null, selection: null, odds: 2, status: 'cashed_out', eventDate: null, isLive: false },
      ],
    });
    const tennis = groupBy([cashed], 'sport').find((g) => g.key === 'Tennis')!;
    expect(tennis.winRate).toBe(100);
    expect(tennis.roi).toBeCloseTo(50, 6);
  });

  it('keeps void stake out of a group ROI', () => {
    const legOf = (status: BetStatus): Bet =>
      bet({
        status,
        stake: 10,
        actualReturn: status === 'won' ? 20 : 10,
        legs: [
          { sport: 'Darts', league: null, event: null, marketType: null, selection: null, odds: 2, status, eventDate: null, isLive: false },
        ],
      });
    const darts = groupBy([legOf('won'), legOf('void')], 'sport').find((g) => g.key === 'Darts')!;
    // +10 profit over 10 of resolved stake, not 20 of gross stake.
    expect(darts.roi).toBeCloseTo(100, 6);
  });
});
