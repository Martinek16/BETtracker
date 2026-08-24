import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { RateTable } from './fx';
import type { OddsFormat } from './odds';
import {
  accountKey,
  UNCLAIMED,
  type AccountId,
  type AccountPerks,
  type AccountRef,
  type Bet,
  type Bonus,
  type Bookmaker,
  type CasinoRound,
  type Transaction,
} from './types';

export const DB_NAME = 'betanal-db';
// Bumped when a store is added: an existing database already sitting on the old
// number never re-runs `upgrade`, so the new store would silently never exist.
export const DB_VERSION = 8;

/**
 * The account every pre-v5 record belongs to. Only bet-at-home was ever
 * imported, so untagged rows can only have come from there.
 */
const LEGACY_BOOKMAKER: Bookmaker = 'bet-at-home';

/**
 * The sites that existed when v5 wrote its per-bookmaker meta keys. Frozen on
 * purpose: a migration rewrites keys that were written in the past, so reading
 * today's installed bookmakers here would make it miss keys once a site is
 * removed, and pointlessly look for keys a site added later never wrote.
 */
const V5_BOOKMAKERS: readonly Bookmaker[] = ['bet-at-home', 'stake'];

/**
 * Meta rows are per-account. Before v5 they were single global keys, which two
 * connected accounts would have silently overwritten for each other; before v6
 * they were per bookmaker, which did the same to two logins at one bookmaker.
 */
const metaKey = (base: string, account: AccountRef): string => `${base}:${accountKey(account)}`;

/** The registry row itself is per bookmaker - it is what lists the accounts. */
const registryKey = (bookmaker: Bookmaker): string => `accounts:${bookmaker}`;

/** Where migrated rows land until a real identity claims them. */
const LEGACY_ACCOUNT: AccountRef = { bookmaker: LEGACY_BOOKMAKER, accountId: UNCLAIMED };

/**
 * `bonusOffers` is no longer written; it stays listed so rows an older version
 * left behind are still deleted and exported with the rest.
 */
const META_BASES = ['sync', 'backfill', 'balance', 'balanceHistory', 'bonusOffers'] as const;

/** Period the dashboard shows. Lives here because it is a persisted setting. */
export type TimeRange = '7d' | '14d' | '1m' | '3m' | '6m' | '1y' | 'all';

/**
 * Which figure the header calls "balance": what the bookmaker page says sits in
 * the account right now, or what the tracked money adds up to.
 */
export type BalanceSource = 'live' | 'derived';

/** One figure for every account together, or one figure per account. */
export type BalanceLayout = 'total' | 'accounts';

/** Which way round the dot and the comma go: 1.234,56 or 1,234.56. */
export type NumberFormat = 'eu' | 'us';

/** Which side of the amount the currency mark sits on: €10 or 10 €. */
export type SymbolPosition = 'before' | 'after';

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  currency: string;
  /** Account keys left out of every view. Their bets stay stored, just hidden. */
  hiddenAccounts: string[];
  /** Period every page opens on. */
  defaultRange: TimeRange;
  /** How a price is written wherever the dashboard prints one. */
  oddsFormat: OddsFormat;
  /** How a number is punctuated wherever the dashboard prints one. */
  numberFormat: NumberFormat;
  /** Which side of an amount the currency mark is printed on. */
  symbolPosition: SymbolPosition;
  /** Where the header balance comes from. */
  balanceSource: BalanceSource;
  /** Whether the header adds the accounts up or lists them side by side. */
  balanceLayout: BalanceLayout;
  /**
   * Count bonus money as part of the balance. Off shows only what could be
   * withdrawn today, with the granted money left out of the figure.
   */
  includeBonus: boolean;
  /** Draw bookmaker logos in grey so they sit inside the dashboard's palette. */
  monoIcons: boolean;
  /**
   * Show rewards the bookmaker is holding until they are claimed. They are not
   * in the balance and no sync collects them, so the figure is a reminder rather
   * than money in hand - and a reminder nobody acts on is just noise.
   */
  showClaimable: boolean;
  /**
   * Show the casino page for accounts that run one off the same wallet. Off for
   * a reader who only wants the sportsbook - the figures are still counted, they
   * just stop having a page of their own.
   */
  showCasino: boolean;
  /** Toast when a sync brings in bets the tracker did not have. */
  syncAlerts: boolean;
  /** Toast when a connected account stopped syncing or signed itself out. */
  connectionAlerts: boolean;
  /** Figures switched off on the account page. Ids, not labels - labels change. */
  hiddenAccountStats: string[];
  /** What the user calls each account, keyed by account key. */
  accountNames: Record<string, string>;
  /**
   * How many picks a group needs before the analytics tables rank it among the
   * rest. A row under it is still shown, at the bottom: one bet that happened to
   * win is the top of a profit sort otherwise, and it is not a finding.
   */
  minPicks: number;
  /** The guided tour runs once, the first time the dashboard has bets to show. */
  tourSeen: boolean;
}

