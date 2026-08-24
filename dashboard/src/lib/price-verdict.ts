/**
 * How far short of its price a set of picks has to fall before it is called a
 * loss, as a share of the price. Read relative, not in points: 5pp under a 70%
 * price is a rounding error, 5pp under a 12% price is most of the band gone.
 */
export const SHORTFALL = 0.1;

export type PriceVerdict = 'over' | 'under' | null;

/** Null where the figure is close enough to its price that a colour would lie. */
export const priceVerdict = (hitRate: number, priced: number): PriceVerdict => {
  if (hitRate >= priced) return 'over';
  if (hitRate < priced * (1 - SHORTFALL)) return 'under';
  return null;
};

/** The CSS variable a verdict is drawn in, muted where there is no verdict. */
export const verdictVar = (verdict: PriceVerdict): string =>
  verdict === 'over' ? 'profit' : verdict === 'under' ? 'loss' : 'muted-foreground';
