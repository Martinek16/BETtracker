import { useState } from 'react';
import type { SelectionStats } from '@betanal/shared';
import type { AnalysisUnit } from '@/context/dashboard-context';
import type { DayResult, HighlightBet, PickHighlight } from '@/lib/period-analytics';
import { cn, formatDate, formatMoney, formatPercent } from '@/lib/utils';
import { AnalysisUnitToggle } from './analysis-unit-toggle';
import { DashboardCard, DashboardCardHeading } from './dashboard-card';

interface HighlightsCardProps {
  biggestWin: HighlightBet | null;
  biggestLoss: HighlightBet | null;
  bestDay: DayResult | null;
  worstDay: DayResult | null;
  bestPick: PickHighlight | null;
  worstPick: PickHighlight | null;
  pickSplit: SelectionStats[];
  avgWin: number;
  avgLoss: number;
  picksPerSlip: number;
  meanOdds: number;
  currency: string;
}

const moneyClass = (value: number): string =>
  value > 0 ? 'text-profit' : value < 0 ? 'text-loss' : 'text-foreground';

const Row = ({
  label,
  title,
  value,
  valueClassName,
}: {
  label: string;
  title: string | null;
  value: string;
  valueClassName: string;
}): JSX.Element => (
  <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-2.5 py-2">
    <div className="min-w-0">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="truncate text-xs font-medium" title={title ?? undefined}>
        {title ?? '—'}
      </p>
    </div>
    <span className={cn('shrink-0 text-xs font-semibold tabular-nums', valueClassName)}>
      {value}
    </span>
  </div>
);

const Stat = ({
  label,
  value,
  hint,
  valueClassName,
}: {
  label: string;
  value: string;
  hint: string;
  valueClassName?: string;
}): JSX.Element => (
  <div className="text-center">
    <p className="text-[10px] text-muted-foreground">{label}</p>
    <p className={cn('text-sm font-semibold tabular-nums', valueClassName)}>{value}</p>
    <p className="truncate text-[10px] text-muted-foreground">{hint}</p>
  </div>
);

const pickSplitStat = (split: SelectionStats[], key: string): { value: string; hint: string } => {
  const group = split.find((g) => g.key === key);
  if (group === undefined || group.decided === 0) return { value: '—', hint: 'None settled' };
  return {
    value: formatPercent(group.hitRate),
    hint: `${String(group.won)} of ${String(group.decided)} picks`,
  };
};

/**
 * The two results and the two days worth remembering. Judged per slip, which is
 * what was actually paid out, or per pick, where a leg of a combo has no money
 * of its own and so is measured by price and hit rate instead.
 */
export const HighlightsCard = ({
  biggestWin,
  biggestLoss,
  bestDay,
  worstDay,
  bestPick,
  worstPick,
  pickSplit,
  avgWin,
  avgLoss,
  picksPerSlip,
  meanOdds,
  currency,
}: HighlightsCardProps): JSX.Element => {
  const [unit, setUnit] = useState<AnalysisUnit>('slips');
  const favorites = pickSplitStat(pickSplit, 'Favorite');
  const underdogs = pickSplitStat(pickSplit, 'Underdog');

  return (
    <DashboardCard className="flex h-full flex-col overflow-hidden p-4">
      <DashboardCardHeading
        className="mb-3"
        title="Highlights"
        action={<AnalysisUnitToggle value={unit} onChange={setUnit} />}
      />
      {/* The two rows keep their size; the figures share out whatever height is
          left, so they sit centred instead of hanging under a gap. */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        {unit === 'slips' ? (
          <>
            <Row
              label="Biggest win"
              title={biggestWin?.label ?? null}
              value={biggestWin ? formatMoney(biggestWin.profit, currency) : '—'}
              valueClassName={biggestWin ? moneyClass(biggestWin.profit) : 'text-muted-foreground'}
            />
            <Row
              label="Biggest loss"
              title={biggestLoss?.label ?? null}
              value={biggestLoss ? formatMoney(biggestLoss.profit, currency) : '—'}
              valueClassName={
                biggestLoss ? moneyClass(biggestLoss.profit) : 'text-muted-foreground'
              }
            />
            <div className="grid flex-1 grid-cols-2 content-evenly gap-x-3 gap-y-5">
              <Stat
                label="Best day"
                value={bestDay ? formatMoney(bestDay.profit, currency) : '—'}
                hint={bestDay ? `${formatDate(bestDay.date)} · ${String(bestDay.bets)} bets` : '—'}
                valueClassName={bestDay ? moneyClass(bestDay.profit) : undefined}
              />
              <Stat
                label="Worst day"
                value={worstDay ? formatMoney(worstDay.profit, currency) : '—'}
                hint={
                  worstDay ? `${formatDate(worstDay.date)} · ${String(worstDay.bets)} bets` : '—'
                }
                valueClassName={worstDay ? moneyClass(worstDay.profit) : undefined}
              />
              <Stat
                label="Average win"
                value={formatMoney(avgWin, currency)}
                hint="Per slip that won"
                valueClassName={moneyClass(avgWin)}
              />
              <Stat
                label="Average loss"
                value={formatMoney(avgLoss, currency)}
                hint="Per slip that lost"
                valueClassName={moneyClass(avgLoss)}
              />
            </div>
          </>
        ) : (
          <>
            <Row
              label="Biggest odds that won"
              title={bestPick?.label ?? null}
              value={bestPick ? bestPick.odds.toFixed(2) : '—'}
              valueClassName={bestPick ? 'text-profit' : 'text-muted-foreground'}
            />
            <Row
              label="Smallest odds that lost"
              title={worstPick?.label ?? null}
              value={worstPick ? worstPick.odds.toFixed(2) : '—'}
              valueClassName={worstPick ? 'text-loss' : 'text-muted-foreground'}
            />
            <div className="grid flex-1 grid-cols-2 content-evenly gap-x-3 gap-y-5">
              <Stat label="Favourites hit" value={favorites.value} hint={favorites.hint} />
              <Stat label="Underdogs hit" value={underdogs.value} hint={underdogs.hint} />
              <Stat
                label="Picks per slip"
                value={picksPerSlip === 0 ? '—' : picksPerSlip.toFixed(1)}
                hint="Legs on an average slip"
              />
              <Stat
                label="Average price"
                value={meanOdds === 0 ? '—' : meanOdds.toFixed(2)}
                hint="Across settled picks"
              />
            </div>
          </>
        )}
      </div>
    </DashboardCard>
  );
};
