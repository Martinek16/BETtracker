import { describe, expect, it } from 'vitest';
import { activeBets, isLiveBet, isLiveLeg, statKindForMarket } from './active-bets';
import type { Bet, BetLeg, BetStatus } from './types';

const NOW = Date.parse('2026-01-01T12:00:00Z');

const leg = (over: Partial<BetLeg> = {}): BetLeg => ({
  sport: 'Football',
  league: 'Test',
  event: 'A - B',
  marketType: '1X2',
  selection: 'A',
  odds: 2,
  status: 'pending',
  eventDate: '2026-01-01T18:00:00Z',
  isLive: false,
  ...over,
});

const bet = (betId: string, legs: BetLeg[], status: BetStatus = 'pending'): Bet => ({
  betId,
  bookmaker: 'bet-at-home',
  accountId: 'acc-1',
  placedAt: '2026-01-01T10:00:00Z',
  settledAt: null,
  cashedOutAt: null,
  sport: 'Football',
  league: 'Test',
  event: 'A - B',
  marketType: '1X2',
  selection: 'A',
  odds: 2,
  stake: 10,
  potentialReturn: 20,
  actualReturn: 0,
  status,
  betType: 'single',
  legs,
  currency: 'EUR',
});

const ids = (bets: Bet[]): string[] => bets.map((b) => b.betId);

describe('statKindForMarket', () => {
  it('follows what was backed rather than the sport', () => {
    expect(statKindForMarket('Total Corners')).toBe('Corners');
    expect(statKindForMarket('Yellow Cards Over/Under')).toBe('Cards');
    expect(statKindForMarket('Player Bookings')).toBe('Cards');
    expect(statKindForMarket('Over/Under')).toBeNull();
    expect(statKindForMarket(null)).toBeNull();
  });
});

describe('isLiveBet', () => {
  it('treats a started pending leg as live even when isLive was captured false', () => {
    const preMatch = bet('x', [leg({ isLive: false, eventDate: '2026-01-01T11:00:00Z' })]);
    expect(isLiveBet(preMatch, NOW)).toBe(true);
  });

  it('ignores a started leg that has already been decided', () => {
    const done = bet('x', [leg({ status: 'won', eventDate: '2026-01-01T11:00:00Z' })]);
    expect(isLiveBet(done, NOW)).toBe(false);
  });

  it('is not live when kickoff is unknown', () => {
    expect(isLiveBet(bet('x', [leg({ eventDate: null })]), NOW)).toBe(false);
  });
});

describe('isLiveLeg', () => {
  it('is live once kickoff has passed, even when isLive was captured false', () => {
    expect(isLiveLeg(leg({ isLive: false, eventDate: '2026-01-01T11:00:00Z' }), NOW)).toBe(true);
    expect(isLiveLeg(leg({ isLive: false, eventDate: '2026-01-01T18:00:00Z' }), NOW)).toBe(false);
  });

  it('stops being live long after kickoff, settled or not', () => {
    // A match called off, or one the book has simply not settled yet: kickoff on
    // its own cannot say a match is still being played, and reading it that way
    // left a finished slip under Live for the rest of the evening.
    expect(isLiveLeg(leg({ isLive: true, eventDate: '2026-01-01T04:00:00Z' }), NOW)).toBe(false);
  });
});

