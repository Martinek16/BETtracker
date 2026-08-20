import type { Bet } from './types';
import { groupBy, type GroupStats, type LegDimension, type SlipDimension } from './dimensions';
import { groupSelectionsBy } from './selections';
import { OTHER_MARKETS } from './markets';

/** One betting habit, phrased so it can be read straight off the screen. */
export interface Habit {
  label: string;
  profit: number;
  bets: number;
  winRate: number;
  /** Profit per 1 staked: −0.6 means 40 cents of every 1 came back. */
  unitsPerBet: number;
  /** One bet made most of the figure, so it reads as a result, not a habit. */
  driven: boolean;
}

export interface HabitLeaks {
  worst: Habit[];
  best: Habit[];
}

/** Dimensions that describe a decision the bettor can actually change. */
/**
 * The day or hour a slip was placed is left out on purpose: "you bet on
 * Wednesdays" names when the betting happened, not a choice that can be bet
 * differently next time.
 */
const SCANNED: readonly SlipDimension[] = [
  'legCount',
  'isLive',
  'sport',
  'league',
  'slipOdds',
  'stakeBand',
  'exit',
];

const legCountLabel = (key: string): string => {
  if (key === '1') return 'Single bets';
  if (key === '5+') return 'Combos with 5+ legs';
  return `${key}-leg combos`;
};

const labelFor = (dimension: SlipDimension, key: string): string => {
  switch (dimension) {
    case 'legCount':
      return legCountLabel(key);
    case 'isLive':
      return key === 'In-play' ? 'Live betting' : 'Pre-match betting';
    case 'slipOdds':
      return `Odds ${key}`;
    case 'stakeBand':
      return `Stakes of ${key}`;
    case 'exit':
      return key === 'Cashed out' ? 'Cashing out early' : 'Slips held to the end';
    default:
      return key;
  }
};

/**
 * A group holding nearly every bet is not a habit - "Pre-match betting −€180"
 * when 100% of the bets are pre-match is the period total wearing a label. Only
 * groups the bettor could actually bet less of are worth naming.
 */
const DOMINANT_SHARE = 0.8;

interface Candidate extends Habit {
  dimension: string;
}

/**
 * Groups are ranked by what came back on every 1 staked. Ranking on the money
 * total only ever puts the biggest stakes on top, so the sport that was bet in
 * €100 slips would outrank the one bet in €5 slips at exactly the same skill.
 * The money still travels with every row as `profit`, and the checks below keep
 * a group that is one slip or nearly the whole period out of the list.
 */
const cost = (c: Candidate): number => c.unitsPerBet;

/**
 * Keep the strongest row per dimension. Without this the list happily fills up
 * with three views of the same losing bets ("5+ legs", "odds 5.00+", "live"),
 * which reads like three problems when it is one.
 */
const topPerDimension = (candidates: Candidate[], limit: number): Habit[] => {
  const seen = new Set<string>();
  const first: Candidate[] = [];
  const rest: Candidate[] = [];
  for (const c of candidates) {
    if (seen.has(c.dimension)) rest.push(c);
    else {
      seen.add(c.dimension);
      first.push(c);
    }
  }
  // One per dimension first, then the strongest leftovers: a short list is worse
  // than a second sport, and the rest are already sorted worst-first.
  return [...first, ...rest].slice(0, limit).map((c) => ({
    label: c.label,
    profit: c.profit,
    bets: c.bets,
    winRate: c.winRate,
    unitsPerBet: c.unitsPerBet,
    driven: c.driven,
  }));
};

/** A single bet holding this much of a group's swing makes it a result, not a habit. */
const DRIVEN_SHARE = 0.5;

/**
 * Worst-first for `sign = 1`, best-first for `sign = -1`, with one-bet groups
 * always behind the rest: a group carried by a single slip is a story about that
 * slip, and putting it on top would send the reader after a pattern that is not
 * there.
 */
