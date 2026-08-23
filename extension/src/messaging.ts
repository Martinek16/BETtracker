import type { CapturedFields } from './bookmakers/capture';
import type { BankingCredentials, Credentials } from './bookmakers/types';
import type {
  AccountId,
  BalanceInfo,
  Bet,
  Bookmaker,
  Connection,
  LiveScore,
  LogLevel,
  SyncMeta,
} from '@betanal/shared';

export { bookmakerForHost, bookmakerForRequests, sitePatternFor } from './bookmakers/capture';

/** Tag used on window.postMessage between the MAIN-world inject and content script. */
export const PAGE_BRIDGE_TAG = 'bettracker-bridge';

/** The bridge posts opaque fields; only the named bookmaker's adapter reads them. */
export interface PageBridgeMessage {
  tag: typeof PAGE_BRIDGE_TAG;
  bookmaker: Bookmaker;
  fields: CapturedFields;
}

/** Tag used for the separate account-API session captured for deposits/withdrawals. */
export const PAGE_BANKING_TAG = 'bettracker-banking';

export interface PageBankingMessage {
  tag: typeof PAGE_BANKING_TAG;
  bookmaker: Bookmaker;
  fields: CapturedFields;
}

/** Tag for response bodies captured from the page's own API calls. */
export const PAGE_DATA_TAG = 'bettracker-data';

export interface PageDataMessage {
  tag: typeof PAGE_DATA_TAG;
  /**
   * 'log' carries a line for the app's own log: the bridge runs in the page and
   * cannot reach our database, so what it has to say is relayed like any other
   * body it captures rather than printed into the bookmaker's console.
   */
  kind: 'open-bets' | 'log' | 'activity';
  payload: unknown;
}

/**
 * Tag on the messages the panel document sends out to the page frame that hosts
 * it. The panel is the popup shown in the page instead of in a browser window,
 * so it has to say how tall it wants to be and when it is done with itself.
 */
export const PANEL_MESSAGE = 'bettracker-panel';

export interface PanelMessage {
  tag: typeof PANEL_MESSAGE;
  height?: number;
  close?: true;
}

/** A request the background needs the page to make on its behalf. */
export interface PageFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/** `status` 0 means the request never got an answer; `body` then holds the reason. */
export interface PageFetchResult {
  status: number;
  body: string;
}

/** Messages the background sends into a page's content script. */
export type ToContent =
  | { type: 'SHOW_PANEL'; bookmaker: Bookmaker }
  | { type: 'PAGE_FETCH'; url: string; init: PageFetchInit };

export interface SyncProgress {
  page: number;
  totalNew: number;
  done: boolean;
  message: string;
  /** What `totalNew` counts, so a reader can tally it without parsing the prose. */
  kind?: 'bets' | 'transactions';
  /** Only on the last message of a run: whether every account finished cleanly. */
  ok?: boolean;
}

/** Balance scraped from the page, relayed content → background. */
export interface ScrapedBalance {
  amount: number;
  currency: string | null;
}

/** Answer to REFRESH_OPEN. */
export interface OpenBetsSnapshot {
  bets: Bet[];
  /** null on a fresh fetch; otherwise 'logged_out' | 'syncing' | an error message. */
  error: string | null;
  /** true when `bets` came from IndexedDB rather than the network. */
  stale: boolean;
  /**
   * In-play counts the bookmaker served with the open bets, keyed by event id.
   * Empty for sites whose scores arrive over a feed the dashboard opens itself.
   */
  scores: Record<string, LiveScore[]>;
}

