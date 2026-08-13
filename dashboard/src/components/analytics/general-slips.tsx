import type { Bet } from '@betanal/shared';
import { BasicsCard } from '@/components/analytics/basics-card';
import { LeaksCard } from '@/components/analytics/findings-cards';
import { QuestionStack } from '@/components/analytics/question-stack';
import { LegCountChart, OddsPnlChart, StakeOutcomeChart } from '@/components/charts/band-charts';

interface GeneralSlipsProps {
  bets: readonly Bet[];
  currency: string;
}

export const GeneralSlips = ({ bets, currency }: GeneralSlipsProps): JSX.Element => (
  <div className="grid h-full min-h-0 gap-3 lg:grid-cols-3">
    <div className="flex min-h-0 flex-col gap-3" data-tour="analytics-basics">
      <BasicsCard bets={bets} unit="slips" currency={currency} />
      <LeaksCard bets={bets} currency={currency} />
    </div>
    <div className="min-h-0">
      <QuestionStack bets={bets} currency={currency} />
    </div>
    <div className="flex min-h-0 flex-col gap-3" data-tour="analytics-charts">
      <OddsPnlChart bets={bets} currency={currency} />
      <LegCountChart bets={bets} currency={currency} />
      <StakeOutcomeChart bets={bets} currency={currency} />
    </div>
  </div>
);