/** The thresholds the settings page offers. One is no threshold at all. */
export const MIN_PICKS_CHOICES: readonly number[] = [1, 20, 50, 100];

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  currency: 'EUR',
  hiddenAccounts: [],
  defaultRange: '7d',
  oddsFormat: 'decimal',
  numberFormat: 'eu',
  symbolPosition: 'after',
  balanceSource: 'live',
  balanceLayout: 'total',
  includeBonus: true,
  monoIcons: true,
  showClaimable: true,
  showCasino: true,
  syncAlerts: true,
  connectionAlerts: true,
  hiddenAccountStats: [],
  accountNames: {},
  minPicks: 20,
  tourSeen: false,
};

export interface SyncMeta {
  lastSyncAt: string | null;
  lastStatus: 'synced' | 'syncing' | 'error' | 'logged_out';
  lastError: string | null;
}

/** Live account balance scraped from the bookmaker page (no API exposes it). */
export interface BalanceInfo {
  bookmaker: Bookmaker;
  accountId: AccountId;
  amount: number;
  currency: string | null;
  capturedAt: string;
  /**
   * What the account holds coin by coin, richest first, at a site that keeps a
   * wallet per currency. `amount` is their combined worth and stays the figure
   * every total reads; this is only what that figure is made of. Absent where
   * the account has one balance and the split would say nothing.
   */
  holdings?: readonly { currency: string; amount: number }[];
  /**
   * Worth put aside in the site's vault, in the same currency as `amount` and
   * deliberately not part of it - the site's own header leaves it out too. Still
   * the account's money, so a wallet that ignores it reads money moved out of
   * betting reach as money that went missing.
   */
  vault?: number;
  /**
   * Lifetime turnover the site reports itself, in the same currency as `amount`.
   * Split by product because one wallet funds both, and the casino half is the
   * only trace of play the bet history never records. Absent where the site
   * publishes no such figure.
   */
  wagered?: { sports: number; casino: number };
}

/**
 * A bet as it sits in the store: the domain record plus the one date the
 * dashboard files it under. It is a copy of `settledAt ?? cashedOutAt ??
 * placedAt`, written down only because IndexedDB cannot index a value it has to
 * compute - and without an index a period can only be found by reading every bet
 * ever stored and throwing most of them away.
 */
type StoredBet = Bet & { periodDate: string };

const withPeriodDate = (bet: Bet): StoredBet => ({
  ...bet,
  periodDate: bet.settledAt ?? bet.cashedOutAt ?? bet.placedAt,
});

interface BetAnalDB extends DBSchema {
  bets: {
    key: string;
    value: StoredBet;
    indexes: { placedAt: string; status: string; bookmaker: string; periodDate: string };
  };
  settings: { key: string; value: { key: string; value: unknown } };
  meta: { key: string; value: { key: string; value: unknown } };
  transactions: {
    key: string;
    value: Transaction;
    indexes: { occurredAt: string; bookmaker: string };
  };
  bonuses: {
    key: string;
    value: Bonus;
    indexes: { grantedAt: string; bookmaker: string };
  };
  casinoRounds: {
    key: string;
    value: CasinoRound;
    indexes: { playedAt: string; bookmaker: string };
  };
}

let dbPromise: Promise<IDBPDatabase<BetAnalDB>> | null = null;

