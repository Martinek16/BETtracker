import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  accountKey,
  casinoByGame,
  casinoRoundCurve,
  casinoRoundTotals,
  casinoSessions,
  casinoTotals,
  convertRounds,
  totalProfit,
  type CasinoAccountInput,
  type CasinoRound,
} from '@betanal/shared';
import { Coins, Dices, Percent, PieChart } from 'lucide-react';
import { DashboardCard, DashboardCardHeading } from '@/components/dashboard/dashboard-card';
import { MetricCard } from '@/components/dashboard/metric-card';
import { RunningPlChart } from '@/components/dashboard/running-pl-chart';
import { useDashboard } from '@/context/dashboard-context';
import { findAccount, useAllKnownAccounts, useVisibleHistory } from '@/data/accounts';
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

/** As many rows as fit without the card growing a scrollbar of its own. */
const TOP_ROWS = 5;

const Row = ({ className, children }: { className?: string; children: ReactNode }): JSX.Element => (
  <div className={cn('flex items-center gap-3', className)}>{children}</div>
);

const topNote = (rows: readonly unknown[]): string =>
  rows.length > TOP_ROWS ? `Most staked first, ${TOP_ROWS} of ${rows.length}` : 'Most staked first';

const signTone = (value: number): 'profit' | 'loss' | 'neutral' =>
  value > 0 ? 'profit' : value < 0 ? 'loss' : 'neutral';

const toneClass = (value: number | null): string =>
  value === null || value === 0 ? 'text-foreground' : value > 0 ? 'text-profit' : 'text-loss';

/**
 * The casino, which the sportsbook figures otherwise swallow.
 *
 * Everything on top is built from the rounds themselves, so the period picker
 * cuts them the way it cuts bets: a round happened at a moment and belongs to
 * whatever window holds that moment. The account table at the bottom is the
 * site's own lifetime tally, which no period can honestly cut - it is there to
 * be compared against, and to say something at a site that records no rounds.
 */
