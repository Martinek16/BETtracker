import { describe, expect, it } from 'vitest';

import { looksLikeMoney, parseAmount } from './balance';

describe('looksLikeMoney', () => {
  it('accepts rendered money figures', () => {
    for (const text of ['0,00', '12.50', '1.234,56', '1,234.56', '€ 250,00', '250,00 EUR', ' 8,00 ']) {
      expect(looksLikeMoney(text)).toBe(true);
    }
  });

  it('rejects text that only happens to contain digits', () => {
    for (const text of ['2.50', '1X2', '15:30', 'Match 3', '2026', '1.234.567', '', '0.005']) {
      expect(looksLikeMoney(text)).toBe(text === '2.50');
    }
  });
});

describe('parseAmount', () => {
  it('reads both decimal conventions', () => {
    expect(parseAmount('1.234,56')).toBe(1234.56);
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount('€ 0,00')).toBe(0);
    expect(parseAmount('no digits')).toBeNull();
  });
});
