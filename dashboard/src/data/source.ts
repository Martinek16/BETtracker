import {
  accountKey,
  clearAccount,
  clearAll,
  convertBets,
  deleteTransaction,
  getKnownAccounts as storedAccounts,
  exportAll,
  countBets,
  getAllBets,
  getBetCounts,
  getBetsInRange,
  getEarliestRecordDate,
  getPendingBets,
  getAllBonuses,
  getAllTransactions,
  getAllBalances,
  getAllBalanceHistory,
  getAllPerks,
  getAllSyncMeta as storedSyncMeta,
  getOpenBetsSeen,
  getRates,
  getSettings,
  log,
  type AccountRef,
  setSettings,
  type AccountPerks,
  type AppSettings,
  type BalanceInfo,
  type Bet,
  type Bonus,
  type Bookmaker,
  type ExportBundle,
  type KnownAccount,
  type LiveScore,
  type SyncMeta,
  type Transaction,
} from '@betanal/shared';
import devBets from '@betanal/shared/fixtures/bets';
import {
  demoAllBets,
  demoBalances,
  demoBets,
  demoBonuses,
  demoKnownAccounts,
  demoPerks,
  demoSyncMeta,
  demoTransactions,
  isDemoData,
} from '@/data/demo-data';

/** True when running as the packaged extension page (vs. Vite dev server). */
export const isExtension = (): boolean =>
  typeof chrome !== 'undefined' &&
  typeof chrome.runtime !== 'undefined' &&
  Boolean(chrome.runtime?.id);

/**
 * Bets the dashboard needs for a window `[from, to)`: the ones filed inside it,
 * plus every open slip whatever its date, because those are pinned above the
 * period rather than being part of it.
 *
 * Reading a window instead of the whole store is what keeps a history of years
 * off the heap; only the All period still asks for everything.
 *
 * Outside the extension it falls back to the bundled dev fixture, unwindowed, so
 * the dashboard stays runnable standalone.
 */
export const loadBets = async (from: string | null, to: string | null): Promise<Bet[]> => {
  if (isDemoData()) return demoBets(from, to);
  if (!isExtension()) return devBets as unknown as Bet[];
  try {
    const [inRange, pending] = await Promise.all([getBetsInRange(from, to), getPendingBets()]);
    const seen = new Set(inRange.map((bet) => bet.betId));
    return [...inRange, ...pending.filter((bet) => !seen.has(bet.betId))];
  } catch (err) {
    log('warn', 'dashboard', `failed to read bets: ${(err as Error).message}`);
    return [];
  }
};

/**
 * Every stored bet, however far back. Only the account pages ask for this — they
 * report on a login's whole life, which no window can answer — and it is the one
 * read left whose cost grows with the history.
 */
export const loadAllBets = async (): Promise<Bet[]> => {
  if (isDemoData()) return demoAllBets();
  if (!isExtension()) return devBets as unknown as Bet[];
  try {
    return await getAllBets();
  } catch (err) {
    log('warn', 'dashboard', `failed to read bets: ${(err as Error).message}`);
    return [];
  }
};

/**
 * The figures about the stored history that the dashboard states without
 * showing: how much there is, where it starts, and which sites it came from.
 * Counted in the database so a windowed load cannot make them shrink.
 */
export const loadBetSummary = async (): Promise<{
  count: number;
  earliest: string | null;
  bookmakers: Bookmaker[];
}> => {
  if (isDemoData()) {
    const all = demoAllBets();
    return {
      count: all.length,
      earliest: all[0]?.placedAt ?? null,
      bookmakers: [...new Set(all.map((bet) => bet.bookmaker))],
    };
  }
  if (!isExtension()) return { count: 0, earliest: null, bookmakers: [] };
  try {
    const [count, earliest, counts] = await Promise.all([
      countBets(),
      getEarliestRecordDate(),
      getBetCounts(),
    ]);
    return { count, earliest, bookmakers: Object.keys(counts) as Bookmaker[] };
  } catch (err) {
    log('warn', 'dashboard', `failed to summarise bets: ${(err as Error).message}`);
    return { count: 0, earliest: null, bookmakers: [] };
  }
};

