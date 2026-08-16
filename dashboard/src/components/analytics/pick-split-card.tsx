import { useMemo } from 'react';
import {
  compareGroupKeys,
  groupSelectionsBy,
  hasKeyOrder,
  type Bet,
  type LegDimension,
} from '@betanal/shared';
import { CardHeadline, CardNote, NoteFigure } from '@/components/analytics/card-note';
import { RankedBars } from '@/components/analytics/ranked-bars';
import { DashboardCard, DashboardCardHeading } from '@/components/dashboard/dashboard-card';
import { formatPercent } from '@/lib/utils';

/** A row needs this many settled picks before it is allowed to carry the answer. */
const MIN_ROWS_SAMPLE = 10;

interface PickSplitCardProps {
  bets: readonly Bet[];
  title: string;
  dimension: LegDimension;
  /** Header for the label column, e.g. "Market". */
  column: string;
  slots?: number;
}

/**
 * "How did these picks do, split by X?" for any way of slicing single selections.
 * Every one of these questions is the same split - one card instead of one file
 * per dimension.
 *
 * Bands with a natural order keep it. Names are ranked by how much was bet on
 * them: the four names a reader recognises from their own betting, not the four
 * that a couple of lucky picks pushed to the top.
 */
export const PickSplitCard = ({
  bets,
  title,
  dimension,
  column,
  slots = 4,
}: PickSplitCardProps): JSX.Element => {
  const all = useMemo(
    () => groupSelectionsBy(bets, dimension).filter((g) => g.decided > 0),
    [bets, dimension],
  );

  const groups = useMemo(
    () =>
      [...all]
        .sort((a, b) =>
          hasKeyOrder(dimension)
            ? compareGroupKeys(dimension, a.label, b.label)
            : b.decided - a.decided,
        )
        .slice(0, slots),
    [all, dimension, slots],
  );

  // Every settled pick the split covers, not only the rows that fit: the count
  // beside the title says what the card was read from.
  const decided = all.reduce((sum, g) => sum + g.decided, 0);
  const best = [...groups]
    .filter((g) => g.decided >= MIN_ROWS_SAMPLE)
    .sort((a, b) => b.edgePp - a.edgePp)[0];
  const tone = best !== undefined && best.edgePp >= 0 ? 'profit' : 'loss';

  return (
    <DashboardCard className="flex h-full min-h-0 flex-col p-3">
      <DashboardCardHeading
        className="mb-2"
        title={title}
        sample={`${String(decided)} picks`}
        action={
          best === undefined ? null : (
            <CardHeadline tone={tone} title={best.label}>
              {best.label}
            </CardHeadline>
          )
        }
      />
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No settled picks in this period.</p>
      ) : (
        <RankedBars
          rows={groups.map((g) => ({
            label: g.label,
            value: g.edgePp,
            sample: g.decided,
            note: formatPercent(g.hitRate, 0),
            extra: formatPercent(g.meanImplied, 0),
          }))}
          columns={[column, 'Gap', 'Picks']}
          noteColumn="You won"
          extraColumn="Priced"
          formatValue={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}pp`}
          lowSample={MIN_ROWS_SAMPLE}
          slots={slots}
        />
      )}
      <CardNote>
        {best === undefined ? (
          `Nothing here has ${String(MIN_ROWS_SAMPLE)}+ settled picks yet.`
        ) : (
          <>
            {`${best.label}: won ${formatPercent(best.hitRate, 0)} where the price said ${formatPercent(best.meanImplied, 0)} - `}
            <NoteFigure tone={tone}>
              {`${best.edgePp >= 0 ? '+' : ''}${best.edgePp.toFixed(1)}pp`}
            </NoteFigure>
            {best.edgePp >= 0
              ? ' on the price, the best here.'
              : ' on the price, the least bad here.'}
          </>
        )}
      </CardNote>
    </DashboardCard>
  );
};
