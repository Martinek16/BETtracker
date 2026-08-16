import type { ReactNode } from 'react';
import type { Bonus, Bookmaker, Transaction } from '@betanal/shared';
import { AccountIcon } from '@/components/dashboard/account-icon';
import { useDashboard, type BalanceRow } from '@/context/dashboard-context';
import { findAccount } from '@/data/accounts';
import { cn, formatAmount, formatMoney } from '@/lib/utils';

interface Row {
  label: string;
  value: number;
  /**
   * The currency the figure is written in, when it is not the display one — a
   * coin row is read in the coin, which is the point of splitting it out. The
   * label already carries the code, so the figure itself is printed bare.
   */
  currency?: string;
  /** The same money in the display currency: small, and ahead of the figure. */
  aside?: number;
}

/** One account's figure and the rows that add up to it. */
interface AccountBalance {
  bookmaker: Bookmaker;
  /** What tells two logins at the same site apart; the site alone does not. */
  key: string;
  /** null when the site has not been open since the account was connected. */
  amount: number | null;
  rows: readonly Row[];
  /**
   * Rakeback the site is still holding. It hangs off the account rather than
   * joining the rows, because the rows add up to the balance and this does not.
   */
  waiting?: number | null;
}

/**
 * One line of the breakdown. A row denominated in a coin reads in that coin,
 * with what it is worth in the display currency written smaller beside it — the
 * coin is what was bet, the worth is what makes it comparable, and neither
 * alone answers the question.
 */
