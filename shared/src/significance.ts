const Z95 = 1.96;

/**
 * P(Z >= z) for a standard normal. Zelen & Severo 26.2.17, error below 7.5e-8 -
 * enough to quote a result as "about 1 in N runs of pure chance".
 */
export const normalTail = (z: number): number => {
  if (!Number.isFinite(z)) return z > 0 ? 0 : 1;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const density = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const tail =
    density *
    t *
    (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? tail : 1 - tail;
};

export interface WilsonInterval {
  /** Lower bound of the 95% interval, as a percentage. */
  low: number;
  /** Upper bound of the 95% interval, as a percentage. */
  high: number;
  /** Interval centre - shrunk toward 50% on small samples, unlike the raw rate. */
  centre: number;
}

/**
 * Wilson score interval for a hit rate. The normal approximation collapses at
 * small n (it can even produce bounds outside 0–100), which is exactly the range
 * a personal betting book lives in, so the closed form is the honest choice.
 */
export const wilson = (successes: number, n: number, z: number = Z95): WilsonInterval => {
  if (n <= 0) return { low: 0, high: 100, centre: 50 };
  const p = successes / n;
  const denom = 1 + z ** 2 / n;
  const centre = (p + z ** 2 / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + z ** 2 / (4 * n ** 2));
  return {
    low: Math.max(0, centre - half) * 100,
    high: Math.min(1, centre + half) * 100,
    centre: centre * 100,
  };
};

/**
 * Whether the rate the bookmaker priced still sits inside what this many results
 * could produce by chance. True means the row has not separated itself from the
 * price yet - not that it holds few bets. How many it takes depends on the odds:
 * a group of even-money picks needs far more of them than a group of 1.05 shots
 * before a gap to the price means anything.
 */
export const withinChance = (low: number, high: number, priced: number): boolean =>
  priced >= low && priced <= high;

/**
 * Prior weight for segment shrinkage, in bets. Kept low deliberately: a personal
 * book runs to hundreds of slips, and the textbook k≈150 would pull every segment
 * onto the global mean and leave nothing to rank.
 */
export const SHRINK_K = 40;

/**
 * Empirical-Bayes shrinkage of a segment's yield toward the overall yield. A
 * one-bet segment reports roughly the global yield instead of ±400%, which makes
 * segments comparable - use it to sort, and show the raw figure to the user.
 */
export const shrunkYield = (
  sample: number,
  segmentYield: number,
  globalYield: number,
  k: number = SHRINK_K,
): number => {
  if (sample <= 0) return globalYield;
  return (sample * segmentYield + k * globalYield) / (sample + k);
};

/**
 * Chance of each possible count of losing legs, given each leg's own implied
 * probability. Poisson-binomial by dynamic programming - legs have different
 * prices, so a plain binomial would be the wrong null.
 * Index i holds P(exactly i legs lose).
 */
export const lossCountDistribution = (lossProbabilities: readonly number[]): number[] => {
  let dist = [1];
  for (const q of lossProbabilities) {
    const next = new Array<number>(dist.length + 1).fill(0);
    for (let i = 0; i < dist.length; i += 1) {
      const prior = dist[i] ?? 0;
      next[i] = (next[i] ?? 0) + prior * (1 - q);
      next[i + 1] = (next[i + 1] ?? 0) + prior * q;
    }
    dist = next;
  }
  return dist;
};

/**
 * P(exactly one leg loses | at least one leg loses). The baseline the observed
 * "one leg killed it" share has to beat before it means anything: on a four-leg
 * builder most losses lose exactly one leg by construction.
 */
export const singleLossShare = (lossProbabilities: readonly number[]): number => {
  const dist = lossCountDistribution(lossProbabilities);
  const noLoss = dist[0] ?? 0;
  const anyLoss = 1 - noLoss;
  if (anyLoss <= 0) return 0;
  return ((dist[1] ?? 0) / anyLoss) * 100;
};
