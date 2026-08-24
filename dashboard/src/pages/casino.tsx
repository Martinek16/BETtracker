import { useEffect, useMemo, useState } from 'react';
import {
  accountKey,
  casinoByGame,
  casinoCurve,
  casinoSessions,
  casinoTotals,
  convertAmount,
  convertRounds,
  dayOf,
  type CasinoAccountInput,
  type CasinoRound,
  type CasinoSnapshot,
} from '@betanal/shared';
import { Coins, Dices, Percent, PieChart } from 'lucide-react';
import { DashboardCard, DashboardCardHeading } from '@/components/dashboard/dashboard-card';
import { MetricCard } from '@/components/dashboard/metric-card';
import { RunningPlChart } from '@/components/dashboard/running-pl-chart';
import { useDashboard } from '@/context/dashboard-context';
import { findAccount, useAllKnownAccounts, useVisibleHistory } from '@/data/accounts';
import { getRates, loadBalanceHistory, loadCasinoRounds } from '@/data/source';
import { rangeCutoff, rangeEnd } from '@/lib/chart-data';
import { cn, formatDate, formatDateTime, formatMoney, formatPercent } from '@/lib/utils';

/**
 * Every balance reading the extension ever took, priced on the day it was taken
 * and filed under the account it belongs to. The stored readings are raw, unlike
 * the one the dashboard hands out, so each needs the rate of its own day.
 */
const useSnapshots = (currency: string): Map<string, CasinoSnapshot[]> => {
  const [byAccount, setByAccount] = useState<Map<string, CasinoSnapshot[]>>(new Map());

  useEffect(() => {
    let active = true;
    void Promise.all([loadBalanceHistory(), getRates()]).then(([history, rates]) => {
      if (!active) return;
      const next = new Map<string, CasinoSnapshot[]>();
      for (const row of history) {
        const day = dayOf(row.capturedAt);
        const from = row.currency ?? currency;
        const held = convertAmount(row.amount + (row.vault ?? 0), from, day, rates, currency);
        if (held === null) continue;
        const wagered =
          row.wagered === undefined
            ? null
            : convertAmount(row.wagered.casino, from, day, rates, currency);
        const reported =
          row.result === undefined
            ? null
            : convertAmount(row.result.casino, from, day, rates, currency);
        const key = accountKey(row);
        next.set(key, [...(next.get(key) ?? []), { at: row.capturedAt, held, wagered, reported }]);
      }
      setByAccount(next);
    });
    return () => {
      active = false;
    };
  }, [currency]);

  return byAccount;
};

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

const signTone = (value: number): 'profit' | 'loss' | 'neutral' =>
  value > 0 ? 'profit' : value < 0 ? 'loss' : 'neutral';

const toneClass = (value: number | null): string =>
  value === null || value === 0 ? 'text-foreground' : value > 0 ? 'text-profit' : 'text-loss';

/**
 * The casino, which the sportsbook figures otherwise swallow. It is read whole
 * rather than by the period picker: what the casino took is the money the bets
 * and the payments cannot explain, and that sum only closes over the whole
 * history of an account.
 */