const ranked =
  (sign: 1 | -1) =>
  (a: Candidate, b: Candidate): number =>
    Number(a.driven) - Number(b.driven) || sign * (cost(a) - cost(b));

const toCandidate =
  (dimension: SlipDimension) =>
  (g: GroupStats): Candidate => ({
    dimension,
    label: labelFor(dimension, g.key),
    profit: g.profit,
    bets: g.bets,
    winRate: g.winRate,
    // The money that came back, not the average slip: a group of ten €5 slips and
    // one €200 slip is read the way the account felt it.
    unitsPerBet: g.roi / 100,
    // Either measure alone misses a case: stake swing misses one huge slip beside
    // small ones, money share misses one lucky small slip at long odds.
    driven: g.topSwingShare > DRIVEN_SHARE || g.topMoneyShare > DRIVEN_SHARE,
  });

/**
 * The habits costing and making the most money, across every dimension at once.
 *
 * `minBets` guards against a two-bet sport topping the list on noise alone; it
 * is a readability floor, not a significance test.
 */
export const habitLeaks = (bets: readonly Bet[], minBets = 5, limit = 3): HabitLeaks => {
  const candidates = SCANNED.flatMap((dimension) =>
    groupBy(bets, dimension)
      .filter(
        (g) =>
          g.bets >= minBets &&
          g.bets <= bets.length * DOMINANT_SHARE &&
          g.key !== 'Mixed' &&
          g.key !== 'Unknown',
      )
      .map(toCandidate(dimension)),
  );

  return {
    worst: topPerDimension(candidates.filter((c) => c.profit < 0).sort(ranked(1)), limit),
    best: topPerDimension(candidates.filter((c) => c.profit > 0).sort(ranked(-1)), limit),
  };
};

/**
 * The family rather than the book's own market name: "Over/Under 2.5" and
 * "Over/Under 3.5" are one habit priced at two numbers, and scanned apart neither
 * of them ever reaches the minimum to be named at all. Same grouping the
 * breakdowns read markets at.
 */
const SCANNED_LEGS: readonly LegDimension[] = ['sport', 'marketFamily', 'oddsBracket', 'isLive'];

const legLabelFor = (dimension: LegDimension, key: string): string => {
  switch (dimension) {
    case 'oddsBracket':
      return `Odds ${key}`;
    case 'isLive':
      return key === 'In-play' ? 'Live picks' : 'Pre-match picks';
    default:
      return key;
  }
};

/**
 * The same scan one level down, over individual selections instead of slips.
 *
 * `profit` here is in flat 1-unit stakes, not currency: a leg of a combo never
 * had money of its own, so any € figure would be invented. Callers must label it
 * as units.
 */
export const selectionLeaks = (bets: readonly Bet[], minPicks = 8, limit = 3): HabitLeaks => {
  const candidates = SCANNED_LEGS.flatMap((dimension) => {
    const groups = groupSelectionsBy(bets, dimension);
    const decidedTotal = groups.reduce((sum, g) => sum + g.decided, 0);
    return groups
      .filter(
        (g) =>
          g.decided >= minPicks &&
          g.decided <= decidedTotal * DOMINANT_SHARE &&
          g.key !== 'Unknown' &&
          // The bucket everything unrecognised falls into is not a habit anyone
          // can bet less of.
          g.key !== OTHER_MARKETS,
      )
      .map((g) => ({
        dimension,
        label: legLabelFor(dimension, g.key),
        profit: g.flatUnitsPl,
        bets: g.decided,
        winRate: g.hitRate,
        unitsPerBet: g.decided === 0 ? 0 : g.flatUnitsPl / g.decided,
        driven: g.topSwingShare > DRIVEN_SHARE,
      }));
  });

  return {
    worst: topPerDimension(candidates.filter((c) => c.profit < 0).sort(ranked(1)), limit),
    best: topPerDimension(candidates.filter((c) => c.profit > 0).sort(ranked(-1)), limit),
  };
};
