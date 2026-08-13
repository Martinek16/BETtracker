/** How a price is written. Lives here because it is a persisted setting. */
export type OddsFormat = 'decimal' | 'fractional' | 'american';

/** Largest denominator a bookmaker would print, so 17/20 stays but 173/204 does not. */
const MAX_DENOMINATOR = 100;

/**
 * Closest p/q to the profit part of a decimal price. Brute force over every
 * denominator: 100 divisions is cheaper than being clever, and the smallest
 * denominator wins ties so 2.00 reads 1/1 rather than 2/2.
 */
const toFraction = (profit: number): string => {
  let best = { num: 1, den: 1, error: Number.POSITIVE_INFINITY };
  for (let den = 1; den <= MAX_DENOMINATOR; den += 1) {
    const num = Math.round(profit * den);
    const error = Math.abs(profit - num / den);
    if (error < best.error - 1e-9) best = { num, den, error };
  }
  return `${String(best.num)}/${String(best.den)}`;
};

/**
 * Odds below evens are written as the stake needed to win 100, which is what
 * makes the American form negative there.
 */
const toAmerican = (odds: number): string => {
  const profit = odds - 1;
  if (profit <= 0) return '—';
  if (profit >= 1) return `+${String(Math.round(profit * 100))}`;
  return `-${String(Math.round(100 / profit))}`;
};

export const formatOdds = (odds: number, format: OddsFormat = 'decimal'): string => {
  if (!Number.isFinite(odds) || odds <= 1) return odds.toFixed(2);
  if (format === 'fractional') return toFraction(odds - 1);
  if (format === 'american') return toAmerican(odds);
  return odds.toFixed(2);
};
