import type {
  AccountId,
  AccountRef,
  BalanceInfo,
  Bet,
  Bookmaker,
  LiveScore,
} from '@betanal/shared';
import type { CapturedFields } from './capture-rule';
import type { SyncProgress } from '../messaging';

/**
 * Credentials captured from the page's own authenticated calls.
 *
 * The fields are deliberately opaque: only the adapter that captured them knows
 * what they mean. That is what lets the content script, the messaging layer and
 * the background worker stay ignorant of any particular bookmaker — a new site
 * needs a capture rule and an adapter, and nothing else in the extension moves.
 */
export interface Credentials {
  bookmaker: Bookmaker;
  fields: CapturedFields;
}

/** A second session, for sites whose money history lives on another backend. */
export interface BankingCredentials {
  bookmaker: Bookmaker;
  fields: CapturedFields;
}

/** Reads a captured field, failing loudly rather than sending `undefined`. */
export const field = (creds: Credentials | BankingCredentials, name: string): string => {
  const value = creds.fields[name];
  if (value === undefined) throw new Error(`${creds.bookmaker}: missing captured field "${name}"`);
  return value;
};

export const siteOriginKey = (bookmaker: Bookmaker): string => `siteOrigin:${bookmaker}`;

/**
 * The mirror the user actually reaches a bookmaker on, recorded by the content
 * script. A site's own public endpoints are served only from the mirror it was
 * loaded from, and the numbered mirrors are renumbered over time, so hard-coding
 * one would quietly stop working.
 */
export const getSiteOrigin = async (bookmaker: Bookmaker, fallback: string): Promise<string> => {
  const key = siteOriginKey(bookmaker);
  const stored = await chrome.storage.local.get(key);
  return typeof stored[key] === 'string' ? stored[key] : fallback;
};

export type SyncMode = 'incremental' | 'full';

/** How far `syncMoney` walks the deposit and withdrawal history. */
export type MoneyDepth = 'bonuses' | 'recent' | 'full';

export interface SyncResult {
  added: number;
  pages: number;
  skipped: number;
}

export interface FetchPageOptions {
  /** ISO timestamp cursor — fetch bets placed strictly before this. */
  placedBefore: string;
  limit: number;
}

export interface SettledPage {
  bets: Bet[];
  /** Cursor for the next page (oldest placedAt seen), or null when exhausted. */
  nextCursor: string | null;
  /** Bets returned by the API that failed to parse and were skipped. */
  skipped: number;
}

export interface OpenBets {
  bets: Bet[];
  /**
   * In-play counts that came back with the same payload, keyed by event id.
   * Only for sites that carry them there; elsewhere the scores arrive over a
   * feed of their own and this stays absent.
   */
  scores?: Record<string, LiveScore[]>;
}

/**
 * Everything site-specific behind one interface. Adapters own their own paging:
 * one bookmaker walks a timestamp cursor, another counts offsets, and neither
 * shape belongs in the shared engine. Reusable pieces live in `sync/sync.ts`.
 */
export interface BookmakerAdapter {
  readonly id: Bookmaker;
  readonly name: string;
  /**
   * Which login these credentials belong to, read from the site itself. Called
   * before anything is written, so a second account is separated from the first
   * without the user telling the extension it exists.
   */
  accountId(creds: Credentials): Promise<AccountId>;
  /** Import settled and open bets. Throws SessionExpiredError on a dead token. */
  syncBets(
    creds: Credentials,
    account: AccountRef,
    mode: SyncMode,
    onProgress: (progress: SyncProgress) => void,
  ): Promise<SyncResult>;
  /** One fresh read of the currently open bets. */
  openBets(creds: Credentials, account: AccountRef): Promise<OpenBets>;
  /** Normalize an open-bets body the page fetched itself; `[]` where unused. */
  parseOpen(payload: unknown, account: AccountRef): Bet[];
  /**
   * Deposits, withdrawals and bonuses. `banking` is the separately-captured
   * session, null for sites that need none. Omitted where the site exposes no
   * money history.
   *
   * `depth` is how far the deposit/withdrawal walk goes: `full` for the whole
   * history, `recent` for the window that can still change, `bonuses` for
   * neither. Bonuses and offers are read at every depth — they are two requests
   * and they change while the balance stands still.
   */
  syncMoney?(
    creds: Credentials,
    banking: BankingCredentials | null,
    account: AccountRef,
    depth: MoneyDepth,
  ): Promise<number>;
  /** True when `syncMoney` cannot run without the second session. */
  readonly needsBankingSession?: boolean;
  /**
   * Balance read from the API, for sites where the page DOM doesn't show it.
   * `banking` is the same second session `syncMoney` gets: at some sites the
   * wallet lives on the account backend, not the sportsbook one.
   */
  balance?(
    creds: Credentials,
    account: AccountRef,
    banking: BankingCredentials | null,
  ): Promise<BalanceInfo | null>;
}