const BreakdownRow = ({
  row,
  currency,
  strong = false,
}: {
  row: Row;
  currency: string;
  strong?: boolean;
}): JSX.Element => (
  <div className="flex items-center justify-between gap-6">
    <span className={cn(strong ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
      {row.label}
    </span>
    <span className="flex items-baseline gap-1.5">
      <span className={cn('tabular-nums text-foreground', strong && 'font-semibold')}>
        {row.currency === undefined
          ? formatMoney(row.value, currency)
          : formatAmount(row.value, row.currency)}
      </span>
      {row.aside !== undefined && (
        <span className="text-[9px] tabular-nums text-muted-foreground">
          {formatMoney(row.aside, currency)}
        </span>
      )}
    </span>
  </div>
);

/** One account inside the breakdown: its own figure, then what makes it up. */
const AccountGroup = ({
  account,
  currency,
}: {
  account: AccountBalance;
  currency: string;
}): JSX.Element => (
  <div className="text-[10px]">
    <div className="flex items-center justify-between gap-6">
      <span className="flex min-w-0 items-center gap-1.5">
        <AccountIcon bookmaker={account.bookmaker} className="h-4 w-4 rounded" />
        <span className="truncate font-medium uppercase tracking-wide text-muted-foreground">
          {findAccount(account.bookmaker)?.name ?? account.bookmaker}
        </span>
      </span>
      <span className={cn('tabular-nums', account.amount === null && 'text-muted-foreground')}>
        {account.amount === null ? 'not read yet' : formatMoney(account.amount, currency)}
      </span>
    </div>
    {account.rows.length > 0 && (
      <div className="mt-1 space-y-1 border-t border-border pl-[22px] pt-1.5">
        {account.rows.map((row) => (
          <BreakdownRow key={row.label} row={row} currency={currency} />
        ))}
      </div>
    )}
    {account.waiting != null && (
      <div className="mt-1 flex items-center justify-between gap-6 pl-[22px] text-emerald-500">
        <span>Rakeback to claim</span>
        <span className="tabular-nums">{formatMoney(account.waiting, currency)}</span>
      </div>
    )}
  </div>
);

/**
 * The number, with the breakdown a hover away. Every account is headed by its
 * own mark so the rows underneath are never ambiguous; a lone account already
 * is the total, so the footer waits until there is something to add up.
 */
const BalanceReadout = ({
  label,
  amount,
  currency,
  accounts,
}: {
  label: ReactNode;
  amount: number | null;
  currency: string;
  accounts: readonly AccountBalance[];
}): JSX.Element => (
  <div className="group relative flex items-center gap-2 text-right" tabIndex={0}>
    {label}
    <span
      className={cn('text-sm font-semibold tabular-nums', amount === null && 'text-muted-foreground')}
    >
      {amount === null ? '—' : formatMoney(amount, currency)}
    </span>
    {/* With no account connected there is nothing to break down, and the panel
        opened as an empty box on hover. */}
    {accounts.length > 0 && (
      <div className="pointer-events-none absolute -right-3 top-full z-50 mt-2 hidden w-64 rounded-lg border border-border bg-popover p-3 text-left text-xs text-popover-foreground shadow-lg group-hover:block group-focus-within:block">
        <div className="space-y-2">
          {accounts.map((account) => (
            <AccountGroup key={account.key} account={account} currency={currency} />
          ))}
        </div>
        {accounts.length > 1 && (
          <div className="mt-2 border-t border-border pt-2">
            <BreakdownRow row={{ label: 'Total', value: amount ?? 0 }} currency={currency} strong />
          </div>
        )}
      </div>
    )}
  </div>
);

/**
 * What the bookmaker page says is in each account. The scraped figure already
 * includes bonus money, so withdrawable is the remainder — clamped in case a
 * scrape and a bonus sync disagree for a moment. Without a bonus the breakdown
 * would only repeat the account's own figure back at it, so it stays away until
 * there is one to split off.
 */
const liveBalances = (
  balances: readonly BalanceRow[],
  bonuses: readonly Bonus[],
  includeBonus: boolean,
): AccountBalance[] =>
  balances.map(({ bookmaker, key, amount, holdings }) => {
    // A wallet per coin makes its own breakdown: what is held, and what each
    // holding is worth. Nothing there is bonus money, so the split below has
    // nothing to say about an account that reads this way.
    if (holdings.length > 0)
      return {
        bookmaker,
        key,
        amount,
        rows: holdings.map((h) => ({
          label: h.currency,
          value: h.amount,
          currency: h.currency,
          aside: h.worth,
        })),
      };
    const bonus = bonuses.reduce(
      (sum, b) => (b.bookmaker === bookmaker && b.status === 'active' ? sum + b.currentAmount : sum),
      0,
    );
    const withdrawable = Math.max(amount - bonus, 0);
    if (bonus === 0) return { bookmaker, key, amount, rows: [] };
    return {
      bookmaker,
      key,
      amount: includeBonus ? amount : withdrawable,
      rows: includeBonus
        ? [
            { label: 'Withdrawable', value: withdrawable },
            { label: 'Bonus', value: bonus },
          ]
        : [
            { label: 'On the site', value: amount },
            { label: 'Bonus', value: -bonus },
          ],
    };
  });

/**
 * What the account has given back, less what was paid into it. Money leaving
 * the pocket counts against you and money coming back counts for you, so the
 * two rows carry the sign they have from the pocket's side and add straight up
 * to whether the account is ahead. The bets are already inside those movements.
 */
const derivedBalances = (
  books: readonly Bookmaker[],
  transactions: readonly Transaction[],
): AccountBalance[] =>
  books.map((bookmaker) => {
    let deposits = 0;
    let withdrawals = 0;
    for (const t of transactions) {
      if (t.bookmaker !== bookmaker) continue;
      if (t.kind === 'deposit') deposits += t.amount;
      else withdrawals += t.amount;
    }
    return {
      bookmaker,
      key: bookmaker,
      amount: withdrawals - deposits,
      rows: [
        { label: 'Deposited', value: -deposits },
        { label: 'Withdrawn', value: withdrawals },
      ],
    };
  });

/**
 * The setting picks where the figure comes from and whether the accounts are
 * added up or listed. A missing reading falls back to the tracked sum so the
 * header never goes blank. Every account is counted whatever the pages are
 * filtered to: this is what is in the accounts, not what is on screen.
 */
const BalanceControl = (): JSX.Element => {
  const {
    allTransactions: transactions,
    allBonuses: bonuses,
    currency,
    balanceSource,
    balanceLayout,
    includeBonus,
    accountBalances,
    unreadBalances,
    activeBookmakers,
    claimable,
  } = useDashboard();

  const live = balanceSource === 'live' && accountBalances.length > 0;
  // An account nobody has opened yet has no figure, but leaving it out of the
  // breakdown makes the list look like it is missing accounts. It is listed with
  // no number instead, which is the honest version of the same thing.
  const accounts = live
    ? [
        ...liveBalances(accountBalances, bonuses, includeBonus),
        ...unreadBalances.map((bookmaker) => ({
          bookmaker,
          key: bookmaker,
          amount: null,
          rows: [],
        })),
      ]
    : derivedBalances(activeBookmakers, transactions);

  const accountsWithRewards = accounts.map((account) => ({
    ...account,
    waiting: claimable.find((reward) => reward.key === account.key)?.worth ?? null,
  }));

  if (balanceLayout === 'accounts' && accountsWithRewards.length > 0) {
    return (
      <div className="flex items-center gap-5">
        {accountsWithRewards.map((account) => (
          <BalanceReadout
            key={account.key}
            label={<AccountIcon bookmaker={account.bookmaker} className="h-5 w-5" />}
            amount={account.amount}
            currency={currency}
            accounts={[account]}
          />
        ))}
      </div>
    );
  }

  const amount = accountsWithRewards.reduce((sum, account) => sum + (account.amount ?? 0), 0);

  return (
    <BalanceReadout
      label={
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {live ? 'Balance' : 'Net'}
        </span>
      }
      amount={amount}
      currency={currency}
      accounts={accountsWithRewards}
    />
  );
};

/**
 * Rewards the bookmaker is holding until they are collected. They are not in the
 * balance and no sync will move them, so the only thing that makes them money is
 * the player noticing — which is why they sit in the header rather than a page.
 */
const ClaimableChip = (): JSX.Element | null => {
  const { claimable, currency } = useDashboard();
  if (claimable.length === 0) return null;
  const total = claimable.reduce((sum, r) => sum + (r.worth ?? 0), 0);

  return (
    <div className="group relative flex items-center gap-1.5" tabIndex={0}>
      <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-emerald-500">
        Rakeback {formatMoney(total, currency)}
      </span>
      <div className="pointer-events-none absolute right-0 top-full z-50 mt-2 hidden w-56 rounded-lg border border-border bg-popover p-3 text-left text-[10px] text-popover-foreground shadow-lg group-hover:block group-focus-within:block">
        <p className="mb-2 text-muted-foreground">Waiting to be claimed on the site.</p>
        <div className="space-y-1">
          {claimable.flatMap((reward) =>
            reward.parts.map((part) => (
              <BreakdownRow
                key={`${reward.key}-${part.currency}`}
                row={{ label: part.currency, value: part.amount, currency: part.currency }}
                currency={currency}
              />
            )),
          )}
        </div>
      </div>
    </div>
  );
};

export const AppHeader = ({ bare = false }: { bare?: boolean }): JSX.Element => {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="flex h-14 items-center justify-between gap-6 px-6">
        <span className="font-display select-none text-lg leading-none">
          <span className="font-bold uppercase tracking-[0.18em] text-foreground">Bet</span>
          <span className="font-light tracking-tight text-muted-foreground">tracker</span>
        </span>
        {!bare && (
          <div className="flex items-center gap-4">
            <ClaimableChip />
            <BalanceControl />
          </div>
        )}
      </div>
    </header>
  );
};
