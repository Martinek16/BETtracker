import { describe, expect, it } from 'vitest';
import { convertAmount, convertTransaction, missingRates, rateFor, type RateTable } from './fx';
import type { Transaction } from './types';

const table: RateTable = {
  '2026-03-02': { USD: 1.1, BTC: 0.00002 },
  '2026-03-06': { USD: 1.2, BTC: 0.000025 },
};

const txn = (currency: string, occurredAt: string, amount: number): Transaction => ({
  id: 't1',
  bookmaker: 'stake',
  accountId: 'acc-1',
  kind: 'deposit',
  amount,
  currency,
  occurredAt,
  note: null,
});

describe('rateFor', () => {
  it('treats the base currency as itself without needing a rate', () => {
    expect(rateFor({}, 'EUR', '2026-03-02')).toBe(1);
  });

  it('falls back to the most recent earlier day when the exact day is missing', () => {
    expect(rateFor(table, 'USD', '2026-03-04')).toBe(1.1);
  });

  it('never falls forward onto a rate that did not exist yet', () => {
    expect(rateFor(table, 'USD', '2026-03-01')).toBeNull();
  });

  it('gives up rather than reaching back indefinitely', () => {
    expect(rateFor(table, 'USD', '2026-04-01')).toBeNull();
  });
});

describe('convertAmount', () => {
  it('is the identity when the currency already matches', () => {
    expect(convertAmount(25, 'BTC', '1999-01-01', {}, 'BTC')).toBe(25);
  });

  it('uses the rate of the record date, not the latest one', () => {
    expect(convertAmount(0.00002, 'BTC', '2026-03-02', table, 'EUR')).toBeCloseTo(1, 10);
    expect(convertAmount(0.00002, 'BTC', '2026-03-06', table, 'EUR')).toBeCloseTo(0.8, 10);
  });

  it('converts between two non-base currencies', () => {
    expect(convertAmount(1.1, 'USD', '2026-03-02', table, 'BTC')).toBeCloseTo(0.00002, 10);
  });

  it('returns null instead of an invented total when the rate is unknown', () => {
    expect(convertAmount(10, 'GBP', '2026-03-02', table, 'EUR')).toBeNull();
  });
});

describe('convertTransaction', () => {
  it('rewrites the amount and the currency together', () => {
    const result = convertTransaction(txn('USD', '2026-03-02T10:00:00Z', 110), table, 'EUR');
    expect(result?.amount).toBeCloseTo(100, 10);
    expect(result?.currency).toBe('EUR');
  });

  it('keeps the rate so the original figure can be read back', () => {
    const result = convertTransaction(txn('USD', '2026-03-02T10:00:00Z', 110), table, 'EUR');
    expect(result?.sourceCurrency).toBe('USD');
    expect((result?.amount ?? 0) / (result?.fxRate ?? 1)).toBeCloseTo(110, 10);
  });

  it('says nothing about a source when the record needed no conversion', () => {
    const result = convertTransaction(txn('EUR', '2026-03-02T10:00:00Z', 110), table, 'EUR');
    expect(result?.sourceCurrency).toBeUndefined();
  });

  it('drops the record rather than mis-summing it', () => {
    expect(convertTransaction(txn('GBP', '2026-03-02T10:00:00Z', 110), table, 'EUR')).toBeNull();
  });
});

describe('missingRates', () => {
  it('reports each unmet pair once and skips the ones already covered', () => {
    expect(
      missingRates(
        [
          { currency: 'USD', day: '2026-03-04' },
          { currency: 'GBP', day: '2026-03-04' },
          { currency: 'GBP', day: '2026-03-04' },
        ],
        table,
      ),
    ).toEqual([{ currency: 'GBP', day: '2026-03-04' }]);
  });
});
