import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  accountKey,
  casinoByGame,
  casinoByKind,
  casinoRoundCurve,
  casinoRoundTotals,
  convertRounds,
  roundNet,
  type CasinoKind,
  type CasinoRound,
} from '@betanal/shared';
import { Coins, Dices, Percent, Target, TrendingUp } from 'lucide-react';
import { DashboardCard, DashboardCardHeading } from '@/components/dashboard/dashboard-card';
import { MetricCard } from '@/components/dashboard/metric-card';
import { RunningPlChart } from '@/components/dashboard/running-pl-chart';
import { useDashboard } from '@/context/dashboard-context';
import { findAccount, useAllKnownAccounts } from '@/data/accounts';
import { getRates, loadCasinoRounds } from '@/data/source';
import { rangeCutoff, rangeEnd } from '@/lib/chart-data';
import { cn, formatDateTime, formatMoney, formatPercent } from '@/lib/utils';

/**
 * The rounds a site wrote down one by one, priced in the display currency. Empty
 * at every site that keeps no such record, which is all but one of them.
 */
const useRounds = (currency: string): CasinoRound[] => {
  const [rounds, setRounds] = useState<CasinoRound[]>([]);

  useEffect(() => {
    let active = true;
    void Promise.all([loadCasinoRounds(), getRates()]).then(([stored, rates]) => {
      if (active) setRounds(convertRounds(stored, rates, currency).converted);
    });
    return () => {
      active = false;
    };
  }, [currency]);

  return rounds;
};

const KIND_NAMES: Record<CasinoKind, string> = {
  originals: 'The site’s own games',
  slots: 'Slots',
  live: 'Live tables',
  provider: 'Other studios',
};

const HEAD =
  'border-b border-border/60 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground';

const ROW = 'py-1 text-xs';

const Row = ({
  className,
  title,
  children,
}: {
  className?: string;
  title?: string;
  children: ReactNode;
}): JSX.Element => (
  <div className={cn('flex items-center gap-2', className)} title={title}>
    {children}
  </div>
);

const signTone = (value: number): 'profit' | 'loss' | 'neutral' =>
  value > 0 ? 'profit' : value < 0 ? 'loss' : 'neutral';

const toneClass = (value: number | null): string =>
  value === null || value === 0 ? 'text-foreground' : value > 0 ? 'text-profit' : 'text-loss';

/**
 * The casino, which the sportsbook figures otherwise swallow.
 *
 * Every figure here is built from the rounds themselves, so the period picker
 * cuts them the way it cuts bets: a round happened at a moment and belongs to
 * whatever window holds that moment. Nothing on the page is a lifetime tally,
 * which is why nothing on it contradicts the picker above it.
 */