export const CasinoPage = (): JSX.Element => {
  const { accountBalances, bookmaker, days, until } = useDashboard();
  const logins = useAllKnownAccounts();
  const stored = useVisibleHistory(true);

  const currency = stored.currency;
  const snapshots = useSnapshots(currency);
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

  const totals = useMemo(() => casinoTotals(inputs), [inputs]);

  // One curve per casino account rather than one for all of them: the readings of
  // two accounts fall on different days, and a single line would have to invent
  // the days each account was not read on. The curve is the one figure here the
  // period can honestly cut, since every point stands on a reading of its own.
  const curves = useMemo(() => {
    const from = days === null ? -Infinity : rangeCutoff(days, until);
    const to = days === null ? Infinity : rangeEnd(until);
    return inputs
      .filter((input) => input.hasCasino)
      .map((input) => ({
        input,
        points: casinoCurve(
          snapshots.get(input.key) ?? [],
          input.bets,
          input.transactions,
          input.bonuses,
        ).filter((point) => {
          const at = Date.parse(point.date);
          return at >= from && at < to;
        }),
      }))
      .filter((curve) => curve.points.length > 1);
  }, [inputs, snapshots, days, until]);

  // Rounds are single moments, so unlike the wallet gap they take the period
  // picker without lying: what was played in a window is what was played.
  const rounds = useMemo(() => {
    const keys = new Set(inputs.map((input) => input.key));
    const from = days === null ? -Infinity : rangeCutoff(days, until);
    const to = days === null ? Infinity : rangeEnd(until);
    return allRounds.filter((round) => {
      const at = Date.parse(round.playedAt);
      return keys.has(accountKey(round)) && at >= from && at < to;
    });
  }, [allRounds, inputs, days, until]);

  const games = useMemo(() => casinoByGame(rounds), [rounds]);
  const sessions = useMemo(() => casinoSessions(rounds), [rounds]);

  const money = (value: number | null): string =>
    value === null ? '—' : formatMoney(value, currency);

  // Two different figures wear the same label, so the page has to say which one
  // it is showing: a site's own statement, or the money its wallet cannot account
  // for - and that second one carries every payment nobody ever read.
  const inferred = totals.accounts.some((account) => account.source === 'wallet');

  if (totals.accounts.length === 0) {
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
    <div className="flex h-full flex-col gap-3 overflow-y-auto">
      <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard
          icon={Dices}
          label="Casino result"
          value={money(totals.net)}
          subtitle={
            inferred
              ? 'What the wallet cannot explain'
              : 'What the casino took, as the site states it'
          }
          tone={totals.net === null ? 'neutral' : signTone(totals.net)}
        />
        <MetricCard
          icon={Coins}
          label="Wagered"
          value={money(totals.wagered)}
          subtitle="Spun through, as the site counts it"
        />
        <MetricCard
          icon={Percent}
          label="Actual return"
          value={totals.rtp === null ? '—' : formatPercent(totals.rtp * 100)}
          subtitle="Came back per unit staked"
          tone={totals.rtp === null ? 'neutral' : signTone(totals.rtp - 1)}
        />
        <MetricCard
          icon={PieChart}
          label="Share of what you lost"
          value={totals.shareOfLoss === null ? '—' : formatPercent(totals.shareOfLoss * 100)}
          subtitle="The rest went on bets"
        />
      </div>

      {curves.length === 0 ? (
        <DashboardCard className="shrink-0 p-4">
          <DashboardCardHeading
            title="Casino over time"
            subtitle="A line needs two balance readings in the period above, and this account has fewer."
          />
        </DashboardCard>
      ) : (
        curves.map(({ input, points }) => (
          <div key={input.key} className="grid min-h-[320px] flex-1 gap-3 xl:grid-cols-3">
            <DashboardCard className="flex h-full min-h-0 flex-col p-4 xl:col-span-2">
              <DashboardCardHeading
                className="mb-3"
                title="Casino over time"
                subtitle={`${findAccount(input.bookmaker)?.name ?? input.bookmaker} · one point per balance reading`}
              />
              <div className="min-h-0 flex-1 overflow-hidden">
                <RunningPlChart
                  series={points}
                  currency={currency}
                  days={days}
                  until={until}
                  deltaLabel="Since last reading"
                  totalLabel="Casino result"
                />
              </div>
            </DashboardCard>

            <DashboardCard className="flex h-full min-h-0 flex-col p-4">
              <DashboardCardHeading className="mb-3" title="Readings" />
              <div className="flex items-center gap-3 border-b border-border/60 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="flex-1">When</span>
                <span className="w-24 text-right">Spun</span>
                <span className="w-24 text-right">Took</span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {[...points].reverse().map((point) => (
                  <div key={point.date} className="flex items-center gap-3 py-1.5 text-sm">
                    <span className="flex-1 truncate text-muted-foreground">
                      {formatDate(point.date)}
                    </span>
                    <span className="w-24 text-right tabular-nums text-muted-foreground">
                      {point.wagered === null ? '—' : formatMoney(point.wagered, currency)}
                    </span>
                    <span className={cn('w-24 text-right tabular-nums', toneClass(point.profit))}>
                      {formatMoney(point.profit, currency)}
                    </span>
                  </div>
                ))}
              </div>
            </DashboardCard>
          </div>
        ))
      )}

      {rounds.length > 0 && (
        <div className="grid shrink-0 gap-3 xl:grid-cols-2">
          <DashboardCard className="flex max-h-[360px] flex-col p-4">
            <DashboardCardHeading
              className="mb-3"
              title="Where it went"
              subtitle="By game, most staked first"
            />
            <div className="flex items-center gap-3 border-b border-border/60 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="flex-1">Game</span>
              <span className="w-16 text-right">Rounds</span>
              <span className="w-24 text-right">Staked</span>
              <span className="w-24 text-right">Result</span>
              <span className="w-16 text-right">Return</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {games.map((game) => (
                <div key={game.label} className="flex items-center gap-3 py-1.5 text-sm">
                  <span className="flex-1 truncate" title={game.provider ?? undefined}>
                    {game.label}
                  </span>
                  <span className="w-16 text-right tabular-nums text-muted-foreground">
                    {game.rounds}
                  </span>
                  <span className="w-24 text-right tabular-nums text-muted-foreground">
                    {formatMoney(game.staked, currency)}
                  </span>
                  <span className={cn('w-24 text-right tabular-nums', toneClass(game.net))}>
                    {formatMoney(game.net, currency)}
                  </span>
                  <span className="w-16 text-right tabular-nums text-muted-foreground">
                    {game.rtp === null ? '—' : formatPercent(game.rtp * 100)}
                  </span>
                </div>
              ))}
            </div>
          </DashboardCard>

          <DashboardCard className="flex max-h-[360px] flex-col p-4">
            <DashboardCardHeading
              className="mb-3"
              title="Sittings"
              subtitle="Rounds with no half-hour break between them, newest first"
            />
            <div className="flex items-center gap-3 border-b border-border/60 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="flex-1">Started</span>
              <span className="w-16 text-right">Rounds</span>
              <span className="w-24 text-right">Staked</span>
              <span className="w-24 text-right">Result</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {sessions.map((session) => (
                <div key={session.startedAt} className="flex items-center gap-3 py-1.5 text-sm">
                  <span
                    className="flex-1 truncate text-muted-foreground"
                    title={session.games.join(', ')}
                  >
                    {formatDateTime(session.startedAt)}
                  </span>
                  <span className="w-16 text-right tabular-nums text-muted-foreground">
                    {session.totals.rounds}
                  </span>
                  <span className="w-24 text-right tabular-nums text-muted-foreground">
                    {formatMoney(session.totals.staked, currency)}
                  </span>
                  <span
                    className={cn('w-24 text-right tabular-nums', toneClass(session.totals.net))}
                  >
                    {formatMoney(session.totals.net, currency)}
                  </span>
                </div>
              ))}
            </div>
          </DashboardCard>
        </div>
      )}

      <p className="shrink-0 pb-1 text-xs leading-relaxed text-muted-foreground">
        {inferred
          ? 'Where a site states no casino result of its own, the figure above is what the wallet holds less what the bets and payments explain - so it carries any history that was never read as well. '
          : 'The casino result and the turnover are the site’s own lifetime figures, not something worked out here. '}
        Either way it covers an account’s whole life, not the period above. The rounds below are the
        ones the site still hands out, which is why they can add up to less.
      </p>
    </div>
  );
};
