import { useMemo } from 'react';
import { findings, habitLeaks, type Bet, type Finding, type Habit } from '@betanal/shared';
import { RankedBars, type RankedRow } from '@/components/analytics/ranked-bars';
import { StakeSparkline } from '@/components/charts/mini-charts';
import { DashboardCard, DashboardCardHeading } from '@/components/dashboard/dashboard-card';
import { useDashboard } from '@/context/dashboard-context';
import { useMinPicks } from '@/lib/held-back';
import { cn, compactMoney, formatMoney, symbolOf } from '@/lib/utils';

interface LeaksCardProps {
  bets: readonly Bet[];
  currency: string;
}

/** Slips a segment needs before it is offered as a leak at all. */
const MIN_SEGMENT = 5;
/** Segments named at once. */
const SLOTS = 4;

/**
 * Rows carry what came back on every 1 staked, so a segment bet in €100 slips
 * and one bet in €5 slips are read against each other. The money the segment
 * cost travels beside it, saying how much of the period the rate moved.
 */
const toRow =
  (currency: string) =>
  (habit: Habit): RankedRow => ({
    label: habit.label,
    value: habit.unitsPerBet,
    // The same rate over the whole segment, in flat stakes: −4.8u reads as "this
    // cost you nearly five average slips", whatever the slips were worth.
    note: `${(habit.unitsPerBet * habit.bets).toFixed(1)}u`,
    extra: compactMoney(habit.profit, currency),
    sample: habit.bets,
    unreliable: habit.driven,
    title: `${habit.label}: ${compactMoney(habit.profit, currency)} over ${String(habit.bets)} slips${
      habit.driven ? ' - mostly one big slip, not a habit' : ''
    }`,
  });

/**
 * What the selected period cost and what it was worth keeping. Two readings of
 * the same bets: the segments name what to stop backing, the findings name what
 * to stop doing - a habit like topping up after a loss lives in no segment.
 *
 * Read from the selected period alone: a habit named from the whole record while
 * a week is on screen answers a question the reader did not ask.
 */
export const LeaksCard = ({ bets, currency }: LeaksCardProps): JSX.Element => {
  const { transactions } = useDashboard();
  const minBets = useMinPicks();

  const leaks = useMemo(() => {
    const solid = habitLeaks(bets, MIN_SEGMENT, SLOTS);
    if (solid.worst.length > 0) return { ...solid, thin: false };
    // Nothing clears the floor: name the front runner rather than say nothing,
    // and let the row say how little is behind it.
    return { ...habitLeaks(bets, 1, SLOTS), thin: true };
  }, [bets]);

  const notes: Finding[] = useMemo(
    () => findings(bets, transactions, (amount) => compactMoney(amount, currency)),
    [bets, transactions, currency],
  );
  const ordered = [...notes].sort((a, b) =>
    a.kind === b.kind ? 0 : a.kind === 'problem' ? -1 : 1,
  );

  const worst = leaks.worst.map(toRow(currency));

  return (
    <DashboardCard className="flex min-h-0 flex-1 flex-col p-3">
      <div className="shrink-0">
        <DashboardCardHeading
          className="mb-2"
          title="What to improve"
          action={
            leaks.thin ? (
              <span
                className="rounded border border-border px-1.5 py-px text-[10px] text-muted-foreground"
                title={`No segment has ${String(MIN_SEGMENT)} settled slips yet, so these rows are a first look rather than a habit.`}
              >
                Thin data
              </span>
            ) : undefined
          }
        />
        {worst.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No settled slips in this period, so there is nothing to read yet.
          </p>
        ) : (
          <>
            {/* One figure per row: what came back on every 1 that went in, so
                anything under 1 is money that stayed with the bookmaker. */}
            <RankedBars
              rows={worst}
              columns={['What cost you most', `Per ${symbolOf(currency)}1`]}
              formatValue={(v) => formatMoney(1 + v, currency)}
              noteColumn="Units"
              extraColumn="Cost"
              lowSample={minBets}
            />
          </>
        )}
      </div>
      {ordered.length === 0 ? null : (
        <ul className="scroll-area mt-2.5 min-h-0 flex-1 space-y-2 overflow-y-auto border-t border-border pt-2">
          {ordered.map((f) => (
            <li key={f.id} className="flex gap-2.5">
              <span
                aria-hidden
                className={cn(
                  'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                  f.kind === 'problem' ? 'bg-loss' : 'bg-profit',
                )}
              />
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">{f.title}</p>
                <p className="text-[11px] leading-snug text-muted-foreground">{f.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto shrink-0">
        <StakeSparkline bets={bets} currency={currency} />
      </div>
    </DashboardCard>
  );
};