/** Messages sent to the background service worker. */
export type ToBackground =
  | { type: 'CREDENTIALS'; credentials: Credentials }
  | { type: 'BANKING_CREDENTIALS'; banking: BankingCredentials }
  /**
   * What the site's own page shows about being signed in. Sent whenever the
   * answer changes, because a login form is replaced by an account menu without
   * the page ever reloading.
   */
  | { type: 'PAGE_LOGIN'; bookmaker: Bookmaker; signedOut: boolean }
  | { type: 'BALANCE'; bookmaker: Bookmaker; balance: ScrapedBalance }
  | { type: 'OPEN_BETS'; bookmaker: Bookmaker; payload: unknown }
  /**
   * The user placed, cashed out, deposited or withdrew on the page. Carries
   * nothing but the fact: it exists so the background re-reads that login now
   * rather than on the next alarm, at sites whose balance we cannot see.
   */
  | { type: 'ACTIVITY'; bookmaker: Bookmaker }
  /** A line for the app's log, from a context that cannot reach the database. */
  | { type: 'LOG'; level: LogLevel; scope: string; message: string }
  /**
   * A supported site was opened; the background decides whether to ask about it.
   * `origin` is the mirror the user actually reached the bookmaker on, which is
   * the only way to know it - the numbered mirrors rotate.
   */
  | { type: 'SITE_DETECTED'; bookmaker: Bookmaker; origin: string }
  | { type: 'SET_CONSENT'; bookmaker: Bookmaker; enabled: boolean }
  /**
   * The last login at this site was deleted, so the answer the user once gave
   * about it is deleted with it: the next sign-in asks again rather than picking
   * the site back up on a permission granted for data that no longer exists.
   */
  | { type: 'FORGET_SITE'; bookmaker: Bookmaker }
  /**
   * A mirror the manifest does not list, recognised from its own API calls and
   * granted by the user in the popup. The background starts watching that origin.
   */
  | { type: 'ENABLE_MIRROR'; bookmaker: Bookmaker; origin: string }
  /** Reload the bookmaker's tab so its next request carries the session. */
  | { type: 'RECONNECT'; bookmaker: Bookmaker }
  | { type: 'SYNC_NOW'; mode: 'incremental' | 'full' }
  /**
   * Quote the currency the totals are shown in. Sent when that setting changes:
   * the stored records were only ever priced against the previous one, so until
   * the new one has a rate on each of their days every record is left out.
   */
  | { type: 'SYNC_RATES' }
  | { type: 'REFRESH_OPEN' }
  | { type: 'GET_STATUS' };

/**
 * One supported bookmaker, as the popup needs to describe it: whether the user
 * has agreed to it, whether the site's session has been seen, and what has
 * actually been stored. Everything the popup says is derived from these - it
 * knows nothing about any particular bookmaker.
 */
export interface AccountStatus {
  bookmaker: Bookmaker;
  name: string;
  /** The login currently signed in here, or null while none has been identified. */
  accountId: AccountId | null;
  /** How many logins at this site the extension has ever seen. */
  knownAccounts: number;
  /** undefined = never answered, false = the user declined. */
  consent: boolean | undefined;
  /** True once the site's own authenticated call has been seen. */
  signedIn: boolean;
  /**
   * What the page itself last showed: true for a login form, false for an
   * account menu, null where it has said neither. A session not yet captured is
   * not the same as being signed out - the site's authenticated call is not made
   * on every one of its pages - so this is what the "sign in first" line is
   * allowed to rest on.
   */
  looksSignedOut: boolean | null;
  /** null until the extension has read this account at least once. */
  meta: SyncMeta | null;
  /**
   * The one line about how this account is doing, decided here rather than in
   * the popup: the settings page reads the very same states, and a popup that
   * worked them out for itself would drift out of step with it.
   */
  connection: Connection;
  bets: number;
  transactions: number;
}

/** Responses / broadcasts from the background service worker. */
export type FromBackground =
  | {
      type: 'STATUS';
      accounts: AccountStatus[];
      /** A newly-seen bookmaker awaiting the user's yes/no, or null. */
      pending: Bookmaker | null;
      /**
       * Whether a run is walking right now. A step can take minutes without a
       * word - the deposits walk is hundreds of sequential requests - so this is
       * how a watcher tells a slow run from one that died.
       */
      syncing: boolean;
    }
  /** Something a STATUS answer would report has changed; ask again. */
  | { type: 'STATUS_CHANGED' }
  | { type: 'BALANCE'; balance: BalanceInfo }
  | { type: 'OPEN_SNAPSHOT'; snapshot: OpenBetsSnapshot }
  | { type: 'SYNC_PROGRESS'; progress: SyncProgress };

export const isPageBridgeMessage = (data: unknown): data is PageBridgeMessage =>
  typeof data === 'object' && data !== null && (data as { tag?: unknown }).tag === PAGE_BRIDGE_TAG;

export const isPageBankingMessage = (data: unknown): data is PageBankingMessage =>
  typeof data === 'object' && data !== null && (data as { tag?: unknown }).tag === PAGE_BANKING_TAG;

export const isPageDataMessage = (data: unknown): data is PageDataMessage =>
  typeof data === 'object' && data !== null && (data as { tag?: unknown }).tag === PAGE_DATA_TAG;