describe('isLiveBet with the book’s own scores', () => {
  const started = { eventId: 'e1', eventDate: '2026-01-01T11:00:00Z' };

  it('drops a slip out of play once the book calls the match ended', () => {
    const slip = bet('x', [leg(started)]);
    expect(isLiveBet(slip, NOW, { e1: [{ home: '2', away: '1', period: 'Ended' }] })).toBe(false);
    expect(isLiveBet(slip, NOW, { e1: [{ home: '2', away: '1', period: '2nd half' }] })).toBe(true);
  });

  it('keeps it in play while the book says nothing about that event', () => {
    expect(isLiveBet(bet('x', [leg(started)]), NOW, {})).toBe(true);
  });

  it('drops a fixture that was put back and never started, scoreline or not', () => {
    // The tennis case: kickoff has passed, so the window reads it as running,
    // and the book carries its state with no score at all.
    const slip = bet('x', [leg(started)]);
    expect(isLiveBet(slip, NOW, { e1: [{ home: '', away: '', period: 'Not started' }] })).toBe(
      false,
    );
    expect(isLiveBet(slip, NOW, { e1: [{ home: '', away: '', period: 'Postponed' }] })).toBe(false);
  });

  it('reads a scoreline as a match being played, clock or no clock', () => {
    // A feed that pushes the set score and nothing else - no minute, no period -
    // still says the match is on, and is the only thing that can say so for a
    // sport whose kickoff is a queue position.
    const tennis = leg({ ...started, sport: 'Tennis' });
    expect(isLiveBet(bet('x', [tennis]), NOW, { e1: [{ home: '1', away: '0' }] })).toBe(true);
  });

  it('waits for the book on a sport that is played when the court frees up', () => {
    // The match was due at eleven; the one before it went to five sets. Nothing
    // the book has said puts it on court, so the kickoff on its own must not.
    const tennis = leg({ ...started, sport: 'Tennis' });
    expect(isLiveBet(bet('x', [tennis]), NOW, {})).toBe(false);
    expect(isLiveBet(bet('x', [leg(started)]), NOW, {})).toBe(true);
    // Placed in play, so it was being played whatever the schedule said.
    expect(isLiveBet(bet('x', [leg({ ...tennis, isLive: true })]), NOW, {})).toBe(true);
  });

  it('keeps a match in play for as long as the book names the part being played', () => {
    // The cricket case: eight hours past the first ball, no window over it, and
    // out of play the moment the pick itself is decided.
    const started = { eventId: 'e1', eventDate: '2026-01-01T04:00:00Z' };
    const innings = { e1: [{ home: '210', away: '', period: '2nd innings' }] };
    expect(isLiveBet(bet('x', [leg(started)]), NOW, innings)).toBe(true);
    expect(isLiveBet(bet('x', [leg({ ...started, status: 'won' })]), NOW, innings)).toBe(false);
  });
});

describe('activeBets', () => {
  it('puts live bets first, including ones only live by kickoff time', () => {
    const upcoming = bet('upcoming', [leg({ eventDate: '2026-01-01T13:00:00Z' })]);
    const flagged = bet('flagged', [leg({ isLive: true, eventDate: '2026-01-01T20:00:00Z' })]);
    const started = bet('started', [leg({ isLive: false, eventDate: '2026-01-01T11:00:00Z' })]);

    expect(ids(activeBets([upcoming, flagged, started], NOW))).toEqual([
      'started',
      'flagged',
      'upcoming',
    ]);
  });

  it('sorts by earliest pending kickoff, unknown dates last', () => {
    const late = bet('late', [leg({ eventDate: '2026-01-01T20:00:00Z' })]);
    const early = bet('early', [leg({ eventDate: '2026-01-01T14:00:00Z' })]);
    const unknown = bet('unknown', [leg({ eventDate: null })]);

    expect(ids(activeBets([unknown, late, early], NOW))).toEqual(['early', 'late', 'unknown']);
  });

  it('ignores decided legs when picking the next kickoff', () => {
    const a = bet('a', [
      leg({ status: 'won', eventDate: '2026-01-01T13:00:00Z' }),
      leg({ eventDate: '2026-01-01T20:00:00Z' }),
    ]);
    const b = bet('b', [leg({ eventDate: '2026-01-01T15:00:00Z' })]);

    expect(ids(activeBets([a, b], NOW))).toEqual(['b', 'a']);
  });

  it('drops non-pending bets and leaves the input untouched', () => {
    const input = [
      bet('won', [leg()], 'won'),
      bet('open', [leg()]),
      bet('cashed', [leg()], 'cashed_out'),
    ];
    const before = ids(input);

    expect(ids(activeBets(input, NOW))).toEqual(['open']);
    expect(ids(input)).toEqual(before);
  });
});
