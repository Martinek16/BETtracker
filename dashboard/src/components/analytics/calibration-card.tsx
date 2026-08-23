import { useMemo } from 'react';
import {
  compareGroupKeys,
  groupSelectionsBy,
  type Bet,
  type SelectionStats,
} from '@betanal/shared';
import { CardHeadline, CardNote, NoteFigure } from '@/components/analytics/card-note';
import { IntervalBar } from '@/components/analytics/interval-bar';
import { DashboardCard, DashboardCardHeading } from '@/components/dashboard/dashboard-card';
import { cn, formatPercent } from '@/lib/utils';

interface CalibrationCardProps {
  bets: readonly Bet[];
}

const MIN_SAMPLE = 10;

/** Only a band that clears the price proves anything - same rule as the verdict card. */
const verdictOf = (g: SelectionStats): 'over' | 'under' | null => {
  if (g.decided < MIN_SAMPLE) return null;
  if (g.wilsonLow > g.meanImplied) return 'over';
  if (g.wilsonHigh < g.meanImplied) return 'under';
  return null;
};

export const CalibrationCard = ({ bets }: CalibrationCardProps): JSX.Element => {
  // Coarse bands, not the breakdown table's twelve brackets: five rows is what
  // the card has room for, and a bracket holding three picks proves nothing.
  const groups = useMemo(
    () =>
      groupSelectionsBy(bets, 'oddsBand')
        .filter((g) => g.decided > 0)
        .sort((a, b) => compareGroupKeys('oddsBand', a.key, b.key)),
    [bets],
  );

  const over = groups.filter((g) => verdictOf(g) === 'over');
  const under = groups.filter((g) => verdictOf(g) === 'under');

  return (
    <DashboardCard className="flex h-full flex-col p-3">
      <DashboardCardHeading
        className="mb-3"
        title="Which prices did you beat?"
        action={
          <CardHeadline tone={over.length > 0 ? 'profit' : under.length > 0 ? 'loss' : 'neutral'}>
            {/* The question asks which band you beat, so a band you lost to is
                never the answer to it - that belongs in the note below. */}
            {over[0]?.key ?? (under.length > 0 ? 'None' : 'Too soon')}
          </CardHeadline>
        }
      />
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No settled picks in this period.</p>
      ) : (
        <ul className="mb-2 space-y-2">
          <li className="flex items-center gap-3 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span className="w-20 shrink-0">Odds</span>
            <span className="min-w-0 flex-1">Your band vs the price</span>
            <span className="w-14 shrink-0 text-right">You win</span>
            <span className="w-14 shrink-0 text-right">Priced</span>
            <span className="w-12 shrink-0 text-right">Picks</span>
          </li>
          {groups.map((g) => {
            const verdict = verdictOf(g);
            return (
              <li
                key={g.key}
                className={cn('flex items-center gap-3', g.decided < MIN_SAMPLE && 'opacity-40')}
              >
                <span className="w-20 shrink-0 text-xs tabular-nums text-muted-foreground">
                  {g.key}
                </span>
                <div className="min-w-0 flex-1">
                  <IntervalBar low={g.wilsonLow} high={g.wilsonHigh} marker={g.meanImplied} />
                </div>
                <span
                  className={cn(
                    'w-14 shrink-0 text-right text-xs font-medium tabular-nums',
                    verdict === 'over' && 'text-profit',
                    verdict === 'under' && 'text-loss',
                    verdict === null && 'text-muted-foreground',
                  )}
                >
                  {formatPercent(g.hitRate, 0)}
                </span>
                <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                  {formatPercent(g.meanImplied, 0)}
                </span>
                <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                  {g.decided}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <CardNote>
        {under.length > 0 ? (
          <>
            {'At '}
            <NoteFigure tone="loss">{under.map((g) => g.key).join(', ')}</NoteFigure>
            {' you won less often than those prices promised.'}
          </>
        ) : over.length > 0 ? (
          <>
            {'Only '}
            <NoteFigure tone="profit">{over.map((g) => g.key).join(', ')}</NoteFigure>
            {' landed more often than its price promised.'}
          </>
        ) : (
          'No price band stood clear of what it promised yet.'
        )}
      </CardNote>
    </DashboardCard>
  );
};
