import { describe, expect, it } from 'vitest';
import {
  lossCountDistribution,
  normalTail,
  SHRINK_K,
  shrunkYield,
  singleLossShare,
  wilson,
} from './significance';

describe('normalTail', () => {
  it('matches the published tail at the usual cut-offs', () => {
    expect(normalTail(0)).toBeCloseTo(0.5, 6);
    expect(normalTail(1.96)).toBeCloseTo(0.025, 4);
    expect(normalTail(-1.96)).toBeCloseTo(0.975, 4);
    expect(normalTail(2.576)).toBeCloseTo(0.005, 4);
  });

  it('saturates rather than returning NaN at the extremes', () => {
    expect(normalTail(Infinity)).toBe(0);
    expect(normalTail(-Infinity)).toBe(1);
  });
});

describe('wilson', () => {
  it('matches published bounds for 5/10', () => {
    const { low, high, centre } = wilson(5, 10);
    expect(low).toBeCloseTo(23.66, 1);
    expect(high).toBeCloseTo(76.34, 1);
    expect(centre).toBeCloseTo(50, 6);
  });

  it('shrinks the centre toward 50% on a perfect small sample', () => {
    const { low, high, centre } = wilson(1, 1);
    expect(centre).toBeLessThan(100);
    expect(high).toBeLessThanOrEqual(100);
    expect(low).toBeGreaterThanOrEqual(0);
  });

  it('returns the full range with no data', () => {
    expect(wilson(0, 0)).toEqual({ low: 0, high: 100, centre: 50 });
  });

  it('narrows as the sample grows at a fixed rate', () => {
    const small = wilson(50, 100);
    const large = wilson(500, 1000);
    expect(large.high - large.low).toBeLessThan(small.high - small.low);
  });
});

describe('shrunkYield', () => {
  it('reports the global yield for an empty segment', () => {
    expect(shrunkYield(0, 400, 5)).toBe(5);
  });

  it('barely moves off the global yield at n=1', () => {
    expect(shrunkYield(1, 400, 5)).toBeCloseTo((400 + SHRINK_K * 5) / (1 + SHRINK_K), 6);
    expect(shrunkYield(1, 400, 5)).toBeLessThan(20);
  });

  it('converges to the segment yield as n grows', () => {
    expect(shrunkYield(100_000, 40, 5)).toBeCloseTo(40, 1);
  });
});

describe('lossCountDistribution', () => {
  it('is a point mass at zero with no legs', () => {
    expect(lossCountDistribution([])).toEqual([1]);
  });

  it('sums to one and has length legs+1', () => {
    const dist = lossCountDistribution([0.3, 0.5, 0.2, 0.9]);
    expect(dist).toHaveLength(5);
    expect(dist.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it('reduces to the binomial when every leg shares a price', () => {
    const dist = lossCountDistribution([0.5, 0.5, 0.5]);
    expect(dist).toEqual([0.125, 0.375, 0.375, 0.125]);
  });
});

describe('singleLossShare', () => {
  it('is 100% when exactly one leg can lose', () => {
    expect(singleLossShare([1, 0, 0])).toBeCloseTo(100, 10);
  });

  it('is zero when no leg can lose', () => {
    expect(singleLossShare([0, 0])).toBe(0);
  });

  it('is high by construction on a four-leg builder with good legs', () => {
    // 30% loss per leg: most losing slips lose exactly one — the baseline the
    // observed "one leg killed it" share has to beat.
    expect(singleLossShare([0.3, 0.3, 0.3, 0.3])).toBeGreaterThan(50);
  });
});
