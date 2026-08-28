import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from './__fixtures__/bets.json';
import walletFixture from './__fixtures__/wallet.json';
import casinoFixture from './__fixtures__/casino-rounds.json';
import { RateLimitedError } from '../../sync/sync';
import { sampleRef } from '../samples';
import {
  couponBonus,
  fetchBaseRates,
  normalizeBet,
  normalizeRound,
  parseBalance,
  parseScopedTotals,
  stake,
} from './adapter';

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
    // The category the tournament hangs off is where it is played.
    expect(acc?.legs.map((l) => l.country)).toContain('England');
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

  it('prices the buy-back off the stake, and only while the slip is open', () => {
    const base = {
      id: 'c1',
      createdAt: '2026-01-01T00:00:00Z',
      amount: 10,
      currency: 'eur',
      active: true,
    };
    expect(normalizeBet({ ...base, cashoutMultiplier: 1.4 }, 'acc-1')?.cashOutValue).toBeCloseTo(
      14,
    );
    // Withdrawn offers arrive as a zero, and a settled slip has nothing to sell.
    expect(normalizeBet({ ...base, cashoutMultiplier: 0 }, 'acc-1')?.cashOutValue).toBeUndefined();
    expect(
      normalizeBet(
        { ...base, active: false, status: 'settled', payout: 0, cashoutMultiplier: 1.4 },
        'acc-1',
      )?.cashOutValue,
    ).toBeUndefined();
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
    tournament: {
      name: 'Premier League',
      category: { name: 'England', sport: { name: 'Soccer' } },
    },
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
  // A row off /transactions/bonuses, where the site labels this type "Coupon".
  const claim = {
    id: '4a6b726e-e8e7-4df5-aed2-ddedb7f78f6f',
    type: 'bonusCode',
    currency: 'sol',
    amount: 0.00039720000476640006,
    createdAt: 'Sat, 08 Aug 2026 13:09:44 GMT',
  };

  it('writes a coupon payment as money already received, like rakeback', () => {
    const bonus = couponBonus(claim, 'acc-1');
    expect(bonus?.id).toBe('stake-coupon-4a6b726e-e8e7-4df5-aed2-ddedb7f78f6f');
    expect(bonus?.name).toBe('Coupon');
    expect(bonus?.status).toBe('released');
    expect(bonus?.currency).toBe('SOL');
    expect(bonus?.wageringRequired).toBe(0);
    // The ledger dates rows the way HTTP does, not the way the rest of the app reads.
    expect(bonus?.grantedAt).toBe('2026-08-08T13:09:44.000Z');
  });

  it('names a drop apart from a code, and drops a row that paid nothing', () => {
    expect(couponBonus({ ...claim, type: 'bonusDrop' }, 'acc-1')?.name).toBe('Coupon drop');
    expect(couponBonus({ ...claim, amount: 0 }, 'acc-1')).toBeNull();
  });
});

describe('stake scoped totals', () => {
  it('sums turnover and result per product and leaves an unknown scope out', () => {
    // Coin amounts differ wildly in worth, so only the priced fields may be added up.
    const totals = parseScopedTotals([
      { betAmount: 33.67, betValue: 4238.57, profitValue: -612.4, currency: 'ltc', scope: 'house' },
      { betAmount: 28.46, betValue: 3269.35, profitValue: 118.2, currency: 'ltc', scope: 'sport' },
      { betAmount: 149.5, betValue: 47.8, profitValue: -12.05, currency: 'doge', scope: 'sport' },
      { betAmount: 1, betValue: 999, profitValue: 999, currency: 'btc', scope: 'poker' },
    ]);
    expect(totals?.wagered?.casino).toBeCloseTo(4238.57);
    expect(totals?.wagered?.sports).toBeCloseTo(3317.15);
    expect(totals?.result?.casino).toBeCloseTo(-612.4);
    expect(totals?.result?.sports).toBeCloseTo(106.15);
  });

  it('reports nothing rather than zero when the site sends none', () => {
    expect(parseScopedTotals([])).toBeUndefined();
    expect(parseScopedTotals(null)).toBeUndefined();
  });
});

/**
 * Stake keeps a wallet per coin, so its balance is the one place a bookmaker's
 * own figures are combined by us rather than by the site. The fixture is the
 * real 174-coin answer, of which four were actually held.
 */
