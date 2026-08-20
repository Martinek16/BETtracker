import type { Bet } from './types';
import { isDecisive, isWin, profitOf, resolutionDate } from './calculations';
import { canonicalLeague } from './leagues';
import { canonicalSport } from './sports';

/** Aggregated performance metrics for a group of bets. */
export interface GroupStats {
  key: string;
  bets: number;
  staked: number;
  profit: number;
  roi: number;
  winRate: number;
  averageOdds: number;
  /** Profit measured in stakes rather than money, so a €5 and a €500 slip weigh the same. */
  unitsPl: number;
  /**
   * How much of the group's whole swing came from its single biggest slip, 0–1.
   * High means the group's figure is one bet wearing a label, not a pattern.
   */
  topSwingShare: number;
  /**
   * The same share measured in money. A group of five €5 slips beside one €500
   * slip reads as a pattern by stake swing and as one bet by this.
   */
  topMoneyShare: number;
}

const ODDS_BRACKETS: ReadonlyArray<{ label: string; min: number; max: number }> = [
  { label: '1.00–1.25', min: 0, max: 1.25 },
  { label: '1.25–1.50', min: 1.25, max: 1.5 },
  { label: '1.50–1.75', min: 1.5, max: 1.75 },
  { label: '1.75–2.00', min: 1.75, max: 2.0 },
  { label: '2.00–2.50', min: 2.0, max: 2.5 },
  { label: '2.50–3.00', min: 2.5, max: 3.0 },
  { label: '3.00–4.00', min: 3.0, max: 4.0 },
  { label: '4.00–5.00', min: 4.0, max: 5.0 },
  { label: '5.00–7.50', min: 5.0, max: 7.5 },
  { label: '7.50–10.0', min: 7.5, max: 10.0 },
  { label: '10.0–20.0', min: 10.0, max: 20.0 },
  { label: '20.0+', min: 20.0, max: Infinity },
];

/**
 * The same axis in the few bands a bettor thinks in. A card with room for five
 * rows cannot draw the twelve brackets above, and a bracket holding three picks
 * proves nothing on its own anyway.
 */
const ODDS_BANDS: ReadonlyArray<{ label: string; max: number }> = [
  { label: 'Under 1.50', max: 1.5 },
  { label: '1.50–2.00', max: 2.0 },
  { label: '2.00–3.00', max: 3.0 },
  { label: '3.00–5.00', max: 5.0 },
  { label: '5.00+', max: Infinity },
];

const STAKE_BANDS: ReadonlyArray<{ label: string; max: number }> = [
  { label: '≤ 5', max: 5 },
  { label: '5–10', max: 10 },
  { label: '10–25', max: 25 },
  { label: '25–50', max: 50 },
  { label: '50–100', max: 100 },
  { label: '100–250', max: 250 },
  { label: '250–500', max: 500 },
  { label: '500–1000', max: 1000 },
  { label: '1000–2500', max: 2500 },
  { label: '2500–5000', max: 5000 },
  { label: '5000–10000', max: 10000 },
  { label: '10000+', max: Infinity },
];

/**
 * Bands that follow the money rather than a fixed ladder.
 *
 * A ladder printed once for everyone reads well for the bettor it was drawn
 * around and badly for the rest: a punter whose every slip is between €100 and
 * €250 learns nothing from a row saying so, and one staking €2 needs the bottom
 * rung split rather than the top. So the ladder below is only the starting
 * point, and any rung the slips pile up on is cut where they actually sit.
 */
interface Band {
  /** Exclusive for stakes, inclusive for odds - see `closed`. */
  min: number;
  max: number;
}

/** Cut points a reader recognises, coarsest first. */
const STEPS = [1000, 500, 250, 100, 50, 25, 10, 5, 2.5, 1, 0.5, 0.25, 0.1, 0.05];

