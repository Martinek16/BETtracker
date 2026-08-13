import { useEffect, useState, type ReactNode } from 'react';
import { Hourglass, PlugZap, X } from 'lucide-react';
import type { Bonus, Bookmaker, Transaction } from '@betanal/shared';
import { AccountIcon } from '@/components/dashboard/account-icon';
import {
  getAllSyncMeta,
  getBetCounts,
  getSettings,
  loadBonuses,
  loadTransactions,
} from '@/data/source';

/** How much each account held on the last visit, so arrivals can be counted. */
const SEEN_COUNTS_KEY = 'betanal:seen-counts';
/** The day the expiry warning last fired, so a slow bonus nags once, not hourly. */
const EXPIRY_DAY_KEY = 'betanal:expiry-day';
/** How close to its end a bonus has to be before it is worth interrupting for. */
const EXPIRY_WARN_DAYS = 3;
const VISIBLE_MS = 6000;

/**
 * One message: its mark on a plate down the whole side, then what happened and
 * what it means, then the way out. Dismissing is local state — nothing outlives
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
 * reach — one fixed width, so a long message and a short one line up. They share
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
    counts[tx.bookmaker] = { ...row(tx.bookmaker), transactions: row(tx.bookmaker).transactions + 1 };
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
        // an arrival — an import or a first run is not news.
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

/** A grant still carrying a balance whose own end date is close. */
const expiringSoon = (bonus: Bonus): boolean => {
  if (bonus.status !== 'active' || bonus.expiresAt === null || bonus.currentAmount <= 0) return false;
  const left = Date.parse(bonus.expiresAt) - Date.now();
  return left > 0 && left <= EXPIRY_WARN_DAYS * 86_400_000;
};

/** States the expiry while it still matters to the figures, once a day at most. */
export const BonusExpiryToast = (): JSX.Element | null => {
  const [soon, setSoon] = useState<Bonus[]>([]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    void Promise.all([loadBonuses(), getSettings()]).then(([bonuses, settings]) => {
      if (!settings.expiryAlerts) return;
      const today = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem(EXPIRY_DAY_KEY) === today) return;
      const due = bonuses.filter(expiringSoon);
      if (due.length === 0) return;
      try {
        localStorage.setItem(EXPIRY_DAY_KEY, today);
      } catch {
        /* private mode: the warning simply repeats next visit */
      }
      setSoon(due);
      timer = setTimeout(() => setSoon([]), VISIBLE_MS);
    });
    return () => clearTimeout(timer);
  }, []);

  if (soon.length === 0) return null;
  const only = soon.length === 1 ? soon[0] : undefined;

  return (
    <Toast
      icon={<Hourglass size={15} strokeWidth={1.75} className="text-primary" />}
      title={only === undefined ? `${soon.length} bonuses expire soon` : 'A bonus expires soon'}
    >
      {only === undefined ? 'Open Bonuses to see which.' : only.name}
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
