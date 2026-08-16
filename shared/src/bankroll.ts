import { profitOf, resolutionDate, settledBets } from './calculations';
import type { Bet, Transaction } from './types';

const signedAmount = (txn: Transaction): number =>
  txn.kind === 'deposit' ? txn.amount : -txn.amount;

export interface StakeShare {
  /** Mean stake as a percentage of the balance held when it was placed. */
  average: number;
  max: number;
  /** Bets that had a known positive balance behind them. */
  sample: number;
}

/**
 * Stake sized against the bankroll behind it - the discipline metric. A flat
 * stake looks constant in euros while quietly becoming a third of the account.
 *
 * Bets placed before any recorded deposit have no known balance, so they are
 * skipped rather than counted at an invented one.
 */
export const stakeShare = (
  bets: readonly Bet[],
  transactions: readonly Transaction[],
): StakeShare => {
  const events = [
    ...settledBets(bets).map((b) => ({ date: resolutionDate(b), delta: profitOf(b), stake: 0 })),
    ...transactions.map((t) => ({ date: t.occurredAt, delta: signedAmount(t), stake: 0 })),
    ...bets.map((b) => ({ date: b.placedAt, delta: 0, stake: b.stake })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  let balance = 0;
  let total = 0;
  let sample = 0;
  let max = 0;

  for (const e of events) {
    if (e.stake > 0 && balance > 0) {
      const share = (e.stake / balance) * 100;
      total += share;
      sample += 1;
      if (share > max) max = share;
    }
    balance += e.delta;
  }

  return { average: sample === 0 ? 0 : total / sample, max, sample };
};
