import type { Bet, BetLeg, BetStatus } from '../types';

export const makeLeg = (over: Partial<BetLeg> = {}): BetLeg => ({
  sport: 'Football',
  league: 'Test',
  event: 'A - B',
  marketType: '1X2',
  selection: 'A',
  odds: 2,
  status: 'won',
  eventDate: '2026-01-01T18:00:00Z',
  isLive: false,
  ...over,
});

export const makeBet = (over: Partial<Bet> = {}): Bet => ({
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

export const settledBet = (
  status: BetStatus,
  stake: number,
  actualReturn: number,
  odds = 2,
): Bet => makeBet({ status, stake, actualReturn, odds });
