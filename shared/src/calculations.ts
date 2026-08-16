import type { Bet, BetLeg } from './types';

/** Net profit/loss of a single bet: payout minus stake. Pending bets have no
 * realized result yet, so they contribute 0 rather than counting as a full
 * stake loss. */
export const profitOf = (bet: Bet): number =>
  bet.status === 'pending' ? 0 : bet.actualReturn - bet.stake;

export const isSettled = (bet: Bet): boolean => bet.status !== 'pending';

/** When the money actually moved. Cash-outs settle at `cashedOutAt`; pending bets
 * have no resolution yet and fall back to placement. */
export const resolutionDate = (bet: Bet): string =>
  bet.settledAt ?? bet.cashedOutAt ?? bet.placedAt;

/** A bet that counts toward win-rate (has a decisive outcome). */
export const isDecisive = (bet: Bet): boolean =>
  bet.status === 'won' || bet.status === 'lost' || bet.status === 'cashed_out';

export const isWin = (bet: Bet): boolean =>
  bet.status === 'won' || (bet.status === 'cashed_out' && profitOf(bet) > 0);

export const isLoss = (bet: Bet): boolean =>
  bet.status === 'lost' || (bet.status === 'cashed_out' && profitOf(bet) <= 0);

export const settledBets = (bets: readonly Bet[]): Bet[] => bets.filter(isSettled);

export const decisiveBets = (bets: readonly Bet[]): Bet[] => bets.filter(isDecisive);

export const totalStaked = (bets: readonly Bet[]): number =>
  bets.reduce((sum, b) => sum + b.stake, 0);

export const totalReturn = (bets: readonly Bet[]): number =>
  bets.reduce((sum, b) => sum + b.actualReturn, 0);

export const totalProfit = (bets: readonly Bet[]): number =>
  bets.reduce((sum, b) => sum + profitOf(b), 0);

/** Stake that actually resolved into a win or loss. Void stakes are refunded and
 * pending stakes have no outcome yet, so neither belongs in an ROI denominator. */
export const resolvedStake = (bets: readonly Bet[]): number =>
  decisiveBets(bets).reduce((sum, b) => sum + b.stake, 0);

/** ROI % = profit / resolved stake * 100. Returns 0 when nothing has resolved. */
export const roi = (bets: readonly Bet[]): number => {
  const staked = resolvedStake(bets);
  if (staked === 0) return 0;
  return (totalProfit(bets) / staked) * 100;
};

/** Win rate % over decisive bets (excludes void & pending). */
export const winRate = (bets: readonly Bet[]): number => {
  const decisive = decisiveBets(bets);
  if (decisive.length === 0) return 0;
  return (decisive.filter(isWin).length / decisive.length) * 100;
};

export const averageOdds = (bets: readonly Bet[]): number => {
  if (bets.length === 0) return 0;
  return bets.reduce((sum, b) => sum + b.odds, 0) / bets.length;
};

/** Average odds weighted by stake - what your money actually rode at, as opposed
 * to `averageOdds` which describes the typical pick regardless of size. */
export const stakeWeightedOdds = (bets: readonly Bet[]): number => {
  const decisive = decisiveBets(bets);
  const staked = decisive.reduce((sum, b) => sum + b.stake, 0);
  if (staked === 0) return 0;
  return decisive.reduce((sum, b) => sum + b.odds * b.stake, 0) / staked;
};

/** Win rate needed to break even at your stake-weighted odds. */
export const breakEvenWinRate = (bets: readonly Bet[]): number => {
  const odds = stakeWeightedOdds(bets);
  return odds === 0 ? 0 : 100 / odds;
};

export const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

/** Sample variance of per-bet profit over settled bets. */
export const variance = (bets: readonly Bet[]): number => {
  const xs = settledBets(bets).map(profitOf);
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((sum, x) => sum + (x - m) ** 2, 0) / (xs.length - 1);
};

export const stdDev = (bets: readonly Bet[]): number => Math.sqrt(variance(bets));

/** Sharpe-like ratio: mean per-bet profit / volatility. */
export const sharpeRatio = (bets: readonly Bet[]): number => {
  const sd = stdDev(bets);
  if (sd === 0) return 0;
  return mean(settledBets(bets).map(profitOf)) / sd;
};

export interface EquityPoint {
  date: string;
  betId: string;
  profit: number;
  cumulative: number;
}

