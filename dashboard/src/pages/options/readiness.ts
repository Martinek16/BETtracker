/**
 * What a bookmaker has actually proved, read off what it stored.
 *
 * Tests prove that a recording parses. They cannot prove that the site works,
 * because the failure that costs a day looks identical to success: the sync
 * reports done, the total is right, and every breakdown on screen is a column
 * of blanks because `sport` came through null on every bet.
 *
 * So this asks the stored records the questions a person would otherwise have
 * to ask by eye, and reports what is still unanswered. A question it cannot
 * answer is left unanswered rather than passed: an account with no open bet in
 * it has not shown that open bets work, and saying otherwise is the one thing
 * this file must never do.
 */

import type { AccountRef, Bet, Bonus, Bookmaker, SyncMeta, Transaction } from '@betanal/shared';

export interface Check {
  /** What was asked, in the words the person checking would use. */
  label: string;
  /**
   * `true` proved, `false` contradicted, `null` nothing to judge on. The third
   * is not a soft pass: it is the answer "your account has never had one of
   * these, so this is still untested".
   */
  state: boolean | null;
  /** What the stored records say, in one line. */
  detail: string;
}

export interface Records {
  bets: readonly Bet[];
  transactions: readonly Transaction[];
  bonuses: readonly Bonus[];
  /** One entry per account whose balance has actually been read off the site. */
  balances: readonly { bookmaker: Bookmaker }[];
  /**
   * Bookmakers an open bet has ever been read from. Recorded when it happens: a
   * bet settles, so asking the stored bets would answer "never worked" for every
   * account that simply has nothing running at the moment it is asked.
   */
  openBetsSeen: readonly Bookmaker[];
  metas: readonly { account: AccountRef; meta: SyncMeta }[];
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The three fields every breakdown on the analytics screen groups by. */
const named = (bet: Bet): boolean =>
  bet.sport !== null && bet.event !== null && bet.selection !== null;

const SETTLED = ['won', 'lost', 'void'] as const;

export const checksFor = (bookmaker: Bookmaker, all: Records): Check[] => {
  const bets = all.bets.filter((bet) => bet.bookmaker === bookmaker);
  const transactions = all.transactions.filter((tx) => tx.bookmaker === bookmaker);
  const bonuses = all.bonuses.filter((bonus) => bonus.bookmaker === bookmaker);
  const balances = all.balances.filter((balance) => balance.bookmaker === bookmaker);
  const metas = all.metas.filter(({ account }) => account.bookmaker === bookmaker);

  const blank = bets.filter((bet) => !named(bet));
  const seen = new Set(bets.map((bet) => bet.status));
  const missing = SETTLED.filter((status) => !seen.has(status));
  const multi = bets.filter((bet) => bet.betType !== 'single');
  const legless = multi.filter((bet) => bet.legs.length < 2);
  const openNow = bets.some((bet) => bet.status === 'pending');
  const everOpen = all.openBetsSeen.includes(bookmaker);
  const failed = metas.filter(({ meta }) => meta.lastStatus === 'error');
  const synced = metas.filter(({ meta }) => meta.lastSyncAt !== null);

  return [
    {
      label: 'Bets read',
      state: bets.length === 0 ? false : true,
      detail: bets.length === 0 ? 'Nothing stored yet' : plural(bets.length, 'bet'),
    },
    {
      label: 'Every bet names a sport, a match and a selection',
      state: bets.length === 0 ? null : blank.length === 0,
      detail:
        bets.length === 0
          ? 'No bets to judge on'
          : blank.length === 0
            ? 'All of them'
            : `${plural(blank.length, 'bet')} with a blank field — the breakdowns will be empty`,
    },
    {
      label: 'Won, lost and void all read as what they are',
      state: bets.length === 0 ? null : missing.length === 0,
      detail:
        bets.length === 0
          ? 'No bets to judge on'
          : missing.length === 0
            ? 'All three seen'
            : `Never seen: ${missing.join(', ')}`,
    },
    {
      label: 'Accumulators carry their legs',
      state: multi.length === 0 ? null : legless.length === 0,
      detail:
        multi.length === 0
          ? 'No accumulator stored — place one to test it'
          : legless.length === 0
            ? `${plural(multi.length, 'accumulator')}, each with its legs`
            : `${plural(legless.length, 'accumulator')} came through with no legs`,
    },
    {
      label: 'Open bets appear while they run',
      state: openNow || everOpen ? true : null,
      detail: openNow
        ? 'One is open now'
        : everOpen
          ? 'Read before — none open now'
          : 'Never seen one — leave a bet running and look again',
    },
    {
      label: 'The balance is read off the site',
      state: balances.length > 0,
      detail:
        balances.length > 0
          ? 'Read'
          : 'Not read — open the site with the extension on',
    },
    {
      label: 'Deposits and withdrawals arrive',
      state: transactions.length > 0 ? true : null,
      detail:
        transactions.length > 0
          ? plural(transactions.length, 'movement')
          : 'None stored — either the site has no endpoint for them, or it was missed',
    },
    {
      label: 'Bonuses and free bets arrive',
      state: bonuses.length > 0 ? true : null,
      detail:
        bonuses.length > 0
          ? `${bonuses.length} ${bonuses.length === 1 ? 'bonus' : 'bonuses'}`
          : 'None stored — either the site grants none, or it was missed',
    },
    {
      label: 'The account syncs without an error',
      state: synced.length === 0 ? null : failed.length === 0,
      detail:
        synced.length === 0
          ? 'Never synced — open the site and sign in'
          : failed.length === 0
            ? 'Last run went through'
            : (failed[0]?.meta.lastError ?? 'The last run failed'),
    },
  ];
};

/** How far along the site is, for a one-line summary above the detail. */
export const scoreOf = (checks: readonly Check[]): { passed: number; failed: number; open: number } => ({
  passed: checks.filter((check) => check.state === true).length,
  failed: checks.filter((check) => check.state === false).length,
  open: checks.filter((check) => check.state === null).length,
});
