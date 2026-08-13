import { useState } from 'react';
import type { GroupStats, Habit, HabitLeaks } from '@betanal/shared';
import type { AnalysisUnit } from '@/context/dashboard-context';
import { DashboardCard, DashboardCardHeading } from './dashboard-card';
import { AnalysisUnitToggle } from './analysis-unit-toggle';
import { formatMoney } from '@/lib/utils';

interface LeakCardProps {
  /** Slip-level habits, in currency. */
  leaks: HabitLeaks;
  /** Pick-level habits. Profit is in flat units, never currency. */
  pickLeaks: HabitLeaks;
  comboBands: GroupStats[];
  currency: string;
}

const Row = ({
  label,
  sub,
  value,
  money,
  positive,
  rank,
}: {
  label: string;
  sub: string;
  value: string;
  /** The same result in money, where the rows are slips that had a stake. */
  money?: string;
  positive: boolean;
  rank?: string;
}): JSX.Element => (
  <li className="flex items-center gap-2.5">
    {rank === undefined ? null : (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border bg-muted/30 text-[10px] font-medium tabular-nums text-muted-foreground">
        {rank}
      </span>
    )}
    <div className="min-w-0 flex-1">
      <p className="truncate text-xs font-medium">{label}</p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
    <span className="flex shrink-0 items-baseline gap-1.5">
      {money === undefined ? null : (
        <span className="text-[10px] tabular-nums text-muted-foreground">{money}</span>
      )}
      <span
        className="text-xs font-semibold tabular-nums"
        style={{ color: `hsl(var(--${positive ? 'profit' : 'loss'}))` }}
      >
        {value}
      </span>
    </span>
  </li>
);

/** One unit is one average stake, so results compare across stake sizes. */
const formatUnits = (value: number): string => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}u`;

/** What a group costs per bet — the figure the rows are ranked on. */
const formatPerBet = (value: number): string =>
  `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}u/bet`;

const HabitList = ({
  habits,
  rankPrefix,
}: {
  habits: Habit[];
  rankPrefix: (index: number) => string;
}): JSX.Element => (
  <ul className="space-y-2">
    {habits.map((habit, i) => (
      <Row
        key={habit.label}
        rank={rankPrefix(i)}
        label={habit.label}
        sub={`${habit.bets} · won ${Math.round(habit.winRate)}%`}
        money={formatUnits(habit.profit)}
        value={formatPerBet(habit.profit / habit.bets)}
        positive={habit.profit >= 0}
      />
    ))}
  </ul>
);

/**
 * Where the money goes, at whichever grain the question is asked. Per slip by
 * default, which is the money that actually moved; per pick judges a sport or
 * market leg by leg, since a mixed combo belongs to no single sport.
 */
export const LeakCard = ({
  leaks,
  pickLeaks,
  comboBands,
  currency,
}: LeakCardProps): JSX.Element => {
  const [unit, setUnit] = useState<AnalysisUnit>('slips');

  const active = unit === 'selections' ? pickLeaks : leaks;
  const hasAny = active.worst.length > 0 || active.best.length > 0;
  const bands = comboBands.filter((b) => b.bets > 0);

  return (
    <DashboardCard className="flex h-full flex-col overflow-hidden p-4">
      <DashboardCardHeading
        className="mb-3"
        title="What's costing you money"
        action={<AnalysisUnitToggle value={unit} onChange={setUnit} />}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        {unit === 'selections' ? (
          !hasAny ? (
            <p className="text-sm text-muted-foreground">Not enough picks yet to spot a pattern</p>
          ) : (
            <>
              {active.worst.length > 0 ? (
                <HabitList habits={active.worst} rankPrefix={(i) => String(i + 1)} />
              ) : (
                <p className="text-xs text-muted-foreground">Nothing is losing you money</p>
              )}
              {active.best.length > 0 ? (
                <>
                  <p className="mt-2.5 border-t border-border pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    What's working
                  </p>
                  <div className="mt-2">
                    <HabitList habits={active.best} rankPrefix={() => '↑'} />
                  </div>
                </>
              ) : null}
            </>
          )
        ) : bands.length === 0 ? (
          <p className="text-sm text-muted-foreground">No settled slips in this period</p>
        ) : (
          <ul className="space-y-2">
            {bands.map((band) => (
              <Row
                key={band.key}
                label={band.key}
                sub={`${band.bets} slips · won ${Math.round(band.winRate)}%`}
                value={formatPerBet(band.staked > 0 ? band.profit / band.staked : 0)}
                money={formatMoney(band.profit, currency)}
                positive={band.profit >= 0}
              />
            ))}
          </ul>
        )}
      </div>
    </DashboardCard>
  );
};
