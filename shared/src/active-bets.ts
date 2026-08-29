/**
 * Selecting and ordering the bets that are still running.
 *
 * Kept here rather than in the dashboard so the ordering rules are unit-tested
 * alongside the other pure bet logic.
 */

import { canonicalSport, isEsport } from './sports';
import type { Bet, BetLeg, LiveScore } from './types';

/** Kickoff as epoch ms, or NaN when unknown - every comparison against NaN is false. */
const startedAt = (leg: BetLeg): number =>
  leg.eventDate === null ? Number.NaN : Date.parse(leg.eventDate);

/**
 * How long after kickoff a leg still counts as in play when the book has not
 * said otherwise. Without a bound, a match that finished hours ago - or one that
 * was called off and never kicked off at all - stayed in the Live tab for as
 * long as the book left the slip unsettled, which is what made a won bet sit
 * there all evening.
 *
 * ponytail: a flat window over every sport. The book's own clock is the exact
 * answer and is used below when it is there; this is what stands in when it is
 * not. Long enough for extra time and a five-set match.
 */
const LIVE_WINDOW_MS = 4 * 60 * 60_000;

/**
 * Words a book uses for a match that is not being played: one that is over, and
 * one that never got going. Both matter, and for the same reason - a fixture put
 * back an hour keeps the kickoff it was placed at, so the window below reads it
 * as running and the slip pulsed as live all evening.
 */
const NOT_RUNNING =
  /^(ended|finished|full[ -]?time|ft|aet|after extra time|final|result|not[ _-]?started|scheduled|postponed|delayed|start delayed|interrupted|suspended|abandoned|cancell?ed|walkover|retired)$/i;

/** The book saying this event is not being played, whatever it calls it. */
export const isStoppedEvent = (scores: readonly LiveScore[] | undefined): boolean =>
  scores !== undefined &&
  scores.some((score) => score.period !== undefined && NOT_RUNNING.test(score.period.trim()));

/**
 * The book naming the part being played, counting a clock, or simply putting a
 * figure on the board. No test day, five setter or rain delay outlasts this: the
 * match is running because the book is still reporting it as running, however
 * many hours ago it started.
 *
 * The scoreline counts on its own because not every feed carries a clock: a
 * bookmaker that pushes only the set score would otherwise say nothing this
 * function recognises, and its match would be judged by the kickoff alone.
 */
const isRunningEvent = (scores: readonly LiveScore[] | undefined): boolean =>
  scores !== undefined &&
  !isStoppedEvent(scores) &&
  scores.some(
    (score) => score.clock !== undefined || score.period !== undefined || score.home !== '',
  );

/**
 * Sports played one after another on the same court, table, oche or ring, where
 * the time on the slip is when the match was due up rather than when it starts.
 * A five-setter before it, or a card that overruns, puts everything behind it
 * back by an hour and the book never rewrites the kickoff it sold the bet at.
 *
 * For these the kickoff is not evidence of anything, so a slip goes in play only
 * when the book itself reports the match running - or when it was placed in play
 * to begin with. Sports that start when the clock says so keep the window below.
 */
const WAITS_ITS_TURN =
  /tennis|badminton|squash|padel|snooker|billiard|pool|darts|bowling|boxing|mma|ufc|fighting|martial|chess/i;

const startsWhenCalled = (sport: string | null): boolean => {
  const name = canonicalSport(sport) ?? '';
  return isEsport(name) || WAITS_ITS_TURN.test(name);
};

/**
 * A leg is in play if it is flagged live or its event has started and could
 * still be running.
 *
 * The second clause matters: `isLive` is captured when the bet is placed, so a
 * pre-match bet on a match that has since kicked off keeps `isLive: false`
 * forever and would otherwise never reach the top of the list. It is bounded by
 * `LIVE_WINDOW_MS` because kickoff alone cannot say a match is still going.
 *
 * Pass the scores the book handed back and its own word beats both clauses, in
 * either direction: a match it is still reporting on is in play for as long as
 * it says so, with no window over it, and one it calls off is not in play even
 * though its kickoff has been and gone. The window only stands in where the book
 * says nothing at all - and not even then for a sport that waits its turn, where
 * a passed kickoff says only that the match was due, not that it is being played.
 */
export const isLiveLeg = (
  leg: BetLeg,
  now: number = Date.now(),
  scores?: Record<string, readonly LiveScore[]>,
): boolean => {
  const said = leg.eventId === undefined ? undefined : scores?.[leg.eventId];
  if (isStoppedEvent(said)) return false;
  if (isRunningEvent(said)) return leg.status === 'pending';
  const at = startedAt(leg);
  if (leg.status === 'pending' && at <= now && !startsWhenCalled(leg.sport)) {
    return now - at < LIVE_WINDOW_MS;
  }
  return leg.isLive;
};

/** A bet is in play if any of its legs is. */
export const isLiveBet = (
  bet: Bet,
  now: number = Date.now(),
  scores?: Record<string, readonly LiveScore[]>,
): boolean => bet.legs.some((leg) => isLiveLeg(leg, now, scores));

/**
 * Which running count belongs next to a leg - corners for a corner bet, cards
 * for a card bet, the plain score for everything else.
 *
 * Matched on the market name because that is the only market description the
 * bets API hands over; `null` means "whatever the scoreboard says".
 */
export const statKindForMarket = (marketType: string | null): string | null => {
  const name = marketType?.toLowerCase() ?? '';
  if (name.includes('corner')) return 'Corners';
  if (name.includes('card') || name.includes('booking')) return 'Cards';
  return null;
};

/** Earliest kickoff among undecided legs; Infinity when none is known, so those sort last. */
const nextEventAt = (bet: Bet): number => {
  let earliest = Number.POSITIVE_INFINITY;
  for (const leg of bet.legs) {
    if (leg.status !== 'pending') continue;
    const at = startedAt(leg);
    if (!Number.isNaN(at) && at < earliest) earliest = at;
  }
  return earliest;
};

/**
 * Open bets, in play first. Within each block the next event to start comes
 * first - for live bets that is the match closest to finishing.
 */
export const activeBets = (bets: readonly Bet[], now: number = Date.now()): Bet[] =>
  bets
    .filter((bet) => bet.status === 'pending')
    .sort((a, b) => {
      const live = Number(isLiveBet(b, now)) - Number(isLiveBet(a, now));
      if (live !== 0) return live;

      const eventA = nextEventAt(a);
      const eventB = nextEventAt(b);
      if (eventA !== eventB) return eventA < eventB ? -1 : 1;

      const placedA = Date.parse(a.placedAt);
      const placedB = Date.parse(b.placedAt);
      if (placedA !== placedB) return placedB - placedA;

      return a.betId < b.betId ? -1 : a.betId > b.betId ? 1 : 0;
    });