export const CasinoPage = (): JSX.Element => {
  const { bookmaker, currency, days, until } = useDashboard();
  const logins = useAllKnownAccounts();
  const allRounds = useRounds(currency);

  const casinoKeys = useMemo(
    () =>
      new Set(
        logins
          .filter(
            (login) =>
              (bookmaker === 'all' || login.bookmaker === bookmaker) &&
              findAccount(login.bookmaker)?.hasCasino === true,
          )
          .map((login) => accountKey(login)),
      ),
    [logins, bookmaker],
  );

  // Rounds are single moments, so unlike a lifetime tally they take the period
  // picker without lying: what was played in a window is what was played.
  const rounds = useMemo(() => {
    const from = days === null ? -Infinity : rangeCutoff(days, until);
    const to = days === null ? Infinity : rangeEnd(until);
    return allRounds.filter((round) => {
      const at = Date.parse(round.playedAt);
      return casinoKeys.has(accountKey(round)) && at >= from && at < to;
    });
  }, [allRounds, casinoKeys, days, until]);

  const played = useMemo(() => casinoRoundTotals(rounds), [rounds]);
  const curve = useMemo(() => casinoRoundCurve(rounds), [rounds]);
  const games = useMemo(() => casinoByGame(rounds), [rounds]);
  const kinds = useMemo(() => casinoByKind(rounds), [rounds]);

  const money = (value: number | null): string =>
    value === null ? '—' : formatMoney(value, currency);

  if (casinoKeys.size === 0) {
    return (
      <DashboardCard className="p-5">
        <DashboardCardHeading
          title="Casino"
          subtitle="No connected account runs a casino off its betting wallet."
        />
        <p className="text-sm text-muted-foreground">
          This page fills itself the moment such an account is connected.
        </p>
      </DashboardCard>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-5">
        <MetricCard
          icon={Dices}
          label="Casino result"
          value={money(played.net)}
          subtitle={`${played.rounds} rounds in this period`}
          tone={signTone(played.net)}
        />
        <MetricCard
          icon={Coins}
          label="Staked"
          value={money(played.staked)}
          subtitle={
            played.rounds === 0 ? 'Spun through' : `${money(played.staked / played.rounds)} a round`
          }
        />
        <MetricCard
          icon={Percent}
          label="Actual return"
          value={played.rtp === null ? '—' : formatPercent(played.rtp * 100)}
          subtitle="Came back per unit staked"
          tone={played.rtp === null ? 'neutral' : signTone(played.rtp - 1)}
        />
        <MetricCard
          icon={Target}
          label="Rounds that paid"
          value={played.rounds === 0 ? '—' : formatPercent((played.won / played.rounds) * 100)}
          subtitle={`${played.won} of ${played.rounds} came back over the stake`}
        />
        <MetricCard
          icon={TrendingUp}
          label="Best round"
          value={played.bestRound === null ? '—' : money(roundNet(played.bestRound))}
          subtitle={
            played.worstRound === null
              ? 'Nothing played yet'
              : `Worst ${money(roundNet(played.worstRound))} · ${played.worstRound.game}`
          }
          tone={played.bestRound === null ? 'neutral' : signTone(roundNet(played.bestRound))}
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-3">
        <div className="flex min-h-0 flex-col gap-3 xl:col-span-2">
          <DashboardCard className="flex min-h-0 flex-[3] flex-col p-4">
            <DashboardCardHeading
              className="mb-3"
              title="Casino over time"
              subtitle={
                rounds.length === 0 ? 'Nothing played in this period' : 'One step per round'
              }
            />
            <div className="min-h-0 flex-1 overflow-hidden">
              {rounds.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Either no round was played in this period, or the site hands out no round-by-round
                  history.
                </p>
              ) : (
                <RunningPlChart
                  series={curve}
                  currency={currency}
                  days={days}
                  until={until}
                  deltaLabel="This round"
                  totalLabel="Casino result"
                />
              )}
            </div>
          </DashboardCard>

          <div className="grid min-h-0 flex-[2] gap-3 sm:grid-cols-2">
            <DashboardCard className="flex min-h-0 flex-col p-4">
              <DashboardCardHeading
                className="mb-2"
                title="Where it went"
                subtitle="By game, most staked first"
              />
              <Row className={HEAD}>
                <span className="flex-1">Game</span>
                <span className="w-10 text-right">Rounds</span>
                <span className="w-16 text-right">Staked</span>
                <span className="w-16 text-right">Result</span>
                <span className="w-12 text-right">Return</span>
              </Row>
              <div className="scroll-area min-h-0 flex-1 overflow-y-auto">
                {games.map((game) => (
                  <Row key={game.label} className={ROW}>
                    <span className="flex-1 truncate" title={game.provider ?? undefined}>
                      {game.label}
                    </span>
                    <span className="w-10 text-right tabular-nums text-muted-foreground">
                      {game.rounds}
                    </span>
                    <span className="w-16 text-right tabular-nums text-muted-foreground">
                      {formatMoney(game.staked, currency)}
                    </span>
                    <span className={cn('w-16 text-right tabular-nums', toneClass(game.net))}>
                      {formatMoney(game.net, currency)}
                    </span>
                    <span className="w-12 text-right tabular-nums text-muted-foreground">
                      {game.rtp === null ? '—' : formatPercent(game.rtp * 100, 0)}
                    </span>
                  </Row>
                ))}
              </div>
            </DashboardCard>

            <DashboardCard className="flex min-h-0 flex-col p-4">
              <DashboardCardHeading
                className="mb-2"
                title="By type"
                subtitle="What the site calls each corner of its casino"
              />
              <Row className={HEAD}>
                <span className="flex-1">Type</span>
                <span className="w-10 text-right">Rounds</span>
                <span className="w-16 text-right">Staked</span>
                <span className="w-16 text-right">Result</span>
                <span className="w-12 text-right">Return</span>
              </Row>
              <div className="scroll-area min-h-0 flex-1 overflow-y-auto">
                {kinds.map((kind) => (
                  <Row key={kind.label} className={ROW}>
                    <span
                      className="flex-1 truncate"
                      title={`${formatPercent(kind.share * 100, 0)} of the turnover`}
                    >
                      {KIND_NAMES[kind.kind]}
                    </span>
                    <span className="w-10 text-right tabular-nums text-muted-foreground">
                      {kind.rounds}
                    </span>
                    <span className="w-16 text-right tabular-nums text-muted-foreground">
                      {formatMoney(kind.staked, currency)}
                    </span>
                    <span className={cn('w-16 text-right tabular-nums', toneClass(kind.net))}>
                      {formatMoney(kind.net, currency)}
                    </span>
                    <span className="w-12 text-right tabular-nums text-muted-foreground">
                      {kind.rtp === null ? '—' : formatPercent(kind.rtp * 100, 0)}
                    </span>
                  </Row>
                ))}
              </div>
            </DashboardCard>
          </div>
        </div>

        <DashboardCard className="flex h-full min-h-0 flex-col p-4">
          <DashboardCardHeading className="mb-2" title="Rounds" subtitle="Newest first" />
          <Row className={HEAD}>
            <span className="w-24">When</span>
            <span className="flex-1">Game</span>
            <span className="w-16 text-right">Staked</span>
            <span className="w-16 text-right">Result</span>
          </Row>
          <div className="scroll-area min-h-0 flex-1 overflow-y-auto">
            {[...rounds]
              .sort((a, b) => b.playedAt.localeCompare(a.playedAt))
              .map((round) => (
                <Row key={round.id} className={ROW} title={`${round.multiplier.toFixed(2)}×`}>
                  <span className="w-24 shrink-0 tabular-nums text-[11px] text-muted-foreground">
                    {formatDateTime(round.playedAt)}
                  </span>
                  <span className="flex-1 truncate" title={round.provider ?? undefined}>
                    {round.game}
                  </span>
                  <span className="w-16 text-right tabular-nums text-muted-foreground">
                    {formatMoney(round.stake, currency)}
                  </span>
                  <span
                    className={cn(
                      'w-16 text-right tabular-nums',
                      toneClass(round.payout - round.stake),
                    )}
                  >
                    {formatMoney(round.payout - round.stake, currency)}
                  </span>
                </Row>
              ))}
          </div>
        </DashboardCard>
      </div>
    </div>
  );
};