export const openDb = (): Promise<IDBPDatabase<BetAnalDB>> => {
  if (dbPromise === null) {
    dbPromise = openDB<BetAnalDB>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (!db.objectStoreNames.contains('bets')) {
          const store = db.createObjectStore('bets', { keyPath: 'betId' });
          store.createIndex('placedAt', 'placedAt');
          store.createIndex('status', 'status');
          store.createIndex('bookmaker', 'bookmaker');
          store.createIndex('periodDate', 'periodDate');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('transactions')) {
          const store = db.createObjectStore('transactions', { keyPath: 'id' });
          store.createIndex('occurredAt', 'occurredAt');
          store.createIndex('bookmaker', 'bookmaker');
        }
        if (!db.objectStoreNames.contains('bonuses')) {
          const store = db.createObjectStore('bonuses', { keyPath: 'id' });
          store.createIndex('grantedAt', 'grantedAt');
          store.createIndex('bookmaker', 'bookmaker');
        }
        if (!db.objectStoreNames.contains('casinoRounds')) {
          const store = db.createObjectStore('casinoRounds', { keyPath: 'id' });
          store.createIndex('playedAt', 'playedAt');
          store.createIndex('bookmaker', 'bookmaker');
        }

        // v5: every record and every meta row becomes bookmaker-scoped. Runs in
        // the upgrade transaction, so a failure rolls the whole thing back
        // rather than leaving half-tagged data behind.
        if (oldVersion > 0 && oldVersion < 5) {
          for (const name of ['transactions', 'bonuses'] as const) {
            const store = tx.objectStore(name);
            if (!store.indexNames.contains('bookmaker')) {
              store.createIndex('bookmaker', 'bookmaker');
            }
            for await (const cursor of store) {
              const row = cursor.value as { bookmaker?: Bookmaker };
              if (row.bookmaker === undefined) {
                await cursor.update({ ...cursor.value, bookmaker: LEGACY_BOOKMAKER });
              }
            }
          }

          const meta = tx.objectStore('meta');
          for (const base of META_BASES) {
            const row = await meta.get(base);
            if (row === undefined) continue;
            const value =
              base === 'bonusOffers' && Array.isArray(row.value)
                ? row.value.map((o) => ({ bookmaker: LEGACY_BOOKMAKER, ...(o as object) }))
                : row.value;
            // Already the v6 key: metaKey now carries an account, and the block
            // below only rewrites keys written by an actual v5 database.
            await meta.put({ key: metaKey(base, LEGACY_ACCOUNT), value });
            await meta.delete(base);
          }
        }

        // v6: scope drops from the bookmaker to one login at it. Which login
        // wrote these rows is not knowable here - nothing recorded it - so they
        // are marked unclaimed and the first identity seen takes them over.
        if (oldVersion > 0 && oldVersion < 6) {
          for (const name of ['bets', 'transactions', 'bonuses'] as const) {
            for await (const cursor of tx.objectStore(name)) {
              const row = cursor.value as { accountId?: AccountId };
              if (row.accountId === undefined) {
                await cursor.update({ ...cursor.value, accountId: UNCLAIMED });
              }
            }
          }

          if (oldVersion >= 5) {
            const meta = tx.objectStore('meta');
            for (const base of META_BASES) {
              for (const bookmaker of V5_BOOKMAKERS) {
                const row = await meta.get(`${base}:${bookmaker}`);
                if (row === undefined) continue;
                await meta.put({
                  key: metaKey(base, { bookmaker, accountId: UNCLAIMED }),
                  value: row.value,
                });
                await meta.delete(`${base}:${bookmaker}`);
              }
            }
          }

          const settings = tx.objectStore('settings');
          const row = await settings.get('app');
          if (row && typeof row.value === 'object' && row.value !== null) {
            const old = row.value as {
              hiddenBookmakers?: Bookmaker[];
              accountNames?: Partial<Record<Bookmaker, string>>;
            };
            const next: Record<string, unknown> = { ...old };
            delete next.hiddenBookmakers;
            next.hiddenAccounts = (old.hiddenBookmakers ?? []).map((bookmaker) =>
              accountKey({ bookmaker, accountId: UNCLAIMED }),
            );
            next.accountNames = Object.fromEntries(
              Object.entries(old.accountNames ?? {}).map(([bookmaker, name]) => [
                accountKey({ bookmaker: bookmaker as Bookmaker, accountId: UNCLAIMED }),
                name,
              ]),
            );
            await settings.put({ key: 'app', value: next });
          }
        }

        // v7: the date a bet is filed under stops being recomputed on every read
        // and becomes a stored, indexed field. Costs one pass now and saves
        // loading the whole history to answer "what happened last week" forever
        // after.
        if (oldVersion > 0 && oldVersion < 7) {
          const bets = tx.objectStore('bets');
          if (!bets.indexNames.contains('periodDate')) {
            bets.createIndex('periodDate', 'periodDate');
          }
          for await (const cursor of bets) {
            await cursor.update(withPeriodDate(cursor.value));
          }
        }
      },
    });
  }
  return dbPromise;
};

/** Idempotent bulk upsert keyed by betId. Returns count of new bets. */
export const putBets = async (bets: readonly Bet[]): Promise<number> => {
  const db = await openDb();
  const tx = db.transaction('bets', 'readwrite');
  let added = 0;
  await Promise.all(
    bets.map(async (bet) => {
      // getKey rather than get: only whether the row is already there is wanted,
      // and reading the key skips deserialising a whole slip per bet.
      if ((await tx.store.getKey(bet.betId)) === undefined) added += 1;
      // Rewritten in full on every upsert, so a slip that settles moves to its
      // settlement date in the index by itself and cannot drift out of step.
      await tx.store.put(withPeriodDate(bet));
    }),
  );
  await tx.done;
  return added;
};

export const getAllBets = async (): Promise<Bet[]> => {
  const db = await openDb();
  return db.getAll('bets');
};

