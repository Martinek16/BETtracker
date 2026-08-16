/**
 * Public reference points a personal betting record is worth comparing against.
 * Own numbers alone cannot say whether a result is good - these say what the rest
 * of the market achieves.
 */

/**
 * Overround a recreational bookmaker builds into a market, in percent of stake.
 * Recreational books run 5–10%, sharp books and exchanges 2–3%; 5% is the usual
 * figure quoted for mainstream football at an online bookmaker.
 */
export const TYPICAL_BOOKMAKER_MARGIN_PCT = 5;

/** Sustained yield that counts as a winning bettor. Published ranges put it at 3–7%. */
export const GOOD_LONG_RUN_YIELD_PCT = 3;

/** Share of bettors that profits over the long run, in percent. Commonly cited as 3–5%. */
export const PROFITABLE_BETTOR_SHARE_PCT = 5;

/**
 * Settled bets before a yield figure is worth reading as a verdict. Published
 * guidance runs from several hundred to 1000+; 500 is the low end of honest.
 */
export const RELIABLE_SAMPLE_BETS = 500;

export type YieldVerdict = 'too-soon' | 'losing' | 'break-even' | 'winning';

/**
 * Where a yield sits against the market, not against zero. Needs both a large
 * enough sample and an interval that clears zero before it will call anything.
 */
export const yieldVerdict = (
  yieldPct: number,
  sample: number,
  significant: boolean,
): YieldVerdict => {
  if (!significant || sample < RELIABLE_SAMPLE_BETS) return 'too-soon';
  if (yieldPct < 0) return 'losing';
  if (yieldPct < GOOD_LONG_RUN_YIELD_PCT) return 'break-even';
  return 'winning';
};
