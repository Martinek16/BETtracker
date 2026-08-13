/**
 * The live sessions, one per login rather than one per bookmaker.
 *
 * A browser can be signed in to two accounts at the same site at the same time,
 * because a cookie jar belongs to an origin: stake.com and stake.bet are one
 * bookmaker and two logins. Holding a single session per bookmaker meant the
 * second one overwrote the first, and — worse — a run could pair one login's
 * session with the other login's identity and write its bets against the wrong
 * account. Keyed by the origin the session was captured on, neither can touch
 * the other.
 *
 * The origin is also what a request has to be made from for sites whose session
 * is a cookie, so it is worth keeping for its own sake.
 */

import type { AccountId, AccountRef, Bookmaker } from '@betanal/shared';
import type { BankingCredentials, Credentials } from '../bookmakers/types';

export interface Connection {
  key: string;
  bookmaker: Bookmaker;
  /** The page origin this session was captured on — the mirror the user is on. */
  origin: string;
  creds: Credentials;
  /** The second session some sites need for deposits and withdrawals. */
  banking: BankingCredentials | null;
  /** null until the site has said which login the session belongs to. */
  accountId: AccountId | null;
}

const keyOf = (bookmaker: Bookmaker, origin: string): string => `${bookmaker}|${origin}`;

/** What the worker holds. Mirrored into session storage, never onto disk. */
let all: Record<string, Connection> = {};

const persist = (): void => {
  void chrome.storage.session.set({ connections: all });
};

export const restoreConnections = async (): Promise<void> => {
  const stored = await chrome.storage.session.get('connections');
  const value: unknown = stored.connections;
  if (value !== null && typeof value === 'object') all = value as Record<string, Connection>;
};

export const allConnections = (): Connection[] => Object.values(all);

export const connectionsOf = (bookmaker: Bookmaker): Connection[] =>
  Object.values(all).filter((c) => c.bookmaker === bookmaker);

export const connectionAt = (bookmaker: Bookmaker, origin: string): Connection | null =>
  all[keyOf(bookmaker, origin)] ?? null;

/**
 * The session to speak for a bookmaker when no origin narrows it down — the
 * alarm and the dashboard's own polling ask about a site, not about a tab. The
 * identified one wins: an unresolved session can write nothing anyway.
 */
export const anyConnectionOf = (bookmaker: Bookmaker): Connection | null => {
  const mine = connectionsOf(bookmaker);
  return mine.find((c) => c.accountId !== null) ?? mine[0] ?? null;
};

/** Records the session, answering whether this is a login we had nothing for. */
export const putCredentials = (
  bookmaker: Bookmaker,
  origin: string,
  creds: Credentials,
): { connection: Connection; resumed: boolean } => {
  const key = keyOf(bookmaker, origin);
  const existing = all[key];
  const connection: Connection = {
    key,
    bookmaker,
    origin,
    creds,
    banking: existing?.banking ?? null,
    accountId: existing?.accountId ?? null,
  };
  all = { ...all, [key]: connection };
  persist();
  return { connection, resumed: existing === undefined };
};

export const putBanking = (
  bookmaker: Bookmaker,
  origin: string,
  banking: BankingCredentials,
): Connection | null => {
  const connection = all[keyOf(bookmaker, origin)];
  // Nothing to attach it to: the banking backend answered before the sportsbook
  // did, and the session it belongs to has not been seen yet. It arrives again
  // on the next account page the user opens.
  if (connection === undefined) return null;
  const next: Connection = { ...connection, banking };
  all = { ...all, [connection.key]: next };
  persist();
  return next;
};

export const setAccountId = (key: string, accountId: AccountId): Connection | null => {
  const connection = all[key];
  if (connection === undefined) return null;
  const next: Connection = { ...connection, accountId };
  all = { ...all, [key]: next };
  persist();
  return next;
};

/** The session died. The login stays known; only the token it was read with goes. */
export const dropConnection = (key: string): void => {
  if (all[key] === undefined) return;
  const rest = { ...all };
  delete rest[key];
  all = rest;
  persist();
};

export const dropBanking = (key: string): void => {
  const connection = all[key];
  if (connection === undefined || connection.banking === null) return;
  all = { ...all, [key]: { ...connection, banking: null } };
  persist();
};

/** Everything held for one site, dropped — see the background's `forgetSite`. */
export const dropBookmaker = (bookmaker: Bookmaker): void => {
  all = Object.fromEntries(Object.entries(all).filter(([, c]) => c.bookmaker !== bookmaker));
  persist();
};

export const accountOf = (connection: Connection): AccountRef | null =>
  connection.accountId === null
    ? null
    : { bookmaker: connection.bookmaker, accountId: connection.accountId };