/** The roundest number strictly inside the band, nearest to where the slips sit. */
const splitPoint = (min: number, max: number, target: number): number | null => {
  for (const step of STEPS) {
    const inside: number[] = [];
    for (let v = (Math.floor(min / step) + 1) * step; v < max; v += step) {
      const rounded = Number(v.toFixed(2));
      if (rounded > min && rounded < max) inside.push(rounded);
    }
    const nearest = inside.reduce<number | null>(
      (best, v) => (best === null || Math.abs(v - target) < Math.abs(best - target) ? v : best),
      null,
    );
    if (nearest !== null) return nearest;
  }
  return null;
};

/** A band nobody can act on: it holds this much of the period all by itself. */
const CROWDED_SHARE = 0.3;
/** Below this a split only makes two bands too small to read anything into. */
const CROWDED_MIN = 12;

const refine = (base: readonly Band[], values: readonly number[], closed: Closed): Band[] => {
  const holds = (band: Band, v: number): boolean =>
    closed === 'upper' ? v > band.min && v <= band.max : v >= band.min && v < band.max;

  let bands = [...base];
  // Four passes turn one crowded rung into at most five, which is as far as a
  // card with room for a dozen rows can usefully go.
  for (let pass = 0; pass < 4; pass++) {
    const held = bands.map((band) => values.filter((v) => holds(band, v)).sort((a, b) => a - b));
    const counts = held.map((v) => v.length);
    const index = counts.indexOf(Math.max(...counts, 0));
    const inside = held[index];
    const band = bands[index];
    if (band === undefined || inside === undefined) break;
    if (inside.length < CROWDED_MIN || inside.length < values.length * CROWDED_SHARE) break;
    const median = inside[Math.floor(inside.length / 2)]!;
    // An open-ended top band is cut against the biggest slip in it, since it has
    // no ceiling of its own to measure the middle against.
    const ceiling = Number.isFinite(band.max) ? band.max : inside[inside.length - 1]! + 0.01;
    const cut = splitPoint(band.min, ceiling, median);
    if (cut === null) break;
    bands = [
      ...bands.slice(0, index),
      { min: band.min, max: cut },
      { min: cut, max: band.max },
      ...bands.slice(index + 1),
    ];
  }
  return bands;
};

type Closed = 'upper' | 'lower';

interface Ladder {
  base: readonly Band[];
  closed: Closed;
  value: (bet: Bet) => number;
  format: (v: number) => string;
}

const bandsOf = (labels: ReadonlyArray<{ max: number }>): Band[] =>
  labels.map((b, i) => ({ min: i === 0 ? 0 : labels[i - 1]!.max, max: b.max }));

const ADAPTIVE: Partial<Record<SlipDimension, Ladder>> = {
  stakeBand: {
    base: bandsOf(STAKE_BANDS),
    closed: 'upper',
    value: (bet) => bet.stake,
    format: (v) => String(Math.round(v * 100) / 100),
  },
  slipOdds: {
    base: ODDS_BRACKETS,
    closed: 'lower',
    value: (bet) => bet.odds,
    format: (v) => v.toFixed(2),
  },
};

const bandLabel = (band: Band, ladder: Ladder): string => {
  if (band.max === Infinity) return `${ladder.format(band.min)}+`;
  if (band.min === 0 && ladder.closed === 'upper') return `≤ ${ladder.format(band.max)}`;
  return `${ladder.format(band.min)}–${ladder.format(band.max)}`;
};

/**
 * How this population of slips is grouped on this dimension. Population-aware,
 * so a band can be cut where the slips actually sit; every other dimension falls
 * straight through to `keyForSlip`.
 */
export const slipKeyer = (
  bets: readonly Bet[],
  dimension: SlipDimension,
): ((bet: Bet) => string) => {
  const ladder = ADAPTIVE[dimension];
  if (ladder === undefined) return (bet) => keyForSlip(bet, dimension);
  const bands = refine(ladder.base, bets.map(ladder.value), ladder.closed);
  const last = bands[bands.length - 1]!;
  return (bet) => {
    const v = ladder.value(bet);
    const band =
      bands.find((b) =>
        ladder.closed === 'upper' ? v > b.min && v <= b.max : v >= b.min && v < b.max,
      ) ?? last;
    return bandLabel(band, ladder);
  };
};

