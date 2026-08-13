import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from './__fixtures__/bets.json';
import { RateLimitedError } from '../../sync/sync';
import { couponBonus, normalizeBet, parseWagered, stake } from './adapter';

/** Real `sportBetList` entries, lifted out of a recorded stake.com page load. */
const raw = fixture.data.user.sportBetList.map((entry) => entry.bet);
const bets = raw.map((b) => normalizeBet(b, 'acc-1'));

describe('stake adapter', () => {
  it('parses every fixture bet', () => {
    expect(bets.every((b) => b !== null)).toBe(true);
    expect(bets.length).toBe(4);
  });

  it('reads the outcome from the payout, not the status word', () => {
    // Stake settles every slip to status "settled"; only the payout says which way.
    expect(raw.every((b) => b.status === 'settled')).toBe(true);
    expect(bets.filter((b) => b?.status === 'won').length).toBe(2);
    expect(bets.filter((b) => b?.status === 'lost').length).toBe(2);
  });

  it('keeps amounts in the coin they were staked in', () => {
    for (const bet of bets) {
      expect(bet?.currency).toBe('LTC');
      expect(bet?.stake).toBeGreaterThan(0);
    }
  });

  it('separates singles from accumulators by leg count', () => {
    const single = bets.find((b) => b?.legs.length === 1);
    const acc = bets.find((b) => (b?.legs.length ?? 0) > 1);
    expect(single?.betType).toBe('single');
    expect(acc?.betType).toBe('accumulator');
  });

  it('carries sport, event and odds down to each leg', () => {
    const acc = bets.find((b) => b?.legs.length === 10);
    expect(acc?.sport).toBe('Soccer');
    expect(acc?.legs.every((l) => l.event !== null && l.odds !== null)).toBe(true);
    // A voided leg must not be reported as a loss on the slip's own breakdown.
    expect(acc?.legs.filter((l) => l.status === 'void').length).toBe(3);
  });

  it('stamps ids and timestamps the rest of the app can rely on', () => {
    for (const bet of bets) {
      expect(bet?.betId.startsWith('stake-')).toBe(true);
      expect(bet?.placedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
      expect(bet?.settledAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    }
  });

  it('marks a promotion slip as staked from bonus money, whole', () => {
    const base = { id: 'p1', createdAt: '2026-01-01T00:00:00Z', amount: 8, currency: 'eur' };
    expect(normalizeBet(base, 'acc-1')?.bonusStake).toBeUndefined();
    expect(
      normalizeBet({ ...base, promotionBet: { __typename: 'SportsbookPromotionBet' } }, 'acc-1')
        ?.bonusStake,
    ).toBe(8);
  });

  it('returns null instead of a half-built bet when ids are missing', () => {
    expect(normalizeBet({ amount: 1, currency: 'ltc' }, 'acc-1')).toBeNull();
  });
});

/**
 * The other two bet products describe a leg in their own shape, so each has to be
 * folded into the same one. Before they were, their slips reached the dashboard
 * with a stake and an id and nothing that named a match.
 */
describe('stake bet products other than SportBet', () => {
  const fixture = {
    id: 'f1',
    name: 'Chelsea - Arsenal',
    data: { startTime: '2026-02-01T20:00:00Z' },
    tournament: { name: 'Premier League', category: { name: 'England', sport: { name: 'Soccer' } } },
  };

  it('reads a player prop off the stat, the competitor and the line', () => {
    const bet = normalizeBet(
      {
        __typename: 'SwishBet',
        id: 's1',
        createdAt: '2026-02-01T18:00:00Z',
        amount: 5,
        currency: 'eur',
        swishStatus: 'settled',
        swishOutcomes: [
          {
            odds: 1.85,
            lineType: 'over',
            outcome: { name: 'C. Palmer', line: 1.5 },
            market: { stat: { name: 'Shots on target' }, game: { fixture } },
          },
        ],
      },
      'acc-1',
    );
    expect(bet?.event).toBe('Chelsea - Arsenal');
    expect(bet?.sport).toBe('Soccer');
    expect(bet?.marketType).toBe('Shots on target');
    expect(bet?.selection).toBe('C. Palmer over 1.5');
    expect(bet?.legs[0]?.odds).toBe(1.85);
  });

  it('takes an X-multi leg from the last price it was struck at', () => {
    const bet = normalizeBet(
      {
        __typename: 'SportsbookXMultiBet',
        id: 'x1',
        createdAt: '2026-02-01T18:00:00Z',
        amount: 5,
        currency: 'eur',
        xStatus: 'settled',
        xOutcomes: [
          {
            result: { status: 'won' },
            prices: [
              { marketName: '1x2', odds: 2.4, outcome: { name: 'Chelsea' } },
              { marketName: '1x2', odds: 2.1, outcome: { name: 'Chelsea' } },
            ],
            fixture,
          },
          {
            result: { status: 'lost' },
            prices: [{ marketName: 'Total', odds: 1.9, outcome: { name: 'Over 2.5' } }],
            // A player-prop leg wraps the match one level deeper.
            fixture: { fixture },
          },
        ],
      },
      'acc-1',
    );
    expect(bet?.betType).toBe('accumulator');
    expect(bet?.legs.map((l) => l.odds)).toEqual([2.1, 1.9]);
    expect(bet?.legs.map((l) => l.status)).toEqual(['won', 'lost']);
    expect(bet?.legs.every((l) => l.event === 'Chelsea - Arsenal')).toBe(true);
    expect(bet?.marketType).toBe('1x2');
  });
});

describe('stake coupons', () => {
  const claim = {
    amount: 5,
    currency: 'ltc',
    claimedAt: '2026-07-01T10:00:00Z',
    redeemed: true,
    bonusCode: { id: 'c1', code: 'WELCOME', expiresAt: '2026-09-01T00:00:00Z' },
  };

  it('keys a redeemed code by the code it was claimed from', () => {
    const bonus = couponBonus(claim, 'acc-1');
    expect(bonus?.id).toBe('stake-coupon-c1');
    expect(bonus?.name).toBe('WELCOME');
    expect(bonus?.status).toBe('released');
    expect(bonus?.currency).toBe('LTC');
  });

  it('holds an unredeemed claim as still active, and drops a claim with no code', () => {
    expect(couponBonus({ ...claim, redeemed: false }, 'acc-1')?.status).toBe('active');
    expect(couponBonus({ ...claim, bonusCode: null }, 'acc-1')).toBeNull();
  });
});

describe('stake wagered totals', () => {
  it('sums turnover per product and leaves an unknown scope out', () => {
    // Coin amounts differ wildly in worth, so only `betValue` may be added up.
    const wagered = parseWagered([
      { betAmount: 33.67, betValue: 4238.57, currency: 'ltc', scope: 'house' },
      { betAmount: 28.46, betValue: 3269.35, currency: 'ltc', scope: 'sport' },
      { betAmount: 149.5, betValue: 47.8, currency: 'doge', scope: 'sport' },
      { betAmount: 1, betValue: 999, currency: 'btc', scope: 'poker' },
    ]);
    expect(wagered?.casino).toBeCloseTo(4238.57);
    expect(wagered?.sports).toBeCloseTo(3317.15);
  });

  it('reports no turnover rather than zero when the site sends none', () => {
    expect(parseWagered([])).toBeUndefined();
    expect(parseWagered(null)).toBeUndefined();
  });
});

describe('stake GraphQL failures', () => {
  // An access token keeps the request in the worker, so a mocked fetch is the
  // whole transport; without one the call is relayed through a tab instead.
  const creds = {
    bookmaker: 'stake',
    fields: { apiBase: 'https://stake.com', accessToken: 't' },
  } as const;

  const answers = (body: unknown): void => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body }),
    );
  };

  afterEach(() => vi.unstubAllGlobals());

  it('keeps the fields that resolved when only some of them failed', async () => {
    // GraphQL reports per-field failures beside the data that did come back.
    // Discarding the answer over one unreadable field threw away whole pages of
    // bets and left the account reading as failed.
    answers({
      data: { user: { id: 'acc-1' } },
      errors: [{ message: 'Cannot read outcomes of bet 9' }],
    });
    await expect(stake.accountId(creds)).resolves.toBe('acc-1');
  });

  it('backs off instead of retrying when the site asks it to wait', async () => {
    answers({ data: null, errors: [{ message: 'Please try again in a few minutes.' }] });
    await expect(stake.accountId(creds)).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('says a repeated refusal once rather than once per field', async () => {
    // A throttled page of fifty bets came back as the same sentence fifty times,
    // which is what filled the log with thousand-character lines.
    answers({
      data: null,
      errors: Array.from({ length: 44 }, () => ({ message: 'This action is not available.' })),
    });
    const err = await stake.accountId(creds).then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(err?.message).toBe('Stake UserId: This action is not available.');
  });
});
