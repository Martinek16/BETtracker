import type { Bet } from '@betanal/shared';
import { cn, formatMoney } from '@/lib/utils';

/**
 * What the slips on show are worth: what they cost, and what they pay if they
 * land. Two labelled figures rather than one run-on line, so either can be read
 * on its own. The count is not here - the tabs already carry it. The slips are
 * handed over whole, so both places count them the same way.
 */
export const SlipTotals = ({
  bets,
  currency,
  className,
}: {
  bets: readonly Bet[];
  currency: string;
  className?: string;
}): JSX.Element => (
  <div className={cn('flex items-baseline gap-4 text-[11px] leading-none', className)}>
    {(
      [
        ['Staked', bets.reduce((sum, bet) => sum + bet.stake, 0)],
        [
          'To win',
          bets.reduce((sum, bet) => sum + (bet.currentPotentialReturn ?? bet.potentialReturn), 0),
        ],
      ] as const
    ).map(([label, value]) => (
      <span key={label} className="flex items-baseline gap-1.5">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums text-foreground">
          {formatMoney(value, currency)}
        </span>
      </span>
    ))}
  </div>
);
