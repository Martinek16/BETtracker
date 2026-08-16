import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  accountKey,
  convertBets,
  convertBonuses,
  convertTransactions,
  type AccountRef,
  type Bet,
  type Bonus,
  type Bookmaker,
  type KnownAccount,
  type SyncMeta,
  type Transaction,
} from '@betanal/shared';
import {
  getAllSyncMeta,
  getKnownAccounts,
  getRates,
  getSettings,
  loadAllBets,
  loadBonuses,
  loadOpenBetsSeen,
  loadTransactions,
} from '@/data/source';
import { useSettings } from '@/data/use-settings';
import { CATALOG, type BookmakerMeta } from '@bookmakers/catalog';

/**
 * One bookmaker as the dashboard draws it, straight out of its own
 * `bookmaker.json`. Adding a bookmaker changes nothing in this file.
 */
export type AccountInfo = BookmakerMeta;

/** Every bookmaker the extension can read. One entry per adapter. */
export const ACCOUNTS: readonly AccountInfo[] = CATALOG;

/**
 * The bookmaker's mark with the background cut away. It is shipped from the
 * bookmaker's own folder — see the `bookmaker-logos` plugin in `vite.config.ts`
 * — so a new site brings its logo with it. Fetching each site's favicon instead
 * would drag its opaque plate along, and the sites are behind a proxy that does
 * not always answer.
 */
export const accountLogoUrl = (account: AccountInfo): string => `logos/${account.id}.png`;

export const findAccount = (id: string | undefined): AccountInfo | undefined =>
  ACCOUNTS.find((account) => account.id === id);

const originKey = (bookmaker: Bookmaker): string => `siteOrigin:${bookmaker}`;

/**
 * The address each bookmaker was last reached on, as the extension recorded it.
 * A numbered mirror is renumbered over time, so the one the browser actually
 * used is the only address worth putting on screen.
 */
export const useSiteOrigins = (): Record<string, string> => {
  const [origins, setOrigins] = useState<Record<string, string>>({});

  useEffect(() => {
    if (typeof chrome === 'undefined' || chrome.storage?.local === undefined) return;
    void chrome.storage.local
      .get(ACCOUNTS.map((account) => originKey(account.id)))
      .then((stored: Record<string, unknown>) =>
        setOrigins(
          Object.fromEntries(
            ACCOUNTS.flatMap((account) => {
              const origin = stored[originKey(account.id)];
              return typeof origin === 'string' ? [[account.id, origin]] : [];
            }),
          ),
        ),
      );
  }, []);

  return origins;
};

export interface SiteLink {
  /** What to write on screen: the mirror's host, without the scheme. */
  host: string;
  url: string;
}

/**
 * The mirror as the punter knows it. A bookmaker serves its sportsbook from a
 * subdomain of the mirror — `sports2.bah26.com` — and that is the host the
 * extension recorded, because that is where its pages are read from. Nobody
 * types it, and it lands on a section of the site rather than on the site.
 *
 * ponytail: last two labels, no public-suffix list. A bookmaker on a two-part
 * TLD (`bet-at-home.co.uk`) would need one.
 */
const registrableHost = (host: string): string => {
  const labels = host.split('.');
  return labels.length > 2 ? labels.slice(-2).join('.') : host;
};

/**
 * Where this bookmaker is actually reached, falling back to its own address.
 * `path` lands the reader on a section of the site rather than on the site.
 */
export const siteLinkOf = (
  account: AccountInfo,
  origins: Record<string, string>,
  path = '',
): SiteLink => {
  const origin = origins[account.id];
  const host = ((): string => {
    if (origin === undefined) return account.site;
    try {
      return registrableHost(new URL(origin).host);
    } catch {
      return account.site; // stored junk; the bookmaker's own address still works
    }
  })();
  return { host, url: `https://${host}${path}` };
};

/**
 * Sync state is owned by the background worker, so it is re-read whenever the
 * worker reports progress rather than kept in React state. One record per login,
 * keyed by account key — a site with two logins reports two of them.
 */