/**
 * Bets filed under a half-open window `[from, to)`, read straight off the
 * periodDate index. Either end may be `null` for "no bound on that side"; both
 * null is every bet, which is what the All period asks for and the only case
 * that still costs the whole store.
 *
 * Open slips are deliberately not included - they are pinned above whatever
 * period is showing, so callers read them with `getPendingBets`.
 */
export const getBetsInRange = async (from: string | null, to: string | null): Promise<Bet[]> => {
  const db = await openDb();
  const range =
    from === null
      ? to === null
        ? undefined
        : IDBKeyRange.upperBound(to, true)
      : to === null
        ? IDBKeyRange.lowerBound(from)
        : IDBKeyRange.bound(from, to, false, true);
  return db.getAllFromIndex('bets', 'periodDate', range);
};

/** How many bets are stored, counted by the index rather than by reading them. */
export const countBets = async (): Promise<number> => (await openDb()).count('bets');

/**
 * Which bookmakers this database has ever held an account for, read from the
 * registry rows rather than from a list of the sites this build ships.
 *
 * That distinction is what lets a bookmaker be added or dropped without the
 * stored data going quiet: rows written by a version that still had a site are
 * still counted, and a freshly added site costs nothing until it is used. The
 * pre-v5 bookmaker is included because its rows predate the registry.
 */
const seenBookmakers = async (db: IDBPDatabase<BetAnalDB>): Promise<Bookmaker[]> => {
  const prefix = registryKey('');
  const registered = (await db.getAllKeys('meta'))
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));
  return [...new Set([LEGACY_BOOKMAKER, ...registered])];
};

/**
 * How many bets each bookmaker holds. One index count per site, no rows read, so
 * it stays cheap however long the history gets.
 */
export const getBetCounts = async (): Promise<Partial<Record<Bookmaker, number>>> => {
  const db = await openDb();
  const counts = await Promise.all(
    (await seenBookmakers(db)).map(
      async (b) => [b, await db.countFromIndex('bets', 'bookmaker', b)] as const,
    ),
  );
  return Object.fromEntries(counts.filter(([, n]) => n > 0));
};

/** The same count for payments and for bonuses, off their own bookmaker index. */
export const getRecordCounts = async (
  store: 'transactions' | 'bonuses',
): Promise<Partial<Record<Bookmaker, number>>> => {
  const db = await openDb();
  const counts = await Promise.all(
    (await seenBookmakers(db)).map(
      async (b) => [b, await db.countFromIndex(store, 'bookmaker', b)] as const,
    ),
  );
  return Object.fromEntries(counts.filter(([, n]) => n > 0));
};

/**
 * Whether this login has a single bet stored. Asked of a sync that was killed
 * mid-run, to tell "wrote nothing" from "wrote something and never said so".
 * Walks the bookmaker index and stops at the first row that matches, because
 * there is no index on the login itself - reading the whole store to answer a
 * yes/no cost the worker its entire bet history on every wake-up.
 */
export const hasBets = async (account: AccountRef): Promise<boolean> => {
  const db = await openDb();
  const index = db.transaction('bets').store.index('bookmaker');
  for await (const cursor of index.iterate(IDBKeyRange.only(account.bookmaker))) {
    if (cursor.value.accountId === account.accountId) return true;
  }
  return false;
};

/**
 * Oldest day anything is stored on, so the date pickers know where the data
 * starts without the dashboard having to hold all of it. One row off each index.
 */
export const getEarliestRecordDate = async (): Promise<string | null> => {
  const db = await openDb();
  const [bet, txn] = await Promise.all([
    db.transaction('bets').store.index('placedAt').openCursor(),
    db.transaction('transactions').store.index('occurredAt').openCursor(),
  ]);
  const dates = [bet?.value.placedAt, txn?.value.occurredAt].filter(
    (d): d is string => d !== undefined,
  );
  if (dates.length === 0) return null;
  return dates.reduce((a, b) => (Date.parse(a) <= Date.parse(b) ? a : b));
};

/**
 * ponytail: the account is filtered in memory after the bookmaker index rather
 * than through a compound index. One player's bets number in the thousands; add
 * the index when a read is actually slow.
 */
const ofAccount = <T extends { accountId: AccountId }>(rows: T[], account: AccountRef): T[] =>
  rows.filter((row) => row.accountId === account.accountId);

export const getPendingBets = async (account?: AccountRef): Promise<Bet[]> => {
  const db = await openDb();
  const rows = await db.getAllFromIndex('bets', 'status', 'pending');
  if (account === undefined) return rows;
  return ofAccount(
    rows.filter((b) => b.bookmaker === account.bookmaker),
    account,
  );
};