/** The upper edge a band label names, so cut bands still sort into the ladder. */
const bandRank = (key: string): number => {
  if (key.endsWith('+')) return Infinity;
  const numbers = key.match(/\d+(\.\d+)?/g);
  return numbers === null ? Number.POSITIVE_INFINITY : Number(numbers[numbers.length - 1]);
};

/** Slips are named the way a bookmaker names them, then banded once the names run out. */
const FOLD_NAMES = ['Single', 'Double', 'Treble', '4-fold', '5-fold'];

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const oddsBracket = (odds: number): string =>
  ODDS_BRACKETS.find((b) => odds >= b.min && odds < b.max)?.label ?? '5.00+';

export const oddsBand = (odds: number): string =>
  ODDS_BANDS.find((b) => odds < b.max)?.label ?? '5.00+';

export const stakeBand = (stake: number): string =>
  STAKE_BANDS.find((b) => stake <= b.max)?.label ?? '10000+';

/**
 * What the slip is, in bookmaker words. A system bet keeps its own name - its
 * legs are not one chain, so calling it a 6-fold would misread the bet.
 */
export const slipType = (bet: Bet): string => {
  if (bet.betType === 'system') return 'System';
  const legs = Math.max(1, bet.legs.length);
  if (legs <= FOLD_NAMES.length) return FOLD_NAMES[legs - 1]!;
  if (legs <= 10) return '6–10 folds';
  if (legs <= 20) return '11–20 folds';
  return '21+ folds';
};

export const selectionType = (odds: number): 'Favorite' | 'Underdog' =>
  odds < 2.0 ? 'Favorite' : 'Underdog';

/** How long before kickoff the bet went on. Live bets are their own bucket since
 * "time to event" is meaningless once the match is running. */
export const timeToEventBucket = (
  placedAt: string,
  eventDate: string | null,
  isLive: boolean,
): string => {
  if (isLive) return 'In-play';
  if (eventDate === null) return 'Unknown';
  const hours = (new Date(eventDate).getTime() - new Date(placedAt).getTime()) / 3_600_000;
  if (Number.isNaN(hours)) return 'Unknown';
  if (hours < 1) return '< 1h before';
  if (hours < 24) return '1–24h before';
  return '> 24h before';
};

/** Dimensions that group whole slips. Every slip falls in exactly one group. */
export type SlipDimension =
  | 'betType'
  | 'legCount'
  | 'slipOdds'
  | 'stakeBand'
  | 'dayOfWeek'
  | 'hourOfDay'
  | 'month'
  | 'sport'
  | 'league'
  | 'selectionType'
  | 'isLive'
  | 'bookmaker'
  | 'exit';

/** Dimensions that group individual selections. See `selections.ts`. */
export type LegDimension =
  | 'sport'
  | 'league'
  | 'event'
  | 'marketType'
  | 'marketFamily'
  | 'marketLine'
  | 'selection'
  | 'team'
  | 'selectionType'
  | 'oddsBracket'
  | 'oddsBand'
  | 'isLive'
  | 'timeToEvent'
  | 'dayOfWeek'
  | 'hourOfDay'
  | 'month';

export type DimensionKey = SlipDimension | LegDimension;

/**
 * The shared value across every leg, or 'Mixed'. A four-leg builder spanning
 * football and tennis is neither a football bet nor a tennis bet - calling it
 * 'Mixed' keeps groups a true partition, so group profits sum to period profit.
 *
 * Legs the bookmaker left blank are skipped rather than treated as a value of
 * their own - one unlabelled leg would otherwise turn a pure football builder
 * into 'Mixed'. Same rule the adapter already applies to `bet.sport`.
 */