/** Cumulative profit over settled bets, ordered by when each one resolved - a
 * balance curve has to follow cashflow, not the order the bets were placed in. */
export const equityCurve = (bets: readonly Bet[]): EquityPoint[] => {
  const sorted = [...settledBets(bets)].sort((a, b) =>
    resolutionDate(a).localeCompare(resolutionDate(b)),
  );
  let cumulative = 0;
  return sorted.map((b) => {
    const profit = profitOf(b);
    cumulative += profit;
    return { date: resolutionDate(b), betId: b.betId, profit, cumulative };
  });
};

export interface DrawdownInfo {
  /** Largest peak-to-trough fall in cumulative profit, as a positive number. */
  maxDrawdown: number;
  /** How far below the all-time peak you are right now. */
  currentDrawdown: number;
  peak: number;
  troughAt: string | null;
}

export const drawdown = (bets: readonly Bet[]): DrawdownInfo => {
  const curve = equityCurve(bets);
  let peak = 0;
  let maxDrawdown = 0;
  let troughAt: string | null = null;
  let last = 0;

  for (const point of curve) {
    if (point.cumulative > peak) peak = point.cumulative;
    const fall = peak - point.cumulative;
    if (fall > maxDrawdown) {
      maxDrawdown = fall;
      troughAt = point.date;
    }
    last = point.cumulative;
  }

  return { maxDrawdown, currentDrawdown: peak - last, peak, troughAt };
};

export interface LuckInfo {
  /** Wins the odds implied you should get (sum of 1/odds). */
  expectedWins: number;
  actualWins: number;
  /** Positive means you beat the price you took. */
  delta: number;
}

/** Compares hits against what the prices implied. Bookmaker odds already carry
 * margin, so beating them is the honest signal - a raw EV figure against those
 * same odds is zero by construction and would tell you nothing. */
export const luck = (bets: readonly Bet[]): LuckInfo => {
  const decisive = decisiveBets(bets);
  const expectedWins = decisive.reduce((sum, b) => sum + (b.odds > 0 ? 1 / b.odds : 0), 0);
  const actualWins = decisive.filter(isWin).length;
  return { expectedWins, actualWins, delta: actualWins - expectedWins };
};

export interface EdgeConfidence {
  /** Mean profit per unit staked, as a percentage. */
  yield: number;
  /** Spread of that figure under pure chance, as a percentage of stake. */
  stdError: number;
  /** Yield in units of that spread - how far the run sits from break even. */
  tStat: number;
  ciLow: number;
  ciHigh: number;
  sample: number;
  /** True when the 95% interval excludes zero. */
  significant: boolean;
}

/**
 * Is the ROI an edge or is it chance? Puts a 95% interval around the money that
 * came back per unit staked - the same figure `roi` reports, so a card that shows
 * both does not contradict itself.
 *
 * The spread comes from the odds, not from how much the results happened to
 * scatter. A slip staking S at decimal odds o pays S(o-1) with probability 1/o and
 * loses S otherwise, so on its own price it has mean 0 and variance S²(o-1). The
 * sample variance of the results cannot be used here: a run of straight losses, or
 * any run where every slip returned the same share of its stake, has a sample
 * variance of exactly zero and would be reported as a certainty on three slips.
 */
// ponytail: normal approximation (1.96) of a sum of skewed per-slip payouts.
// Fine once a few dozen slips are in; a bootstrap would be the upgrade.
export const edgeConfidence = (bets: readonly Bet[]): EdgeConfidence => {
  const backed = decisiveBets(bets).filter((b) => b.stake > 0);
  const sample = backed.length;
  const empty = {
    yield: 0,
    stdError: 0,
    tStat: 0,
    ciLow: 0,
    ciHigh: 0,
    sample,
    significant: false,
  };
  if (sample === 0) return empty;

  const staked = backed.reduce((sum, b) => sum + b.stake, 0);
  const ratio = backed.reduce((sum, b) => sum + profitOf(b), 0) / staked;
  const chanceVariance = backed.reduce((sum, b) => sum + b.stake ** 2 * Math.max(b.odds - 1, 0), 0);
  // Only reachable when every slip was priced at 1.00 or below, which no book
  // quotes: there is no price to be right or wrong about, so nothing to conclude.
  if (chanceVariance === 0) return { ...empty, yield: ratio * 100 };

  const stdError = Math.sqrt(chanceVariance) / staked;
  const margin = 1.96 * stdError;
  return {
    yield: ratio * 100,
    stdError: stdError * 100,
    tStat: ratio / stdError,
    ciLow: (ratio - margin) * 100,
    ciHigh: (ratio + margin) * 100,
    sample,
    significant: Math.abs(ratio) > margin,
  };
};

