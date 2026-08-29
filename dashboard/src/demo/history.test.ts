import { describe, expect, it } from 'vitest';
import { profitOf, resolutionDate } from '@betanal/shared';
import { demoHistory } from '@/demo/history';

const { bets, rounds, transactions } = demoHistory();

describe('the demo history', () => {
  it('covers a year of betting across both accounts', () => {
    expect(bets.length).toBeGreaterThan(150);
    expect(new Set(bets.map((bet) => bet.bookmaker))).toEqual(new Set(['bet-at-home', 'stake']));
    expect(new Set(bets.map((bet) => bet.status))).toEqual(
      new Set(['won', 'lost', 'void', 'cashed_out']),
    );
    expect(bets.some((bet) => bet.betType === 'accumulator')).toBe(true);
    expect(bets.some((bet) => bet.legs.some((leg) => leg.groupOdds !== undefined))).toBe(true);
  });

  it('prices every slip the way a bookmaker does', () => {
    for (const bet of bets) {
      expect(bet.potentialReturn).toBeCloseTo(bet.stake * bet.odds, 1);
      expect(bet.legs.length).toBeGreaterThan(0);
      expect(resolutionDate(bet) >= bet.placedAt).toBe(true);
      if (bet.status === 'won') expect(bet.actualReturn).toBeGreaterThan(bet.stake);
      if (bet.status === 'lost') expect(bet.actualReturn).toBe(0);
    }
  });

  // The margin is what the demo is meant to show. A reader who came out ahead
  // over 300 days would be reading a story no bookmaker tells.
  it('leaves the punter slightly down, on the bets and in the casino', () => {
    const staked = bets.reduce((sum, bet) => sum + bet.stake, 0);
    const profit = bets.reduce((sum, bet) => sum + profitOf(bet), 0);
    expect(profit).toBeLessThan(0);
    expect(profit / staked).toBeGreaterThan(-0.25);

    const wagered = rounds.reduce((sum, round) => sum + round.stake, 0);
    const paid = rounds.reduce((sum, round) => sum + round.payout, 0);
    expect(paid / wagered).toBeGreaterThan(0.8);
    expect(paid / wagered).toBeLessThan(1);
  });

  it('keys its records the way the imports do', () => {
    expect(rounds.every((round) => round.id.startsWith('stake-round-'))).toBe(true);
    expect(transactions.every((row) => /^(bah|stake)-(dep|wd)-/.test(row.id))).toBe(true);
    expect(transactions.some((row) => row.kind === 'withdrawal')).toBe(true);
  });

  it('is drawn once and stays put', () => {
    expect(demoHistory().bets).toBe(bets);
  });
});
