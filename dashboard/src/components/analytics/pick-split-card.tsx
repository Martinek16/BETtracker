import { useMemo, type ReactNode } from 'react';
import {
  compareGroupKeys,
  groupSelectionsBy,
  hasKeyOrder,
  type Bet,
  type LegDimension,
  type SelectionStats,
} from '@betanal/shared';
import { CardHeadline, CardNote } from '@/components/analytics/card-note';
import { RankedBars } from '@/components/analytics/ranked-bars';
import { CountryFlag } from '@/components/dashboard/country-flag';
import { DashboardCard, DashboardCardHeading } from '@/components/dashboard/dashboard-card';
import { sportIconFor } from '@/components/dashboard/live-score';
import { useMinPicks } from '@/lib/held-back';
import { cn, formatPercent } from '@/lib/utils';

interface PickSplitCardProps {
  bets: readonly Bet[];
  title: string;
  dimension: LegDimension;
  /** Header for the label column, e.g. "Market". */
  column: string;
  /**
   * Rows offered. A dimension with a long tail is given more than fits and the
   * list scrolls: a card that draws four names into space that holds twelve is
   * hiding the reader's own betting to keep a tidy box.
   */
  slots?: number;
  className?: string;
}

/**
 * What a row is at a glance, where its dimension has such a thing: the sport a
 * team plays, the country a competition is played in. Names alone read as one
 * grey column, and a team name says nothing about which sport it is from.
 */
const markOf = (dimension: LegDimension, g: SelectionStats): ReactNode => {
  if (dimension === 'league') {
    return g.country === null ? null : <CountryFlag country={g.country} />;
  }
  if (dimension !== 'team') return undefined;
  const sport = g.sports[0] ?? null;
  const Icon = sportIconFor(sport);
  return <Icon aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />;
};

/**
 * "How did these picks do, split by X?" for any way of slicing single selections.
 * Every one of these questions is the same split - one card instead of one file
 * per dimension.
 *
 * Bands with a natural order keep it; names are ordered by the gap the bars draw.
 */
export const PickSplitCard = ({
  bets,
  title,
  dimension,
  column,
  slots = 8,
  className,
}: PickSplitCardProps): JSX.Element => {
  const minPicks = useMinPicks();
  const all = useMemo(
    () => groupSelectionsBy(bets, dimension).filter((g) => g.decided > 0),
    [bets, dimension],
  );

  // Both which rows are shown and the order they come in follow the figure the
  // bars draw, so the card answers its own question. Rows with enough picks come
  // first, whichever side of the price they landed on - a name with two lucky
  // picks must not take the top off a name with two hundred - and the thin ones
  // fill whatever room is left rather than leaving the card half empty.
  const groups = useMemo(() => {
    const byEdge = (a: SelectionStats, b: SelectionStats): number => b.edgePp - a.edgePp;
    if (hasKeyOrder(dimension)) {
      return [...all].sort((a, b) => compareGroupKeys(dimension, a.label, b.label)).slice(0, slots);
    }
    return [
      ...all.filter((g) => g.decided >= minPicks).sort(byEdge),
      ...all.filter((g) => g.decided < minPicks).sort(byEdge),
    ].slice(0, slots);
  }, [all, dimension, minPicks, slots]);

  const best = [...groups]
    .filter((g) => g.decided >= minPicks)
    .sort((a, b) => b.edgePp - a.edgePp)[0];
  const tone = best !== undefined && best.edgePp >= 0 ? 'profit' : 'loss';
  // Nothing has enough picks yet: name the front runner anyway, greyed, so the
  // card answers its own question instead of leaving the corner blank.
  const leader = best ?? [...groups].sort((a, b) => b.edgePp - a.edgePp)[0];

  return (
    <DashboardCard className={cn('flex min-h-0 flex-col p-3', className)}>
      <DashboardCardHeading
        className="mb-2"
        title={title}
        action={
          leader === undefined ? null : (
            <CardHeadline tone={best === undefined ? 'neutral' : tone} title={leader.label}>
              {leader.label}
            </CardHeadline>
          )
        }
      />
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No settled picks in this period.</p>
      ) : (
        <div className="scroll-area -mr-1 min-h-0 flex-1 overflow-y-auto pr-1">
          <RankedBars
            rows={groups.map((g) => ({
              label: g.label,
              mark: markOf(dimension, g),
              value: g.edgePp,
              sample: g.decided,
              title:
                `${g.label}: won ${formatPercent(g.hitRate, 0)} at prices claiming ${formatPercent(g.meanImplied, 0)}` +
                (g.decided < minPicks
                  ? ` - only ${String(g.decided)} settled picks, too few to read as a pattern.`
                  : ` over ${String(g.decided)} settled picks.`),
            }))}
            columns={[column, 'vs price', 'Picks']}
            formatValue={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}pp`}
            lowSample={minPicks}
            slots={slots}
          />
        </div>
      )}
      {/* The corner already names the leader and the rows already carry their
          own figures, so the line under them explains the reading once and
          repeats neither. */}
      <CardNote>
        {`Bars are how far each row landed from the price its picks were taken at. Faded rows have under ${String(minPicks)} settled picks.`}
      </CardNote>
    </DashboardCard>
  );
};
