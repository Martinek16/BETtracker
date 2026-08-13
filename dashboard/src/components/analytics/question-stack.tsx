import type { Bet } from '@betanal/shared';
import { usePersistedState } from '@/lib/persisted-state';
import { ChasingCard } from '@/components/analytics/chasing-card';
import { LuckCard } from '@/components/analytics/luck-card';
import { MoneyDetailCard } from '@/components/analytics/money-detail-card';
import { WinningQuestion } from '@/components/analytics/verdict-card';

type Id = 'winning' | 'luck' | 'chasing';

interface QuestionStackProps {
  bets: readonly Bet[];
  currency: string;
}

/**
 * Three questions, one open at a time: did the money come back, could luck alone
 * explain it, and did the last result change the next stake. Everything else is a
 * detail of one of those and belongs in a breakdown. Every question is asked in the
 * past tense on purpose: this reads back bets already placed, it does not suggest
 * the next one.
 */
export const QuestionStack = ({ bets, currency }: QuestionStackProps): JSX.Element => {
  const [open, setOpen] = usePersistedState<Id>('analytics.question', 'winning', [
    'winning',
    'luck',
    'chasing',
  ]);
  const toggle = (id: Id) => () => {
    setOpen(id);
  };

  return (
    <div data-tour="questions" className="flex h-full min-h-0 flex-col gap-2">
      <WinningQuestion
        bets={bets}
        currency={currency}
        open={open === 'winning'}
        onToggle={toggle('winning')}
      />
      <LuckCard bets={bets} currency={currency} open={open === 'luck'} onToggle={toggle('luck')} />
      <ChasingCard
        bets={bets}
        currency={currency}
        open={open === 'chasing'}
        onToggle={toggle('chasing')}
      />
      <MoneyDetailCard bets={bets} currency={currency} />
    </div>
  );
};
