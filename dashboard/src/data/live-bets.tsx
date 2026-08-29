import { createContext, useContext, type ReactNode } from 'react';
import { isLiveBet, isLiveLeg, type Bet, type LiveScore } from '@betanal/shared';
import { useDashboard } from '@/context/dashboard-context';
import { DEMO_REFRESHED_AT, DEMO_SCORES, isDemoMode } from '@/demo';
import { useActiveBets } from '@/data/use-active-bets';
import { useLiveScores } from '@/data/use-live-scores';

/**
 * Open slips and what their matches are doing, read once for the whole app.
 *
 * The slip panel and the bet table both want the same in-play figures, and each
 * one asking for itself would mean two polls at the bookmaker and two sockets on
 * its feed. Both cost the book, so it is fetched here and read from anywhere.
 */
export interface LiveBets {
  bets: Bet[];
  error: string | null;
  /** Counts and clocks by bookmaker event id, from the poll and the feed alike. */
  scores: Record<string, LiveScore[]>;
  /** When the book last answered, or null before it has. */
  refreshedAt: number | null;
}

const LiveBetsContext = createContext<LiveBets>({
  bets: [],
  error: null,
  scores: {},
  refreshedAt: null,
});

export const useLiveBets = (): LiveBets => useContext(LiveBetsContext);

export const LiveBetsProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const { bets: stored } = useDashboard();
  // Nothing is running when nothing is open, so the book is left alone until a
  // slip is actually waiting on a result.
  const anyOpen = stored.some((bet) => bet.status === 'pending');
  const { bets, error, scores: polled, refreshedAt } = useActiveBets(anyOpen);

  const liveEventIds = bets
    .filter((bet) => isLiveBet(bet))
    .flatMap((bet) => bet.legs.filter((leg) => isLiveLeg(leg)).flatMap((leg) => leg.eventId ?? []));
  // Demo ids belong to no bookmaker, so the socket stays shut while one is shown.
  const feedScores = useLiveScores(
    liveEventIds.length > 0 && !isDemoMode(),
    liveEventIds,
  );

  // Two sources, one map: one book pushes its scores over a socket, the other
  // hands them back with the bets. Event ids are the bookmaker's own, so they
  // cannot collide across books.
  const scores = {
    ...feedScores,
    ...polled,
    ...(isDemoMode() ? DEMO_SCORES : {}),
  };

  return (
    <LiveBetsContext.Provider
      value={{
        bets,
        error,
        scores,
        // Nothing polls a bookmaker in demo, so the stamp is stood in for.
        refreshedAt: refreshedAt ?? (isDemoMode() ? DEMO_REFRESHED_AT : null),
      }}
    >
      {children}
    </LiveBetsContext.Provider>
  );
};
