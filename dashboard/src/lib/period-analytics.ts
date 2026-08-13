import {
  comboSizeBands,
  comboVsSingles,
  drawdown,
  edgeConfidence,
  groupBy,
  groupSelectionsBy,
  habitLeaks,
  legHitRate,
  luck,
  profitOf,
  resolutionDate,
  selectionLeaks,
  selectionsOf,
  sharpeRatio,
  stdDev,
  streaks,
  summarize,
  totalStaked,
  type Bet,
} from '@betanal/shared';
import type { GroupStats, HabitLeaks, SelectionStats } from '@betanal/shared';

export interface StatusBreakdown {
  won: number;
  lost: number;
  pending: number;
  void: number;
  cashed_out: number;
}

export interface HighlightBet {
  profit: number;
  label: string;
  legCount: number;
  legLines: string[];
  odds: number;
  stake: number;
}

/** A single calendar day's settled result, used for the best/worst day rows. */
export interface DayResult {
  date: string;
  profit: number;
  bets: number;
}

/** One leg singled out for the highlights, with no money attached to it. */
export interface PickHighlight {
  label: string;
  event: string;
  odds: number;
}

export interface PeriodAnalytics {
  summary: ReturnType<typeof summarize>;
  streak: ReturnType<typeof streaks>;
  drawdown: ReturnType<typeof drawdown>;
  luck: ReturnType<typeof luck>;
  edge: ReturnType<typeof edgeConfidence>;
  legs: ReturnType<typeof legHitRate>;
  combo: ReturnType<typeof comboVsSingles>;
  betTypes: GroupStats[];
  status: StatusBreakdown;
  pendingStake: number;
  avgStake: number;
  biggestWin: HighlightBet | null;
  biggestLoss: HighlightBet | null;
  leaks: HabitLeaks;
  /** The same scan over individual picks. Profit is in flat units, not currency. */
  pickLeaks: HabitLeaks;
  comboBands: GroupStats[];
  selectionSplit: GroupStats[];
  /** Hit rates for favourites and underdogs judged pick by pick. */
  pickSplit: SelectionStats[];
  /** Mean 1/odds across decided picks: what the bookmaker priced them at. */
  meanImplied: number;
  bestDay: DayResult | null;
  worstDay: DayResult | null;
  bestPick: PickHighlight | null;
  worstPick: PickHighlight | null;
  /** Mean profit of a slip that won, and mean loss of one that didn't. */
  avgWin: number;
  avgLoss: number;
  /** Mean legs on a slip, and the mean price of a decided pick. */
  picksPerSlip: number;
  meanOdds: number;
  sharpe: number;
  volatility: number;
  yieldPerBet: number;
}

import { betDisplayTitle, betLegLines } from '@/lib/bet-display';

/** The best and worst settled day, by profit. Local date, so it matches the axis. */
const dayExtremes = (bets: readonly Bet[]): { best: DayResult | null; worst: DayResult | null } => {
  const byDay = new Map<string, DayResult>();
  for (const bet of bets) {
    if (bet.status === 'pending') continue;
    const date = resolutionDate(bet).slice(0, 10);
    const day = byDay.get(date) ?? { date, profit: 0, bets: 0 };
    day.profit += profitOf(bet);
    day.bets += 1;
    byDay.set(date, day);
  }

  let best: DayResult | null = null;
  let worst: DayResult | null = null;
  for (const day of byDay.values()) {
    if (best === null || day.profit > best.profit) best = day;
    if (worst === null || day.profit < worst.profit) worst = day;
  }
  return { best, worst };
};

/**
 * The longest-priced pick that came in, and the shortest-priced one that did
 * not — the two picks a bettor actually remembers. Both are legs, so neither
 * carries money: a leg of a combo never had a stake of its own.
 */
const pickExtremes = (
  bets: readonly Bet[],
): {
  best: PickHighlight | null;
  worst: PickHighlight | null;
  meanImplied: number;
  meanOdds: number;
} => {
  let best: PickHighlight | null = null;
  let worst: PickHighlight | null = null;
  let impliedSum = 0;
  let oddsSum = 0;
  let decided = 0;

  for (const sel of selectionsOf(bets)) {
    const { leg, odds } = sel;
    if (leg.status !== 'won' && leg.status !== 'lost') continue;
    decided += 1;
    impliedSum += 1 / odds;
    oddsSum += odds;

    const pick: PickHighlight = {
      label: leg.selection ?? leg.marketType ?? 'Unknown',
      event: leg.event ?? '',
      odds,
    };
    if (leg.status === 'won' && (best === null || odds > best.odds)) best = pick;
    if (leg.status === 'lost' && (worst === null || odds < worst.odds)) worst = pick;
  }

  return {
    best,
    worst,
    meanImplied: decided === 0 ? 0 : (impliedSum / decided) * 100,
    meanOdds: decided === 0 ? 0 : oddsSum / decided,
  };
};

export const analyzePeriod = (bets: readonly Bet[]): PeriodAnalytics => {
  const summary = summarize(bets);
  const streak = streaks(bets);
  const status: StatusBreakdown = { won: 0, lost: 0, pending: 0, void: 0, cashed_out: 0 };

  let pendingStake = 0;
  let biggestWin: HighlightBet | null = null;
  let biggestLoss: HighlightBet | null = null;
  let winSum = 0;
  let winCount = 0;
  let lossSum = 0;
  let lossCount = 0;
  let legCount = 0;

  for (const bet of bets) {
    status[bet.status] += 1;
    legCount += Math.max(1, bet.legs.length);
    if (bet.status === 'pending') pendingStake += bet.stake;

    if (bet.status === 'pending') continue;
    const p = profitOf(bet);
    if (p > 0) {
      winSum += p;
      winCount += 1;
    } else if (p < 0) {
      lossSum += p;
      lossCount += 1;
    }
    const highlight: HighlightBet = {
      profit: p,
      label: betDisplayTitle(bet),
      legCount: bet.legs.length,
      legLines: betLegLines(bet),
      odds: bet.odds,
      stake: bet.stake,
    };
    if (biggestWin === null || p > biggestWin.profit) biggestWin = highlight;
    if (biggestLoss === null || p < biggestLoss.profit) biggestLoss = highlight;
  }

  const days = dayExtremes(bets);
  const picks = pickExtremes(bets);

  return {
    summary,
    streak,
    drawdown: drawdown(bets),
    luck: luck(bets),
    edge: edgeConfidence(bets),
    legs: legHitRate(bets),
    combo: comboVsSingles(bets),
    betTypes: groupBy(bets, 'betType').filter((g) => g.bets > 0),
    status,
    pendingStake,
    avgStake: bets.length > 0 ? totalStaked(bets) / bets.length : 0,
    biggestWin,
    biggestLoss,
    leaks: habitLeaks(bets),
    pickLeaks: selectionLeaks(bets),
    comboBands: comboSizeBands(bets),
    selectionSplit: groupBy(bets, 'selectionType'),
    pickSplit: groupSelectionsBy(bets, 'selectionType'),
    meanImplied: picks.meanImplied,
    bestDay: days.best,
    worstDay: days.worst,
    bestPick: picks.best,
    worstPick: picks.worst,
    avgWin: winCount === 0 ? 0 : winSum / winCount,
    avgLoss: lossCount === 0 ? 0 : lossSum / lossCount,
    picksPerSlip: bets.length === 0 ? 0 : legCount / bets.length,
    meanOdds: picks.meanOdds,
    sharpe: sharpeRatio(bets),
    volatility: stdDev(bets),
    yieldPerBet: bets.length > 0 ? summary.totalProfit / bets.length : 0,
  };
};
