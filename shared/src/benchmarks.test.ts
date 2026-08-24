import { describe, expect, it } from 'vitest';
import {
  GOOD_LONG_RUN_YIELD_PCT,
  marginGapPp,
  RELIABLE_SAMPLE_BETS,
  yieldVerdict,
} from './benchmarks';

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

describe('marginGapPp', () => {
  it('is zero where nothing is priced', () => {
    expect(marginGapPp(0)).toBeCloseTo(0, 10);
  });

  it('reads a 40% price as a 38.1% shot at a 5% overround', () => {
    // 40 / 1.05 = 38.095..., so par is 1.9pp under the price, not level with it.
    expect(40 + marginGapPp(40)).toBeCloseTo(38.095, 3);
  });

  it('costs a short price more points than a long one', () => {
    expect(Math.abs(marginGapPp(60))).toBeGreaterThan(Math.abs(marginGapPp(20)));
  });
});
