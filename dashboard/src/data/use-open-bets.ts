import { useEffect, useState } from 'react';
import { isLiveBet, type Bet, type Bookmaker, type LiveScore } from '@betanal/shared';
import { findAccount, siteLinkOf, useSiteOrigins, type SiteLink } from '@/data/accounts';
import { useLiveBets } from '@/data/live-bets';

/** A slip belongs to the day its first match starts, not the day it was placed. */
const kickoffOf = (bet: Bet): number => {
  const starts = bet.legs.flatMap((leg) => {
    const ms = leg.eventDate == null ? Number.NaN : Date.parse(leg.eventDate);
    return Number.isNaN(ms) ? [] : [ms];
  });
  return starts.length > 0 ? Math.min(...starts) : Date.parse(bet.placedAt);
};

/** The clock only has to move as fast as the nearest kickoff is worth watching. */
const TICK_MS = 30_000;

export interface OpenBets {
  /** Slips with a match running, nearest kickoff first. */
  live: Bet[];
  /** Slips whose first match has yet to start, nearest kickoff first. */
  waiting: Bet[];
  scores: Record<string, LiveScore[]>;
  /** When the book last answered, or null before it has. */
  refreshedAt: number | null;
  /** Ticked while watching, so the cards estimate their clocks without a timer each. */
  now: number;
  /** Where this bookmaker's own open bets are; null for a book we do not know. */
  siteLinkFor: (bookmaker: Bookmaker) => SiteLink | null;
}

/**
 * The open slips, split the way both the drawer and the page show them.
 *
 * The split depends on `now`, so it cannot live in the shared context: each
 * reader ticks its own clock only while it is on screen. Everything else here
 * would otherwise be written twice and drift apart.
 *
 * `watching` is false while the reader cannot see the slips - a shut drawer, a
 * hidden tab - and then the clock stands still rather than re-rendering all day.
 */
export const useOpenBets = (watching: boolean): OpenBets => {
  const { bets, scores, refreshedAt } = useLiveBets();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!watching) return;
    // Catches up on whatever passed while it was not being watched.
    const tick = (): void => {
      if (!document.hidden) setNow(Date.now());
    };
    tick();
    const timer = window.setInterval(tick, TICK_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [watching]);

  // With the scores, so a slip whose match the book has called ended drops back
  // to waiting rather than sitting under live until the book gets round to
  // settling it. `now` is what re-runs this.
  const byKickoff = [...bets].sort((a, b) => kickoffOf(a) - kickoffOf(b));

  // The mirror the browser actually reached the book on; its own address otherwise.
  const origins = useSiteOrigins();

  return {
    live: byKickoff.filter((bet) => isLiveBet(bet, now, scores)),
    waiting: byKickoff.filter((bet) => !isLiveBet(bet, now, scores)),
    scores,
    refreshedAt,
    now,
    siteLinkFor: (bookmaker) => {
      const account = findAccount(bookmaker);
      if (account === undefined) return null;
      return siteLinkOf(account, origins, account.betsPath);
    },
  };
};
