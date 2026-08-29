/**
 * What `@/demo` resolves to in a built copy.
 *
 * The made-up history is a testing aid, and an invented bet has no business
 * sitting in the file people download. Aliasing the whole module away at build
 * time - rather than switching it off at runtime - is what keeps the dataset out
 * of the bundle: a branch that is never taken still ships the code behind it.
 */

import type {
  AccountPerks,
  AccountRef,
  BalanceInfo,
  Bet,
  Bonus,
  CasinoRound,
  KnownAccount,
  LiveScore,
  SyncMeta,
  Transaction,
} from '@betanal/shared';

export const isDemoMode = (): boolean => false;
export const setDemoMode = (_on: boolean): void => {};

export const DEMO_BETS: Bet[] = [];
export const DEMO_SCORES: Record<string, LiveScore[]> = {};
export const DEMO_REFRESHED_AT = 0;

export const demoBets = (_from: string | null, _to: string | null): Bet[] => [];
export const demoAllBets = (): Bet[] => [];
export const demoCasinoRounds = (): CasinoRound[] => [];
export const demoTransactions = (): Transaction[] => [];
export const demoBonuses = (): Bonus[] => [];
export const demoBalances = (): BalanceInfo[] => [];
export const demoPerks = (): AccountPerks[] => [];
export const demoKnownAccounts = (): KnownAccount[] => [];
export const demoSyncMeta = (): { account: AccountRef; meta: SyncMeta }[] => [];
