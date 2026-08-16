import { describe, expect, it } from 'vitest';
import type { Bet } from '@betanal/shared';
import { checksFor, type Records } from '@/pages/options/readiness';

const bet = (over: Partial<Bet> = {}): Bet => ({
  betId: 'b1',
  bookmaker: 'my-site',
  accountId: 'a1',
  placedAt: '2026-01-01T10:00:00.000Z',
  settledAt: '2026-01-01T12:00:00.000Z',
  cashedOutAt: null,
  sport: 'Football',
  league: 'Premier League',
  event: 'Arsenal vs Chelsea',
  marketType: '1X2',
  selection: 'Arsenal',
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

const records = (over: Partial<Records> = {}): Records => ({
  bets: [],
  transactions: [],
  bonuses: [],
  balances: [],
  metas: [],
  ...over,
});

const stateOf = (all: Records, label: string): boolean | null => {
  const check = checksFor('my-site', all).find((one) => one.label.startsWith(label));
  if (check === undefined) throw new Error(`no check named ${label}`);
  return check.state;
};

describe('what a bookmaker has proved', () => {
  it('holds a blank sport against the site, because every breakdown groups by it', () => {
    const named = records({ bets: [bet()] });
    expect(stateOf(named, 'Every bet names')).toBe(true);
    expect(stateOf(records({ bets: [bet({ sport: null })] }), 'Every bet names')).toBe(false);
  });

  it('calls an untested thing untested rather than passed', () => {
    // No open bet in the account is not evidence that open bets work, and a tick
    // here is exactly the wrong answer that costs the next person a day.
    expect(stateOf(records({ bets: [bet()] }), 'Open bets')).toBeNull();
    expect(stateOf(records({ bets: [bet({ status: 'pending' })] }), 'Open bets')).toBe(true);
    expect(stateOf(records(), 'Deposits')).toBeNull();
  });

  it('judges nothing off an empty store, except that nothing arrived', () => {
    const empty = checksFor('my-site', records());
    expect(stateOf(records(), 'Bets read')).toBe(false);
    expect(empty.filter((check) => check.state === true)).toHaveLength(0);
  });

  it('reports an accumulator that came through without its legs', () => {
    const flat = records({ bets: [bet({ betType: 'accumulator', legs: [] })] });
    expect(stateOf(flat, 'Accumulators')).toBe(false);
  });

  it('ignores what another bookmaker stored', () => {
    const other = records({ bets: [bet({ bookmaker: 'someone-else' })] });
    expect(stateOf(other, 'Bets read')).toBe(false);
  });
});
