import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/settled-bets.json';
import { normalizeBet, parseBalance, parseBanking, parseSettled } from './adapter';

describe('bet-at-home adapter', () => {
  const page = parseSettled(fixture, 'acc-1');

  it('parses every fixture bet with none skipped', () => {
    expect(page.bets.length).toBe(8);
    expect(page.skipped).toBe(0);
  });

  it('produces a pagination cursor (oldest placedAt)', () => {
    expect(page.nextCursor).toBeTruthy();
    expect(page.nextCursor).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('maps single and accumulator bet types', () => {
    expect(page.bets.some((b) => b.betType === 'single')).toBe(true);
    const acc = page.bets.find((b) => b.betType === 'accumulator');
    expect(acc).toBeDefined();
    expect(acc?.legs.length).toBeGreaterThan(1);
  });

  it('uses decimal odds and consistent money fields', () => {
    for (const b of page.bets) {
      expect(b.odds).toBeGreaterThan(1);
      expect(b.stake).toBeGreaterThan(0);
      expect(b.currency).toBe('EUR');
    }
  });

  it('records winnings on won bets and zero on lost bets', () => {
    const won = page.bets.find((b) => b.status === 'won');
    const lost = page.bets.find((b) => b.status === 'lost');
    expect(won?.actualReturn).toBeGreaterThan(won?.stake ?? 0);
    expect(lost?.actualReturn).toBe(0);
  });

  it('separates the bonus part of a stake from the money that left the pocket', () => {
    const base = { id: 'x', placedDate: '2026-01-01T00:00:00Z' };
    expect(normalizeBet({ ...base, totalBetAmount: 20 }, 'acc-1')?.bonusStake).toBeUndefined();
    expect(normalizeBet({ ...base, totalBetAmount: 20, bonusStake: 12 }, 'acc-1')?.bonusStake).toBe(
      12,
    );
    // A free bet leaves bonusStake at zero and reports its face value instead.
    expect(
      normalizeBet({ ...base, totalBetAmount: 10, bonusStake: 0, freeBetAmount: 10 }, 'acc-1')
        ?.bonusStake,
    ).toBe(10);
    // Never more than the slip itself, whatever the payload claims.
    expect(normalizeBet({ ...base, totalBetAmount: 5, bonusStake: 50 }, 'acc-1')?.bonusStake).toBe(
      5,
    );
  });

  it('trusts realStake over every other split, in all four shapes it arrives in', () => {
    // All four verbatim from one settled-bets page of a real account.
    const base = { id: 'x', placedDate: '2026-01-01T00:00:00Z' };
    const bonusOf = (raw: Record<string, unknown>): number | undefined =>
      normalizeBet({ ...base, ...raw }, 'acc-1')?.bonusStake;
    // Paid for in full, though it counts towards a bonus wallet's wagering.
    expect(
      bonusOf({ totalBetAmount: 67.37, realStake: 67.37, bonusStake: 0, hasBonusMoney: true }),
    ).toBeUndefined();
    expect(bonusOf({ totalBetAmount: 51, realStake: 27.8, bonusStake: 23.2 })).toBe(23.2);
    // A free bet: nothing left the pocket, and neither split field says so.
    expect(bonusOf({ totalBetAmount: 25, realStake: 0, bonusStake: 0, freeBet: true })).toBe(25);
    expect(bonusOf({ totalBetAmount: 20, realStake: 0, bonusStake: 20 })).toBe(20);
  });

  it('returns null when required fields are missing', () => {
    expect(normalizeBet({}, 'acc-1')).toBeNull();
    expect(normalizeBet({ id: 'x' }, 'acc-1')).toBeNull();
    expect(normalizeBet({ id: 'x', placedDate: '2026-01-01T00:00:00Z' }, 'acc-1')).not.toBeNull();
  });
});

describe('banking transactions', () => {
  // transId is a JS number past 2^53 and already lossy in the raw payload —
  // transIdStr is the only safe id, and getting this wrong silently merges rows.
  const raw = {
    pagination: { next: 'https://x/next', previous: null },
    transactions: [
      {
        transId: 684166713974889700,
        transIdStr: '684166713974889701',
        created: '2026-08-01T23:16:47.197Z',
        completed: '2026-08-01T23:17:08.087Z',
        status: 'Success',
        type: 0,
        currency: 'EUR',
        realAmount: 16,
        debitName: 'MoneyMatrix',
        creditName: 'CasinoWallet',
        productType: 'CasinoRealMoney',
      },
      {
        transIdStr: '684523775111821101',
        created: '2026-08-02T11:05:56.484Z',
        status: 'PendingNotification',
        type: 1,
        currency: 'EUR',
        realAmount: 100,
        creditName: 'MoneyMatrix',
      },
    ],
  };

  const page = parseBanking(raw, 'acc-1');

  it('maps type 0/1 to deposit/withdrawal with positive amounts', () => {
    expect(page.transactions.map((t) => t.kind)).toEqual(['deposit', 'withdrawal']);
    expect(page.transactions.map((t) => t.amount)).toEqual([16, 100]);
  });

  it('keeps the precision-safe id, namespaced against manual entries', () => {
    expect(page.transactions[0]?.id).toBe('bah-684166713974889701');
  });

  it('dates from completion, falling back to creation while still pending', () => {
    expect(page.transactions[0]?.occurredAt).toBe('2026-08-01T23:17:08.087Z');
    expect(page.transactions[1]?.occurredAt).toBe('2026-08-02T11:05:56.484Z');
  });

  it('surfaces a non-final status in the note', () => {
    expect(page.transactions[0]?.note).toBe('MoneyMatrix');
    expect(page.transactions[1]?.note).toBe('MoneyMatrix · PendingNotification');
  });

  it('tags the casino wallet, treating anything unnamed as sportsbook', () => {
    expect(page.transactions.map((t) => t.product)).toEqual(['casino', 'sports']);
  });

  it('exposes the pagination cursor and tolerates junk', () => {
    expect(page.next).toBe('https://x/next');
    expect(parseBanking({}, 'acc-1').transactions).toEqual([]);
    expect(parseBanking(null, 'acc-1').next).toBeNull();
  });
});

describe('parseBalance', () => {
  // Verbatim from the balance response: the wallet is one entry among several.
  const account = { bookmaker: 'bet-at-home' as const, accountId: 'acc-1' };
  const raw = {
    totalAmount: { EUR: 110.07 },
    totalCashAmount: { EUR: 110.07 },
    items: [
      { type: 'Real', amount: 110.07, currency: 'EUR' },
      { type: 'Bonus', amount: 40, currency: 'EUR' },
      { type: 'RealLocked', amount: 0, currency: 'EUR' },
    ],
  };

  it('reads the real wallet and leaves bonus money out of it', () => {
    expect(parseBalance(raw, account)?.amount).toBe(110.07);
    expect(parseBalance(raw, account)?.currency).toBe('EUR');
  });

  it('falls back to the cash total and gives up rather than guessing zero', () => {
    expect(parseBalance({ totalCashAmount: { EUR: 12.5 } }, account)?.amount).toBe(12.5);
    expect(parseBalance({}, account)).toBeNull();
    expect(parseBalance(null, account)).toBeNull();
  });
});
