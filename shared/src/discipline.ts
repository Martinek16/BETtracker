import type { Bet } from './types';
import { decisiveBets, isWin, profitOf, resolutionDate } from './calculations';

export interface TiltSide {
  bets: number;
  meanStake: number;
  roi: number;
}

export interface TiltCheck {
  afterLoss: TiltSide;
  afterWin: TiltSide;
  /** Percent difference in mean stake after a loss vs after a win. */
  stakeLift: number;
  sample: number;
}

const sideOf = (bets: readonly Bet[]): TiltSide => {
  if (bets.length === 0) return { bets: 0, meanStake: 0, roi: 0 };
  const staked = bets.reduce((sum, b) => sum + b.stake, 0);
  const profit = bets.reduce((sum, b) => sum + profitOf(b), 0);
  return {
    bets: bets.length,
    meanStake: staked / bets.length,
    roi: staked === 0 ? 0 : (profit / staked) * 100,
  };
};

/**
 * Does a loss make you bet bigger? Each bet is bucketed by the outcome of the
 * last result the user had actually seen when they placed it — the most recent
 * *other* bet that had already settled — not by position in the list, which
 * would credit them with results they could not yet know.
 */
export const tiltCheck = (bets: readonly Bet[]): TiltCheck => {
  const decisive = [...decisiveBets(bets)].sort((a, b) => a.placedAt.localeCompare(b.placedAt));
  // ponytail: O(n²) predecessor scan. A personal book is hundreds of bets; sort
  // the settle times and sweep if it ever gets slow.
  const afterLoss: Bet[] = [];
  const afterWin: Bet[] = [];

  for (const bet of decisive) {
    let latest: Bet | null = null;
    for (const other of decisive) {
      if (other === bet) continue;
      const settled = resolutionDate(other);
      if (settled >= bet.placedAt) continue;
      if (latest === null || settled > resolutionDate(latest)) latest = other;
    }
    if (latest === null) continue;
    (isWin(latest) ? afterWin : afterLoss).push(bet);
  }

  const loss = sideOf(afterLoss);
  const win = sideOf(afterWin);

  return {
    afterLoss: loss,
    afterWin: win,
    stakeLift: win.meanStake === 0 ? 0 : (loss.meanStake / win.meanStake - 1) * 100,
    sample: loss.bets + win.bets,
  };
};
