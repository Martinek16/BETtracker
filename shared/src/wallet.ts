import { summarizeBonuses } from './bonus';
import { totalStaked } from './calculations';
import type { Bet, Bonus, Transaction } from './types';

/**
 * The account's wallet written as a sum. Every figure is money that has actually
 * moved: what was paid in, what bonus money cleared its wagering and turned real,
 * what the settled slips gave back, what was taken out, and what is still riding
 * on slips that have not resolved.
 */
export interface WalletLedger {
  deposits: number;
  withdrawals: number;
  /** Bonus money that cleared its wagering. A grant on its own is a promise. */
  bonusRealized: number;
  /**
   * Returns less stakes on settled slips, counting only the part of each that
   * moved real money. Void slips refund and weigh nothing.
   */
  betResult: number;
  /** Real-money stake that has left the wallet and has no outcome yet. */
  heldInOpenBets: number;
  /** Stake that came out of the bonus wallet instead of the pocket. */
  stakedFromBonus: number;
  /** What the wallet should hold if everything above is everything that happened. */
  expected: number;
  /**
   * Balance less `expected`, or null when no balance has been read. Not an error
   * term: at a site whose casino shares the wallet this is what the casino took,
   * and everywhere else it is history the reader never saw.
   */
  unexplained: number | null;
}

/**
 * The share of a slip that moved real money. A bonus-funded stake never passed
 * through a deposit and its winnings land back in the bonus wallet, so counting
 * either as real money is what makes an account look thousands short.
 */
const realShare = (bet: Bet): number => {
  const bonusStake = Math.min(bet.bonusStake ?? 0, bet.stake);
  if (bet.stake <= 0) return 1;
  return (bet.stake - bonusStake) / bet.stake;
};

const realStake = (bets: readonly Bet[]): number =>
  bets.reduce((sum, bet) => sum + bet.stake * realShare(bet), 0);

const realResult = (bets: readonly Bet[]): number =>
  bets.reduce((sum, bet) => sum + (bet.actualReturn - bet.stake) * realShare(bet), 0);

export const walletLedger = (
  bets: readonly Bet[],
  transactions: readonly Transaction[],
  bonuses: readonly Bonus[],
  balance: number | null,
): WalletLedger => {
  let deposits = 0;
  let withdrawals = 0;
  for (const t of transactions) {
    if (t.kind === 'deposit') deposits += t.amount;
    else withdrawals += t.amount;
  }

  const settled = bets.filter((bet) => bet.status !== 'pending');
  const open = bets.filter((bet) => bet.status === 'pending');
  const betResult = realResult(settled);
  const heldInOpenBets = realStake(open);
  const stakedFromBonus =
    totalStaked(bets) - (realStake(settled) + heldInOpenBets);
  const bonusRealized = summarizeBonuses(bonuses).realized;
  const expected = deposits + bonusRealized + betResult - withdrawals - heldInOpenBets;

  return {
    deposits,
    withdrawals,
    bonusRealized,
    betResult,
    heldInOpenBets,
    stakedFromBonus,
    expected,
    unexplained: balance === null ? null : balance - expected,
  };
};
