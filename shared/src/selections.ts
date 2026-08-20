import type { Bet, BetLeg } from './types';
import { flatUnitProfit, profitOf } from './calculations';
import { canonicalLeague } from './leagues';
import { marketFamily, marketLine } from './markets';
import { teamPicked } from './teams';
import {
  hourOf,
  monthOf,
  oddsBand,
  oddsBracket,
  selectionType,
  timeToEventBucket,
  weekdayOf,
  type LegDimension,
} from './dimensions';
import { wilson, withinChance } from './significance';
import { canonicalSport } from './sports';

/** One leg, with the slip it came from. Deliberately carries no stake or profit. */
export interface Selection {
  bet: Bet;
  leg: BetLeg;
  legIndex: number;
  odds: number;
}

const syntheticLeg = (bet: Bet): BetLeg => ({
  sport: bet.sport,
  league: bet.league,
  event: bet.event,
  marketType: bet.marketType,
  selection: bet.selection,
  odds: bet.odds,
  status: bet.status,
  eventDate: null,
  isLive: false,
});

export const selectionsOf = (bets: readonly Bet[]): Selection[] =>
  bets.flatMap((bet) => {
    const legs = bet.legs.length > 0 ? bet.legs : [syntheticLeg(bet)];
    return legs.map((leg, legIndex) => ({ bet, leg, legIndex, odds: leg.odds ?? bet.odds }));
  });

/**
 * The sport a pick was made in. A book that files the sport on the slip and not
 * on the leg would otherwise leave every leg of a combo sportless, which is what
 * left league rows unmarked.
 */
const sportOf = (sel: Selection): string | null =>
  canonicalSport(sel.leg.sport ?? sel.bet.sport, sel.bet.bookmaker);

/** The group a selection falls in, or null when the dimension does not apply to
 * it - a pick that names no team has no place in the team view. */
export const legKeyOf = (sel: Selection, dimension: LegDimension): string | null => {
  const { bet, leg } = sel;
  switch (dimension) {
    case 'sport':
      return sportOf(sel) ?? 'Unknown';
    case 'league':
      return canonicalLeague(leg.league) ?? 'Unknown';
    case 'event':
      return leg.event ?? 'Unknown';
    case 'marketType':
      return leg.marketType ?? 'Unknown';
    case 'marketFamily':
      return marketFamily(leg.marketType);
    case 'marketLine':
      return marketLine(leg.marketType, leg.event, leg.selection, sportOf(sel));
    case 'selection':
      return leg.selection ?? leg.marketType ?? 'Unknown';
    case 'team':
      return teamPicked(leg.event, leg.selection);
    case 'selectionType':
      return selectionType(sel.odds);
    case 'oddsBracket':
      return oddsBracket(sel.odds);
    case 'oddsBand':
      return oddsBand(sel.odds);
    case 'isLive':
      return leg.isLive ? 'In-play' : 'Pre-match';
    case 'timeToEvent':
      return timeToEventBucket(bet.placedAt, leg.eventDate, leg.isLive);
    case 'dayOfWeek':
      return weekdayOf(bet.placedAt);
    case 'hourOfDay':
      return hourOf(bet.placedAt);
    case 'month':
      return monthOf(bet);
  }
};

/**
 * Selection-level performance. A leg of a combo never had a stake of its own, so
 * `moneyPl` splits its slip's result evenly over the legs that carried it - real
 * money, attributed, never invented. `flatUnitsPl` stays the like-for-like
 * measure: an explicit "what if these were 1u singles" counterfactual.
 */
export interface SelectionStats {
  /** Identity, unique in the list. Two sports' Bundesliga are two groups. */
  key: string;
  /** What to write on the row. The sport a group belongs to is drawn beside it,
   * so the name needs no help telling the two Bundesligas apart. */
  label: string;
  /** Every selection in the group, settled or not. */
  picks: number;
  /** Selections that won or lost - the denominator for hit rate. */
  decided: number;
  won: number;
  hitRate: number;
  /** Mean 1/odds across decided selections: what the bookmaker priced. */
  meanImplied: number;
  /** hitRate − meanImplied, in percentage points. */
  edgePp: number;
  wilsonLow: number;
  wilsonHigh: number;
  /** True while the group's record is still explained by the prices it took. */
  withinChance: boolean;
  meanOdds: number;
  flatUnitsPl: number;
  flatUnitsRoi: number;
  /** Picks that were a slip of their own, so their money is theirs alone. */
  singles: number;
  /**
   * Money won or lost. A single carries its slip's whole result; a combo leg
   * carries an equal share of its slip's, since the legs shared one stake and
   * no leg of them can be said to have earned more of it than another.
   */
  moneyPl: number;
  /**
   * How much of the group's whole swing came from its single biggest pick, 0–1.
   * High means the group's figure is one lucky price, not a pattern.
   */
  topSwingShare: number;
  /**
   * The sports the group spans, the one it mostly is first. A market bet in
   * four sports is still mainly one of them, and saying which is more use than
   * leaving the row unmarked because it is not purely one.
   */
  sports: string[];
}

const isDecidedLeg = (leg: BetLeg): boolean => leg.status === 'won' || leg.status === 'lost';

/**
 * What one leg would have returned as a flat 1u single. Priced at the selection's
 * own odds, which is the slip's price where the book files no price per leg -
 * `flatUnitProfit` would read that leg as a 1.00 shot and pay a winner nothing.
 */