describe('stake balance', () => {
  // USD per unit, as Stake's own price list states them.
  const rates = new Map([
    ['BTC', 113_000],
    ['LTC', 110],
    ['SOL', 160],
    ['DOGE', 0.2],
  ]);
  const balance = parseBalance(walletFixture, rates, sampleRef('stake'));

  it('reports only the coins actually held, richest first', () => {
    expect(balance?.holdings?.map((h) => h.currency)).toEqual(['LTC', 'SOL', 'BTC', 'DOGE']);
  });

  it('leaves the vault out, as the site does in its own header', () => {
    // The fixture's LTC row holds 0.000498… in the vault on top of this.
    expect(balance?.holdings?.[0]?.amount).toBeCloseTo(0.005562004523654822, 18);
  });

  it('adds the holdings up into one figure in one currency', () => {
    const worth =
      0.005562004523654822 * 110 +
      0.0000863500000000128 * 160 +
      2.9233026167339488e-8 * 113_000 +
      7.278615044015169e-9 * 0.2;
    expect(balance?.amount).toBeCloseTo(worth, 4);
    expect(balance?.currency).toBe('USD');
  });

  it('says nothing rather than zero when it cannot price anything', () => {
    expect(parseBalance(walletFixture, new Map(), sampleRef('stake'))).toBeNull();
    expect(parseBalance(null, rates, sampleRef('stake'))).toBeNull();
  });

  it('reports a single-coin wallet unpriced rather than not at all', () => {
    // Nothing to add up, so no price list is needed to state it - and the app's
    // own rate table prices it afterwards. A refused price list used to blank
    // such a wallet, which in turn told the money walk nothing had moved.
    const one = [{ available: { amount: 12.5, currency: 'ltc' }, vault: { amount: 0 } }];
    const balance = parseBalance(one, new Map(), sampleRef('stake'));
    expect(balance?.amount).toBe(12.5);
    expect(balance?.currency).toBe('LTC');
    expect(balance?.holdings).toEqual([{ currency: 'LTC', amount: 12.5 }]);
  });
});

describe('stake GraphQL failures', () => {
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

  // No tab of the site is open, so these calls fall back to the token and a
  // mocked fetch is the whole transport.
  beforeEach(() => {
    vi.stubGlobal('chrome', { tabs: { query: vi.fn().mockResolvedValue([]) } });
  });

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

  it('asks the open tab rather than the worker, whose request carries no cookie', async () => {
    // Stake authenticates with the token and the session cookie at once, and the
    // worker's request never carries the cookie: the wallet was refused while the
    // bet list, content with the token alone, kept importing.
    const worker = vi.fn();
    vi.stubGlobal('fetch', worker);
    const sendMessage = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({ data: { user: { id: 'acc-1' } } }),
    });
    vi.stubGlobal('chrome', {
      tabs: { query: vi.fn().mockResolvedValue([{ id: 7 }]), sendMessage },
    });
    await expect(stake.accountId(creds)).resolves.toBe('acc-1');
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(worker).not.toHaveBeenCalled();
  });

  it('keeps the session when the site refuses the operation rather than the login', async () => {
    // "You are not allowed to do that" is what Stake says to a signed-out visitor
    // and to a signed-in one asking for something in a shape it will not serve.
    // Reading it as an expiry dropped a live token on every run, so the account
    // signed itself back in over and over and the refusal came again.
    answers({ data: null, errors: [{ message: 'You are not allowed to do that.' }] });
    const err = await stake.accountId(creds).then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(err?.name).not.toBe('SessionExpiredError');
    expect(err?.message).toBe('Stake UserId: You are not allowed to do that.');
  });

  it('waits for a tab rather than dropping the session when only the token was sent', async () => {
    // The wallet answers the page and refuses the worker, whose request carries
    // no cookie. Read as an expiry it threw away a live session and paused the
    // deposits for an hour, so they imported only when a tab happened to be open.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' }),
    );
    const err = await stake.accountId(creds).then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(err?.name).toBe('RelayUnavailableError');
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

  it('keeps the last price list when a later read is refused', async () => {
    // Prices an hour old value a wallet to within a fraction of a percent; no
    // prices value it not at all. Dropping them blanked the balance outright.
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    answers({
      data: { currencyConfiguration: { baseRates: [{ currency: 'ltc', baseRate: 110 }] } },
    });
    expect((await fetchBaseRates(creds)).get('LTC')).toBe(110);

    // Past the ten minutes the list is held for, so it is asked for again.
    clock.mockReturnValue(1_000 + 11 * 60_000);
    answers({ data: null, errors: [{ message: 'Cannot query field baseRate.' }] });
    expect((await fetchBaseRates(creds)).get('LTC')).toBe(110);
    clock.mockRestore();
  });
});

describe('casino rounds', () => {
  const raw = casinoFixture.data.user.houseBetList;
  const rounds = raw.flatMap((entry) => normalizeRound(entry, 'acc-1') ?? []);

  it('keeps only the rounds it can state a result for', () => {
    // Seven rows in, four out: one round is still running, one is the racebook,
    // which is not a casino at all, and the live table names no clock of its own.
    expect(rounds).toHaveLength(4);
    expect(rounds.map((r) => r.game)).not.toContain('Horse Racing');
    expect(rounds.map((r) => r.game)).not.toContain('Lightning Roulette');
  });

  it('reads the kind off the type Stake puts on the round', () => {
    expect(rounds.map((r) => r.kind)).toEqual(['originals', 'originals', 'slots', 'provider']);
  });

  it('keeps the round in the coin it was played in', () => {
    expect(rounds[0]?.currency).toBe('SOL');
    expect(rounds[0]?.stake).toBeCloseTo(0.33574873);
    expect(rounds[0]?.payout).toBeCloseTo(0.402898476);
  });

  it('names the studio where Stake names one', () => {
    // Only an outside studio's round carries a provider, and it carries it on
    // the round rather than on the game.
    expect(rounds[3]?.provider).toBe('Hacksaw Gaming');
    expect(rounds[0]?.provider).toBeNull();
  });

  it('dates the round by the site clock, as an ISO timestamp', () => {
    expect(rounds[0]?.playedAt).toBe('2026-01-31T19:42:39.000Z');
  });
});