/**
 * Newest bet an account already has. Scoped per account: a shared cursor would
 * make a freshly connected login skip everything older than the busiest one.
 *
 * Walks the placedAt index newest-first and stops at the first row this account
 * owns, normally the very first step. Every timestamp is written by
 * `toISOString`, so the index's string order is the chronological one.
 */
export const getLatestPlacedAt = async (account: AccountRef): Promise<string | null> => {
  const db = await openDb();
  let cursor = await db.transaction('bets').store.index('placedAt').openCursor(null, 'prev');
  while (cursor !== null) {
    const bet = cursor.value;
    if (bet.bookmaker === account.bookmaker && bet.accountId === account.accountId) {
      return bet.placedAt;
    }
    cursor = await cursor.continue();
  }
  return null;
};

export const deleteBet = async (betId: string): Promise<void> => {
  const db = await openDb();
  await db.delete('bets', betId);
};

export const clearAllBets = async (): Promise<void> => {
  const db = await openDb();
  await db.clear('bets');
};

/**
 * Empties every store. `meta` goes too, so the next sync starts from scratch
 * rather than resuming from a cursor that points past bets no longer here.
 */
export const clearAll = async (): Promise<void> => {
  const db = await openDb();
  await Promise.all([
    db.clear('bets'),
    db.clear('transactions'),
    db.clear('bonuses'),
    db.clear('casinoRounds'),
    db.clear('meta'),
    db.clear('settings'),
  ]);
};

/**
 * Everything one account left behind. Its meta rows go too, so reconnecting
 * later reads the history from scratch instead of resuming from a dead cursor.
 */
export const clearAccount = async (account: AccountRef): Promise<void> => {
  const db = await openDb();
  const key = accountKey(account);
  const [bets, transactions, bonuses, rounds, metaKeys] = await Promise.all([
    db.getAllFromIndex('bets', 'bookmaker', account.bookmaker),
    db.getAllFromIndex('transactions', 'bookmaker', account.bookmaker),
    db.getAllFromIndex('bonuses', 'bookmaker', account.bookmaker),
    db.getAllFromIndex('casinoRounds', 'bookmaker', account.bookmaker),
    db.getAllKeys('meta'),
  ]);
  await Promise.all([
    ...ofAccount(bets, account).map((b) => db.delete('bets', b.betId)),
    ...ofAccount(transactions, account).map((t) => db.delete('transactions', t.id)),
    ...ofAccount(bonuses, account).map((b) => db.delete('bonuses', b.id)),
    ...ofAccount(rounds, account).map((r) => db.delete('casinoRounds', r.id)),
    ...metaKeys.filter((k) => k.endsWith(`:${key}`)).map((k) => db.delete('meta', k)),
  ]);

  const known = await getKnownAccounts(account.bookmaker);
  await db.put('meta', {
    key: registryKey(account.bookmaker),
    value: known.filter((a) => a.accountId !== account.accountId),
  });

  const settings = await getSettings();
  const accountNames = { ...settings.accountNames };
  delete accountNames[key];
  await setSettings({
    ...settings,
    hiddenAccounts: settings.hiddenAccounts.filter((a) => a !== key),
    accountNames,
  });
};

/** One login the extension has actually seen, with when it was seen. */
export interface KnownAccount {
  bookmaker: Bookmaker;
  accountId: AccountId;
  firstSeenAt: string;
  lastSeenAt: string;
}

export const getKnownAccounts = async (bookmaker?: Bookmaker): Promise<KnownAccount[]> => {
  const db = await openDb();
  const read = async (b: Bookmaker): Promise<KnownAccount[]> => {
    const row = await db.get('meta', registryKey(b));
    return Array.isArray(row?.value) ? (row.value as KnownAccount[]) : [];
  };
  if (bookmaker !== undefined) return read(bookmaker);
  return (await Promise.all((await seenBookmakers(db)).map(read))).flat();
};

/**
 * Records that this login exists and was just seen. Called on every credential
 * capture, which is what makes a second account appear without the user adding
 * anything by hand.
 */
export const registerAccount = async (account: AccountRef): Promise<void> => {
  const db = await openDb();
  const known = await getKnownAccounts(account.bookmaker);
  const now = new Date().toISOString();
  const existing = known.find((a) => a.accountId === account.accountId);
  const next: KnownAccount[] = existing
    ? known.map((a) => (a.accountId === account.accountId ? { ...a, lastSeenAt: now } : a))
    : [...known, { ...account, firstSeenAt: now, lastSeenAt: now }];
  await db.put('meta', { key: registryKey(account.bookmaker), value: next });
};

/**
 * Hands rows stored before identities were read to the first login seen at that
 * bookmaker. Those rows can only have come from whoever was connected then, and
 * that is the account signing in now. A no-op once anything has claimed them.
 */
