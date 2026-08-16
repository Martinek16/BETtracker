/**
 * What a bookmaker folder has to show for itself, and the reason it exists as a
 * file rather than a list in the test.
 *
 * The shared invariants - an id no other site can claim, money that is a number,
 * a status that agrees with the payout - are checked against real parsed output,
 * which means the suite needs each folder's parser results. Those parsers are
 * folder-specific and not on the adapter interface, so the test cannot reach
 * them on its own.
 *
 * Having the folder hand them over turns that around: `conformance.test.ts`
 * finds every `samples.ts` on disk and holds it to the same rules, and a
 * contributor adding a site never edits a shared file to be tested by it. That
 * matters because shared files are exactly what they are not allowed to change
 * - a weakened invariant would be weakened for every bookmaker at once.
 */

import type { AccountId, AccountRef, Bet, Bookmaker } from '@betanal/shared';

/**
 * One account id for every folder's samples, so the suite can prove that two
 * sites never mint the same `betId` - the database keys on it alone, and a
 * collision silently overwrites somebody's bet.
 */
export const SAMPLE_ACCOUNT_ID: AccountId = 'sample-account';

export const sampleRef = (bookmaker: Bookmaker): AccountRef => ({
  bookmaker,
  accountId: SAMPLE_ACCOUNT_ID,
});

/**
 * Bets parsed from the folder's own recorded payloads, as its adapter produces
 * them. Both lists come from `__fixtures__/`; nothing here is written by hand,
 * because a sample invented to satisfy the parser proves only that the parser
 * agrees with itself.
 */
export interface Samples {
  /** Bets the site reports as finished. At least one is required. */
  settled: Bet[];
  /** Bets still running. Empty where the site exposes no payload to record. */
  open: Bet[];
}
