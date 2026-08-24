import type { Bet } from '@betanal/shared';
import { BasicsCard } from '@/components/analytics/basics-card';
import { PickSplitCard } from '@/components/analytics/pick-split-card';
import { VerdictCard } from '@/components/analytics/verdict-card';

interface GeneralSelectionsProps {
  bets: readonly Bet[];
  currency: string;
}

/**
 * One card per question a bettor asks of their own picks, each asked once. The
 * odds axis is the verdict curve's alone - a favourite/underdog split is the
 * same question with two coarse rows - and the market card groups into families,
 * the way the breakdown table does, so the rows carry names and not book codes.
 *
 * Cards are sized by how much they have to say, not by the grid. A split over
 * five fixed buckets is given five rows' worth of card; a split over hundreds of
 * teams is given the tallest box on the page and allowed to scroll inside it.
 * Equal boxes only ever fit the shortest list and waste the rest.
 */
export const GeneralSelections = ({ bets, currency }: GeneralSelectionsProps): JSX.Element => (
  <div className="flex h-full min-h-0 flex-col gap-3">
    <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-3">
      {/* The record itself, then the two splits whose rows are fixed in advance:
          both are as tall as their content and no taller. */}
      <div className="flex min-h-0 flex-col gap-3">
        <BasicsCard bets={bets} unit="selections" currency={currency} />
        <PickSplitCard
          className="shrink-0"
          bets={bets}
          title="Which timing beat its price?"
          dimension="timeToEvent"
          column="Placed"
          slots={5}
        />
        <PickSplitCard
          className="flex-1"
          bets={bets}
          title="Which markets beat their price?"
          dimension="marketFamily"
          column="Market"
          slots={12}
        />
      </div>
      {/* The verdict, given the height on the page: the curve is the one thing
          here that reads better the more room it has. */}
      <div className="flex min-h-0 flex-col gap-3">
        <VerdictCard className="flex-1" bets={bets} />
        {/* Sports sits under the curve rather than beside the long tails: it
            rarely runs past a handful of rows, and the odds bands the curve
            already draws answered the same question this column asks. */}
        <PickSplitCard
          className="shrink-0"
          bets={bets}
          title="Which sports beat their price?"
          dimension="sport"
          column="Sport"
          slots={8}
        />
      </div>
      {/* The two longest tails, one under the other: leagues run to dozens and
          teams to hundreds, so both take half the column and scroll inside it. */}
      <div className="flex min-h-0 flex-col gap-3">
        <PickSplitCard
          className="flex-1"
          bets={bets}
          title="Which leagues beat their price?"
          dimension="league"
          column="League"
          slots={12}
        />
        <PickSplitCard
          className="flex-1"
          bets={bets}
          title="Which teams beat their price?"
          dimension="team"
          column="Team / player"
          slots={16}
        />
      </div>
    </div>
  </div>
);
