import { useMemo } from 'react';
import { groupBy, roi, shrunkYield, type Bet, type SlipDimension } from '@betanal/shared';
import { CardNote } from '@/components/analytics/card-note';
import { QuestionCard } from '@/components/analytics/question-card';
import { RankedBars } from '@/components/analytics/ranked-bars';
import { useMinPicks } from '@/lib/held-back';
import { formatMoney, formatPercent } from '@/lib/utils';

interface BandQuestionProps {
  bets: readonly Bet[];
  currency: string;
  open: boolean;
  onToggle: () => void;
  title: string;
  dimension: SlipDimension;
  /** Header for the band column, e.g. "Odds" or "Stake". */
  bandColumn: string;
  /** Fixed row order where the bands have a natural one; ranked by yield otherwise. */
  order?: readonly string[];
  /** What the split does and does not prove, in one line. */
  note: string;
  /** Most rows to draw. */
  slots?: number;
}

/**
 * "Which X pays me?" for any way of slicing whole slips. Every one of these
 * questions is the same split - one card instead of one file per dimension.
 */
export const BandQuestion = ({
  bets,
  currency,
  open,
  onToggle,
  title,
  dimension,
  bandColumn,
  order,
  note,
  slots = 5,
}: BandQuestionProps): JSX.Element => {
  const minBets = useMinPicks();
  const rows = useMemo(() => {
    const overall = roi(bets);
    return groupBy(bets, dimension)
      .filter((g) => g.bets > 0)
      .sort((a, b) =>
        order === undefined
          ? shrunkYield(b.bets, b.roi, overall) - shrunkYield(a.bets, a.roi, overall)
          : order.indexOf(a.key) - order.indexOf(b.key),
      )
      .map((g) => ({
        label: g.key,
        value: g.roi,
        sample: g.bets,
        note: formatMoney(g.profit, currency),
      }));
  }, [bets, currency, dimension, order]);

  const solid = rows.filter((r) => r.sample >= minBets);
  const best = order === undefined ? solid[0] : [...solid].sort((a, b) => b.value - a.value)[0];
  // Nothing has enough slips yet: still name the front runner, but say it is thin.
  const leader = best ?? [...rows].sort((a, b) => b.value - a.value)[0];

  return (
    <QuestionCard
      title={title}
      answer={leader === undefined ? '—' : leader.label}
      tone={best === undefined ? 'neutral' : best.value >= 0 ? 'profit' : 'loss'}
      open={open}
      onToggle={onToggle}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No settled slips in this period.</p>
      ) : (
        <RankedBars
          rows={rows}
          columns={[bandColumn, 'Return', 'Slips']}
          noteColumn="Profit"
          formatValue={(v) => formatPercent(v, 0)}
          lowSample={minBets}
          slots={slots}
        />
      )}
      <CardNote>
        {best === undefined && leader !== undefined
          ? `No band has ${String(minBets)} slips yet, so this is a front runner rather than an answer. ${note}`
          : note}
      </CardNote>
    </QuestionCard>
  );
};