/** Meta rows carry their own account, so a renamed key has to rename the value. */
const reAccount = (value: unknown, accountId: AccountId): unknown => {
  if (Array.isArray(value)) return value.map((item) => reAccount(item, accountId));
  if (value === null || typeof value !== 'object' || !('accountId' in value)) return value;
  return { ...value, accountId };
};

export const claimUnclaimed = async (account: AccountRef): Promise<void> => {
  if (account.accountId === UNCLAIMED) return;
  const db = await openDb();
  const orphan: AccountRef = { bookmaker: account.bookmaker, accountId: UNCLAIMED };

  const tx = db.transaction(['bets', 'transactions', 'bonuses', 'casinoRounds'], 'readwrite');
  for (const name of ['bets', 'transactions', 'bonuses', 'casinoRounds'] as const) {
    const store = tx.objectStore(name);
    for (const row of ofAccount(await store.index('bookmaker').getAll(account.bookmaker), orphan)) {
      await store.put({ ...row, accountId: account.accountId });
    }
  }
  await tx.done;

  const from = accountKey(orphan);
  const to = accountKey(account);
  for (const base of META_BASES) {
    const row = await db.get('meta', `${base}:${from}`);
    if (row === undefined) continue;
    if ((await db.get('meta', `${base}:${to}`)) === undefined) {
      await db.put('meta', {
        key: `${base}:${to}`,
        value: reAccount(row.value, account.accountId),
      });
    }
    await db.delete('meta', `${base}:${from}`);
  }

  const settings = await getSettings();
  const { [from]: orphanName, ...rest } = settings.accountNames;
  await setSettings({
    ...settings,
    hiddenAccounts: settings.hiddenAccounts.map((a) => (a === from ? to : a)),
    accountNames: orphanName === undefined ? rest : { ...rest, [to]: rest[to] ?? orphanName },
  });
};

/** Deposits/withdrawals imported from the bookmaker, newest first. */
export const getAllTransactions = async (): Promise<Transaction[]> => {
  const db = await openDb();
  const rows = await db.getAll('transactions');
  return rows.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
};

/** True when the row was not stored yet, which is what lets a walk stop early. */
export const putTransaction = async (txn: Transaction): Promise<boolean> => {
  const db = await openDb();
  const tx = db.transaction('transactions', 'readwrite');
  const fresh = (await tx.store.getKey(txn.id)) === undefined;
  await tx.store.put(txn);
  await tx.done;
  return fresh;
};

/** Casino rounds, newest first. Only sites that record rounds ever write here. */
export const getAllCasinoRounds = async (): Promise<CasinoRound[]> => {
  const db = await openDb();
  const rows = await db.getAll('casinoRounds');
  return rows.sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt));
};

/** How many of these rounds were not stored yet; see `putTransaction`. */
export const putCasinoRounds = async (rounds: readonly CasinoRound[]): Promise<number> => {
  if (rounds.length === 0) return 0;
  const db = await openDb();
  const tx = db.transaction('casinoRounds', 'readwrite');
  let fresh = 0;
  for (const round of rounds) {
    if ((await tx.store.getKey(round.id)) === undefined) fresh += 1;
    await tx.store.put(round);
  }
  await tx.done;
  return fresh;
};

export const deleteTransaction = async (id: string): Promise<void> => {
  const db = await openDb();
  await db.delete('transactions', id);
};

/** Bonuses granted by the bookmaker, newest grant first. */
export const getAllBonuses = async (): Promise<Bonus[]> => {
  const db = await openDb();
  const rows = await db.getAll('bonuses');
  return rows.sort((a, b) => Date.parse(b.grantedAt) - Date.parse(a.grantedAt));
};

/** True when the grant was not stored yet; see `putTransaction`. */
export const putBonus = async (bonus: Bonus): Promise<boolean> => {
  const db = await openDb();
  const tx = db.transaction('bonuses', 'readwrite');
  const fresh = (await tx.store.getKey(bonus.id)) === undefined;
  await tx.store.put(bonus);
  await tx.done;
  return fresh;
};

/**
 * Standing rewards as they were at the last sync. A snapshot for the same reason
 * offers are one: the bookmaker only ever reports what is true now.
 */
export const getPerks = async (account: AccountRef): Promise<AccountPerks | null> => {
  const db = await openDb();
  const row = await db.get('meta', metaKey('perks', account));
  return typeof row?.value === 'object' && row.value !== null ? (row.value as AccountPerks) : null;
};

export const setPerks = async (account: AccountRef, perks: AccountPerks): Promise<void> => {
  const db = await openDb();
  await db.put('meta', { key: metaKey('perks', account), value: perks });
};