const pureOrMixed = (
  bet: Bet,
  of: (leg: Bet['legs'][number]) => string | null,
  fallback: string,
): string => {
  const known = new Set(bet.legs.map(of).filter((v): v is string => v !== null && v !== ''));
  if (known.size === 0) return fallback;
  if (known.size > 1) return 'Mixed';
  return [...known][0]!;
};

const legCountKey = (bet: Bet): string => {
  const n = Math.max(1, bet.legs.length);
  return n >= 5 ? '5+' : String(n);
};

export const weekdayOf = (placedAt: string): string =>
  WEEKDAYS[new Date(placedAt).getDay()] ?? 'Unknown';

export const hourOf = (placedAt: string): string =>
  String(new Date(placedAt).getHours()).padStart(2, '0');

/** A P/L bucket, so it follows settlement - unlike weekdayOf/hourOf, which
 * describe betting behaviour and stay on placement time. */
export const monthOf = (bet: Bet): string => {
  const d = new Date(resolutionDate(bet));
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

/**
 * The order a dimension's groups are read in when nothing else is asked for:
 * singles before doubles, cheap odds before long ones, Monday before Sunday.
 * Dimensions whose keys are names rather than steps are absent - there is no
 * meaningful order for a league.
 */
const KEY_ORDER: Partial<Record<DimensionKey, readonly string[]>> = {
  betType: [...FOLD_NAMES, '6–10 folds', '11–20 folds', '21+ folds', 'System'],
  legCount: ['1', '2', '3', '4', '5+'],
  slipOdds: ODDS_BRACKETS.map((b) => b.label),
  oddsBracket: ODDS_BRACKETS.map((b) => b.label),
  oddsBand: ODDS_BANDS.map((b) => b.label),
  stakeBand: STAKE_BANDS.map((b) => b.label),
  selectionType: ['Favorite', 'Underdog'],
  isLive: ['Pre-match', 'In-play', 'Mixed'],
  exit: ['Held to the end', 'Cashed out'],
  timeToEvent: ['< 1h before', '1–24h before', '> 24h before', 'In-play', 'Unknown'],
  // Weeks are read Monday-first here, unlike `Date.getDay()`'s Sunday-first index.
  dayOfWeek: [...WEEKDAYS.slice(1), WEEKDAYS[0]!],
};

/** `Jan 2026` sorts as a date, not as the letter J. */
const monthRank = (key: string): number => {
  const [month, year] = key.split(' ');
  const index = MONTHS.indexOf(month ?? '');
  const y = Number(year);
  if (index < 0 || Number.isNaN(y)) return Number.POSITIVE_INFINITY;
  return y * 12 + index;
};

/** Ascending comparator for group keys, in whatever order the dimension reads in. */
export const compareGroupKeys = (dimension: DimensionKey, a: string, b: string): number => {
  if (dimension === 'month') return monthRank(a) - monthRank(b);
  // Bands are read off their edges rather than a fixed list: they are cut to fit
  // the slips, so no list written here would name all of them.
  if (dimension === 'stakeBand' || dimension === 'slipOdds') return bandRank(a) - bandRank(b);
  const order = KEY_ORDER[dimension];
  if (order === undefined) return a.localeCompare(b);
  // A key the order does not name (e.g. 'Mixed') sits after the ones it does.
  const rank = (key: string): number => {
    const i = order.indexOf(key);
    return i < 0 ? order.length : i;
  };
  return rank(a) - rank(b) || a.localeCompare(b);
};

/** Whether a dimension's groups have an inherent order worth defaulting to. */
export const hasKeyOrder = (dimension: DimensionKey): boolean =>
  dimension === 'month' || KEY_ORDER[dimension] !== undefined;

export const keyForSlip = (bet: Bet, dimension: SlipDimension): string => {
  switch (dimension) {
    case 'betType':
      return slipType(bet);
    case 'legCount':
      return legCountKey(bet);
    case 'slipOdds':
      return oddsBracket(bet.odds);
    case 'stakeBand':
      return stakeBand(bet.stake);
    case 'dayOfWeek':
      return weekdayOf(bet.placedAt);
    case 'hourOfDay':
      return hourOf(bet.placedAt);
    case 'month':
      return monthOf(bet);
    case 'sport':
      return pureOrMixed(
        bet,
        (leg) => canonicalSport(leg.sport, bet.bookmaker),
        canonicalSport(bet.sport, bet.bookmaker) ?? 'Unknown',
      );
    case 'league':
      return pureOrMixed(
        bet,
        (leg) => canonicalLeague(leg.league),
        canonicalLeague(bet.league) ?? 'Unknown',
      );
    case 'selectionType':
      return selectionType(bet.odds);
    case 'isLive':
      return pureOrMixed(bet, (leg) => (leg.isLive ? 'In-play' : 'Pre-match'), 'Pre-match');
    case 'bookmaker':
      return bet.bookmaker;
    case 'exit':
      return bet.cashedOutAt === null ? 'Held to the end' : 'Cashed out';
  }
};

const statsFor = (key: string, bets: readonly Bet[]): GroupStats => {
  const staked = bets.reduce((sum, bet) => sum + bet.stake, 0);
  const swings = bets.map((bet) => (bet.stake > 0 ? profitOf(bet) / bet.stake : 0));
  const swing = swings.reduce((sum, u) => sum + Math.abs(u), 0);
  const profit = bets.reduce((sum, bet) => sum + profitOf(bet), 0);
  const moneySwing = bets.reduce((sum, bet) => sum + Math.abs(profitOf(bet)), 0);
  const decisive = bets.filter(isDecisive);
  const wins = decisive.filter(isWin).length;
  const winRate = decisive.length === 0 ? 0 : (wins / decisive.length) * 100;
  // Void and pending stake never resolved, so it stays out of the ROI denominator.
  const decisiveStake = decisive.reduce((sum, bet) => sum + bet.stake, 0);

  return {
    key,
    bets: bets.length,
    staked,
    profit,
    roi: decisiveStake === 0 ? 0 : (profit / decisiveStake) * 100,
    winRate,
    averageOdds: bets.length === 0 ? 0 : bets.reduce((sum, bet) => sum + bet.odds, 0) / bets.length,
    unitsPl: swings.reduce((sum, u) => sum + u, 0),
    topSwingShare: swing === 0 ? 0 : Math.max(...swings.map(Math.abs)) / swing,
    topMoneyShare:
      moneySwing === 0 ? 0 : Math.max(...bets.map((bet) => Math.abs(profitOf(bet)))) / moneySwing,
  };
};

const COMBO_BANDS: ReadonlyArray<{ label: string; min: number; max: number }> = [
  { label: 'Singles', min: 1, max: 1 },
  { label: 'Doubles', min: 2, max: 2 },
  { label: 'Trebles', min: 3, max: 3 },
  { label: '4–5 legs', min: 4, max: 5 },
  { label: '6–10 legs', min: 6, max: 10 },
  { label: '11+ legs', min: 11, max: Infinity },
];

/**
 * Slips bucketed by how many legs they carry. Bands rather than `legCount`'s own
 * keys, which stop at '5+' and so hide how far the big builders reach.
 */
export const comboSizeBands = (bets: readonly Bet[]): GroupStats[] =>
  COMBO_BANDS.map((band) =>
    statsFor(
      band.label,
      bets.filter((bet) => {
        const legs = Math.max(1, bet.legs.length);
        return legs >= band.min && legs <= band.max;
      }),
    ),
  );

/** Group whole slips by a dimension and compute aggregated stats per group. */
export const groupBy = (bets: readonly Bet[], dimension: SlipDimension): GroupStats[] => {
  const buckets = new Map<string, Bet[]>();
  const keyOf = slipKeyer(bets, dimension);
  for (const bet of bets) {
    const key = keyOf(bet);
    const existing = buckets.get(key);
    if (existing) existing.push(bet);
    else buckets.set(key, [bet]);
  }
  return [...buckets.entries()].map(([key, group]) => statsFor(key, group));
};
