import { describe, expect, it } from 'vitest';
import type { Bet, BetLeg } from '@betanal/shared';
import { legDays, legGroups } from './bet-table-row';

const leg = (over: Partial<BetLeg> = {}): BetLeg => ({
  sport: 'Football',
  league: null,
  event: 'Rockies - Brewers',
  marketType: 'Match bet',
  selection: 'Brewers',
  odds: 1.3,
  status: 'won',
  eventDate: '2026-06-07T01:10:00.000Z',
  isLive: false,
  ...over,
});

const bet = (legs: BetLeg[]): Bet =>
  ({ betId: 'b1', legs, sport: 'Football' }) as unknown as Bet;

describe('legGroups', () => {
  it('keeps several picks on one fixture together', () => {
    const groups = legGroups(
      bet([
        leg({ eventId: 'e1', selection: 'Under 14.5' }),
        leg({ eventId: 'e2', event: 'Dodgers - Angels', eventDate: '2026-06-07T02:00:00.000Z' }),
        leg({ eventId: 'e1', selection: 'Brewers' }),
      ]),
    );
    expect(groups.map((g) => g.length)).toEqual([2, 1]);
  });

  it('orders the groups by kickoff', () => {
    const groups = legGroups(
      bet([
        leg({ eventId: 'late', eventDate: '2026-06-07T20:00:00.000Z' }),
        leg({ eventId: 'early', eventDate: '2026-06-07T10:00:00.000Z' }),
      ]),
    );
    expect(groups.map((g) => g[0]?.eventId)).toEqual(['early', 'late']);
  });

  it('never folds together legs that name no fixture', () => {
    const groups = legGroups(bet([leg({ event: null }), leg({ event: null })]));
    expect(groups).toHaveLength(2);
  });
});

describe('legDays', () => {
  it('writes the date once a day and rules the day off at its last fixture', () => {
    const days = legDays(
      bet([
        leg({ eventId: 'a', eventDate: '2026-06-07T10:00:00.000Z' }),
        leg({ eventId: 'b', eventDate: '2026-06-07T20:00:00.000Z' }),
        leg({ eventId: 'c', eventDate: '2026-06-08T10:00:00.000Z' }),
      ]),
    );
    expect(days.map((d) => d.showDay)).toEqual([true, false, true]);
    expect(days.map((d) => d.endsDay)).toEqual([false, true, true]);
  });
});
