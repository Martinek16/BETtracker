import { useEffect, useState, type ReactNode } from 'react';
import { Coins, PlugZap, X } from 'lucide-react';
import type { Bookmaker, Transaction } from '@betanal/shared';
import { CATALOG, type BookmakerMeta } from '@bookmakers/catalog';
import { isReleased } from '@bookmakers/released';
import { AccountIcon } from '@/components/dashboard/account-icon';
import { useDashboard } from '@/context/dashboard-context';
import { getAllSyncMeta, getBetCounts, getSettings, loadTransactions } from '@/data/source';
import { formatMoney } from '@/lib/utils';

/** How much each account held on the last visit, so arrivals can be counted. */
const SEEN_COUNTS_KEY = 'betanal:seen-counts';
/** Which bookmakers the build could read on the last visit, so a new one is news. */
const SEEN_BOOKMAKERS_KEY = 'betanal:seen-bookmakers';
/** The waiting rakeback that was last reported, so the same money is said once. */
const SEEN_RAKEBACK_KEY = 'betanal:seen-rakeback';
const VISIBLE_MS = 6000;

/**
 * One message: its mark on a plate down the whole side, then what happened and
 * what it means, then the way out. Dismissing is local state - nothing outlives
 * the page, and each message decides for itself when it has been read.
 */
export const Toast = ({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}): JSX.Element | null => {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="pointer-events-auto flex w-full items-stretch overflow-hidden rounded-l-lg bg-popover text-xs shadow-lg">
      <span className="flex w-9 shrink-0 items-center justify-center">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-2.5 py-1.5 leading-tight">
        <span className="font-semibold">{title}</span>
        {children !== undefined && (
          <span className="truncate text-[11px] text-muted-foreground">{children}</span>
        )}
      </span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="flex shrink-0 items-center px-2 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X size={13} strokeWidth={1.75} />
      </button>
    </div>
  );
};

/**
 * The strip of empty page under the header, on the side the content does not
 * reach - one fixed width, so a long message and a short one line up. They share
 * one column because several can be true at once: a sync that brought in bets can
 * be the same visit that notices a bonus running out.
 */
export const Toasts = ({ children }: { children: ReactNode }): JSX.Element => (
  <div className="pointer-events-none fixed right-0 top-[3.75rem] z-50 flex w-60 flex-col gap-1.5">
    {children}
  </div>
);

/** How much each account held when it was last reported. */
type Counts = Record<string, { bets: number; transactions: number }>;

const readCounts = (): Counts => {
  try {
    const raw = localStorage.getItem(SEEN_COUNTS_KEY);
    return raw === null ? {} : (JSON.parse(raw) as Counts);
  } catch {
    return {};
  }
};

/**
 * Bets arrive as a per-bookmaker count read off the index rather than as rows:
 * only how many there are matters here, and a history of years is far too much
 * to load for that.
 */
const tally = (
  bets: Partial<Record<Bookmaker, number>>,
  transactions: readonly Transaction[],
): Counts => {
  const counts: Counts = {};
  const row = (bookmaker: Bookmaker): { bets: number; transactions: number } =>
    counts[bookmaker] ?? { bets: 0, transactions: 0 };
  for (const [bookmaker, n] of Object.entries(bets)) {
    if (n === undefined) continue;
    counts[bookmaker] = { ...row(bookmaker), bets: n };
  }
  for (const tx of transactions) {
    counts[tx.bookmaker] = {
      ...row(tx.bookmaker),
      transactions: row(tx.bookmaker).transactions + 1,
    };
  }
  return counts;
};

interface Arrival {
  bookmaker: Bookmaker;
  bets: number;
  transactions: number;
}

/**
 * What each account gained since the counts were last written down. Records are
 * stored without a "when did we learn this" stamp, so the arithmetic is on the
 * totals themselves; a shrunken store means something was deleted, which is not
 * an arrival and reads as none.
 */
const arrivals = (now: Counts, seen: Counts): Arrival[] =>
  Object.entries(now).flatMap(([bookmaker, count]) => {
    const before = seen[bookmaker] ?? { bets: 0, transactions: 0 };
    const arrival = {
      bookmaker: bookmaker as Bookmaker,
      bets: Math.max(count.bets - before.bets, 0),
      transactions: Math.max(count.transactions - before.transactions, 0),
    };
    return arrival.bets + arrival.transactions === 0 ? [] : [arrival];
  });

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * What the worker brought in while the dashboard was closed, one message per
 * account. It reports on open rather than on every finished sync: a sync that
 * lands while you are already looking at the numbers changes them in front of
 * you, and announcing that is noise.
 */