const swingOf = (sel: Selection): number => {
  if (sel.leg.odds !== null) return flatUnitProfit(sel.leg);
  if (sel.leg.status === 'won') return sel.odds - 1;
  if (sel.leg.status === 'lost') return -1;
  return 0;
};

/** The sports a group holds, the one it holds most of first. Ties break by name
 * so two runs over the same bets order them the same way. */
const sportsIn = (group: readonly Selection[]): string[] => {
  const counts = new Map<string, number>();
  for (const sel of group) {
    const sport = sportOf(sel);
    if (sport !== null) counts.set(sport, (counts.get(sport) ?? 0) + 1);
  }
  return [...counts]
    .sort(([aSport, aPicks], [bSport, bPicks]) =>
      bPicks - aPicks === 0 ? aSport.localeCompare(bSport) : bPicks - aPicks,
    )
    .map(([sport]) => sport);
};

const statsFor = (key: string, label: string, group: readonly Selection[]): SelectionStats => {
  const singles = group.filter((sel) => sel.bet.legs.length <= 1);
  const decided = group.filter((sel) => isDecidedLeg(sel.leg));
  const won = decided.filter((sel) => sel.leg.status === 'won').length;
  const hitRate = decided.length === 0 ? 0 : (won / decided.length) * 100;
  const meanImplied =
    decided.length === 0
      ? 0
      : (decided.reduce((sum, sel) => sum + 1 / sel.odds, 0) / decided.length) * 100;
  const { low, high } = wilson(won, decided.length);
  const swings = group.map(swingOf);
  const flatUnitsPl = swings.reduce((sum, u) => sum + u, 0);
  const swing = swings.reduce((sum, u) => sum + Math.abs(u), 0);

  return {
    key,
    label,
    picks: group.length,
    decided: decided.length,
    won,
    hitRate,
    meanImplied,
    edgePp: hitRate - meanImplied,
    wilsonLow: low,
    wilsonHigh: high,
    withinChance: withinChance(low, high, meanImplied),
    meanOdds: group.length === 0 ? 0 : group.reduce((sum, sel) => sum + sel.odds, 0) / group.length,
    flatUnitsPl,
    flatUnitsRoi: decided.length === 0 ? 0 : (flatUnitsPl / decided.length) * 100,
    singles: singles.length,
    moneyPl: group.reduce(
      (sum, sel) => sum + profitOf(sel.bet) / Math.max(1, sel.bet.legs.length),
      0,
    ),
    topSwingShare: swing === 0 ? 0 : Math.max(...swings.map(Math.abs)) / swing,
    sports: sportsIn(group),
  };
};

/**
 * Germany has a Bundesliga in four sports and Italy a Serie A in two, and half
 * the countries on earth field a "Slovenia" in every sport they play, so neither
 * name is one thing on its own. Splitting them by sport also lets the row carry
 * the sport's icon, which a group spanning several sports cannot. The remaining
 * dimensions name a thing that is already one thing across sports.
 */
const SPORT_SCOPED: ReadonlySet<LegDimension> = new Set<LegDimension>(['league', 'team']);

const SCOPE = '\u0000';

/**
 * One competition, two house spellings: "La Liga" against "LaLiga", "Prva liga"
 * against "Prvaliga". A space is not a competition, so it is dropped for the
 * purpose of telling two groups apart - and only for that.
 */
const spelling = (name: string): string => name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** The spelling to write on the row: the one that spaces the words out, since
 * that is the one a reader would have written. Ties go the same way every run. */
const readsBetter = (candidate: string, held: string): boolean => {
  const gap = candidate.split(' ').length - held.split(' ').length;
  return gap === 0 ? candidate < held : gap > 0;
};

/** The group a selection lands in, told apart from every other group in the
 * dimension - which for a sport-scoped one is more than its name. */
const identityOf = (sel: Selection, dimension: LegDimension): string | null => {
  const key = legKeyOf(sel, dimension);
  if (key === null) return null;
  return SPORT_SCOPED.has(dimension) ? `${spelling(key)}${SCOPE}${sportOf(sel) ?? ''}` : key;
};

const statsByKey = (
  selections: readonly Selection[],
  dimension: LegDimension,
): SelectionStats[] => {
  const buckets = new Map<string, { label: string; group: Selection[] }>();
  for (const sel of selections) {
    const key = legKeyOf(sel, dimension);
    const identity = identityOf(sel, dimension);
    if (key === null || identity === null) continue;
    const existing = buckets.get(identity);
    if (existing === undefined) {
      buckets.set(identity, { label: key, group: [sel] });
    } else {
      existing.group.push(sel);
      if (readsBetter(key, existing.label)) existing.label = key;
    }
  }

  return [...buckets.entries()].map(([identity, { label, group }]) =>
    statsFor(identity, label, group),
  );
};

export const groupSelectionsBy = (
  bets: readonly Bet[],
  dimension: LegDimension,
): SelectionStats[] => statsByKey(selectionsOf(bets), dimension);

/**
 * The same grouping, further in: the selections left after entering every group
 * in `within`, split by `child`. Two levels take two entries - the lines of a
 * market family, then the sports one of those lines was priced in.
 */
export const groupSelectionsWithin = (
  bets: readonly Bet[],
  within: readonly (readonly [LegDimension, string])[],
  child: LegDimension,
): SelectionStats[] =>
  statsByKey(
    selectionsOf(bets).filter((sel) =>
      within.every(([dimension, key]) => identityOf(sel, dimension) === key),
    ),
    child,
  );
