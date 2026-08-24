import { useMemo } from 'react';
import { tiltCheck, type Bet } from '@betanal/shared';
import { CardNote } from '@/components/analytics/card-note';
import { QuestionCard } from '@/components/analytics/question-card';
import { cn, compactMoney, formatPercent } from '@/lib/utils';

interface ChasingCardProps {
  bets: readonly Bet[];
  currency: string;
  open: boolean;
  onToggle: () => void;
}

/** Slips on each side before a difference in average stake is worth reading. */
const MIN_PER_SIDE = 10;

/**
 * Stake lift that counts as chasing rather than rounding. Deliberately blunt: two
 * average stakes over a few dozen slips carry noise this card does not try to
 * measure, and the number itself is on screen for anyone who wants to judge it.
 */
// ponytail: flat 10% threshold, no interval. Put one round it if the answer
// starts flipping between periods on the same book.
const CHASE_LIFT_PCT = 10;

/**
 * The one question the money cards cannot answer: not what the results were, but
 * whether the last result changed the next stake. A book that doubles up after a
 * loss loses faster than its own hit rate says it should.
 */
export const ChasingCard = ({ bets, currency, open, onToggle }: ChasingCardProps): JSX.Element => {
  const tilt = useMemo(() => tiltCheck(bets), [bets]);

  const money = (amount: number): string => compactMoney(amount, currency);
  const thin = tilt.afterWin.bets < MIN_PER_SIDE || tilt.afterLoss.bets < MIN_PER_SIDE;
  const chasing = !thin && tilt.stakeLift >= CHASE_LIFT_PCT;
  const easingOff = !thin && tilt.stakeLift <= -CHASE_LIFT_PCT;

  const answer = thin ? 'Too soon' : chasing ? 'Yes' : 'No';
  const lift = formatPercent(Math.abs(tilt.stakeLift), 0);
  const hundred = money(100);

  return (
    <QuestionCard
      title="Did losing make you bet bigger?"
      answer={answer}
      tone={chasing ? 'loss' : 'neutral'}
      open={open}
      onToggle={onToggle}
    >
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'Stake after a win', value: money(tilt.afterWin.meanStake) },
          { label: 'Stake after a loss', value: money(tilt.afterLoss.meanStake), lift: true },
          { label: 'Slips compared', value: String(tilt.sample) },
        ].map((row) => (
          <div key={row.label}>
            <dt className="text-[10px] text-muted-foreground">{row.label}</dt>
            <dd
              className={cn(
                'text-xs font-medium tabular-nums text-foreground',
                row.lift === true && chasing && 'text-loss',
              )}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
        Each slip is filed by the last result you had already seen when you placed it, not by its
        place in the list.
      </p>
      <CardNote>
        {thin ? (
          `Fewer than ${String(MIN_PER_SIDE)} slips followed a win or a loss this period, so there is not enough here to see what one does to your next stake.`
        ) : (
          <>
            {chasing
              ? `You staked ${lift} more after a loss than after a win. `
              : easingOff
                ? `You staked ${lift} less after a loss than after a win. `
                : 'Your stake stayed the same whether the last slip won or lost. '}
            {`Every ${hundred} staked after a loss came back as `}
            <span
              className={cn('font-medium', tilt.afterLoss.roi >= 0 ? 'text-profit' : 'text-loss')}
            >
              {money(100 + tilt.afterLoss.roi)}
            </span>
            {', against '}
            <span
              className={cn('font-medium', tilt.afterWin.roi >= 0 ? 'text-profit' : 'text-loss')}
            >
              {money(100 + tilt.afterWin.roi)}
            </span>
            {' after a win.'}
          </>
        )}
      </CardNote>
    </QuestionCard>
  );
};
