import { decisiveBets, equityCurve, isWin } from '@betanal/shared';
import { CircleDollarSign, Coins, Flame, Percent, TrendingUp, Wallet } from 'lucide-react';
import { useMemo } from 'react';
import {
  DashboardCard,
  DashboardCardHeading,
} from '@/components/dashboard/dashboard-card';
import { MetricCard } from '@/components/dashboard/metric-card';
import { LeakCard } from '@/components/dashboard/leak-card';
import { HighlightsCard } from '@/components/dashboard/highlights-card';
import { ChartViewToggle, type TimelineChartView } from '@/components/dashboard/chart-view-toggle';
import { ProfitTimelineChart } from '@/components/dashboard/profit-timeline-chart';
import { ProfitTimelineLineChart } from '@/components/dashboard/profit-timeline-line-chart';
import { RunningPlChart } from '@/components/dashboard/running-pl-chart';
import { StatusBreakdownCard } from '@/components/dashboard/status-breakdown-card';
import { PickAccuracyCard } from '@/components/dashboard/pick-accuracy-card';
import { useDashboard } from '@/context/dashboard-context';
import { findAccount } from '@/data/accounts';
import {
  rangeCutoff,
  rangeEnd,
  timelineBuckets,
  timelineBucketsAt,
  timelineGranularity,
} from '@/lib/chart-data';
import { analyzePeriod } from '@/lib/period-analytics';
import { usePersistedState } from '@/lib/persisted-state';
import { formatMoney, formatPercent } from '@/lib/utils';

/** Which reading the profit card is showing: settled bets, or money in and out. */
type ProfitView = 'betting' | 'cashflow';

/** Only for a bookmaker with no colour of its own — every known one brings one. */
const FALLBACK_COLORS = ['hsl(38 92% 52%)', 'hsl(280 62% 62%)', 'hsl(172 62% 42%)'];

const signTone = (value: number): 'profit' | 'loss' | 'neutral' =>
  value > 0 ? 'profit' : value < 0 ? 'loss' : 'neutral';

