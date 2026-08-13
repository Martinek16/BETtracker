import type { PeriodAnalytics } from '@/lib/period-analytics';
import { DashboardCard, DashboardCardHeading } from './dashboard-card';
import { cn, formatMoney, formatPercent } from '@/lib/utils';

interface PickAccuracyCardProps {
  legs: PeriodAnalytics['legs'];
  combo: PeriodAnalytics['combo'];
  streak: PeriodAnalytics['streak'];
  meanImplied: number;
  /** Slips that were decided, and how many of them won. */
  slips: { won: number; total: number };
  currency: string;
}

const RateRow = ({
  label,
  won,
  total,
}: {
  label: string;
  won: number;
  total: number;
}): JSX.Element => {
  const rate = total === 0 ? 0 : (won / total) * 100;

  return (
    <div className="rounded-md border border-border bg-muted/20 px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <span className="flex shrink-0 items-baseline gap-1.5">
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {`${String(won)} of ${String(total)}`}
          </span>
          <span className="text-xs font-semibold tabular-nums">{formatPercent(rate)}</span>
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted/60">
        <div
          className="h-full rounded-full bg-foreground/70"
          style={{ width: `${Math.max(0, Math.min(100, rate))}%` }}
        />
      </div>
    </div>
  );
};

const Stat = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: number;
}): JSX.Element => (
  <div className="text-center">
    <p className="truncate text-[10px] text-muted-foreground" title={label}>
      {label}
    </p>
    <p
      className={cn(
        'text-sm font-semibold tabular-nums',
        tone === undefined || tone === 0
          ? 'text-foreground'
          : tone > 0
            ? 'text-profit'
            : 'text-loss',
      )}
    >
      {value}
    </p>
  </div>
);

/**
 * Pick accuracy judged both ways: per slip, which is what was actually paid out,
 * and per selection, because a bet builder that misses one leg loses the whole
 * slip and so hides how often the picks themselves were right.
 */
export const PickAccuracyCard = ({
  legs,
  combo,
  streak,
  meanImplied,
  slips,
  currency,
}: PickAccuracyCardProps): JSX.Element => {
  // Hit rate against the price the bookmaker put on those same picks. Positive
  // means the picks landed more often than the odds said they would.
  const edge = legs.rate - meanImplied;

  return (
    <DashboardCard className="flex h-full flex-col overflow-hidden p-4">
      <DashboardCardHeading className="mb-3" title="Pick accuracy" />
      {legs.total === 0 ? (
        <p className="text-sm text-muted-foreground">No settled selections yet.</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
          <RateRow label="Per bet slip" won={slips.won} total={slips.total} />
          <RateRow label="Per selection" won={legs.won} total={legs.total} />
          {/* Whatever height the two rows leave is shared out evenly, so the
              figures sit centred rather than stacked under a gap. */}
          <div className="grid flex-1 grid-cols-2 content-evenly gap-x-3 gap-y-2">
            <Stat label="Odds expected" value={formatPercent(meanImplied)} />
            <Stat
              label="You beat them by"
              value={`${edge >= 0 ? '+' : ''}${edge.toFixed(1)} pp`}
              tone={edge}
            />
            {combo.combos > 0 ? (
              <>
                <Stat
                  label="As combos"
                  value={formatMoney(combo.comboProfit, currency)}
                  tone={combo.comboProfit}
                />
                <Stat
                  label="As singles"
                  value={formatMoney(combo.singlesProfit, currency)}
                  tone={combo.singlesProfit}
                />
              </>
            ) : null}
            <Stat label="Best run" value={`${String(streak.longestWin)} won`} />
            <Stat label="Worst run" value={`${String(streak.longestLoss)} lost`} />
          </div>
        </div>
      )}
    </DashboardCard>
  );
};