export const getSettings = async (): Promise<AppSettings> => {
  const db = await openDb();
  const row = await db.get('settings', 'app');
  if (row && typeof row.value === 'object' && row.value !== null) {
    const stored = { ...DEFAULT_SETTINGS, ...(row.value as Partial<AppSettings>) };
    // A threshold this build no longer offers would leave the settings page
    // showing one figure while the tables sort by another.
    return MIN_PICKS_CHOICES.includes(stored.minPicks)
      ? stored
      : { ...stored, minPicks: DEFAULT_SETTINGS.minPicks };
  }
  return DEFAULT_SETTINGS;
};

export const setSettings = async (settings: AppSettings): Promise<void> => {
  const db = await openDb();
  await db.put('settings', { key: 'app', value: settings });
};

export const getSyncMeta = async (account: AccountRef): Promise<SyncMeta> => {
  const db = await openDb();
  const row = await db.get('meta', metaKey('sync', account));
  if (row && typeof row.value === 'object' && row.value !== null) {
    return row.value as SyncMeta;
  }
  return { lastSyncAt: null, lastStatus: 'logged_out', lastError: null };
};

export const setSyncMeta = async (account: AccountRef, meta: SyncMeta): Promise<void> => {
  const db = await openDb();
  await db.put('meta', { key: metaKey('sync', account), value: meta });
};

/**
 * Backward-pagination progress for the historical backfill. Kept separate from
 * SyncMeta so status updates (which rewrite SyncMeta wholesale) never clobber
 * it. `oldestFetchedAt` is the cursor the backfill resumes from; once the end
 * of history is reached `historyComplete` flips true and backfill is skipped.
 */
export interface BackfillState {
  oldestFetchedAt: string | null;
  historyComplete: boolean;
  /**
   * How far into an offset-paged history the walk has already read. Sites that
   * page by timestamp resume from `oldestFetchedAt` and leave this at 0; ones
   * that page by position have nothing else to resume from, and without it a
   * worker stopped mid-walk started again at the first page every time - on a
   * long history that meant it never reached the end at all.
   */
  betOffset: number;
  /**
   * Deposits/withdrawals have been walked all the way back once. Lives here, in
   * the same record the account's data is cleared with, so disconnecting an
   * account or wiping the database really does mean the next sync re-reads the
   * full money history instead of only the recent window.
   */
  moneyComplete: boolean;
  /**
   * An open bet has been read off the site at least once. A bet settles, and
   * with it the only evidence that the site's open-bet endpoint works at all -
   * so the fact is kept rather than re-derived from what is stored today.
   */
  openBetsSeen: boolean;
}

const DEFAULT_BACKFILL: BackfillState = {
  oldestFetchedAt: null,
  historyComplete: false,
  betOffset: 0,
  moneyComplete: false,
  openBetsSeen: false,
};

export const getBackfillState = async (account: AccountRef): Promise<BackfillState> => {
  const db = await openDb();
  const row = await db.get('meta', metaKey('backfill', account));
  if (row && typeof row.value === 'object' && row.value !== null) {
    return { ...DEFAULT_BACKFILL, ...(row.value as Partial<BackfillState>) };
  }
  return DEFAULT_BACKFILL;
};

/** Merges, so the bet walk and the money walk cannot overwrite each other's flag. */
export const setBackfillState = async (
  account: AccountRef,
  state: Partial<BackfillState>,
): Promise<void> => {
  const db = await openDb();
  const current = await getBackfillState(account);
  await db.put('meta', { key: metaKey('backfill', account), value: { ...current, ...state } });
};

export const getBalance = async (account: AccountRef): Promise<BalanceInfo | null> => {
  const db = await openDb();
  const row = await db.get('meta', metaKey('balance', account));
  if (row && typeof row.value === 'object' && row.value !== null) {
    return row.value as BalanceInfo;
  }
  return null;
};

export const setBalance = async (account: AccountRef, balance: BalanceInfo): Promise<void> => {
  const db = await openDb();
  await db.put('meta', { key: metaKey('balance', account), value: balance });
};

/**
 * Append-only log of balance readings, kept as a reality check against the
 * balance implied by imported transactions and bet results. Consecutive no-op
 * repeats are dropped and the log is capped to stay compact.
 */
const BALANCE_HISTORY_CAP = 2000;

export const appendBalanceSnapshot = async (
  account: AccountRef,
  snapshot: BalanceInfo,
): Promise<void> => {
  const db = await openDb();
  const key = metaKey('balanceHistory', account);
  const row = await db.get('meta', key);
  const list: BalanceInfo[] = Array.isArray(row?.value) ? (row.value as BalanceInfo[]) : [];
  const last = list[list.length - 1];
  // Turnover counts as movement in its own right: a casino round that gave back
  // what it took leaves the balance where it was, and dropping that reading
  // would hide the play rather than the repeat.
  if (
    last &&
    last.amount === snapshot.amount &&
    last.currency === snapshot.currency &&
    last.wagered?.casino === snapshot.wagered?.casino &&
    last.wagered?.sports === snapshot.wagered?.sports
  )
    return;
  list.push(snapshot);
  if (list.length > BALANCE_HISTORY_CAP) list.splice(0, list.length - BALANCE_HISTORY_CAP);
  await db.put('meta', { key, value: list });
};

