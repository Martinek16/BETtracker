import type { ConvertedFrom } from '@betanal/shared';
import { cn, formatMoney, tightMoney } from '@/lib/utils';

/**
 * An amount in the currency chosen in Settings, with the currency the money
 * actually moved in written smaller beside it.
 *
 * A wallet holding a dozen coins is only comparable once everything is in one
 * currency, but a figure converted out of BTC no longer says what was staked.
 * Both are shown: the converted one to be read, the original one to be
 * recognised. The second half stays away when there is nothing to add - a
 * record already in the display currency would only repeat itself.
 */
export const Money = ({
  value,
  currency,
  source,
  secondFirst = false,
  tight = false,
  className,
  secondClassName,
}: {
  value: number;
  currency: string;
  /** What it was converted from; absent when it was already in `currency`. */
  source?: ConvertedFrom;
  /** Puts the smaller figure ahead of the main one, as the balance rows read. */
  secondFirst?: boolean;
  /** Drops the cents of a large sum, for a row with no width to spare. */
  tight?: boolean;
  className?: string;
  secondClassName?: string;
}): JSX.Element => {
  const format = tight ? tightMoney : formatMoney;
  const rate = source?.fxRate;
  const from = source?.sourceCurrency;
  const second =
    rate === undefined || rate === 0 || from === undefined || from === currency ? null : (
      <span className={cn('text-[10px] font-normal text-muted-foreground', secondClassName)}>
        {format(value / rate, from)}
      </span>
    );

  return (
    <span className={cn('inline-flex items-baseline gap-1', className)}>
      {secondFirst && second}
      <span className="tabular-nums">{format(value, currency)}</span>
      {!secondFirst && second}
    </span>
  );
};
