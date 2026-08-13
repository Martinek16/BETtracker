import type { Bonus, Transaction } from './types';

/**
 * What a bonus was actually worth. Only `released` bonuses cleared their
 * wagering requirement and turned into real money; every other end state means
 * the grant was spent or expired before it converted, and is worth nothing no
 * matter how large `grantedAmount` was.
 */
export const realizedBonusValue = (bonus: Bonus): number =>
  bonus.status === 'released' ? bonus.currentAmount : 0;

/**
 * Free bets and free rounds pay their winnings straight onto the real balance,
 * so the wallet that granted them never records what they were worth. Treating
 * them as zero would understate results, which is why they are counted apart
 * rather than summed into `realized`.
 */
export const hasUntrackedOutcome = (bonus: Bonus): boolean =>
  bonus.type === 'freeBet' || bonus.type === 'freeRound';

export interface BonusSummary {
  /** Face value of every grant — what was promised, not what it was worth. */
  granted: number;
  /** Money that actually cleared its wagering requirement. */
  realized: number;
  /** Grants whose outcome the bookmaker never reports back. */
  untrackedCount: number;
  untrackedGranted: number;
}

export const summarizeBonuses = (bonuses: readonly Bonus[]): BonusSummary => {
  const summary: BonusSummary = {
    granted: 0,
    realized: 0,
    untrackedCount: 0,
    untrackedGranted: 0,
  };
  for (const bonus of bonuses) {
    summary.granted += bonus.grantedAmount;
    if (hasUntrackedOutcome(bonus)) {
      summary.untrackedCount += 1;
      summary.untrackedGranted += bonus.grantedAmount;
      continue;
    }
    summary.realized += realizedBonusValue(bonus);
  }
  return summary;
};

/**
 * A deposit-triggered bonus is granted by the same backend movement that
 * completes the deposit, so the two timestamps land within a second of each
 * other. The bookmaker exposes no foreign key, which is why this is matched on
 * time rather than looked up.
 */
const MATCH_WINDOW_MS = 60_000;

/**
 * Pairs deposit-triggered bonuses with the deposit that earned them, keyed by
 * transaction id. Both sides are consumed at most once, so two deposits close
 * together cannot both claim the same grant.
 */
export const bonusesByTransaction = (
  transactions: readonly Transaction[],
  bonuses: readonly Bonus[],
): Map<string, Bonus> => {
  const deposits = transactions.filter((t) => t.kind === 'deposit');
  const paired = new Map<string, Bonus>();
  const taken = new Set<string>();

  // ponytail: O(deposits × bonuses) scan — a few hundred each, so it is free.
  // Bucket by day if either side ever grows into the tens of thousands.
  for (const bonus of bonuses) {
    if (bonus.trigger !== 'deposit') continue;
    const grantedMs = Date.parse(bonus.grantedAt);
    if (Number.isNaN(grantedMs)) continue;

    let best: Transaction | null = null;
    let bestDistance = Infinity;
    for (const deposit of deposits) {
      if (taken.has(deposit.id)) continue;
      const delta = grantedMs - Date.parse(deposit.occurredAt);
      // A grant cannot precede its own deposit by more than clock skew, so a
      // deposit *after* the grant is penalised rather than treated as equally close.
      const distance = delta >= 0 ? Math.abs(delta) : Math.abs(delta) * 2;
      if (distance > MATCH_WINDOW_MS || distance >= bestDistance) continue;
      best = deposit;
      bestDistance = distance;
    }

    if (best !== null) {
      paired.set(best.id, bonus);
      taken.add(best.id);
    }
  }
  return paired;
};