export const SyncToast = (): JSX.Element | null => {
  const [fresh, setFresh] = useState<Arrival[]>([]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    void Promise.all([getBetCounts(), loadTransactions(), getSettings()]).then(
      ([bets, transactions, settings]) => {
        const seen = readCounts();
        const first = Object.keys(seen).length === 0;
        const now = tally(bets, transactions);
        try {
          localStorage.setItem(SEEN_COUNTS_KEY, JSON.stringify(now));
        } catch {
          /* private mode: everything reads as new again next visit */
        }
        // Nothing was written down before, so every stored record would count as
        // an arrival - an import or a first run is not news.
        if (first || !settings.syncAlerts) return;
        const found = arrivals(now, seen);
        if (found.length === 0) return;
        setFresh(found);
        timer = setTimeout(() => setFresh([]), VISIBLE_MS);
      },
    );
    return () => clearTimeout(timer);
  }, []);

  if (fresh.length === 0) return null;

  return (
    <>
      {fresh.map((arrival) => (
        <Toast
          key={arrival.bookmaker}
          icon={<AccountIcon bookmaker={arrival.bookmaker} className="h-5 w-5 rounded" />}
          title="New data"
        >
          {[
            arrival.bets === 0 ? null : plural(arrival.bets, 'bet'),
            arrival.transactions === 0 ? null : plural(arrival.transactions, 'transaction'),
          ]
            .filter((part) => part !== null)
            .join(', ')}
        </Toast>
      ))}
    </>
  );
};

/**
 * A bookmaker this build can read and the last one could not.
 *
 * It arrives either with an update or with a build somebody made themselves,
 * and in both cases the site stays invisible until its owner knows it is there
 * and opens it once. Announced from the catalogue rather than from stored data:
 * there is nothing stored yet, which is the whole point of saying so. It waits
 * to be dismissed rather than timing out, because it is said once per site.
 */
export const NewBookmakerToast = (): JSX.Element | null => {
  const [added, setAdded] = useState<BookmakerMeta[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem(SEEN_BOOKMAKERS_KEY);
    try {
      localStorage.setItem(SEEN_BOOKMAKERS_KEY, JSON.stringify(CATALOG.map((meta) => meta.id)));
    } catch {
      /* private mode: every bookmaker reads as new again next visit */
    }
    // Nothing was written down before, so the whole catalogue would count as new.
    if (raw === null) return;
    const seen = new Set<string>(JSON.parse(raw) as string[]);
    const fresh = CATALOG.filter((meta) => !seen.has(meta.id));
    if (fresh.length === 0) return;
    setAdded(fresh);
  }, []);

  if (added.length === 0) return null;

  return (
    <>
      {added.map((meta) => (
        <Toast
          key={meta.id}
          icon={<AccountIcon bookmaker={meta.id} className="h-5 w-5 rounded" />}
          title={`${meta.name} can now be read`}
        >
          {isReleased(meta.id)
            ? 'Open the site and sign in to start it.'
            : 'Added to this copy. Open the site and sign in to start it.'}
        </Toast>
      ))}
    </>
  );
};

/**
 * Rakeback the bookmaker is holding back until it is asked for.
 *
 * It is the one reward nothing ever delivers: no sync moves it, it is not in the
 * balance, and an account can sit on months of it without being told. So it is
 * said out loud once, when the figure is larger than the one last reported -
 * repeating the same amount on every visit would train the reader to close it.
 *
 * No deadline is given because none is known: the sites that pay rakeback let it
 * stand until it is claimed, and a date invented here would be the app telling
 * the reader to hurry for no reason.
 */
export const RakebackToast = (): JSX.Element | null => {
  const { claimable, currency, loading } = useDashboard();
  const [announced, setAnnounced] = useState(0);
  // Coins the display currency has no rate for are left out rather than guessed,
  // so this can read 0 while something is genuinely waiting.
  const waiting = claimable.reduce((sum, reward) => sum + (reward.worth ?? 0), 0);

  useEffect(() => {
    if (loading) return;
    const seen = Number(localStorage.getItem(SEEN_RAKEBACK_KEY) ?? '0');
    try {
      localStorage.setItem(SEEN_RAKEBACK_KEY, String(waiting));
    } catch {
      /* private mode: the same figure is reported again next visit */
    }
    // A cent of drift is the conversion rate moving, not rakeback accruing.
    if (waiting > seen + 0.01) setAnnounced(waiting);
  }, [loading, waiting]);

  if (announced <= 0) return null;

  return (
    <Toast
      icon={<Coins size={15} strokeWidth={1.75} />}
      title={`${formatMoney(announced, currency)} rakeback waiting`}
    >
      Claim it on the site - nothing brings it in on its own.
    </Toast>
  );
};

/**
 * An account that once synced and now cannot is the one failure that hides
 * itself: the numbers stay on screen, they just stop moving. One that was never
 * connected has nothing to report.
 */
export const ConnectionToast = (): JSX.Element | null => {
  const [broken, setBroken] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    void Promise.all([getAllSyncMeta(), getSettings()]).then(([all, settings]) => {
      if (!settings.connectionAlerts) return;
      const count = all.filter(
        ({ meta }) => meta.lastSyncAt !== null && meta.lastStatus === 'error',
      ).length;
      if (count === 0) return;
      setBroken(count);
      timer = setTimeout(() => setBroken(0), VISIBLE_MS);
    });
    return () => clearTimeout(timer);
  }, []);

  if (broken === 0) return null;

  return (
    <Toast
      icon={<PlugZap size={15} strokeWidth={1.75} className="text-loss" />}
      title={broken === 1 ? 'An account stopped syncing' : `${broken} accounts stopped syncing`}
    >
      Sign in again to keep the figures current.
    </Toast>
  );
};