/** Profit of one leg backed as a flat 1-unit single. Void/pending return the stake. */
export const flatUnitProfit = (leg: BetLeg): number => {
  if (leg.status === 'won') return (leg.odds ?? 1) - 1;
  if (leg.status === 'lost') return -1;
  return 0;
};

export interface ComboComparison {
  /** Bets with more than one leg. */
  combos: number;
  comboProfit: number;
  /** What the same stake spread evenly over those legs as singles would have made. */
  singlesProfit: number;
  difference: number;
}

/** The accumulator counterfactual: combos multiply margin, so this usually shows
 * what the parlay habit costs. */
export const comboVsSingles = (bets: readonly Bet[]): ComboComparison => {
  const combos = settledBets(bets).filter((b) => b.legs.length > 1);
  let comboProfit = 0;
  let singlesProfit = 0;

  for (const bet of combos) {
    comboProfit += profitOf(bet);
    const perLeg = bet.stake / bet.legs.length;
    for (const leg of bet.legs) singlesProfit += perLeg * flatUnitProfit(leg);
  }

  return {
    combos: combos.length,
    comboProfit,
    singlesProfit,
    difference: comboProfit - singlesProfit,
  };
};

/** Pick accuracy across every leg, independent of how they were bundled. */
export const legHitRate = (bets: readonly Bet[]): { won: number; total: number; rate: number } => {
  let won = 0;
  let total = 0;
  for (const bet of bets) {
    const legs = bet.legs.length > 0 ? bet.legs : [];
    for (const leg of legs) {
      if (leg.status !== 'won' && leg.status !== 'lost') continue;
      total += 1;
      if (leg.status === 'won') won += 1;
    }
  }
  return { won, total, rate: total === 0 ? 0 : (won / total) * 100 };
};

export interface StreakInfo {
  current: number;
  currentType: 'W' | 'L' | null;
  longestWin: number;
  longestLoss: number;
}

/** Streaks over decisive bets, ordered chronologically by settlement time. */
export const streaks = (bets: readonly Bet[]): StreakInfo => {
  const ordered = [...decisiveBets(bets)].sort((a, b) =>
    (a.settledAt ?? a.placedAt).localeCompare(b.settledAt ?? b.placedAt),
  );

  let longestWin = 0;
  let longestLoss = 0;
  let runWin = 0;
  let runLoss = 0;
  for (const b of ordered) {
    if (isWin(b)) {
      runWin += 1;
      runLoss = 0;
      longestWin = Math.max(longestWin, runWin);
    } else {
      runLoss += 1;
      runWin = 0;
      longestLoss = Math.max(longestLoss, runLoss);
    }
  }

  let current = 0;
  let currentType: 'W' | 'L' | null = null;
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    const bet = ordered[i];
    if (bet === undefined) break;
    const win = isWin(bet);
    if (currentType === null) {
      currentType = win ? 'W' : 'L';
      current = 1;
    } else if ((currentType === 'W') === win) {
      current += 1;
    } else {
      break;
    }
  }

  return { current, currentType, longestWin, longestLoss };
};

export interface Summary {
  totalBets: number;
  settledBets: number;
  totalStaked: number;
  /** Stake that resolved - the ROI denominator. */
  resolvedStake: number;
  totalReturn: number;
  totalProfit: number;
  roi: number;
  winRate: number;
  breakEvenWinRate: number;
  averageOdds: number;
}

export const summarize = (bets: readonly Bet[]): Summary => ({
  totalBets: bets.length,
  settledBets: settledBets(bets).length,
  totalStaked: totalStaked(bets),
  resolvedStake: resolvedStake(bets),
  totalReturn: totalReturn(bets),
  totalProfit: totalProfit(bets),
  roi: roi(bets),
  winRate: winRate(bets),
  breakEvenWinRate: breakEvenWinRate(bets),
  averageOdds: averageOdds(bets),
});
