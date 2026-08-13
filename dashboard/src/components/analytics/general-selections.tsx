import type { Bet } from '@betanal/shared';
import { BasicsCard } from '@/components/analytics/basics-card';
import { CalibrationCard } from '@/components/analytics/calibration-card';
import { PickSplitCard } from '@/components/analytics/pick-split-card';
import { VerdictCard } from '@/components/analytics/verdict-card';

interface GeneralSelectionsProps {
  bets: readonly Bet[];
  currency: string;
}

/**
 * One card per question a bettor asks of their own picks, each asked once. The
 * odds axis is the calibration card's alone — a favourite/underdog split is the
 * same question with two coarse rows — and the market card groups into families,
 * the way the breakdown table does, so the rows carry names and not book codes.
 */
export const GeneralSelections = ({ bets, currency }: GeneralSelectionsProps): JSX.Element => (
  <div className="grid h-full min-h-0 gap-3 lg:grid-cols-3 lg:grid-rows-3">
    <BasicsCard bets={bets} unit="selections" currency={currency} />
    <VerdictCard bets={bets} />
    <PickSplitCard bets={bets} title="Which sports?" dimension="sport" column="Sport" />
    <PickSplitCard bets={bets} title="Which leagues?" dimension="league" column="League" />
    <PickSplitCard bets={bets} title="Which markets?" dimension="marketFamily" column="Market" />
    <PickSplitCard bets={bets} title="Who did you back?" dimension="team" column="Team / player" />
    <PickSplitCard
      bets={bets}
      title="How early did you bet?"
      dimension="timeToEvent"
      column="Placed"
      slots={5}
    />
    <div className="min-h-0 lg:col-span-2">
      <CalibrationCard bets={bets} />
    </div>
  </div>
);
