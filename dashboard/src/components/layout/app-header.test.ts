import { describe, expect, it } from 'vitest';
import { worthReading } from '@/components/layout/app-header';

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
});
