import { useMemo } from 'react';
import { drawdown, settledBets, type Bet } from '@betanal/shared';
import { CardNote } from '@/components/analytics/card-note';
import { QuestionCard } from '@/components/analytics/question-card';
import { formatDate, formatMoney } from '@/lib/utils';

interface DrawdownQuestionProps {
  bets: readonly Bet[];
  currency: string;
  open: boolean;
  onToggle: () => void;
}

/** The deepest hole the record went into, stated as a fact about bets already placed. */
export const DrawdownQuestion = ({
  bets,
  currency,
  open,
  onToggle,
}: DrawdownQuestionProps): JSX.Element => {
  const dd = useMemo(() => drawdown(bets), [bets]);
  const settled = useMemo(() => settledBets(bets).length, [bets]);

  const rows = [
    { label: 'Deepest fall', value: formatMoney(-dd.maxDrawdown, currency) },
    { label: 'Best point', value: formatMoney(dd.peak, currency) },
    { label: 'Below it now', value: formatMoney(-dd.currentDrawdown, currency) },
    { label: 'Lowest on', value: dd.troughAt === null ? '—' : formatDate(dd.troughAt) },
  ];

  return (
    <QuestionCard
      title="What was the worst losing run?"
      answer={settled === 0 ? '—' : formatMoney(-dd.maxDrawdown, currency)}
      tone={dd.maxDrawdown > 0 ? 'loss' : 'neutral'}
      open={open}
      onToggle={onToggle}
    >
      <dl className="space-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-[11px] text-muted-foreground">{row.label}</dt>
            <dd className="text-xs font-medium tabular-nums text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>
      <CardNote>
        Falls like this are normal. Even a winning bettor is behind after 100 bets about a quarter
        of the time.
      </CardNote>
    </QuestionCard>
  );
};
