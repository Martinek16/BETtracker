import { describe, expect, it } from 'vitest';
import { smallMoney, worthReading } from './utils';

describe('worthReading', () => {
  it('drops a holding that prints as zero in the display currency', () => {
    expect(worthReading(0, 'EUR')).toBe(false);
    expect(worthReading(0.004, 'EUR')).toBe(false);
    expect(worthReading(-0.001, 'EUR')).toBe(false);
  });

  it('keeps anything the display currency can still write', () => {
    expect(worthReading(0.01, 'EUR')).toBe(true);
    expect(worthReading(12.5, 'EUR')).toBe(true);
    expect(worthReading(-3, 'EUR')).toBe(true);
  });

  it('asks the display currency, not a fixed number of places', () => {
    // The yen has no cents, so a fraction of one is not worth a row.
    expect(worthReading(0.4, 'JPY')).toBe(false);
    expect(worthReading(1, 'JPY')).toBe(true);
  });

  it('reads a coin at the places a coin is written to', () => {
    // Dust a wallet still shows, against dust nothing can write at all.
    expect(worthReading(8.28e-9, 'BTC')).toBe(true);
    expect(worthReading(1e-10, 'BTC')).toBe(false);
  });
});

describe('money too small to print', () => {
  it('says a reward is there rather than rounding it away', () => {
    // Rakeback arrives as coin dust: a real amount worth a tenth of a cent.
    expect(smallMoney(0.0008, 'EUR')).toBe('< 0,01 €');
  });

  it('prints anything that reaches a cent as itself', () => {
    expect(smallMoney(0.01, 'EUR')).toBe('0,01 €');
    expect(smallMoney(4.12, 'EUR')).toBe('4,12 €');
  });

  it('leaves nothing as nothing', () => {
    expect(smallMoney(0, 'EUR')).toBe('0,00 €');
  });
});
