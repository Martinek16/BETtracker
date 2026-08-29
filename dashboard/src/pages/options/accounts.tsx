import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import {
  accountKey,
  type AccountRef,
  type Bet,
  type SyncMeta,
  type Transaction,
} from '@betanal/shared';
import { DashboardCard } from '@/components/dashboard/dashboard-card';
import { useDashboard } from '@/context/dashboard-context';
import { Switch } from '@/components/ui/switch';
import {
  ACCOUNTS,
  findAccount,
  useAccountNames,
  useAccountVisibility,
  useAllKnownAccounts,
  useSiteOrigins,
  useStoredRecords,
  useSyncMetaByAccount,
  siteLinkOf,
  type AccountInfo,
  type SiteLink,
} from '@/data/accounts';
import { cn, formatDateTime, formatMoney, smallMoney } from '@/lib/utils';
import { AccountIcon } from '@/components/dashboard/account-icon';
import { ConnectionLabel, Stat } from '@/pages/options/parts';
import { isReleased } from '@bookmakers/released';
import { needsAdapterUpdate } from '@bookmakers/shape';

const AccountCard = ({
  account,
  login,
  link,
  meta,
  bets,
  transactions,
  currency,
  balance,
  waiting,
}: {
  account: AccountInfo;
  login: AccountRef;
  link: SiteLink;
  meta: SyncMeta | undefined;
  bets: Bet[];
  transactions: Transaction[];
  currency: string;
  /** null until the site has been open once with the extension connected. */
  balance: number | null;
  /** Rakeback the site is holding. Not in the balance until it is claimed. */
  waiting: number | null;
}): JSX.Element => {
  const { isVisible, setVisible } = useAccountVisibility();
  const { nameFor } = useAccountNames();
  const key = accountKey(login);
  const shown = isVisible(key);
  const label = nameFor(key) || account.name;
  let deposits = 0;
  let withdrawals = 0;
  for (const t of transactions) {
    if (t.kind === 'deposit') deposits += t.amount;
    else withdrawals += t.amount;
  }
  // Money taken back out, less money put in: ahead is green, still down is red.
  const net = withdrawals - deposits;

  return (
    <DashboardCard className={cn('flex flex-col p-0', shown ? undefined : 'opacity-60')}>
      <div className="flex min-w-0 items-center gap-3 border-b border-border/60 p-4">
        <AccountIcon bookmaker={account.id} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground" title={account.name}>
            {label}
          </p>
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer noopener"
            className="block truncate text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {link.host}
          </a>
        </div>
        <Switch
          data-tour="account-visibility"
          className="ml-auto"
          checked={shown}
          onCheckedChange={(next) => void setVisible(key, next)}
          title={shown ? 'Shown in the app' : 'Hidden from the app'}
        />
      </div>

      <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs text-muted-foreground">
        <ConnectionLabel meta={meta} />
        <span>{meta?.lastSyncAt == null ? 'Never updated' : formatDateTime(meta.lastSyncAt)}</span>
      </div>

      {needsAdapterUpdate(meta?.lastError) && (
        <p className="border-t border-border/60 px-4 py-2.5 text-xs text-pending">
          {account.name} answered in a shape this version does not recognise, so the run stopped
          rather than write a figure it had guessed at. What is on screen is what was last read, and
          it is not being added to. The site has changed its API and {account.name} needs an adapter
          update.
        </p>
      )}

      <div className="border-t border-border/60 px-4 py-3">
        <div className="grid grid-cols-5 gap-2">
          <Stat
            label="Balance"
            value={balance === null ? '—' : formatMoney(balance, currency)}
            note={waiting === null ? undefined : `+${smallMoney(waiting, currency)} to claim`}
          />
          <Stat label="Bets" value={String(bets.length)} />
          <Stat label="Deposits" value={formatMoney(deposits, currency)} />
          <Stat label="Withdrawals" value={formatMoney(withdrawals, currency)} />
          <Stat
            label="Net"
            value={formatMoney(net, currency)}
            tone={net >= 0 ? 'text-profit' : 'text-loss'}
          />
        </div>
      </div>

      <div className="mt-auto flex items-center border-t border-border/60 px-4 py-3">
        <Link
          data-tour="account-details"
          to={`/options/accounts/${login.bookmaker}/${encodeURIComponent(login.accountId)}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Details
          <ChevronRight size={13} strokeWidth={1.75} />
        </Link>
      </div>
    </DashboardCard>
  );
};

const SectionTitle = ({ children }: { children: string }): JSX.Element => (
  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
    {children}
  </h2>
);

/**
 * Every bookmaker this build can read, as a row of marks. The name is on the
 * mark itself and again in the tooltip, so spelling it out beside every icon
 * only widened the row as the list grew.
 *
 * A site added to a copy of the project is drawn apart from the released ones:
 * it works the same, but nobody else has checked it, and whoever added it is the
 * only person who can say whether its figures are right.
 */
const SupportedFooter = (): JSX.Element => {
  const chip = (account: (typeof ACCOUNTS)[number], released: boolean): JSX.Element => (
    <span
      key={account.id}
      title={
        released ? account.name : `${account.name} - added to this copy, not part of a release`
      }
      className={cn(
        'flex items-center rounded-full border p-1.5 text-muted-foreground',
        released ? 'border-border/60' : 'border-dashed border-primary/50 text-primary',
      )}
    >
      <AccountIcon bookmaker={account.id} className="h-4 w-4" />
      <span className="sr-only">{account.name}</span>
    </span>
  );

  const added = ACCOUNTS.filter((account) => !isReleased(account.id));

  return (
    <div
      data-tour="supported-books"
      className="mt-auto flex flex-col items-center gap-1.5 border-t border-border/60 pb-0.5 pt-2.5"
    >
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Supported bookmakers
      </span>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {ACCOUNTS.filter((account) => isReleased(account.id)).map((account) => chip(account, true))}
        {/* What this copy was built with, and what its owner added, are not the
            same claim: only the first has been checked by anybody else. */}
        {added.length > 0 && <span className="mx-1 h-5 w-px bg-border" />}
        {added.map((account) => chip(account, false))}
      </div>
    </div>
  );
};

export const AccountsPage = (): JSX.Element => {
  const { bets, transactions, currency } = useStoredRecords();
  // Already converted to the display currency, and keyed by the same login, so
  // the card can read the header's own figure rather than work one out again.
  const { accountBalances, claimable } = useDashboard();
  const metas = useSyncMetaByAccount();
  const logins = useAllKnownAccounts();
  const origins = useSiteOrigins();

  return (
    <div className="flex flex-1 flex-col gap-6 pb-1">
      <div className="flex items-center gap-3">
        {logins.length > 0 && <SectionTitle>Connected accounts</SectionTitle>}
        <Link
          to="/options/accounts/add-bookmaker"
          className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Add a bookmaker
          <ChevronRight size={13} strokeWidth={1.75} />
        </Link>
      </div>

      {logins.length > 0 && (
        <section className="flex flex-col gap-3">
          <div
            data-tour="accounts-list"
            className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3"
          >
            {logins.map((login) => {
              const account = findAccount(login.bookmaker);
              if (account === undefined) return null;
              return (
                <AccountCard
                  key={accountKey(login)}
                  account={account}
                  login={login}
                  link={siteLinkOf(account, origins)}
                  meta={metas[accountKey(login)]}
                  bets={bets.filter((bet) => accountKey(bet) === accountKey(login))}
                  transactions={transactions.filter((t) => accountKey(t) === accountKey(login))}
                  currency={currency}
                  balance={accountBalances.find((b) => b.key === accountKey(login))?.amount ?? null}
                  waiting={claimable.find((r) => r.key === accountKey(login))?.worth ?? null}
                />
              );
            })}
          </div>
        </section>
      )}

      <SupportedFooter />
    </div>
  );
};