export const requestResync = (mode: 'incremental' | 'full'): void => {
  if (isExtension()) {
    void chrome.runtime.sendMessage({ type: 'SYNC_NOW', mode });
  }
};

/**
 * Drop the extension's memory of a site once the last login at it is deleted, so
 * the next sign-in is asked about again instead of resuming on an answer given
 * about data that is gone.
 */
export const forgetSite = (bookmaker: Bookmaker): void => {
  if (isExtension()) {
    void chrome.runtime.sendMessage({ type: 'FORGET_SITE', bookmaker });
  }
};

/**
 * Ask for a quote of the display currency on every day a record was stored on.
 * Until one exists the record has no price in that currency and is left out of
 * every total, so this runs whenever the setting changes.
 */
export const requestRateSync = (): void => {
  if (isExtension()) {
    void chrome.runtime.sendMessage({ type: 'SYNC_RATES' });
  }
};

/** Mirrors `OpenBetsSnapshot` in the extension; the dashboard does not import from there. */
export interface ActiveBetsSnapshot {
  bets: Bet[];
  error: string | null;
  stale: boolean;
  /** In-play counts the bookmaker served with the bets, keyed by event id. */
  scores: Record<string, LiveScore[]>;
}

/**
 * The worker hands back bets exactly as the bookmaker denominated them — a
 * Stake slip in LTC, another in BTC. Everything the dashboard has already read
 * from the database went through the same conversion in the context, so
 * without this one the panel would list a freshly fetched slip in coins beside
 * a stored one in euros. Accounts switched off are dropped here too, for the
 * same reason: this is the other way records reach the screen.
 */
const inDisplayCurrency = async (bets: readonly Bet[]): Promise<Bet[]> => {
  const [rates, settings] = await Promise.all([getRates(), getSettings()]);
  const shown = bets.filter((bet) => !settings.hiddenAccounts.includes(accountKey(bet)));
  return convertBets(shown, rates, settings.currency).converted;
};

/**
 * Ask the background worker to re-fetch the open bets. null outside the
 * extension, and also when the worker is mid-restart and answers with nothing.
 */
export const refreshOpenBets = async (): Promise<ActiveBetsSnapshot | null> => {
  if (!isExtension()) return null;
  try {
    const res: unknown = await chrome.runtime.sendMessage({ type: 'REFRESH_OPEN' });
    const snapshot = (res as { snapshot?: unknown } | null)?.snapshot;
    if (typeof snapshot !== 'object' || snapshot === null) return null;
    const { bets, error, stale, scores } = snapshot as ActiveBetsSnapshot;
    if (!Array.isArray(bets)) return null;
    return {
      bets: await inDisplayCurrency(bets),
      error: typeof error === 'string' ? error : null,
      stale: stale === true,
      scores: typeof scores === 'object' && scores !== null ? scores : {},
    };
  } catch (err) {
    log('warn', 'dashboard', `open-bets refresh failed: ${(err as Error).message}`);
    return null;
  }
};

/**
 * Live balance per connected account, only available inside the extension
 * (scraped from the page). Not summed here: accounts can be in different
 * currencies, and only the dashboard context knows the conversion rates.
 */
export const loadBalances = async (): Promise<BalanceInfo[]> => {
  if (isDemoData()) return demoBalances();
  if (!isExtension()) return [];
  try {
    return await getAllBalances();
  } catch (err) {
    log('warn', 'dashboard', `failed to read balance: ${(err as Error).message}`);
    return [];
  }
};

/**
 * Deposits/withdrawals, imported from bet-at-home by the extension. Stored in
 * IndexedDB, which is available both in the packaged extension and the dev
 * server, so this works in either.
 */
export const loadTransactions = async (): Promise<Transaction[]> => {
  if (isDemoData()) return demoTransactions();
  try {
    return await withoutDuplicates(await getAllTransactions());
  } catch (err) {
    log('warn', 'dashboard', `failed to read transactions: ${(err as Error).message}`);
    return [];
  }
};