export const useSyncMetaByAccount = (): Record<string, SyncMeta> => {
  const [metas, setMetas] = useState<Record<string, SyncMeta>>({});
  const refresh = useCallback(() => {
    void getAllSyncMeta().then((all) =>
      setMetas(Object.fromEntries(all.map(({ account, meta }) => [accountKey(account), meta]))),
    );
  }, []);

  useEffect(() => {
    refresh();
    if (typeof chrome === 'undefined' || !chrome.runtime?.id) return;
    const onMessage = (message: { type?: string }): void => {
      if (message.type === 'SYNC_PROGRESS') refresh();
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [refresh]);

  return metas;
};

/**
 * Everything stored, ignoring which accounts are switched off — an account that
 * is hidden from the views must still report an honest count on its own card.
 */
const useStored = <T>(load: () => Promise<T>, initial: T): T => {
  const [rows, setRows] = useState<T>(initial);

  useEffect(() => {
    let active = true;
    const refresh = (): void => {
      void load().then((loaded) => {
        if (active) setRows(loaded);
      });
    };
    refresh();
    // A sync started when the page opened finishes a moment later; without this
    // the counts would sit at their pre-sync values until the user navigates.
    const onMessage = (message: { type?: string; progress?: { done?: boolean } }): void => {
      if (message.type === 'SYNC_PROGRESS' && message.progress?.done) refresh();
    };
    const live = typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);
    if (live) chrome.runtime.onMessage.addListener(onMessage);
    return () => {
      active = false;
      if (live) chrome.runtime.onMessage.removeListener(onMessage);
    };
  }, [load]);

  return rows;
};

const NO_ACCOUNTS: KnownAccount[] = [];

/**
 * Every login at every site — one entry per card on the accounts page. The
 * browser can only be signed in to one of them at a time, so the others are
 * shown from what they left behind rather than from a live session.
 */
export const useAllKnownAccounts = (): KnownAccount[] =>
  useStored(useCallback(() => getKnownAccounts(), []), NO_ACCOUNTS);

const NO_BOOKMAKERS: Bookmaker[] = [];

/** Bookmakers an open bet has ever been read from, however long ago. */
export const useOpenBetsSeen = (): Bookmaker[] =>
  useStored(useCallback(() => loadOpenBetsSeen(), []), NO_BOOKMAKERS);

export interface StoredRecords {
  bets: Bet[];
  transactions: Transaction[];
  bonuses: Bonus[];
  /** The currency every amount above has been converted into. */
  currency: string;
  /** Records left out of the totals because no rate covered their day. */
  unconvertible: number;
}

const NO_RECORDS: StoredRecords = {
  bets: [],
  transactions: [],
  bonuses: [],
  currency: 'EUR',
  unconvertible: 0,
};

/**
 * A wallet can hold a dozen coins at once, so adding raw amounts up would sum
 * bitcoin to dogecoin. Converting here, the same way the dashboard does, is what
 * lets an account card show one honest figure in the currency from Settings.
 */
const loadRecords = async (): Promise<StoredRecords> => {
  const [bets, transactions, bonuses, settings, rates] = await Promise.all([
    loadAllBets(),
    loadTransactions(),
    loadBonuses(),
    getSettings(),
    getRates(),
  ]);
  const currency = settings.currency;
  const convertedBets = convertBets(bets, rates, currency);
  const convertedTxs = convertTransactions(transactions, rates, currency);
  const convertedBonuses = convertBonuses(bonuses, rates, currency);
  return {
    bets: convertedBets.converted,
    transactions: convertedTxs.converted,
    bonuses: convertedBonuses.converted,
    currency,
    unconvertible:
      convertedBets.skipped.length +
      convertedTxs.skipped.length +
      convertedBonuses.skipped.length,
  };
};

export const useStoredRecords = (): StoredRecords => useStored(loadRecords, NO_RECORDS);

/**
 * The whole history, minus the logins that are switched off — what a view falls
 * back to when the chosen period holds too few bets to say anything. Read only
 * once `enabled` turns true: this is the one load whose cost grows with the
 * history, and most periods never need it.
 */
export const useVisibleHistory = (enabled: boolean): StoredRecords => {
  const { settings } = useSettings();
  const [records, setRecords] = useState<StoredRecords | null>(null);

  useEffect(() => {
    if (!enabled || records !== null) return;
    let active = true;
    void loadRecords().then((loaded) => {
      if (active) setRecords(loaded);
    });
    return () => {
      active = false;
    };
  }, [enabled, records]);

  const hiddenKey = (settings?.hiddenAccounts ?? []).join('|');
  return useMemo(() => {
    if (records === null) return NO_RECORDS;
    const hidden = new Set(hiddenKey === '' ? [] : hiddenKey.split('|'));
    const shown = <T extends AccountRef>(rows: readonly T[]): T[] =>
      rows.filter((row) => !hidden.has(accountKey(row)));
    return {
      ...records,
      bets: shown(records.bets),
      transactions: shown(records.transactions),
      bonuses: shown(records.bonuses),
    };
  }, [records, hiddenKey]);
};

interface AccountNames {
  /** The stored label, empty when the login has none of its own. */
  nameFor: (key: string) => string;
  /** Empty clears the label rather than storing a blank one. */
  setName: (key: string, name: string) => Promise<void>;
}

/**
 * A name of your own for one login ("Miha's Stake"). Two logins at the same site
 * are two separate cards, so the label belongs to the login, not to the site.
 */
export const useAccountNames = (): AccountNames => {
  const { settings, patch } = useSettings();
  const saved = settings?.accountNames ?? {};

  const setName = async (key: string, name: string): Promise<void> => {
    const next = { ...saved };
    if (name === '') delete next[key];
    else next[key] = name;
    await patch({ accountNames: next });
  };

  return { nameFor: (key) => saved[key] ?? '', setName };
};

interface AccountVisibility {
  isVisible: (key: string) => boolean;
  setVisible: (key: string, visible: boolean) => Promise<void>;
}

/**
 * Which logins feed the dashboard. Hiding one only filters the views — the bets
 * stay in the database and come back the moment it is switched on again.
 */
export const useAccountVisibility = (): AccountVisibility => {
  const { settings, patch } = useSettings();
  const hidden = settings?.hiddenAccounts ?? [];

  const setVisible = async (key: string, visible: boolean): Promise<void> => {
    await patch({
      hiddenAccounts: visible ? hidden.filter((k) => k !== key) : [...hidden, key],
    });
  };

  return { isVisible: (key) => !hidden.includes(key), setVisible };
};
