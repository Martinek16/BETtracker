import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ExternalLink, Unlink } from 'lucide-react';
import { accountKey, type AccountRef } from '@betanal/shared';
import { DashboardCard } from '@/components/dashboard/dashboard-card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useDashboard } from '@/context/dashboard-context';
import {
  findAccount,
  siteLinkOf,
  useAccountNames,
  useAccountVisibility,
  useSiteOrigins,
  useStoredRecords,
  useSyncMetaByAccount,
  type AccountInfo,
} from '@/data/accounts';
import { clearAccount, forgetSite, getKnownAccounts } from '@/data/source';
import { formatDate, formatDateTime } from '@/lib/utils';
import { AccountIcon } from '@/components/dashboard/account-icon';
import { AccountStats } from '@/pages/options/account-stats';
import { ConnectionLabel, Crumbs, Row } from '@/pages/options/parts';

/** Cuts this login loose: everything read from it goes with it, the other logins stay. */
const DisconnectAccount = ({
  account,
  login,
  counts,
}: {
  account: AccountInfo;
  login: AccountRef;
  counts: { bets: number; transactions: number; bonuses: number };
}): JSX.Element => {
  const navigate = useNavigate();
  const { reload } = useDashboard();
  const [open, setOpen] = useState(false);

  const onConfirm = async (): Promise<void> => {
    await clearAccount(login);
    // With the last login at this site gone, the permission to read it goes too:
    // a second login at the same bookmaker keeps it, since that one still exists.
    if ((await getKnownAccounts(account.id)).length === 0) forgetSite(account.id);
    setOpen(false);
    reload();
    navigate('/options/accounts');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full text-loss hover:text-loss">
          <Unlink size={13} strokeWidth={1.75} />
          Delete data
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this account&apos;s data</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-3 rounded-md border border-border/60 p-3 text-left">
          <AccountIcon bookmaker={account.id} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{account.name}</p>
            <p className="truncate text-xs text-muted-foreground" title={login.accountId}>
              {login.accountId}
            </p>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          <p>Deleted from this browser:</p>
          <ul className="mt-1.5 list-inside list-disc">
            <li>{counts.bets} bets</li>
            <li>{counts.transactions} payments</li>
            <li>{counts.bonuses} bonuses</li>
          </ul>
          <DialogDescription className="mt-3">
            Your {account.name} account stays. Sign in again to add it back any time.
          </DialogDescription>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button variant="destructive" size="sm" onClick={() => void onConfirm()}>
            Delete data
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * A name of your own for this login. Saved when the field is left rather than on
 * every keystroke: each save is a database write, and the value is read back into
 * `key` below, which would fight the cursor in the middle of a word.
 */
const AccountName = ({
  accountKey: key,
  placeholder,
}: {
  accountKey: string;
  placeholder: string;
}): JSX.Element => {
  const { nameFor, setName } = useAccountNames();
  const name = nameFor(key);

  return (
    <input
      key={name}
      defaultValue={name}
      placeholder={placeholder}
      maxLength={40}
      onBlur={(e) => void setName(key, e.target.value.trim())}
      className="w-44 rounded-md border border-border bg-transparent px-2 py-1 text-right text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40"
    />
  );
};

/**
 * The login as the bookmaker names it - long enough to wrap, and worth copying
 * when a support form asks for it. Kept to one line, and copied on a click with
 * nothing to dismiss afterwards.
 */
const AccountIdValue = ({ id }: { id: string }): JSX.Element => {
  const [copied, setCopied] = useState(false);

  const onCopy = (): void => {
    void navigator.clipboard.writeText(id);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      title={id}
      className="block w-full truncate text-muted-foreground transition-colors hover:text-foreground"
    >
      {copied ? 'Copied' : id}
    </button>
  );
};

export const AccountDetailPage = (): JSX.Element => {
  const { bookmaker, accountId } = useParams();
  const account = findAccount(bookmaker);
  const stored = useStoredRecords();
  const metas = useSyncMetaByAccount();
  const origins = useSiteOrigins();
  const { accountBalances } = useDashboard();
  const { isVisible, setVisible } = useAccountVisibility();
  const { nameFor } = useAccountNames();

  if (account === undefined || accountId === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <Crumbs to="/options/accounts" parent="Accounts" title="Unknown account" />
        <p className="text-sm text-muted-foreground">That account does not exist.</p>
      </div>
    );
  }

  const login: AccountRef = { bookmaker: account.id, accountId };
  const key = accountKey(login);
  const meta = metas[key];
  const bets = stored.bets.filter((bet) => accountKey(bet) === key);
  const transactions = stored.transactions.filter((t) => accountKey(t) === key);
  const bonuses = stored.bonuses.filter((b) => accountKey(b) === key);
  const placed = bets.map((bet) => bet.placedAt).sort();
  const shown = isVisible(key);
  const first = placed[0];
  const link = siteLinkOf(account, origins);
  const read = accountBalances.find((row) => row.key === key);
  const balance = read?.amount ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Crumbs to="/options/accounts" parent="Accounts" title={nameFor(key) || account.name} />
      {/* Both cards fill whatever is left of the page, the way every other page's
          cards do, so neither carries a scrollbar of its own. */}
      <div className="grid min-h-0 flex-1 gap-4 pb-12 lg:grid-cols-[300px_minmax(0,1fr)]">
        <DashboardCard className="flex flex-col overflow-hidden p-0">
          <div className="flex items-center gap-3 border-b border-border/60 p-4">
            <AccountIcon bookmaker={account.id} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground" title={account.name}>
                {nameFor(key) || account.name}
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
              className="ml-auto"
              checked={shown}
              onCheckedChange={(next) => void setVisible(key, next)}
              title={shown ? 'Shown in the app' : 'Hidden from the app'}
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col px-4 py-1">
            <Row label="Status">
              <ConnectionLabel meta={meta} />
            </Row>
            <Row label="Name">
              <AccountName accountKey={key} placeholder={account.name} />
            </Row>
            <Row label="Id">
              <AccountIdValue id={login.accountId} />
            </Row>
            <Row label="Stored">
              {bets.length} bets, {transactions.length} payments
            </Row>
            {/* Pinned to the bottom of the card: when it was first and last read
                belongs next to the line, not adrift under the counts. */}
            <div className="mt-auto">
              <Row label="First read">{first === undefined ? '—' : formatDate(first)}</Row>
              <Row label="Updated">
                {meta?.lastSyncAt == null ? 'Never' : formatDateTime(meta.lastSyncAt)}
              </Row>
            </div>
          </div>
          {meta?.lastError == null ? null : (
            <p className="border-t border-border/60 px-4 py-2.5 text-xs text-loss">
              {meta.lastError}
            </p>
          )}
          <div className="flex shrink-0 flex-col gap-2 border-t border-border/60 p-4">
            <Button variant="outline" size="sm" className="w-full" asChild>
              <a href={link.url} target="_blank" rel="noreferrer noopener">
                <ExternalLink size={13} strokeWidth={1.75} />
                Open {link.host}
              </a>
            </Button>
            <DisconnectAccount
              account={account}
              login={login}
              counts={{
                bets: bets.length,
                transactions: transactions.length,
                bonuses: bonuses.length,
              }}
            />
          </div>
        </DashboardCard>

        <AccountStats
          account={account}
          bets={bets}
          transactions={transactions}
          bonuses={bonuses}
          balance={balance}
          vault={read?.vault ?? null}
          wagered={read?.wagered ?? null}
          currency={stored.currency}
        />
      </div>
    </div>
  );
};
