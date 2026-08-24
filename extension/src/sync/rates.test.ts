import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RateTable } from '@betanal/shared';

const stored = {
  rates: {} as RateTable,
  currency: 'EUR',
  bets: [{ currency: 'USD', placedAt: '2024-03-05T10:00:00Z' }],
  balances: [] as { currency: string | null; capturedAt: string }[],
};
let written: RateTable | null = null;

vi.mock('@betanal/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@betanal/shared')>()),
  getAllBets: () => Promise.resolve(stored.bets),
  getAllTransactions: () => Promise.resolve([]),
  getAllBonuses: () => Promise.resolve([]),
  getAllCasinoRounds: () => Promise.resolve([]),
  getAllBalances: () => Promise.resolve(stored.balances),
  getSettings: () => Promise.resolve({ currency: stored.currency }),
  getRates: () => Promise.resolve(stored.rates),
  setRates: (t: RateTable) => {
    written = t;
    return Promise.resolve();
  },
}));

const load = async (): Promise<typeof import('./rates')> => {
  vi.resetModules();
  return import('./rates');
};

/** Only the close matters; the rest of a kline row is padding the reader skips. */
const kline = (day: string, close: number): unknown[] => [
  Date.parse(`${day}T00:00:00Z`),
  '0',
  '0',
  '0',
  String(close),
];

/**
 * `closes` maps a Binance symbol to its daily closes. A symbol left out answers
 * 400, which is how that feed says it does not trade the pair.
 */
const stubFeed = (
  quotes: Record<string, unknown>,
  currencies = ['USD', 'CHF'],
  closes: Record<string, unknown[]> = {},
): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const symbol = /symbol=([A-Z]+)/.exec(url)?.[1];
      if (symbol !== undefined && closes[symbol] === undefined) {
        return Promise.resolve({ ok: false, status: 400 } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            symbol !== undefined
              ? closes[symbol]
              : url.includes('/currencies')
                ? Object.fromEntries(currencies.map((c) => [c, c]))
                : { rates: quotes },
          ),
      } as unknown as Response);
    }),
  );
};

describe('syncRates', () => {
  beforeEach(() => {
    stored.rates = {};
    stored.currency = 'EUR';
    stored.bets = [{ currency: 'USD', placedAt: '2024-03-05T10:00:00Z' }];
    stored.balances = [];
    written = null;
    vi.unstubAllGlobals();
  });

  it('stores a quote the records need', async () => {
    stubFeed({ '2024-03-05': { USD: 1.09 } });
    const { syncRates } = await load();

    expect(await syncRates()).toBe(1);
    expect(written?.['2024-03-05']?.USD).toBe(1.09);
  });

  it('never overwrites a rate it already has', async () => {
    // A revised quote would silently move every number already derived from it.
    stored.rates = { '2024-03-05': { USD: 1.0 } };
    stubFeed({ '2024-03-05': { USD: 9.99 } });
    const { syncRates } = await load();

    expect(await syncRates()).toBe(0);
    expect(written).toBeNull();
  });

  it('asks for nothing when a currency is not quoted by the feed', async () => {
    // Crypto has no ECB reference rate; the coin feed supplies one, or nobody does.
    stubFeed({}, ['CHF']);
    const { syncRates } = await load();

    expect(await syncRates()).toBe(0);
  });

  it('prices a coin with no euro book through the dollar stablecoin', async () => {
    // 1 SOL costs 150 USDT and 1 EUR costs 1.1 USDT, so a euro buys 1.1/150 SOL.
    stored.bets = [{ currency: 'SOL', placedAt: '2024-03-05T10:00:00Z' }];
    stubFeed({}, ['CHF'], {
      EURUSDT: [kline('2024-03-05', 1.1)],
      SOLUSDT: [kline('2024-03-05', 150)],
    });
    const { syncRates } = await load();

    expect(await syncRates()).toBe(1);
    expect(written?.['2024-03-05']?.SOL).toBeCloseTo(1.1 / 150, 12);
  });

  it('quotes the currency a balance was read in', async () => {
    // Without it the header can show a balance it cannot convert.
    stored.bets = [];
    stored.balances = [{ currency: 'CHF', capturedAt: '2024-03-05T10:00:00Z' }];
    stubFeed({ '2024-03-05': { CHF: 0.95 } });
    const { syncRates } = await load();

    expect(await syncRates()).toBe(1);
    expect(written?.['2024-03-05']?.CHF).toBe(0.95);
  });
});