export const getBalanceHistory = async (account: AccountRef): Promise<BalanceInfo[]> => {
  const db = await openDb();
  const row = await db.get('meta', metaKey('balanceHistory', account));
  return Array.isArray(row?.value) ? (row.value as BalanceInfo[]) : [];
};

/**
 * Whole-dashboard reads. They walk the registry rather than the bookmaker list,
 * so a second login at one site is read as its own account. Each record carries
 * its own account, so callers that want one filter rather than ask separately.
 */
/**
 * The balance is the one record read off the page rather than fetched with a
 * session, so it can be written before the login is named. It is therefore taken
 * from the stored keys, not the registry: a reading nobody has claimed yet is
 * still this browser's balance, and claimUnclaimed renames it soon enough.
 */
export const getAllBalances = async (): Promise<BalanceInfo[]> => {
  const db = await openDb();
  const keys = (await db.getAllKeys('meta')).filter((key) => key.startsWith('balance:'));
  const rows = await Promise.all(keys.map((key) => db.get('meta', key)));
  const all = rows.flatMap((row) =>
    row !== undefined && typeof row.value === 'object' && row.value !== null
      ? [row.value as BalanceInfo]
      : [],
  );
  // Once a login at the site has been named, an unclaimed reading is the same
  // money read a second time, not a second account. Listing both put a phantom
  // bookmaker row on the dashboard until the next claim tidied it away.
  return all.filter(
    (b) =>
      b.accountId !== UNCLAIMED ||
      !all.some((other) => other.bookmaker === b.bookmaker && other.accountId !== UNCLAIMED),
  );
};

export const getAllBalanceHistory = async (): Promise<BalanceInfo[]> =>
  (await Promise.all((await getKnownAccounts()).map(getBalanceHistory))).flat();

export const getAllPerks = async (): Promise<AccountPerks[]> =>
  (await Promise.all((await getKnownAccounts()).map(getPerks))).flatMap((p) =>
    p === null ? [] : [p],
  );

export const getAllSyncMeta = async (): Promise<{ account: AccountRef; meta: SyncMeta }[]> =>
  Promise.all(
    (await getKnownAccounts()).map(async (account) => ({
      account: { bookmaker: account.bookmaker, accountId: account.accountId },
      meta: await getSyncMeta(account),
    })),
  );

/** Bookmakers that have had an open bet read off them at least once. */
export const getOpenBetsSeen = async (): Promise<Bookmaker[]> => {
  const seen = await Promise.all(
    (await getKnownAccounts()).map(async (account) =>
      (await getBackfillState(account)).openBetsSeen ? account.bookmaker : null,
    ),
  );
  return [...new Set(seen.filter((b): b is Bookmaker => b !== null))];
};

/** Accounts whose bet history is stored back to its very first bet. */
export const getCompleteHistories = async (): Promise<string[]> => {
  const states = await Promise.all(
    (await getKnownAccounts()).map(async (account) => ({
      key: accountKey(account),
      complete: (await getBackfillState(account)).historyComplete,
    })),
  );
  return states.filter((s) => s.complete).map((s) => s.key);
};

/**
 * Daily FX rates, shared by every account: the rate on a date is a property of
 * the world, not of the bookmaker that happened to need it.
 */
export const getRates = async (): Promise<RateTable> => {
  const db = await openDb();
  const row = await db.get('meta', 'rates');
  return row && typeof row.value === 'object' && row.value !== null ? (row.value as RateTable) : {};
};

export const setRates = async (rates: RateTable): Promise<void> => {
  const db = await openDb();
  await db.put('meta', { key: 'rates', value: rates });
};

export interface ExportBundle {
  version: number;
  exportedAt: string;
  bets: Bet[];
  settings: AppSettings;
  transactions: Transaction[];
  bonuses: Bonus[];
  casinoRounds: CasinoRound[];
}

export const exportAll = async (): Promise<ExportBundle> => ({
  version: DB_VERSION,
  exportedAt: new Date().toISOString(),
  bets: await getAllBets(),
  settings: await getSettings(),
  transactions: await getAllTransactions(),
  bonuses: await getAllBonuses(),
  casinoRounds: await getAllCasinoRounds(),
});

// A backup only goes one way. Reading a file back in would let a hand-edited
// bundle stand where a bookmaker's own records should, and every figure the app
// prints would become a claim rather than something that was read off the site.
