import type { Bet, BetLeg } from './types';
import { flatUnitProfit, profitOf } from './calculations';
import { canonicalCountry } from './countries';
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

/** An event that names two sides rather than a competition. */
const FIXTURE = /\s(?:[-–—]|vs?\.?)\s/i;

/**
 * The competition a pick was made in. An outright hangs off no tournament at
 * all - the book files "Eurovision Song Contest 2025" and "FIS World Cup Women
 * 2024/2025" against the sport alone - so the event stands in where it names a
 * competition rather than a fixture, and the sport where even that is missing.
 * A row called "Unknown" tells the reader nothing they can act on.
 */
const leagueOf = (sel: Selection): string => {
  const { event } = sel.leg;
  const outright = event === null || FIXTURE.test(event) ? null : canonicalLeague(event);
  return canonicalLeague(sel.leg.league) ?? outright ?? sportOf(sel) ?? 'Unknown';
};

/** The group a selection falls in, or null when the dimension does not apply to
 * it - a pick that names no team has no place in the team view. */
export const legKeyOf = (sel: Selection, dimension: LegDimension): string | null => {
  const { bet, leg } = sel;
  switch (dimension) {
    case 'sport':
      return sportOf(sel) ?? 'Unknown';
    case 'league':
      return leagueOf(sel);
    case 'country':
      return canonicalCountry(leg.country, leg.league);
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
  /** The countries the group is played in, the one it mostly is first. Empty
   * where none of its picks were read with a country. */
  countries: string[];
  /**
   * Where the group is played: the country it mostly is, `'International'` where
   * it is spread too thin to name one, `null` where nothing placed it at all.
   * Read from the whole vocabulary, so it is the same word whichever bookmaker
   * the reader has picked.
   */
  country: string | null;
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

/** The values a group holds and how many picks hold each, the commonest first.
 * Ties break by name so two runs over the same bets order them the same way. */
const heldIn = (
  group: readonly Selection[],
  of: (sel: Selection) => string | null,
): [string, number][] => {
  const counts = new Map<string, number>();
  for (const sel of group) {
    const value = of(sel);
    if (value !== null) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].sort(([aValue, aPicks], [bValue, bPicks]) =>
    bPicks - aPicks === 0 ? aValue.localeCompare(bValue) : bPicks - aPicks,
  );
};

/**
 * How much of a group has to be one country before the group is called that
 * country's. Serie A is Italy's with a handful of Brazilian picks behind it and
 * Bundesliga is Germany's with a few Austrian; a tennis circuit is a fortnight
 * in each of twenty countries and is honestly none of them.
 */
const DOMINANT = 0.6;

const NOWHERE = 'International';

const countryOf = (countries: readonly (readonly [string, number])[]): string | null => {
  const located = countries.reduce((sum, [, picks]) => sum + picks, 0);
  const first = countries[0];
  if (first === undefined || located === 0) return null;
  return first[1] / located >= DOMINANT ? first[0] : NOWHERE;
};

/**
 * One group's figures. `group` is what the reader has in view and every number
 * is counted over it; `named` is the same group read over every bookmaker, and
 * only the words - the countries - come from there, so that narrowing the table
 * to one book never changes what a row is called or which flag it flies.
 */
const statsFor = (
  key: string,
  label: string,
  group: readonly Selection[],
  named: readonly Selection[],
): SelectionStats => {
  const singles = group.filter((sel) => sel.bet.legs.length <= 1);
  const decided = group.filter((sel) => isDecidedLeg(sel.leg));
  const won = decided.filter((sel) => sel.leg.status === 'won').length;
  const hitRate = decided.length === 0 ? 0 : (won / decided.length) * 100;
  const meanImplied =
    decided.length === 0
      ? 0
      : (decided.reduce((sum, sel) => sum + 1 / sel.odds, 0) / decided.length) * 100;
  const { low, high } = wilson(won, decided.length);
  const countries = heldIn(named, (sel) => canonicalCountry(sel.leg.country, sel.leg.league));
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
    sports: heldIn(group, sportOf).map(([sport]) => sport),
    countries: countries.map(([country]) => country),
    country: countryOf(countries),
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

interface Bucket {
  label: string;
  group: Selection[];
}

const bucketsOf = (
  selections: readonly Selection[],
  dimension: LegDimension,
): Map<string, Bucket> => {
  const buckets = new Map<string, Bucket>();
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
  return buckets;
};

/**
 * Where each competition is played, read over every bet: the same rule the row
 * flies its flag by, applied per leg. A book began filing a country later than
 * it filed the bets, so most of its older legs carry none - and a leg read
 * before the field existed is still a leg of a competition played somewhere.
 * Without this, asking for France answered with the handful of Ligue 1 picks
 * that happened to be read late, not the season the row counts.
 */
const placesOf = (selections: readonly Selection[]): Map<string, string> => {
  const places = new Map<string, string>();
  for (const [identity, bucket] of bucketsOf(selections, 'league')) {
    const country = countryOf(
      heldIn(bucket.group, (sel) => canonicalCountry(sel.leg.country, sel.leg.league)),
    );
    if (country !== null) places.set(identity, country);
  }
  return places;
};

/** The country a pick is filed under: its own, or its competition's. */
const placeOf = (sel: Selection, places: ReadonlyMap<string, string>): string | null =>
  canonicalCountry(sel.leg.country, sel.leg.league) ??
  places.get(identityOf(sel, 'league') ?? '') ??
  null;

const statsByKey = (
  selections: readonly Selection[],
  dimension: LegDimension,
  vocabulary: readonly Selection[],
): SelectionStats[] => {
  const buckets = bucketsOf(selections, dimension);
  const known = vocabulary === selections ? buckets : bucketsOf(vocabulary, dimension);

  return [...buckets.entries()].map(([identity, own]) => {
    const bucket = known.get(identity) ?? own;
    return statsFor(identity, bucket.label, own.group, bucket.group);
  });
};

/**
 * The groups `bets` fall into. `vocabulary` is the wider set the words on the
 * rows are read from - every bet rather than the ones the bookmaker filter
 * leaves standing - so a competition keeps the same name and the same flag
 * whichever book is picked, and a book that files no country for it still shows
 * the country the other book filed.
 */
export const groupSelectionsBy = (
  bets: readonly Bet[],
  dimension: LegDimension,
  vocabulary: readonly Bet[] = bets,
): SelectionStats[] => {
  const selections = selectionsOf(bets);
  return statsByKey(
    selections,
    dimension,
    vocabulary === bets ? selections : selectionsOf(vocabulary),
  );
};

/**
 * The same grouping, further in: the selections left after entering every group
 * in `within`, split by `child`. Two levels take two entries - the lines of a
 * market family, then the sports one of those lines was priced in.
 */
export const groupSelectionsWithin = (
  bets: readonly Bet[],
  within: readonly (readonly [LegDimension, string])[],
  child: LegDimension,
  vocabulary: readonly Bet[] = bets,
): SelectionStats[] => {
  const places = within.some(([dimension]) => dimension === 'country')
    ? placesOf(selectionsOf(vocabulary))
    : new Map<string, string>();
  const entered = (bet: readonly Bet[]): Selection[] =>
    selectionsOf(bet).filter((sel) =>
      within.every(([dimension, key]) =>
        dimension === 'country' ? placeOf(sel, places) === key : identityOf(sel, dimension) === key,
      ),
    );
  const selections = entered(bets);
  return statsByKey(selections, child, vocabulary === bets ? selections : entered(vocabulary));
};
