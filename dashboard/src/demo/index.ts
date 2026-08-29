/**
 * Demo mode - what every read answers while it is on.
 *
 * Each loader in `data/source.ts` falls back to one of the functions below, so
 * the demo is one branch per read rather than a second app: nothing above the
 * data layer knows which of the two histories it is drawing.
 */

import {
  resolutionDate,
  type AccountPerks,
  type AccountRef,
  type BalanceInfo,
  type Bet,
  type Bonus,
  type CasinoRound,
  type KnownAccount,
  type SyncMeta,
  type Transaction,
} from '@betanal/shared';
import { demoHistory } from '@/demo/history';
import { DEMO_BETS } from '@/demo/live';

export { isDemoMode, setDemoMode } from '@/demo/mode';
export { DEMO_BETS, DEMO_REFRESHED_AT, DEMO_SCORES } from '@/demo/live';

/** Bets filed inside `[from, to)`, plus every open slip whatever its date. */
export const demoBets = (from: string | null, to: string | null): Bet[] => [
  ...demoHistory().bets.filter((bet) => {
    const filed = resolutionDate(bet);
    return (from === null || filed >= from) && (to === null || filed < to);
  }),
  ...DEMO_BETS,
];

export const demoAllBets = (): Bet[] => [...demoHistory().bets, ...DEMO_BETS];
export const demoCasinoRounds = (): CasinoRound[] => [...demoHistory().rounds];
export const demoTransactions = (): Transaction[] => [...demoHistory().transactions];
export const demoBonuses = (): Bonus[] => [...demoHistory().bonuses];
export const demoBalances = (): BalanceInfo[] => [...demoHistory().balances];
export const demoPerks = (): AccountPerks[] => [...demoHistory().perks];
export const demoKnownAccounts = (): KnownAccount[] => [...demoHistory().accounts];
export const demoSyncMeta = (): { account: AccountRef; meta: SyncMeta }[] => [
  ...demoHistory().sync,
];
