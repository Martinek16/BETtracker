import { describe, expect, it } from 'vitest';
import type { Bet, BetLeg, Transaction } from './types';
import { findings, type Finding } from './findings';

const leg = (event: string, selection: string): BetLeg => ({
  sport: 'Football',
  league: 'Test',
  event,
  marketType: '1X2',
  selection,
  odds: 2,
  status: 'lost',
  eventDate: null,
  isLive: false,
});

const bet = (betId: string, over: Partial<Bet> = {}): Bet => ({
  betId,
  bookmaker: 'bet-at-home',
  accountId: 'acc-1',
  placedAt: '2026-01-01T10:00:00Z',
  settledAt: '2026-01-01T12:00:00Z',
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
  status: 'lost',
  betType: 'single',
  legs: [leg('A - B', 'A')],
  currency: 'EUR',
  ...over,
});

const money = (n: number): string => n.toFixed(2);
const book = (over: (i: number) => Partial<Bet> = () => ({})): Bet[] =>
  Array.from({ length: 24 }, (_, i) => bet(`b${String(i)}`, over(i)));

const find = (list: readonly Finding[], id: string) => list.find((f) => f.id === id);

describe('findings', () => {
  it('still reads a short period, and says the read is early', () => {
    const early = findings([bet('a'), bet('b')], [], money);

    expect(find(early, 'early')?.detail).toContain('2 settled slips');
    // The checks run all the same: two long-priced losers are still worth naming.
    expect(find(early, 'long-odds')).toBeDefined();
  });

  it('says nothing when nothing settled', () => {
    expect(findings([bet('a', { status: 'pending' })], [], money)).toEqual([]);
  });

  it('flags long prices only when they carry real money and lose', () => {
    const heavy = findings(
      book((i) => (i < 12 ? { odds: 8, legs: [leg(`E${String(i)}`, 'x')] } : {})),
      [],
      money,
    );
    expect(find(heavy, 'long-odds')?.kind).toBe('problem');

    const light = findings(
      book((i) => ({ odds: i === 0 ? 8 : 2, legs: [leg(`E${String(i)}`, 'x')] })),
      [],
      money,
    );
    expect(find(light, 'long-odds')?.kind).toBe('good');
  });

  it('counts a pick as repeated only when it sits on more than one slip', () => {
    const distinct = findings(
      book((i) => ({ legs: [leg(`Event ${String(i)}`, 'Home')] })),
      [],
      money,
    );
    expect(find(distinct, 'repeats')?.kind).toBe('good');

    const doubled = findings(
      book((i) => ({ legs: [leg(`Event ${String(i % 12)}`, 'Home')] })),
      [],
      money,
    );
    expect(find(doubled, 'repeats')?.detail).toContain('12 picks');
  });

  it('only calls a deposit a top-up when losses landed in the day before it', () => {
    const deposit = (id: string, occurredAt: string): Transaction => ({
      id,
      bookmaker: 'bet-at-home',
      accountId: 'acc-1',
      kind: 'deposit',
      amount: 50,
      currency: 'EUR',
      occurredAt,
      note: null,
    });

    const after = findings(book(), [deposit('t1', '2026-01-01T13:00:00Z'), deposit('t2', '2026-01-01T14:00:00Z')], money);
    expect(find(after, 'deposit-chase')?.kind).toBe('problem');

    const unrelated = findings(book(), [deposit('t1', '2025-12-01T13:00:00Z')], money);
    expect(find(unrelated, 'deposit-chase')?.kind).toBe('good');
  });
});
