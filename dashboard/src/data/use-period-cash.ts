import { useMemo } from 'react';
import { useDashboard } from '@/context/dashboard-context';
import { rangeCutoff, rangeEnd } from '@/lib/chart-data';

export interface PeriodCash {
  deposits: number;
  withdrawals: number;
  /** Withdrawn less deposited: what the period left in your pocket. */
  cashFlow: number;
  count: number;
}

/** Money in and out of the accounts over the period the page is showing. */
export const usePeriodCash = (): PeriodCash => {
  const { transactions, days, until } = useDashboard();

  return useMemo(() => {
    const cutoff = days === null ? 0 : rangeCutoff(days, until);
    const end = rangeEnd(until);
    let deposits = 0;
    let withdrawals = 0;
    let count = 0;
    for (const t of transactions) {
      const at = Date.parse(t.occurredAt);
      if (at < cutoff || at >= end) continue;
      count += 1;
      if (t.kind === 'deposit') deposits += t.amount;
      else withdrawals += t.amount;
    }
    return { deposits, withdrawals, cashFlow: withdrawals - deposits, count };
  }, [transactions, days, until]);
};
