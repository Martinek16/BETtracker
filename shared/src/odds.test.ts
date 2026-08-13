import { describe, expect, it } from 'vitest';
import { formatOdds } from './odds';

describe('formatOdds', () => {
  it('keeps two decimals by default', () => {
    expect(formatOdds(1.85)).toBe('1.85');
    expect(formatOdds(2)).toBe('2.00');
  });

  it('writes the profit part as a fraction', () => {
    expect(formatOdds(1.85, 'fractional')).toBe('17/20');
    expect(formatOdds(2, 'fractional')).toBe('1/1');
    expect(formatOdds(3.5, 'fractional')).toBe('5/2');
  });

  it('flips sign at evens for the American form', () => {
    expect(formatOdds(2.85, 'american')).toBe('+185');
    expect(formatOdds(2, 'american')).toBe('+100');
    expect(formatOdds(1.5, 'american')).toBe('-200');
  });

  it('falls back to decimals when the price cannot return a profit', () => {
    expect(formatOdds(1, 'american')).toBe('1.00');
    expect(formatOdds(Number.NaN, 'fractional')).toBe('NaN');
  });
});