export const OverviewPage = (): JSX.Element => {
  const { bets, periodBets, transactions, loading, days, until } = useDashboard();
  const [timelineView, setTimelineView] = usePersistedState<TimelineChartView>(
    'overview.timelineView',
    'bars',
    ['bars', 'line'],
  );
  // Cash flow first: what left the account is the figure a bettor came to check,
  // and the settled-bet reading is one click behind it.
  const [profitView, setProfitView] = usePersistedState<ProfitView>(
    'overview.profitView',
    'cashflow',
    ['betting', 'cashflow'],
  );

  const currency = periodBets[0]?.currency ?? bets[0]?.currency ?? 'EUR';

  const analytics = useMemo(() => analyzePeriod(periodBets), [periodBets]);

  // Slips that settled either way — the same set the win rate is measured over.
  const decidedSlips = useMemo(() => {
    const decided = decisiveBets(periodBets);
    return { won: decided.filter(isWin).length, total: decided.length };
  }, [periodBets]);

  const metrics = useMemo(
    () => ({
      equity: equityCurve(periodBets),
      timeline: timelineBuckets(periodBets, days, until),
    }),
    [periodBets, days, until],
  );

  // What the pocket actually saw over the period: money taken back out, less
  // money paid in. Bets are already inside those movements, so this and the
  // settled-bet profit are two readings of the same period, not two totals.
  const cashFlow = useMemo(() => {
    const cutoff = days === null ? 0 : rangeCutoff(days, until);
    const end = rangeEnd(until);
    let deposits = 0;
    let withdrawals = 0;
    for (const t of transactions) {
      const at = Date.parse(t.occurredAt);
      if (at < cutoff || at >= end) continue;
      if (t.kind === 'deposit') deposits += t.amount;
      else withdrawals += t.amount;
    }
    return withdrawals - deposits;
  }, [transactions, days, until]);

  // One running total per account, over the buckets the whole period produced.
  // Below two accounts there is nothing to compare, so the chart keeps its
  // single green/red curve rather than recolouring it for no reason.
  const accountSeries = useMemo(() => {
    const books = [...new Set(periodBets.map((b) => b.bookmaker))];
    if (books.length < 2) return undefined;
    const granularity = timelineGranularity(periodBets, days, until);
    return books.map((bookmaker, i) => {
      const own = timelineBucketsAt(
        periodBets.filter((b) => b.bookmaker === bookmaker),
        granularity,
        days,
        until,
      );
      const profitByKey = new Map(own.map((b) => [b.key, b.profit]));
      const account = findAccount(bookmaker);
      let total = 0;
      return {
        bookmaker,
        label: account?.name ?? bookmaker,
        color: account?.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]!,
        values: metrics.timeline.map((b) => {
          total += profitByKey.get(b.key) ?? 0;
          return total;
        }),
      };
    });
  }, [periodBets, days, until, metrics.timeline]);

  // An empty chart means two different things, and they need opposite fixes:
  // connect an account, or widen the window.
  const noSource = bets.length === 0;

  const { summary } = analytics;
  const profitTone = signTone(summary.totalProfit);
  // Coloured by what the card actually reads: a return that rounds to 0.0% is
  // break-even on screen, and painting it red argues with the figure beside it.
  const roiTone = signTone(Number(summary.roi.toFixed(1)));
  const { streak } = analytics;
  const runLabel =
    streak.currentType === null
      ? '—'
      : `${streak.current} ${streak.currentType === 'W' ? 'won' : 'lost'}`;

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <div
        data-tour="kpis"
        className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"
      >
        {profitView === 'betting' ? (
          <MetricCard
            icon={CircleDollarSign}
            label="Betting profit"
            value={formatMoney(summary.totalProfit, currency)}
            subtitle={`${summary.totalBets} bets`}
            tone={profitTone}
            onClick={() => setProfitView('cashflow')}
            title="Click for cash flow profit"
          />
        ) : (
          <MetricCard
            icon={CircleDollarSign}
            label="Cash flow profit"
            value={formatMoney(cashFlow, currency)}
            subtitle="Withdrawn − deposited"
            tone={signTone(cashFlow)}
            onClick={() => setProfitView('betting')}
            title="Click for betting profit"
          />
        )}
        <MetricCard
          icon={TrendingUp}
          label="ROI"
          value={formatPercent(summary.roi)}
          subtitle="Return on settled stake"
          tone={roiTone}
        />
        <MetricCard
          icon={Wallet}
          label="Wagered"
          value={formatMoney(summary.resolvedStake, currency)}
          subtitle={`Returned ${formatMoney(summary.totalReturn, currency)}`}
        />
        <MetricCard
          icon={Coins}
          label="Average bet"
          value={formatMoney(analytics.avgStake, currency)}
          subtitle={`Biggest win ${formatMoney(analytics.biggestWin?.profit ?? 0, currency)}`}
        />
        <MetricCard
          icon={Percent}
          label="Win rate"
          value={formatPercent(summary.winRate)}
          subtitle={`You need ${formatPercent(summary.breakEvenWinRate)} to break even`}
        />
        <MetricCard
          icon={Flame}
          label="Current run"
          value={runLabel}
          subtitle={`Best streak ${analytics.streak.longestWin} wins`}
          iconHot={streak.currentType === 'W' && streak.current >= 5}
          tone={streak.currentType === 'W' ? 'profit' : streak.currentType === 'L' ? 'loss' : 'neutral'}
        />
      </div>

      <div data-tour="performance" className="grid min-h-0 flex-1 gap-3 xl:grid-cols-3">
        <DashboardCard className="flex h-full min-h-0 flex-col p-4 xl:col-span-2">
          <DashboardCardHeading
            className="mb-3"
            title="Performance"
            action={<ChartViewToggle value={timelineView} onChange={setTimelineView} />}
          />
          <div className="min-h-0 flex-1 overflow-hidden">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : timelineView === 'bars' ? (
              <ProfitTimelineChart
                data={metrics.timeline}
                currency={currency}
                days={days}
                noSource={noSource}
              />
            ) : (
              <ProfitTimelineLineChart
                data={metrics.timeline}
                currency={currency}
                days={days}
                series={accountSeries}
                noSource={noSource}
              />
            )}
          </div>
        </DashboardCard>

        <DashboardCard className="flex h-full min-h-0 flex-col p-4">
          <DashboardCardHeading className="mb-3" title="Running total" />
          <div className="min-h-0 flex-1 overflow-hidden">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <RunningPlChart
                series={metrics.equity}
                currency={currency}
                days={days}
                until={until}
                noSource={noSource}
              />
            )}
          </div>
        </DashboardCard>
      </div>

      <div
        data-tour="reads"
        className="grid shrink-0 gap-3 sm:grid-cols-2 xl:h-[332px] xl:grid-cols-4"
      >
        <PickAccuracyCard
          legs={analytics.legs}
          combo={analytics.combo}
          streak={analytics.streak}
          meanImplied={analytics.meanImplied}
          slips={decidedSlips}
          currency={currency}
        />
        <StatusBreakdownCard status={analytics.status} total={periodBets.length} />
        <HighlightsCard
          biggestWin={analytics.biggestWin}
          biggestLoss={analytics.biggestLoss}
          bestDay={analytics.bestDay}
          worstDay={analytics.worstDay}
          bestPick={analytics.bestPick}
          worstPick={analytics.worstPick}
          pickSplit={analytics.pickSplit}
          avgWin={analytics.avgWin}
          avgLoss={analytics.avgLoss}
          picksPerSlip={analytics.picksPerSlip}
          meanOdds={analytics.meanOdds}
          currency={currency}
        />
        <LeakCard
          leaks={analytics.leaks}
          pickLeaks={analytics.pickLeaks}
          comboBands={analytics.comboBands}
          currency={currency}
        />
      </div>
    </div>
  );
};
