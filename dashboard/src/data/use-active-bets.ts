import { useEffect, useMemo, useRef, useState } from 'react';
import { activeBets, isLiveBet, type Bet, type LiveScore } from '@betanal/shared';
import { useDashboard } from '@/context/dashboard-context';
import { DEMO_BETS, isDemoSlipEnabled } from '@/data/demo-slip';
import { refreshOpenBets, type ActiveBetsSnapshot } from '@/data/source';

/** How often the panel re-fetches while it is open and nothing is running. */
const POLL_MS = 20_000;
/** A match in play moves; its score is the one thing here that goes stale fast. */
const LIVE_POLL_MS = 8_000;
/** The worker was mid-sync and answered from the database - ask again shortly. */
const BUSY_POLL_MS = 3_000;

/**
 * Open bet slips, in-play first, refreshed from the bookmaker while `open`.
 *
 * Seeded from all stored bets rather than the selected period, so a slip placed
 * before the current range still shows. Polling exists only because IndexedDB
 * alone can't tell us that a slip settled or that the cash-out offer moved.
 */
export interface ActiveBets {
  bets: Bet[];
  error: string | null;
  /** Counts that came with the bets, for books that serve them that way. */
  scores: Record<string, LiveScore[]>;
  /** When the last fetch came back, or null before the first one does. */
  refreshedAt: number | null;
}

export const useActiveBets = (open: boolean): ActiveBets => {
  const { bets: stored } = useDashboard();
  const [snapshot, setSnapshot] = useState<ActiveBetsSnapshot | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const inFlight = useRef(false);

  const seed = useMemo(() => activeBets(stored), [stored]);

  // What the panel fetched outlives the panel being closed, so the counter on the
  // button is right the moment the drawer shuts rather than one database read
  // later. It is dropped as soon as a reload brings the stored copy up to date,
  // which is also what stops a slip that has since settled from lingering.
  useEffect(() => setSnapshot(null), [stored]);

  const bets = snapshot?.bets ?? seed;
  // A match the book has called ended is not worth the fast beat any more, so
  // the scores that came with the bets decide the cadence too.
  const live = bets.some((bet) => isLiveBet(bet, Date.now(), snapshot?.scores));
  // A poll that came back from the database carries no scores at all, so waiting
  // out a full beat for the next one is what made the panel look slow when it
  // was opened while a sync was still running.
  const busy = snapshot?.error === 'syncing';
  const every = busy ? BUSY_POLL_MS : live ? LIVE_POLL_MS : POLL_MS;

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const poll = async (): Promise<void> => {
      if (inFlight.current || document.hidden) return;
      inFlight.current = true;
      try {
        const fresh = await refreshOpenBets();
        if (cancelled || fresh === null) return;
        setSnapshot(fresh);
        // When the slips on screen were last re-read, whether that reached the
        // book or only the database: it answers "how old is this?", and a card
        // that never says so at all is the worse answer of the two.
        setRefreshedAt(Date.now());
      } finally {
        inFlight.current = false;
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), every);
    const onWake = (): void => void poll();
    // Chrome does not reliably fire visibilitychange when the window merely blurs.
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [open, every]);

  return {
    bets: isDemoSlipEnabled() ? [...DEMO_BETS, ...bets] : bets,
    error: snapshot?.error ?? null,
    scores: snapshot?.scores ?? {},
    refreshedAt,
  };
};
