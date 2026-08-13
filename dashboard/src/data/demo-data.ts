/**
 * Demo mode — the wiring, with nothing behind it.
 *
 * Turned on by `demo=1` in the query or the hash. Every page reads its records
 * through `source.ts`, and each read there falls back to one of the functions
 * below when the flag is set. So the way to see how a page looks with a history
 * behind it is to fill one of these in; nothing else has to be touched.
 *
 * They all answer empty on purpose. What used to live here was a generated year
 * of bets built for one round of promotional screenshots — a fixture that size
 * has to be kept in step with every schema change, and it was worth that only
 * for as long as the screenshots were being taken.
 */

import type {
  AccountPerks,
  AccountRef,
  BalanceInfo,
  Bet,
  Bonus,
  KnownAccount,
  SyncMeta,
  Transaction,
} from '@betanal/shared';

export const isDemoData = (): boolean => /[?&#]demo=1(&|#|$)/.test(window.location.href);

/** Bets settled inside `[from, to)`, plus every open slip whatever its date. */
export const demoBets = (_from: string | null, _to: string | null): Bet[] => [];

export const demoAllBets = (): Bet[] => [];
export const demoTransactions = (): Transaction[] => [];
export const demoBonuses = (): Bonus[] => [];
export const demoBalances = (): BalanceInfo[] => [];
export const demoPerks = (): AccountPerks[] => [];
export const demoKnownAccounts = (): KnownAccount[] => [];
export const demoSyncMeta = (): { account: AccountRef; meta: SyncMeta }[] => [];