export const CasinoPage = (): JSX.Element => {
  const { accountBalances, bets, bookmaker, days, until } = useDashboard();
  const logins = useAllKnownAccounts();
  const stored = useVisibleHistory(true);

  const currency = stored.currency;
  const allRounds = useRounds(currency);

  const inputs = useMemo(
    (): CasinoAccountInput[] =>
      logins
        .filter((login) => bookmaker === 'all' || login.bookmaker === bookmaker)
        .map((login) => {
          const key = accountKey(login);
          const read = accountBalances.find((row) => row.key === key);
          return {
            bookmaker: login.bookmaker,
            key,
            hasCasino: findAccount(login.bookmaker)?.hasCasino === true,
            bets: stored.bets.filter((bet) => accountKey(bet) === key),
            transactions: stored.transactions.filter((t) => accountKey(t) === key),
            bonuses: stored.bonuses.filter((b) => accountKey(b) === key),
            balance: read?.amount ?? null,
            vault: read?.vault ?? null,
            wagered: read?.wagered?.casino ?? null,
            reported: read?.result?.casino ?? null,
          };
        }),
    [logins, accountBalances, stored, bookmaker],
  );

  const lifetime = useMemo(() => casinoTotals(inputs), [inputs]);

  // Rounds are single moments, so unlike a lifetime tally they take the period
  // picker without lying: what was played in a window is what was played.
  const rounds = useMemo(() => {
    const keys = new Set(inputs.filter((input) => input.hasCasino).map((input) => input.key));
    const from = days === null ? -Infinity : rangeCutoff(days, until);
    const to = days === null ? Infinity : rangeEnd(until);
    return allRounds.filter((round) => {
      const at = Date.parse(round.playedAt);
      return keys.has(accountKey(round)) && at >= from && at < to;
    });
  }, [allRounds, inputs, days, until]);

  const played = useMemo(() => casinoRoundTotals(rounds), [rounds]);
  const curve = useMemo(() => casinoRoundCurve(rounds), [rounds]);
  const games = useMemo(() => casinoByGame(rounds), [rounds]);
  const sessions = useMemo(() => casinoSessions(rounds), [rounds]);

  // Both losses over the same window, so the split answers the question the card
  // asks - of the money lost in this period, how much of it the casino took.
  const shareOfLoss = useMemo(() => {
    const casinoLoss = Math.max(0, -played.net);
    const betLoss = Math.max(0, -totalProfit(bets));
    return casinoLoss + betLoss === 0 ? null : casinoLoss / (casinoLoss + betLoss);
  }, [played.net, bets]);

  const money = (value: number | null): string =>
    value === null ? '—' : formatMoney(value, currency);

  if (lifetime.accounts.length === 0) {
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
      <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
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
          subtitle="Spun through"
        />
        <MetricCard
          icon={Percent}
          label="Actual return"
          value={played.rtp === null ? '—' : formatPercent(played.rtp * 100)}
          subtitle="Came back per unit staked"
          tone={played.rtp === null ? 'neutral' : signTone(played.rtp - 1)}
        />
        <MetricCard
          icon={PieChart}
          label="Share of what you lost"
          value={shareOfLoss === null ? '—' : formatPercent(shareOfLoss * 100)}
          subtitle="The rest went on bets"
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-3">
        <DashboardCard className="flex h-full min-h-0 flex-col p-4 xl:col-span-2">
          <DashboardCardHeading
            className="mb-3"
            title="Casino over time"
            subtitle={rounds.length === 0 ? 'Nothing played in this period' : 'One step per round'}
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

        <DashboardCard className="flex h-full min-h-0 flex-col p-4">
          <DashboardCardHeading className="mb-3" title="Rounds" subtitle="Newest first" />
          <Row className="border-b border-border/60 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="flex-1">When</span>
            <span className="w-14 text-right">×</span>
            <span className="w-20 text-right">Staked</span>
            <span className="w-20 text-right">Result</span>
          </Row>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {[...rounds]
              .sort((a, b) => b.playedAt.localeCompare(a.playedAt))
              .map((round) => (
                <Row key={round.id} className="py-1.5 text-sm">
                  <span className="flex-1 truncate" title={formatDateTime(round.playedAt)}>
                    {round.game}
                  </span>
                  <span className="w-14 text-right tabular-nums text-muted-foreground">
                    {`${round.multiplier.toFixed(2)}×`}
                  </span>
                  <span className="w-20 text-right tabular-nums text-muted-foreground">
                    {formatMoney(round.stake, currency)}
                  </span>
                  <span
                    className={cn(
                      'w-20 text-right tabular-nums',
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

      <div className="grid shrink-0 gap-3 xl:grid-cols-3">
        <DashboardCard className="p-4">
          <DashboardCardHeading className="mb-3" title="Where it went" subtitle={topNote(games)} />
          <Row className="border-b border-border/60 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="flex-1">Game</span>
            <span className="w-20 text-right">Staked</span>
            <span className="w-20 text-right">Result</span>
          </Row>
          {games.slice(0, TOP_ROWS).map((game) => (
            <Row key={game.label} className="py-1.5 text-sm">
              <span className="flex-1 truncate" title={game.provider ?? undefined}>
                {game.label}
              </span>
              <span className="w-20 text-right tabular-nums text-muted-foreground">
                {formatMoney(game.staked, currency)}
              </span>
              <span className={cn('w-20 text-right tabular-nums', toneClass(game.net))}>
                {formatMoney(game.net, currency)}
              </span>
            </Row>
          ))}
        </DashboardCard>

        <DashboardCard className="p-4">
          <DashboardCardHeading
            className="mb-3"
            title="Sittings"
            subtitle="No half-hour break between rounds"
          />
          <Row className="border-b border-border/60 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="flex-1">Started</span>
            <span className="w-14 text-right">Rounds</span>
            <span className="w-20 text-right">Result</span>
          </Row>
          {sessions.slice(0, TOP_ROWS).map((session) => (
            <Row key={session.startedAt} className="py-1.5 text-sm">
              <span
                className="flex-1 truncate text-muted-foreground"
                title={session.games.join(', ')}
              >
                {formatDateTime(session.startedAt)}
              </span>
              <span className="w-14 text-right tabular-nums text-muted-foreground">
                {session.totals.rounds}
              </span>
              <span className={cn('w-20 text-right tabular-nums', toneClass(session.totals.net))}>
                {formatMoney(session.totals.net, currency)}
              </span>
            </Row>
          ))}
        </DashboardCard>

        <DashboardCard className="p-4">
          <DashboardCardHeading
            className="mb-3"
            title="Lifetime, per account"
            subtitle="Whatever period is chosen above"
          />
          <Row className="border-b border-border/60 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="flex-1">Account</span>
            <span className="w-20 text-right">Wagered</span>
            <span className="w-20 text-right">Result</span>
            <span className="w-14 text-right">Return</span>
          </Row>
          {lifetime.accounts.map((account) => (
            <Row key={account.key} className="py-1.5 text-sm">
              <span
                className="flex-1 truncate"
                title={account.source === 'site' ? 'the site’s own tally' : 'the gap in the wallet'}
              >
                {findAccount(account.bookmaker)?.name ?? account.bookmaker}
              </span>
              <span className="w-20 text-right tabular-nums text-muted-foreground">
                {account.wagered === null ? 'not read' : formatMoney(account.wagered, currency)}
              </span>
              <span className={cn('w-20 text-right tabular-nums', toneClass(account.net))}>
                {money(account.net)}
              </span>
              <span className="w-14 text-right tabular-nums text-muted-foreground">
                {account.rtp === null ? '—' : formatPercent(account.rtp * 100)}
              </span>
            </Row>
          ))}
        </DashboardCard>
      </div>
    </div>
  );
};
