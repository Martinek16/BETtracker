import { describe, expect, it } from 'vitest';
import { GOOD_LONG_RUN_YIELD_PCT, RELIABLE_SAMPLE_BETS, yieldVerdict } from './benchmarks';

describe('yieldVerdict', () => {
  it('withholds a verdict below the reliable sample', () => {
    expect(yieldVerdict(10, RELIABLE_SAMPLE_BETS - 1, true)).toBe('too-soon');
  });

  it('withholds a verdict when the interval does not clear zero', () => {
    expect(yieldVerdict(10, RELIABLE_SAMPLE_BETS * 2, false)).toBe('too-soon');
  });

  it('bands a proven yield against the market', () => {
    const n = RELIABLE_SAMPLE_BETS;
    expect(yieldVerdict(-2, n, true)).toBe('losing');
    expect(yieldVerdict(GOOD_LONG_RUN_YIELD_PCT - 0.5, n, true)).toBe('break-even');
    expect(yieldVerdict(GOOD_LONG_RUN_YIELD_PCT, n, true)).toBe('winning');
  });
});