/** Id prefix each bookmaker import writes. Anything else predates the imports. */
const IMPORTED_PREFIXES = ['bah-', 'stake-'];

/**
 * Drops rows the import can never overwrite, and deletes them for good.
 *
 * Two earlier features wrote transactions of their own — a manual entry form and
 * a flow that guessed movements from balance jumps — and an earlier import keyed
 * rows on a number too large to survive JSON, so the same movement could land
 * twice under ids differing in their last digits. All of it duplicates what the
 * account API now returns, which is the only source left.
 */
const withoutDuplicates = async (rows: readonly Transaction[]): Promise<Transaction[]> => {
  const kept = new Map<string, Transaction>();
  const stale: string[] = [];
  for (const t of rows) {
    if (!IMPORTED_PREFIXES.some((p) => t.id.startsWith(p))) {
      stale.push(t.id);
      continue;
    }
    const movement = `${t.bookmaker}|${t.kind}|${t.amount}|${t.currency}|${t.occurredAt}`;
    if (kept.has(movement)) stale.push(t.id);
    else kept.set(movement, t);
  }
  for (const id of stale) await deleteTransaction(id);
  return [...kept.values()];
};

/**
 * COMBI+ is granted automatically on every larger bet builder, so it floods the
 * history with rows that say nothing about what was actually claimed.
 */
const NOISE_BONUS_NAMES = new Set(['COMBI+']);

/** Bonus grants, newest first. Never mixed into transactions — see `Bonus`. */
export const loadBonuses = async (): Promise<Bonus[]> => {
  if (isDemoData()) return demoBonuses();
  try {
    return (await getAllBonuses()).filter((b) => !NOISE_BONUS_NAMES.has(b.name));
  } catch (err) {
    log('warn', 'dashboard', `failed to read bonuses: ${(err as Error).message}`);
    return [];
  }
};

/**
 * Standing rewards as of the last sync. A snapshot with no history behind it, so
 * an empty list means nothing has been read yet, never that there is nothing.
 */
export const loadPerks = async (): Promise<AccountPerks[]> => {
  if (isDemoData()) return demoPerks();
  try {
    return await getAllPerks();
  } catch (err) {
    log('warn', 'dashboard', `failed to read perks: ${(err as Error).message}`);
    return [];
  }
};

/** Balance readings scraped from the bookmaker, used as a reality check. */
export const loadBalanceHistory = async (): Promise<BalanceInfo[]> => {
  try {
    return await getAllBalanceHistory();
  } catch (err) {
    log('warn', 'dashboard', `failed to read balance history: ${(err as Error).message}`);
    return [];
  }
};

/** Logins the extension has seen. The demo history needs two to have come from. */
export const getKnownAccounts = async (bookmaker?: Bookmaker): Promise<KnownAccount[]> =>
  isDemoData()
    ? demoKnownAccounts().filter((a) => bookmaker === undefined || a.bookmaker === bookmaker)
    : storedAccounts(bookmaker);

/** Sync state per login. In demo both accounts read as just synced. */
export const getAllSyncMeta = async (): Promise<
  readonly { account: AccountRef; meta: SyncMeta }[]
> => (isDemoData() ? demoSyncMeta() : storedSyncMeta());

/**
 * Bookmakers that have shown an open bet at least once. Read separately from the
 * bets because the evidence itself does not survive: the slip settles, and a site
 * whose open-bet endpoint works looks identical to one where it was never tried.
 */
export const loadOpenBetsSeen = async (): Promise<Bookmaker[]> => {
  if (!isExtension()) return [];
  try {
    return await getOpenBetsSeen();
  } catch (err) {
    log('warn', 'dashboard', `failed to read open-bet history: ${(err as Error).message}`);
    return [];
  }
};

export {
  clearAccount,
  getBetCounts,
  getSettings,
  setSettings,
  getRates,
  exportAll,
  clearAll,
};
export type {
  AccountPerks,
  AppSettings,
  BalanceInfo,
  Bet,
  Bonus,
  Bookmaker,
  ExportBundle,
  SyncMeta,
  Transaction,
};
