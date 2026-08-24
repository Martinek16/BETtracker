import { describe, expect, it } from 'vitest';
import { buildProfitChartScale } from './profit-chart-scale';

describe('buildProfitChartScale', () => {
  it('steps in fractions for an account played at a few cents a round', () => {
    const scale = buildProfitChartScale([-0.02, -0.05, -0.11, -0.18], 'EUR');
    expect(scale).not.toBeNull();
    // The whole run fits inside one euro, so a whole-euro axis would draw it flat.
    expect(scale?.yMin).toBeLessThan(-0.1);
    expect(scale?.yMax).toBe(0);
    // Every tick has to read as its own figure, not as four zeros.
    const labels = scale?.yTicks.map((tick) => scale.formatY(tick)) ?? [];
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('keeps whole units where the account plays in them', () => {
    const scale = buildProfitChartScale([120, -40, 260], 'EUR');
    expect(scale?.yMin).toBe(-100);
    expect(scale?.yMax).toBe(300);
    expect(scale?.yTicks).toEqual([-100, 0, 100, 200, 300]);
  });

  it('holds zero on a grid line whatever the step', () => {
    const scale = buildProfitChartScale([-0.3, 0.45], 'EUR');
    expect(scale?.yTicks).toContain(0);
  });
});
