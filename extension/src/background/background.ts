/**
 * Background service worker: owns IndexedDB, orchestrates syncs, drives the
 * toolbar badge, and answers status queries from the popup and dashboard.
 */

import {
  accountKey,
  activeBets,
  appendBalanceSnapshot,
  claimUnclaimed,
  connectionOf,
  dayOf,
  getAllSyncMeta,
  getBackfillState,
  getBetCounts,
  getKnownAccounts,
  getPendingBets,
  getRates,
  getRecordCounts,
  getSettings,
  getSyncMeta,
  hasBets,
  log,
  putBets,
  rateFor,
  registerAccount,
  setBalance,
  setSyncMeta,
  UNCLAIMED,
  type AccountId,
  type AccountRef,
  type BalanceInfo,
  type Bet,
  type Bookmaker,
  type LiveScore,
  type SyncMeta,
} from '@betanal/shared';
import { metaFor } from '../bookmakers/catalog';
import { adapterFor, adapters } from '../bookmakers/registry';
import { siteOriginKey } from '../bookmakers/types';
import type { BookmakerAdapter, Credentials, MoneyDepth } from '../bookmakers/types';
import {
  accountOf,
  allConnections,
  anyConnectionOf,
  connectionAt,
  connectionsOf,
  dropBanking,
  dropBookmaker,
  dropConnection,
  putBanking,
  putCredentials,
  restoreConnections,
  setAccountId,
  type Connection,
} from './connections';
import {
  disappearedBetIds,
  RateLimitedError,
  RelayUnavailableError,
  SessionExpiredError,
  syncOpenBets,
} from '../sync/sync';
import { syncRates } from '../sync/rates';
import { bookmakerForHost, sitePatternFor } from '../messaging';
import type {
  FromBackground,
  OpenBetsSnapshot,
  SyncProgress,
  ToBackground,
  ToContent,
} from '../messaging';

/**
 * How long a run keeps the next one from starting. A bookmaker's site is a
 * single-page app that rewrites its URL on every click, and each of those used
 * to be worth a run - half an evening on the site meant a sync every thirty
 * seconds, each one re-walking the money. The alarm covers the rest.
 */
const SYNC_DEBOUNCE_MS = 5 * 60_000;
/** Open ids from the previous poll. In session storage because the MV3 worker dies. */
const OPEN_IDS_KEY = 'openBetIds';

/** Keyed by account key - two logins at one site have independent statuses. */
let statuses: Record<string, SyncMeta['lastStatus']> = {};
/**
 * The user's yes/no per bookmaker. Undefined means "never asked" - nothing is
 * captured or stored for that site until it turns true, which is what makes a
 * newly-supported bookmaker opt-in rather than silently tracked.
 */
let consent: Partial<Record<Bookmaker, boolean>> = {};
/**
 * What a bookmaker is called, from its own `bookmaker.json` and nowhere else.
 * The adapter used to carry a name of its own, and a scaffolded folder is a copy
 * of an existing one: it answered to the example's name on the popup of a site
 * that had nothing to do with it.
 */
const nameOf = (bookmaker: Bookmaker): string => metaFor(bookmaker)?.name ?? bookmaker;

/** The site waiting for an answer, surfaced by the popup. */
let pending: Bookmaker | null = null;
/**
 * The session that raised the question, held in memory only until it is answered
 * - never written anywhere, and dropped on a no or when the worker sleeps. The
 * origin comes with it: the answer is taken up as a session at one mirror, not
 * as a session at the site in general.
 */
let awaiting: { bookmaker: Bookmaker; origin: string; creds: Credentials } | null = null;
let syncing = false;
/**
 * A sync asked for while one was already running, to be run straight after it.
 * `only` narrows it to one bookmaker; two requests for different sites merge
 * into one run over both rather than dropping either.
 */
let queued: { mode: 'incremental' | 'full'; only: Bookmaker | null } | null = null;
/**
 * When each session was last walked. Per login rather than one clock for the
 * site: the debounce exists to stop a site being re-read every time its own
 * single-page app changes its URL, and one account being busy is no reason to
 * leave a second account at the same bookmaker unread.
 *
 * In session storage because this worker is stopped whenever it goes quiet. Kept
 * only in memory, every wake-up started with an empty clock and re-read the site
 * on the very next route change the page made.
 */
let lastSyncAt: Record<string, number> = {};

const dueForSync = (connection: Connection): boolean =>
  Date.now() - (lastSyncAt[connection.key] ?? 0) > SYNC_DEBOUNCE_MS;

const markSynced = (connection: Connection): void => {
  lastSyncAt = { ...lastSyncAt, [connection.key]: Date.now() };
  void chrome.storage.session.set({ lastSyncAt });
};

/** Any session at this site that is worth re-reading right now. */
const dueConnections = (bookmaker: Bookmaker): Connection[] =>
  connectionsOf(bookmaker).filter(dueForSync);
/**
 * Bookmakers that asked to be left alone, and until when. A throttle answered at
 * poll speed is a throttle that never ends: every refusal costs a request, and
 * the request is what is being refused. Held in session storage because this
 * worker is stopped whenever it goes quiet, and a backoff that forgets itself
 * every thirty seconds is not a backoff.
 */
let cooldowns: Partial<Record<Bookmaker, { until: number; strikes: number }>> = {};

const cooling = (bookmaker: Bookmaker): boolean => Date.now() < (cooldowns[bookmaker]?.until ?? 0);

/**
 * Back off, doubling for a site that keeps refusing, so a bookmaker that is down
 * for the evening is asked twice an hour rather than twice a minute. Reset by
 * the first run that gets through.
 */
const startCooldown = (bookmaker: Bookmaker, baseMs: number, reason: string): void => {
  const strikes = Math.min((cooldowns[bookmaker]?.strikes ?? 0) + 1, 3);
  const wait = baseMs * 2 ** (strikes - 1);
  cooldowns = { ...cooldowns, [bookmaker]: { until: Date.now() + wait, strikes } };
  void chrome.storage.session.set({ cooldowns });
  log('warn', bookmaker, `paused for ${Math.round(wait / 60_000)} min: ${reason}`);
};

const clearCooldown = (bookmaker: Bookmaker): void => {
  if (cooldowns[bookmaker] === undefined) return;
  cooldowns = { ...cooldowns, [bookmaker]: undefined };
  void chrome.storage.session.set({ cooldowns });
};
/**
 * Hosts of the mirrors the user has been seen on, which the shipped match
 * patterns cannot name. Held in memory so recognising a tab costs nothing -
 * a navigation listener that read storage would do so on every URL change in
 * every tab, most of them nothing to do with a bookmaker.
 */
let mirrorHosts: Partial<Record<Bookmaker, string>> = {};

/**
 * Startup restore. A message can reach this worker before the restore finishes -
 * acting on an unloaded consent map would silently drop the first credentials
 * after every wake-up, so consent-dependent handlers wait for this.
 */
let ready: Promise<void> = Promise.resolve();
const whenReady = (fn: () => void): void => {
  void ready.then(fn);
};

const BADGE: Record<SyncMeta['lastStatus'], { text: string; color: string }> = {
  synced: { text: '', color: '#16a34a' },
  syncing: { text: '…', color: '#eab308' },
  error: { text: '!', color: '#dc2626' },
  logged_out: { text: '', color: '#9ca3af' },
};

/** One badge, several accounts: the most alarming state is the one worth showing. */
const BADGE_PRIORITY: SyncMeta['lastStatus'][] = ['error', 'syncing', 'logged_out', 'synced'];

const setBadge = (): void => {
  if (pending !== null) {
    void chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
    void chrome.action.setBadgeText({ text: '?' });
    return;
  }
  const seen = Object.values(statuses);
  const status = BADGE_PRIORITY.find((s) => seen.includes(s)) ?? 'logged_out';
  const { text, color } = BADGE[status];
  void chrome.action.setBadgeBackgroundColor({ color });
  void chrome.action.setBadgeText({ text });
};

/** A live session and the adapter that knows how to read it. */
interface Live {
  adapter: BookmakerAdapter;
  connection: Connection;
}

/** Every session a run can act on. Two logins at one site are two entries here. */
const live = (): Live[] =>
  allConnections().flatMap((connection) => {
    const adapter = adapterFor(connection.bookmaker);
    return adapter === null ? [] : [{ adapter, connection }];
  });

/**
 * A login to speak for a site when nothing narrows it down to one - the badge and
 * the logged-out report are about the site, not about a tab.
 */
const accountFor = (bookmaker: Bookmaker): AccountRef | null => {
  const connection = anyConnectionOf(bookmaker);
  return connection === null ? null : accountOf(connection);
};

/**
 * The one login this browser has ever seen at a site. A page read before its
 * session is captured - a mirror domain the worker has no connection for, or a
 * worker that has just woken - has no connection to name it, and filing it
 * unclaimed put a second, phantom account on the dashboard. With two logins
 * there is nothing to tell them apart, so unclaimed remains the honest answer.
 */
const soleKnownAccount = async (bookmaker: Bookmaker): Promise<AccountRef | null> => {
  const known = (await getKnownAccounts()).filter((a) => a.bookmaker === bookmaker);
  const only = known.length === 1 ? known[0] : undefined;
  return only === undefined ? null : { bookmaker, accountId: only.accountId };
};

const broadcast = (message: FromBackground): void => {
  chrome.runtime.sendMessage(message).catch(() => {
    /* no listeners open */
  });
};

const updateStatus = async (
  account: AccountRef,
  status: SyncMeta['lastStatus'],
  error: string | null = null,
): Promise<void> => {
  const meta: SyncMeta = {
    lastStatus: status,
    lastError: error,
    lastSyncAt:
      status === 'synced' ? new Date().toISOString() : (await getSyncMeta(account)).lastSyncAt,
  };
  await setSyncMeta(account, meta);
  statuses = { ...statuses, [accountKey(account)]: status };
  setBadge();
  broadcast({ type: 'STATUS_CHANGED' });
};

const restoreState = async (): Promise<void> => {
  await restoreConnections();
  const stored = await chrome.storage.session.get(['cooldowns', 'lastSyncAt']);
  // A backoff that only lives as long as the worker is no backoff at all:
  // Chromium stops this worker whenever it goes quiet, which is most of the time.
  const paused: unknown = stored.cooldowns;
  if (paused && typeof paused === 'object') cooldowns = paused as typeof cooldowns;
  const clocks: unknown = stored.lastSyncAt;
  if (clocks && typeof clocks === 'object') lastSyncAt = clocks as typeof lastSyncAt;
};

/**
 * Ask the site which login this session belongs to, before anything is written.
 * A different answer than last time is a different account: it gets its own
 * cursor, backfill state and balance, so the two never mix. Rows imported before
 * the extension could tell logins apart are handed to whichever login turns up
 * first - there is nothing else they could belong to.
 *
 * The answer is recorded against the session that asked, not against the site: a
 * second login signing in elsewhere must not rename the first one's account.
 */
/**
 * Who the site says this session belongs to, and nothing else - no session is
 * kept, no account registered. Separate from `resolveAccount` because the very
 * first thing asked of a site is whether anyone is signed in at all, and that is
 * asked before the user has said whether this site may be read.
 *
 * A refused session is rethrown rather than reported: to a caller checking for a
 * visitor it means "signed out", and to one acting on a session it means the
 * token died. Only the caller knows which of the two it is looking at.
 */
const identify = async (
  adapter: BookmakerAdapter,
  creds: Credentials,
): Promise<AccountId | null> => {
  try {
    return await adapter.accountId(creds);
  } catch (err) {
    if (err instanceof SessionExpiredError) throw err;
    // A site that cannot answer at all says nothing about who is signed in, and
    // reporting it as an unreadable identity read as "your account is gone" while
    // the account was fine and the site was in maintenance. Backed off instead, so
    // the rest of the run does not spend itself on an endpoint that is down.
    if (err instanceof RateLimitedError) {
      startCooldown(adapter.id, err.retryAfterMs, err.message);
      return null;
    }
    // Nowhere to ask from is not an unreadable identity - it is one that was
    // never asked for. The next visit answers it, and warning about it on every
    // poll only buried the failures that were real.
    if (!(err instanceof RelayUnavailableError))
      log('warn', adapter.id, `identity unreadable: ${(err as Error).message}`);
    return null;
  }
};

const resolveAccount = async (
  adapter: BookmakerAdapter,
  connection: Connection,
): Promise<AccountRef | null> => {
  let accountId: AccountId | null;
  try {
    accountId = await identify(adapter, connection.creds);
  } catch {
    await handleSessionExpired(connection);
    return null;
  }
  if (accountId === null) return null;
  // Gone while the site was answering - the user said no, or the session died.
  // Writing the identity back onto a connection that no longer exists would
  // resurrect it, so the answer is dropped with it.
  if (setAccountId(connection.key, accountId) === null) return null;
  const account: AccountRef = { bookmaker: adapter.id, accountId };
  await registerAccount(account);
  await claimUnclaimed(account);
  return account;
};

/** The login behind a session, resolving it first if it has not been named yet. */
const ensureAccount = async (
  adapter: BookmakerAdapter,
  connection: Connection,
): Promise<AccountRef | null> => {
  const known = accountOf(connection);
  return known ?? resolveAccount(adapter, connection);
};

/**
 * Take up a session. Nothing is read with it until the site has said which login
 * it belongs to: awaited rather than started alongside, because a run that began
 * on the old identity would write this login's bets against the previous one.
 */
const persistCredentials = async (
  bookmaker: Bookmaker,
  origin: string,
  creds: Credentials,
): Promise<Connection | null> => {
  const { connection, resumed } = putCredentials(bookmaker, origin, creds);
  // Only the arrival is an event. The same token reaches here from every frame
  // of the site and again each time the site re-issues it, and a log that says
  // "signed in" a dozen times per visit says nothing.
  // Nothing is put in front of the user for this: a site the user already said
  // yes to signing in again is the extension doing its job, and the reading that
  // follows is only worth watching if the user goes looking for it. The panel is
  // for the one question that needs an answer, which `askAbout` raises.
  if (resumed) log('info', bookmaker, 'session captured');
  // The reload allowance is *not* given back here: a token arriving proves only
  // that the site issued one, not that its API accepts it. `sync` returns it.
  const adapter = adapterFor(bookmaker);
  if (adapter !== null && connection.accountId === null) {
    await resolveAccount(adapter, connection);
  }
  // A session arriving is invisible otherwise: an open popup would keep saying it
  // is waiting for one long after the site handed it over.
  broadcast({ type: 'STATUS_CHANGED' });
  return connectionAt(bookmaker, origin);
};

/**
 * The one moment the user is interrupted: a supported site has signed in and has
 * never been answered for. It is drawn in the site's own page, where the panel is
 * ours to shape and sits where the user is already looking. Nothing else opens
 * anything by itself - every other state waits in the toolbar popup, which the
 * badge points at.
 */
const showPanel = async (bookmaker: Bookmaker): Promise<void> => {
  // Every tab of the site, not only the one in front: a bookmaker opened in a
  // background tab signs in there too, and asking only the active tab meant the
  // question was never drawn at all - it fell back to the "?" on the toolbar,
  // which is the one place this panel exists to avoid. The frontmost tab is
  // still asked first, so a user looking at the site sees it right away.
  const tabs = await chrome.tabs.query({});
  for (const tab of [...tabs].sort((a, b) => Number(b.active) - Number(a.active))) {
    if (tab.id === undefined || tab.url === undefined) continue;
    if (bookmakerForUrl(tab.url) !== bookmaker) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_PANEL', bookmaker } satisfies ToContent);
      return;
    } catch {
      /* no content script in that tab; try the next one */
    }
  }
};

/**
 * Ask about a supported site the user has never answered for. The question is
 * also parked in `pending` and shown whenever the popup is next opened - the
 * badge turns into a "?" to say so.
 */
const askAbout = (bookmaker: Bookmaker): void => {
  if (pending === bookmaker) return;
  pending = bookmaker;
  setBadge();
  void showPanel(bookmaker);
};

/** When each session was last asked who it thinks we are, at most this often. */
const identityCheckedAt = new Map<string, number>();
const IDENTITY_CHECK_MS = 30_000;

/**
 * Ask about a site only once it has named the login behind the session.
 *
 * Not every site's auth says by itself whether anyone is signed in: Stake
 * authenticates with the session cookie the browser sends on every call, so its
 * requests look identical whether the visitor is signed in or reading the odds
 * as a stranger. Taking those for a session put the question in front of people
 * who had not signed in at all, and a "yes" then started a run with nothing
 * behind it. The site's own API is the only authority on this, and it is asked
 * at most once every `IDENTITY_CHECK_MS` - a page makes many requests, and each
 * would otherwise cost one of ours.
 */
const askOnceSignedIn = async (
  adapter: BookmakerAdapter,
  origin: string,
  creds: Credentials,
): Promise<void> => {
  if (pending === adapter.id) return;
  const probe = `${adapter.id}|${origin}`;
  const last = identityCheckedAt.get(probe) ?? 0;
  if (Date.now() - last < IDENTITY_CHECK_MS) return;
  identityCheckedAt.set(probe, Date.now());
  // Only whether someone is signed in, and nothing kept either way: a site with
  // no answer yet has neither its session nor the login it names recorded
  // anywhere. That is what makes the question a question.
  try {
    if ((await identify(adapter, creds)) === null) return;
  } catch {
    return; // signed out; the site asks again when someone signs in
  }
  awaiting = { bookmaker: adapter.id, origin, creds };
  askAbout(adapter.id);
};

const noteOrigin = (bookmaker: Bookmaker, origin: string): void => {
  try {
    mirrorHosts = { ...mirrorHosts, [bookmaker]: new URL(origin).host };
  } catch {
    /* not a URL; there is nothing to recognise later */
  }
};

/** The bookmaker a tab is on, counting mirrors the manifest never listed. */
const bookmakerForUrl = (url: string): Bookmaker | null => {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return null;
  }
  const shipped = bookmakerForHost(host);
  if (shipped !== null) return shipped;
  const mirror = Object.entries(mirrorHosts).find(([, known]) => known === host);
  return mirror === undefined ? null : (mirror[0] as Bookmaker);
};

/** Which bookmakers the user has a tab open on right now, mirrors included. */
const openBookmakerTabs = async (): Promise<Set<Bookmaker>> => {
  const open = new Set<Bookmaker>();
  for (const tab of await chrome.tabs.query({})) {
    if (tab.url === undefined) continue;
    const bookmaker = bookmakerForUrl(tab.url);
    if (bookmaker !== null) open.add(bookmaker);
  }
  return open;
};

/**
 * A session can only be lifted out of a request the site itself makes, so a user
 * who signed in before the extension was watching is invisible to it - nothing
 * is wrong, there is simply nothing to read yet. Reloading the tab makes the
 * site authenticate again immediately, instead of asking the user to sign out.
 */
const reconnect = async (bookmaker: Bookmaker, origin: string | null = null): Promise<void> => {
  // The mirror the dead session was captured on, where there is one: reloading
  // the other account's tab hands back the other account's token and leaves this
  // one just as stale as it was.
  const tabs =
    origin === null
      ? await chrome.tabs.query({})
      : [...(await chrome.tabs.query({ url: `${origin}/*` })), ...(await chrome.tabs.query({}))];
  for (const tab of tabs) {
    if (tab.id === undefined || tab.url === undefined) continue;
    if (bookmakerForUrl(tab.url) === bookmaker) {
      await chrome.tabs.reload(tab.id);
      return;
    }
  }
};

/**
 * A site the browser has just let us into. The manifest names no bookmaker, so
 * every site arrives this way: the two page scripts are registered by hand for
 * the one origin that was granted, and nowhere else. Reloading the tab is what
 * makes the site authenticate again with the scripts finally watching.
 */
const enableMirror = async (bookmaker: Bookmaker, origin: string): Promise<void> => {
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return;
  }
  // The whole domain, not the one address granted: the sportsbook is drawn in
  // frames on the site's own subdomains, and a script bound to `www.` alone
  // never sees the calls those frames make.
  const match = sitePatternFor(host);
  const id = `mirror-${host}`;
  const shared = {
    matches: [match],
    runAt: 'document_start' as const,
    allFrames: true,
    persistAcrossSessions: true,
  };
  // Asked rather than inferred from a failure. Registering twice throws the same
  // way a genuinely broken registration does, and treating the two alike left a
  // site granted, unwatched and silent about it.
  const registered = await chrome.scripting.getRegisteredContentScripts();
  const placed = registered.some((script) => script.id === id);
  if (!placed) {
    try {
      await chrome.scripting.registerContentScripts([
        { id, js: ['content.js'], ...shared },
        { id: `${id}-main`, js: ['inject.js'], world: 'MAIN' as const, ...shared },
      ]);
    } catch (err) {
      log('warn', bookmaker, `cannot watch ${match}: ${(err as Error).message}`);
      return;
    }
  }
  noteOrigin(bookmaker, origin);
  await chrome.storage.local.set({ [siteOriginKey(bookmaker)]: origin });
  // Only where the scripts were not there a moment ago. This is called from more
  // than one direction now, and reloading a tab that is already being read
  // throws away the session it was in the middle of handing us.
  if (placed) return;
  // A session can only be lifted out of a call the page makes while we are
  // watching, and this page made all of its own before the grant.
  for (const tab of await chrome.tabs.query({ url: match })) {
    if (tab.id !== undefined) await chrome.tabs.reload(tab.id);
  }
};

/**
 * A site the user let us into from the browser's own settings rather than from
 * the popup. Nothing in the manifest claims a bookmaker any more, so a grant made
 * there leaves no scripts behind it and the site would sit there granted and
 * unread. The grant itself is the signal, wherever it was made.
 */
chrome.permissions.onAdded.addListener((granted) => {
  void (async () => {
    for (const pattern of granted.origins ?? []) {
      // Read off the tab the grant was made on rather than guessed out of the
      // pattern: `https://*.stake.com/*` names no address, and the site the user
      // is standing on is the one address that is certainly right.
      for (const tab of await chrome.tabs.query({ url: pattern })) {
        if (tab.url === undefined) continue;
        const bookmaker = bookmakerForUrl(tab.url);
        if (bookmaker === null) continue;
        await enableMirror(bookmaker, new URL(tab.url).origin);
        break;
      }
    }
  })();
});

/**
 * Everything this worker holds about a site, dropped. Called when the last login
 * at it is deleted: leaving the consent behind would have the very next request
 * from the site quietly start collecting again, against an answer the user gave
 * about data they have since thrown away. Undefined, not false - the question is
 * unanswered again, so the popup asks it rather than treating the site as refused.
 */
const forgetSite = async (bookmaker: Bookmaker): Promise<void> => {
  consent = Object.fromEntries(Object.entries(consent).filter(([b]) => b !== bookmaker));
  await chrome.storage.local.set({ consent });
  // Every login at the site, not one of them: this is the site being given up.
  for (const connection of connectionsOf(bookmaker)) {
    reviving.delete(connection.key);
    apiBalances.delete(connection.key);
    lastBalanceReadAt.delete(connection.key);
    lastActivityAt.delete(connection.key);
    const rest = { ...lastSyncAt };
    delete rest[connection.key];
    lastSyncAt = rest;
  }
  await chrome.storage.session.set({ lastSyncAt });
  dropBookmaker(bookmaker);
  // The badge speaks for whatever these say, so a deleted account left in here
  // would keep reporting a state for a site that no longer has one.
  statuses = Object.fromEntries(
    Object.entries(statuses).filter(([key]) => !key.startsWith(`${bookmaker}:`)),
  );
  // Same reason: the last reading is remembered to avoid re-storing an unchanged
  // balance, and a re-added account would have its first reading skipped.
  for (const key of lastBalance.keys()) {
    if (key.startsWith(`${bookmaker}:`)) lastBalance.delete(key);
  }
  // Likewise the note of when the money last needed walking: a re-added account
  // would otherwise be told its untouched balance means there is nothing to read.
  await chrome.storage.local.remove(
    Object.keys(await chrome.storage.local.get(null)).filter((k) =>
      k.startsWith(`${MONEY_CHECK_KEY}:${bookmaker}:`),
    ),
  );
  clearCooldown(bookmaker);
  if (pending === bookmaker) pending = null;
  log('info', bookmaker, 'site forgotten - it will be asked about again');
  setBadge();
  broadcast({ type: 'STATUS_CHANGED' });
};

const setConsent = async (bookmaker: Bookmaker, enabled: boolean): Promise<void> => {
  consent = { ...consent, [bookmaker]: enabled };
  await chrome.storage.local.set({ consent });
  if (pending === bookmaker) pending = null;
  setBadge();
  // The session that raised the question is taken over on a yes, so the import
  // starts right away instead of waiting for the site's next request.
  const taken = enabled && awaiting?.bookmaker === bookmaker ? awaiting : null;
  if (awaiting?.bookmaker === bookmaker) awaiting = null;
  if (taken !== null) await persistCredentials(taken.bookmaker, taken.origin, taken.creds);
  // The answer changes what the popup has to say whether or not a session came
  // with it. Without this, saying yes before the site has authenticated left the
  // popup asking the same question, which reads as the button doing nothing.
  broadcast({ type: 'STATUS_CHANGED' });
  if (!enabled) return;
  if (connectionsOf(bookmaker).length === 0) await reconnect(bookmaker);
  // Only the site that was just switched on: the other one was not part of the
  // question and has no reason to be read because of it.
  else void sync('incremental', bookmaker);
};

/** How long a money import stays good while nothing has moved in the account. */
const MONEY_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const MONEY_CHECK_KEY = 'moneyCheck';

interface MoneyCheck {
  at: number;
  /** The balance as it read when the walk last ran; see `moneyMoved`. */
  reading: string;
}

/**
 * Whether anything can have happened to the money since the last walk.
 *
 * Deposits, withdrawals and bonus credits all move the balance, so an account
 * whose balance reads exactly as it did when the walk last ran has nothing new
 * to walk - and the walk is by far the most expensive part of a sync, running on
 * every alarm and every navigation around the site. The age is the backstop:
 * offers and rakeback change without the balance moving, and a bet settling
 * moves the balance without a movement behind it, so neither answer is trusted
 * for long.
 */
const moneyMoved = async (account: AccountRef): Promise<boolean> => {
  const key = `${MONEY_CHECK_KEY}:${accountKey(account)}`;
  const stored = (await chrome.storage.local.get(key))[key] as MoneyCheck | undefined;
  if (stored === undefined) return true;
  if (Date.now() - stored.at > MONEY_MAX_AGE_MS) return true;
  // `lastBalance` only lives as long as the worker, so a run whose balance read
  // failed - or has not happened yet - knows nothing about whether the money
  // moved. "Nothing" must not read as "unchanged": once both sides were the
  // empty string the walk was skipped for good and the deposits stopped
  // importing, with the history already marked complete so nothing retried it.
  const reading = lastBalance.get(accountKey(account));
  if (reading === undefined) return true;
  return stored.reading !== reading;
};

const rememberMoneyCheck = async (account: AccountRef): Promise<void> => {
  const reading = lastBalance.get(accountKey(account));
  // Nothing to compare against next time. Writing a stand-in would make the next
  // run believe the balance had held still, which is the trap above.
  if (reading === undefined) return;
  const key = `${MONEY_CHECK_KEY}:${accountKey(account)}`;
  await chrome.storage.local.set({
    [key]: { at: Date.now(), reading } satisfies MoneyCheck,
  });
};

/**
 * Deposits, withdrawals and bonuses. Some sites need a second session that is
 * only seen once the user opens their account pages, so this is always
 * best-effort: money failing must never fail the bet sync that already
 * succeeded. The deep walk runs once per account; afterwards only the recent
 * window can still change, and re-imports upsert anyway.
 */
const importMoney = async ({ adapter, connection }: Live, full = false): Promise<string | null> => {
  if (adapter.syncMoney === undefined) return null;
  const account = await ensureAccount(adapter, connection);
  if (account === null) return null;
  const bank = connection.banking;
  // Said rather than skipped in silence. A site that keeps its cashier on a
  // separate session hands that session out only on the page that uses it, so
  // deposits, withdrawals and bonuses stay empty until the user opens their
  // payments page once - and nothing anywhere used to admit that was why.
  if (adapter.needsBankingSession === true && bank === null) {
    log('info', adapter.id, 'deposits and bonuses wait for your payments page to be opened once');
    return null;
  }
  try {
    // A full resync means the stored history is not trusted, so the backfill flag
    // does not get to skip the walk - otherwise deposits stay stuck at the few
    // months the very first run happened to reach.
    const { moneyComplete } = await getBackfillState(account);
    // Only the deposit/withdrawal walk is held back. Offers and rakeback are read
    // on every run: they change while the balance stands still, and skipping them
    // left the stored list saying whatever the last walk happened to see.
    const walk = full || !moneyComplete || (await moneyMoved(account));
    const depth: MoneyDepth = walk ? (full || !moneyComplete ? 'full' : 'recent') : 'bonuses';
    // The adapter marks the history complete, and only when its walk really
    // reached the end. Marking it here meant a walk that stopped early still
    // counted as done, and every later run stayed shallow - history froze at the
    // few recent months the first run happened to cover.
    const imported = await adapter.syncMoney(connection.creds, bank, account, depth);
    // Only a run that really walked may reset the clock; otherwise the age
    // backstop would be pushed forward by runs that read nothing but bonuses.
    if (walk) await rememberMoneyCheck(account);
    // One line for the whole walk, like the bets: the popup is told every step,
    // the log only what the run ended up with.
    if (imported > 0) log('info', adapter.id, `${imported} transactions imported`);
    broadcast({
      type: 'SYNC_PROGRESS',
      // Every run re-imports the whole recent window, so `imported` counts rows
      // written, not rows that are new. `done` stays false: money is one step of
      // the run, and claiming the run ended here leaves the popup waiting forever.
      progress: {
        page: 0,
        totalNew: imported,
        done: false,
        kind: 'transactions',
        message: `${imported} transactions imported`,
      },
    });
    return null;
  } catch (err) {
    // Nowhere to make the request from: the site has no tab open. Nothing is
    // wrong with the account, so it is neither logged nor reported as a failure.
    if (err instanceof RelayUnavailableError) return null;
    if (err instanceof RateLimitedError) {
      startCooldown(adapter.id, err.retryAfterMs, err.message);
      return err.message;
    }
    // The banking session, where the site keeps one apart from the login: it is
    // refused and a fresh one is captured on the next visit. The money walk
    // itself is not held back - a walk that is never retried is a walk that
    // never recovers, and the account then quietly stops importing deposits.
    if (err instanceof SessionExpiredError) dropBanking(connection.key);
    log('warn', adapter.id, `transaction import skipped: ${(err as Error).message}`);
    // Returned rather than swallowed: a run that imported no transactions used to
    // end on "Up to date", which is why a broken money import stayed invisible.
    return (err as Error).message;
  }
};

/**
 * The last reading per account. A balance is re-read on every scrape and on
 * every panel poll, and announcing one that has not moved makes the dashboard
 * reload - which is what a page redrawing itself for no reason looks like.
 */
const lastBalance = new Map<string, string>();

/**
 * A balance read between two syncs is a fresh day, and often the first record in
 * its currency. Only the sync asks the rate feed, so the header held a figure it
 * could not price and quietly fell back to the tracked one instead.
 *
 * Throttled because a coin the feeds do not trade stays unpriceable however
 * often it is asked for, and the balance is re-read every few seconds.
 */
const RATE_RETRY_MS = 15 * 60_000;
let ratesTriedAt = 0;

/** True when the table gained a quote, so what was already drawn is now wrong. */
const priceBalance = async (balance: BalanceInfo): Promise<boolean> => {
  const currency = balance.currency;
  if (currency === null || currency === undefined) return false;
  const [table, settings] = await Promise.all([getRates(), getSettings()]);
  const day = dayOf(balance.capturedAt);
  const priced =
    rateFor(table, currency, day) !== null && rateFor(table, settings.currency, day) !== null;
  if (priced || Date.now() - ratesTriedAt < RATE_RETRY_MS) return false;
  ratesTriedAt = Date.now();
  try {
    return (await syncRates()) > 0;
  } catch (err) {
    log('warn', 'rates', `rate feed unavailable: ${(err as Error).message}`);
    return false;
  }
};

const storeBalance = async (
  balance: BalanceInfo,
  /** The session it was read with, where there is one - only it can be re-read. */
  connection: Connection | null,
): Promise<void> => {
  const account: AccountRef = { bookmaker: balance.bookmaker, accountId: balance.accountId };
  const key = accountKey(account);
  // The coins held, where the site keeps a wallet per currency. Their combined
  // worth is a live market price and moves every few seconds without anything
  // happening in the account - reading that as "the balance changed" redrew the
  // dashboard constantly and told the money walk it had work to do on every run.
  const reading =
    balance.holdings === undefined
      ? `${balance.amount}|${balance.currency ?? ''}`
      : balance.holdings.map((h) => `${h.currency}:${h.amount}`).join(',');
  const moved = lastBalance.has(key) && lastBalance.get(key) !== reading;
  if (lastBalance.get(key) === reading) return;
  lastBalance.set(key, reading);
  await Promise.all([setBalance(account, balance), appendBalanceSnapshot(account, balance)]);
  broadcast({ type: 'BALANCE', balance });
  // Announced first: the figure is in the database either way, and holding the
  // dashboard back on a rate feed is worse than pricing it a moment later.
  if (await priceBalance(balance)) broadcast({ type: 'BALANCE', balance });
  // Not on the first reading of a worker's life: that one is only "we had none
  // and now we do", which says nothing about anything having happened.
  if (moved && connection !== null) accountActivity(connection);
};

/**
 * Sites whose API has actually answered with a balance. Until one has, the
 * scraped figure is the only one there is: an adapter that *can* read the wallet
 * still needs a session it may not have yet, and blocking the page reading on
 * the promise of an API one leaves the account showing nothing at all.
 */
const apiBalances = new Set<string>();

/** Bookmakers already told about, so "no tab open" is said once and not per poll. */
const saidNoTab = new Set<Bookmaker>();

/**
 * How often the API balance is worth asking for. The panel polls the open bets
 * every eight seconds while a match is in play and used to re-read the balance
 * on every one of those beats; a balance that moved four seconds ago is not
 * worth a request that gets the account throttled.
 */
const BALANCE_TTL_MS = 30_000;
const lastBalanceReadAt = new Map<string, number>();

/**
 * Sites that expose the balance through their API; the rest are scraped from the
 * DOM. `force` is for the sync, which decides whether to walk the money history
 * by comparing this reading against the previous one and so cannot use a stale.
 */
const importBalance = async ({ adapter, connection }: Live, force = false): Promise<void> => {
  if (adapter.balance === undefined) return;
  if (cooling(adapter.id)) return;
  if (!force && Date.now() - (lastBalanceReadAt.get(connection.key) ?? 0) < BALANCE_TTL_MS) return;
  // Before the account is named, not after: naming it is itself a request, and
  // one that fails on every poll used to warn on every poll as well.
  lastBalanceReadAt.set(connection.key, Date.now());
  const account = await ensureAccount(adapter, connection);
  if (account === null) {
    log('warn', adapter.id, 'balance not read: account not identified');
    return;
  }
  try {
    const balance = await adapter.balance(connection.creds, account, connection.banking);
    if (balance === null) return;
    apiBalances.add(connection.key);
    saidNoTab.delete(adapter.id);
    await storeBalance(balance, connection);
  } catch (err) {
    // The panel polls this every twenty seconds, so a site with no tab open would
    // otherwise write the same line three times a minute. Said once all the same:
    // a balance that silently stops refreshing looks exactly like a broken one,
    // and the reader has no way to learn that opening the site is what fixes it.
    if (err instanceof RelayUnavailableError) {
      if (!saidNoTab.has(adapter.id)) {
        saidNoTab.add(adapter.id);
        log('info', adapter.id, `balance not refreshed: ${(err as Error).message}`);
      }
      return;
    }
    if (err instanceof RateLimitedError) {
      startCooldown(adapter.id, err.retryAfterMs, err.message);
      return;
    }
    // Deliberately not dropping the session the way the money import does: this
    // runs on every panel poll, and one endpoint answering 403 would then keep
    // throwing away the session the deposits are read with.
    if (err instanceof SessionExpiredError) apiBalances.delete(connection.key);
    log('warn', adapter.id, `balance read skipped: ${(err as Error).message}`);
  }
};

/**
 * Sessions whose expiry we have already tried to heal, cleared when a session
 * lands. Keyed by connection, except for the wake-up case in `sync` where there
 * is no connection left to key by and the bookmaker's own id stands in - a
 * bookmaker id never contains the `|` a connection key is built around.
 */
const reviving = new Set<string>();

/**
 * The captured token stopped being accepted (~30 min idle). This is not the
 * account going away: it stays in the registry with everything it imported, and
 * the very next authenticated request the site makes hands over a live token.
 *
 * The dead token is dropped because retrying it can only fail, and if one of the
 * site's tabs is open it is reloaded once so that next request happens now rather
 * than whenever the user next clicks something. Reloading twice would mean the
 * user really is signed out, which only they can fix.
 */
const handleSessionExpired = async (connection: Connection): Promise<void> => {
  dropConnection(connection.key);
  log('info', connection.bookmaker, 'session went stale - reviving');
  const account = accountOf(connection);
  if (account !== null) await updateStatus(account, 'logged_out');
  if (reviving.has(connection.key)) return;
  reviving.add(connection.key);
  // The mirror this login was signed in on, so the reload hands back *its*
  // token rather than the other account's.
  await reconnect(connection.bookmaker, connection.origin);
};

/**
 * Sync every connected account, one after the other. Sequential on purpose: the
 * bookmakers rate-limit per session anyway, and a failure on one account must
 * leave the others' status untouched rather than aborting the whole run.
 */
const sync = async (mode: 'incremental' | 'full', only: Bookmaker | null = null): Promise<void> => {
  // A run already walking keeps the ask instead of dropping it. A click that
  // landed during a long backfill used to do nothing whatever, and the popup sat
  // waiting on an answer that was never coming. `full` outranks `incremental`,
  // and two asks about different sites widen to a run over both.
  if (syncing) {
    queued =
      queued === null
        ? { mode, only }
        : {
            mode: queued.mode === 'full' || mode === 'full' ? 'full' : 'incremental',
            only: queued.only === only ? only : null,
          };
    return;
  }
  if (live().length === 0) {
    // Sessions are live bearer tokens, so they are held in memory and in session
    // storage and never written to disk. After a browser restart there is
    // therefore nothing to sync with, and the run would quietly do nothing for as
    // long as the user left the site alone. Reloading a tab that is already open
    // makes the site authenticate again immediately; with no such tab reconnect
    // does nothing, which is the right answer - a session cannot be conjured.
    for (const adapter of adapters()) {
      if (consent[adapter.id] !== true) continue;
      if (reviving.has(adapter.id)) continue;
      reviving.add(adapter.id);
      await reconnect(adapter.id);
    }
    return;
  }
  syncing = true;
  // Whose step this is. The run walks one account at a time, and a log line that
  // only says "sync" leaves the reader guessing which site it was about.
  let scope = 'sync';
  const onProgress = (progress: SyncProgress): void => {
    // Steps are for the popup, which is watching a run happen; the log gets one
    // line per account for what the whole walk brought in. A history is hundreds
    // of pages, and a line for each of them buries everything worth reading -
    // including the one line that says something went wrong, which still passes.
    if (progress.done && progress.ok === false) log('warn', scope, progress.message);
    broadcast({ type: 'SYNC_PROGRESS', progress });
  };
  let failures: string[] = [];
  /** Whether any account was actually read, so a run that skipped every site says so. */
  let walked = false;
  try {
    // One pass per asked-for run. Anything requested while this one walks is run
    // here rather than after the closing message, so a single click still ends
    // with a single answer that covers everything it set off.
    for (
      let pass: { mode: 'incremental' | 'full'; only: Bookmaker | null } | null = { mode, only };
      pass !== null;
    ) {
      failures = [];
      // An account switched off in the settings is left where it is: nothing is
      // read for it until it is switched back on. Read per pass, because the user
      // can flip the switch while a long run is walking.
      const { hiddenAccounts } = await getSettings();
      // Read per pass, so a tab opened or closed mid-run counts for the next one.
      const openSites = await openBookmakerTabs();
      // Read again each pass: a session that arrived mid-run belongs in this one.
      // Every login, not one per site: two accounts at one bookmaker are two
      // walks, each against its own cursor.
      for (const { adapter, connection } of live()) {
        if (pass.only !== null && adapter.id !== pass.only) continue;
        // A site nobody has open is left alone, however the run was set off.
        // Nothing can be placed, deposited or settled at a bookmaker that is not
        // on screen, so its records cannot have moved since the last run - and
        // reading it anyway is what put one site's failures into a run the user
        // started on the other one. Opening the tab sets off a run of its own.
        if (!openSites.has(adapter.id)) continue;
        // Asked to be left alone until the backoff is up. Its stored history is
        // still served from the database; only the requests stop.
        if (cooling(adapter.id)) continue;
        // Nothing is written until the site has said which login this is, so a
        // second account can never inherit the first one's cursor or history.
        const account = await ensureAccount(adapter, connection);
        if (account === null) continue;
        if (hiddenAccounts.includes(accountKey(account))) continue;
        walked = true;
        scope = adapter.id;
        // Kept so a run that could not even reach the site puts back the state
        // the account was really in, rather than leaving it reading "syncing".
        const before = statuses[accountKey(account)] ?? (await getSyncMeta(account)).lastStatus;
        await updateStatus(account, 'syncing');
        try {
          // An account with nothing stored is read whole, whatever set this run
          // off. Anything else would have a brand-new account sit on the recent
          // window until the user found the button that asks for the rest.
          const depth = pass.mode === 'full' || !(await hasBets(account)) ? 'full' : 'incremental';
          const read = await adapter.syncBets(connection.creds, account, depth, onProgress);
          if (read.added > 0) log('info', adapter.id, `${read.added} new bets read`);
          // Settled history alone would leave the currently-running bets out of the
          // database until the panel happens to ask for them.
          await syncOpenBets(adapter, connection.creds, account);
          // Marked read here, not at the end: the bets are in the database at this
          // point, and the money walk below can run for minutes - long enough for
          // Chromium to stop the worker and leave the account looking unread.
          await updateStatus(account, 'synced');
          // A run that got this far proves the session works, so the site earns
          // its one reload back. Cleared on a captured token instead, a site that
          // handed over a token its own API then refused was reloaded on every
          // single run - the reconnect loop the log filled up with.
          reviving.delete(connection.key);
          reviving.delete(adapter.id);
          // A run that reached the end proves the site is answering again, so
          // whatever backoff it had earned is spent rather than doubled next time.
          clearCooldown(adapter.id);
          markSynced(connection);
          // Before the money, not after: the walk below is skipped when the
          // balance says nothing has moved, so it needs this run's reading
          // rather than the one the previous run left behind.
          await importBalance({ adapter, connection }, true);
          const moneyError = await importMoney({ adapter, connection }, depth === 'full');
          if (moneyError !== null) failures.push(`${nameOf(adapter.id)} transactions: ${moneyError}`);
        } catch (err) {
          if (err instanceof RelayUnavailableError) {
            // Not a failure of the account: there is simply no tab of the site
            // open to make its requests from. Left exactly as it was found.
            await updateStatus(account, before);
          } else if (err instanceof RateLimitedError) {
            // The site asked for room, which is not the account failing: its
            // stored history is intact and the next run picks up where this one
            // stopped. Reported so the run does not claim to be up to date.
            startCooldown(adapter.id, err.retryAfterMs, err.message);
            failures.push(`${nameOf(adapter.id)} paused: ${err.message}`);
            await updateStatus(account, before);
          } else if (err instanceof SessionExpiredError) {
            failures.push(`${nameOf(adapter.id)} reconnecting`);
            await handleSessionExpired(connection);
          } else {
            failures.push(`${nameOf(adapter.id)}: ${(err as Error).message}`);
            log('error', adapter.id, `sync failed: ${(err as Error).message}`);
            await updateStatus(account, 'error', (err as Error).message);
          }
        }
      }
      // After the accounts, because it prices exactly what they just stored. A dead
      // rate feed must not make an account that synced fine look failed.
      try {
        await syncRates();
      } catch (err) {
        log('warn', 'rates', `rate feed unavailable: ${(err as Error).message}`);
      }
      pass = queued;
      queued = null;
    }
  } finally {
    syncing = false;
    queued = null;
    // Back to the run itself: the closing line covers every account, not the one
    // that happened to be walked last.
    scope = 'sync';
    // The only message of a run that says the run is over, and the only one that
    // says whether it worked. Everything before it is a step.
    onProgress({
      page: 0,
      totalNew: 0,
      done: true,
      ok: failures.length === 0,
      message:
        failures.length > 0
          ? failures.join(' · ')
          : // Said plainly rather than as "up to date": a run that read nothing
            // has not checked anything, and the button would otherwise look
            // like it worked when it had no site to work on.
            walked
            ? 'Up to date'
            : 'Open a bookmaker tab to sync',
    });
  }
};

/**
 * How long one movement keeps the next one from setting off a run. A deposit
 * lands as several balance changes in a row while the site settles, and a bet
 * placed on a five-leg slip moves it once per confirmation.
 */
const ACTIVITY_DEBOUNCE_MS = 60_000;
const lastActivityAt = new Map<string, number>();

/**
 * One read of a single bookmaker's open slips, stored and announced. Cheap enough
 * to run the moment the money moves: it is the one request that tells the panel a
 * new slip exists, where the history walk tells it everything else as well.
 */
const readOpenNow = async ({ adapter, connection }: Live): Promise<void> => {
  try {
    const account = await ensureAccount(adapter, connection);
    if (account === null) return;
    const { added } = await syncOpenBets(adapter, connection.creds, account);
    // The panel and the counter on its button both read the stored copy, so
    // neither knows about the slip until this says it landed.
    if (added > 0) {
      broadcast({
        type: 'SYNC_PROGRESS',
        progress: { page: 0, totalNew: added, done: true, message: 'Open bets updated' },
      });
    }
  } catch (err) {
    // Not reported as a failure: the run started right after this one covers the
    // same ground and reports for itself.
    log('warn', adapter.id, `open bets not re-read: ${(err as Error).message}`);
  }
};

/**
 * Something moved in this account's money: a deposit landed, a withdrawal left,
 * a stake was placed, or a bet settled. All four are the same event as far as
 * this extension is concerned - a figure that changed - and all four mean the
 * records behind it are now out of date, so that one bookmaker is re-read.
 *
 * This is why there is no separate watch for deposits: the balance already is
 * the signal, it needs no per-site endpoint to be guessed at, and it cannot go
 * out of date when a bookmaker renames one.
 */
const accountActivity = (connection: Connection): void => {
  const bookmaker = connection.bookmaker;
  if (cooling(bookmaker)) return;
  if (Date.now() - (lastActivityAt.get(connection.key) ?? 0) < ACTIVITY_DEBOUNCE_MS) return;
  lastActivityAt.set(connection.key, Date.now());
  const adapter = adapterFor(bookmaker);
  if (adapter === null) return;
  void (async () => {
    // The slip that moved the money first, the history walk after it. One request
    // puts a just-placed bet on screen; the walk behind it can run for minutes,
    // and while it runs the panel's own poll answers out of the database - which
    // is what kept a bet the user had only just placed from showing up.
    if (!syncing) await readOpenNow({ adapter, connection });
    // The debounce above is per login; the run it sets off is not, and it walks
    // whichever sessions are due. A second account at the same site is read on
    // the same trip rather than waiting for its own movement.
    await sync('incremental', bookmaker);
  })();
};

/** Last known open bets from IndexedDB, used whenever a live fetch isn't possible. */
const storedOpenSnapshot = async (error: string): Promise<OpenBetsSnapshot> => ({
  bets: activeBets(await getPendingBets()),
  error,
  stale: true,
  // Counts are only as good as the fetch they came with; a stored slip has none.
  scores: {},
});

/**
 * Fetch the open bets on demand for the dashboard panel. Bets that were open at
 * the previous poll but are gone now have just settled, so kick off one
 * incremental sync to let IndexedDB catch up with what the panel already shows.
 */
const refreshOpen = async (): Promise<OpenBetsSnapshot> => {
  const targets = live();
  if (targets.length === 0) return storedOpenSnapshot('logged_out');
  // Don't race a full sync hitting the same endpoint with the same token.
  if (syncing) return storedOpenSnapshot('syncing');

  const open: Bet[] = [];
  const scores: Record<string, LiveScore[]> = {};
  const refreshed = new Set<string>();
  const openSites = await openBookmakerTabs();
  let stored = 0;
  let failure: string | null = null;

  for (const { adapter, connection } of targets) {
    // Polling a bookmaker whose site is not even open is what this costs the
    // most for and gains the least from: nothing can be placed, deposited or
    // cashed out at a site nobody is looking at, so its slips cannot have moved
    // since the last run. The stored ones below stand in, marked stale.
    if (!openSites.has(adapter.id)) continue;
    if (cooling(adapter.id)) continue;
    const account = await ensureAccount(adapter, connection);
    if (account === null) continue;
    // Per account: one account failing would otherwise look like its bets settled.
    const key = `${OPEN_IDS_KEY}:${accountKey(account)}`;
    try {
      const { bets, added, scores: fresh } = await syncOpenBets(adapter, connection.creds, account);
      stored += added;
      Object.assign(scores, fresh);
      const session = await chrome.storage.session.get(key);
      const previous: unknown = session[key];
      const settled = disappearedBetIds(
        Array.isArray(previous) ? (previous as string[]) : [],
        bets,
      );
      await chrome.storage.session.set({ [key]: bets.map((b) => b.betId) });
      // A slip that was open a moment ago and is gone now has settled, and the
      // money behind it moved with it. Only that bookmaker is re-read: the other
      // one had nothing happen to it.
      if (settled.length > 0) accountActivity(connection);
      refreshed.add(accountKey(account));
      open.push(...bets);
      // The panel is the one place the user watches a bet and the money behind it
      // at the same time, so the balance is re-read on the same beat rather than
      // waiting for the next sync. Not awaited: the scores on screen would
      // otherwise wait on a request that has nothing to do with them, and it
      // reports its own failures.
      void importBalance({ adapter, connection });
    } catch (err) {
      // No tab of the site open: its own slips cannot be fetched, and the stored
      // ones below already cover it. Not the account's failure to report.
      if (err instanceof RelayUnavailableError) continue;
      if (err instanceof RateLimitedError) {
        startCooldown(adapter.id, err.retryAfterMs, err.message);
        continue;
      }
      if (err instanceof SessionExpiredError) await handleSessionExpired(connection);
      failure = (err as Error).message;
    }
  }

  // A slip the panel just fetched is in the database but not in what the page
  // loaded, and the counter on the closed panel reads the page's copy. Only when
  // something was actually new: this poll repeats every 20 seconds.
  if (stored > 0) {
    broadcast({
      type: 'SYNC_PROGRESS',
      progress: { page: 0, totalNew: stored, done: true, message: 'Open bets updated' },
    });
  }

  // The browser is signed in to one login at a time, so a poll only ever hears
  // from the account that is open right now. Every other account's slips are
  // just as open - read from the database rather than dropped, which is what
  // made a second bookmaker's panel go empty as soon as the first one answered.
  const resting = (await getPendingBets()).filter((bet) => !refreshed.has(accountKey(bet)));
  if (open.length === 0 && failure !== null) return storedOpenSnapshot(failure);
  return {
    bets: activeBets([...open, ...resting]),
    error: null,
    stale: resting.length > 0,
    scores,
  };
};

/**
 * Which login a message speaks for: the page it came from. The tab's own URL
 * rather than the frame's, because the site's own calls are made from iframes
 * whose origin is not the site - filing those under the frame would split one
 * login into several.
 */
const originOf = (sender: chrome.runtime.MessageSender): string | null => {
  const url = sender.tab?.url ?? sender.url;
  if (url === undefined) return sender.origin ?? null;
  try {
    return new URL(url).origin;
  } catch {
    return sender.origin ?? null;
  }
};

chrome.runtime.onMessage.addListener((message: ToBackground, sender, sendResponse): boolean => {
  const origin = originOf(sender);
  switch (message.type) {
    case 'CREDENTIALS': {
      // Nothing is stored for a site the user has not said yes to. A session
      // appearing is also the first moment the question is worth asking - it
      // means the user is signed in and there is something to read.
      whenReady(() => {
        const site = message.credentials.bookmaker;
        // No page behind it, so there is no login it could belong to. Filing
        // it against the site in general is exactly the mix-up this avoids.
        if (origin === null) return;
        if (consent[site] === undefined) {
          const adapter = adapterFor(site);
          if (adapter !== null) void askOnceSignedIn(adapter, origin, message.credentials);
          return;
        }
        if (consent[site] !== true) return;
        void (async () => {
          // The debounce is there because the site re-sends its token on every
          // request. A session arriving where we had none is not that repeat -
          // it is the answer to a reconnect, and skipping it is what made
          // "Connect now" reload the tab and then sit there doing nothing.
          const resumed = connectionAt(site, origin) === null;
          const connection = await persistCredentials(site, origin, message.credentials);
          if (connection === null) return;
          if (resumed || dueForSync(connection)) void sync('incremental', site);
          else {
            const account = accountOf(connection);
            if (account !== null) void updateStatus(account, 'synced');
          }
        })();
      });
      return false;
    }
    case 'BANKING_CREDENTIALS': {
      whenReady(() => {
        if (origin === null || consent[message.banking.bookmaker] !== true) return;
        const connection = putBanking(message.banking.bookmaker, origin, message.banking);
        if (connection === null) return;
        // The second session is exactly what a refused money walk was missing,
        // so its arrival is worth a walk right away.
        const adapter = adapterFor(connection.bookmaker);
        if (adapter !== null) void importMoney({ adapter, connection });
      });
      return false;
    }
    case 'SITE_DETECTED': {
      whenReady(() => {
        if (adapterFor(message.bookmaker) === null) return;
        // Remember which mirror the user reaches this bookmaker on; the site's
        // own public endpoints are only served from it.
        noteOrigin(message.bookmaker, message.origin);
        void chrome.storage.local.set({ [siteOriginKey(message.bookmaker)]: message.origin });
        // Nothing is said about the site itself here. Merely being on it means
        // nothing yet - a signed-out visitor has no account to talk about, and a
        // popup opening over the login form is in the way of the one thing that
        // would help. The question waits for the session in `CREDENTIALS`.
        // Opening the site is the moment its data is worth re-reading: the user
        // is looking at the account, and the stored token is as fresh as it gets.
        if (consent[message.bookmaker] === true && dueConnections(message.bookmaker).length > 0) {
          void sync('incremental', message.bookmaker);
        }
      });
      return false;
    }
    case 'ENABLE_MIRROR': {
      void enableMirror(message.bookmaker, message.origin).then(() => sendResponse(undefined));
      return true; // async response
    }
    // Both answer only once the work is done, so the popup can wait on them
    // rather than re-reading a status that has not moved yet.
    case 'SET_CONSENT': {
      whenReady(() => {
        void setConsent(message.bookmaker, message.enabled).then(() => sendResponse(undefined));
      });
      return true; // async response
    }
    case 'FORGET_SITE': {
      whenReady(() => {
        void forgetSite(message.bookmaker).then(() => sendResponse(undefined));
      });
      return true; // async response
    }
    case 'RECONNECT': {
      void reconnect(message.bookmaker).then(() => sendResponse(undefined));
      return true; // async response
    }
    case 'LOGGED_OUT': {
      // Only about the page that said so. Another login at the same site may
      // still be signed in elsewhere, and its status is none of this tab's
      // business.
      const gone = origin === null ? null : connectionAt(message.bookmaker, origin);
      if (gone !== null) return false;
      const account = accountFor(message.bookmaker);
      if (account !== null) void updateStatus(account, 'logged_out');
      return false;
    }
    case 'BALANCE': {
      whenReady(() => {
        void (async () => {
          if (consent[message.bookmaker] !== true) return;
          const connection = origin === null ? null : connectionAt(message.bookmaker, origin);
          // A scraped number must not overwrite one the site's own API reports.
          // It is still worth having noticed: the API reading is only refreshed
          // on a sync or a panel poll, and neither runs once the last open slip
          // has settled - which is the moment the money actually moved. So the
          // page moving is what sends us back to the API for the real figure.
          const owner = connectionsOf(message.bookmaker).find((c) => apiBalances.has(c.key));
          if (owner !== undefined) {
            const adapter = adapterFor(message.bookmaker);
            if (adapter !== null) await importBalance({ adapter, connection: owner }, true);
            return;
          }
          // The page is scraped before the session that names the login has been
          // captured, so an early reading is filed unclaimed rather than dropped:
          // claimUnclaimed hands it over the moment the login is known. Dropping
          // it was permanent - the page only reports a figure when it changes.
          const account =
            (connection === null ? accountFor(message.bookmaker) : accountOf(connection)) ??
            (await soleKnownAccount(message.bookmaker));
          await storeBalance(
            {
              bookmaker: message.bookmaker,
              accountId: account?.accountId ?? UNCLAIMED,
              amount: message.balance.amount,
              currency: message.balance.currency,
              capturedAt: new Date().toISOString(),
            },
            connection,
          );
        })();
      });
      return false;
    }
    case 'ACTIVITY': {
      whenReady(() => {
        if (origin === null || consent[message.bookmaker] !== true) return;
        // Only the login on the page that acted. The other account at the same
        // site had nothing happen to it, and re-reading it here would cost a
        // walk for every bet its neighbour places.
        const connection = connectionAt(message.bookmaker, origin);
        if (connection !== null) accountActivity(connection);
      });
      return false;
    }
    case 'LOG': {
      // Ungated by consent: it says only which of its own calls a page made
      // and whether a session was readable, which is exactly what a user
      // deciding whether to say yes needs to be able to see.
      log(message.level, message.scope, message.message);
      return false;
    }
    case 'OPEN_BETS': {
      void (async () => {
        await ready;
        if (origin === null || consent[message.bookmaker] !== true) return;
        const adapter = adapterFor(message.bookmaker);
        // The slips belong to whoever is signed in on the page they came from,
        // so they wait for that page's session rather than being filed against
        // whichever login the site happens to have identified first.
        const connection = connectionAt(message.bookmaker, origin);
        if (adapter === null || connection === null) return;
        const account = await ensureAccount(adapter, connection);
        if (account === null) return;
        const open = adapter.parseOpen(message.payload, account);
        if (open.length === 0) return;
        // Every scrape re-sends the whole slip list, so only the rows the
        // database did not already hold count as new.
        const added = await putBets(open);
        // Silent when nothing was new: this fires on every scrape of an open
        // bookmaker tab, and announcing a finished sync each time made the
        // dashboard reload and toast over and over with the same numbers.
        if (added > 0) {
          broadcast({
            type: 'SYNC_PROGRESS',
            progress: { page: 0, totalNew: added, done: true, message: 'Open bets updated' },
          });
        }
      })();
      return false;
    }
    case 'SYNC_NOW': {
      // A just-woken worker has not restored its sessions yet; without the
      // wait there would be no connected account and the run would be a no-op.
      whenReady(() => void sync(message.mode));
      return false;
    }
    case 'SYNC_RATES': {
      void (async () => {
        try {
          await syncRates();
        } catch (err) {
          log('warn', 'rates', `rate feed unavailable: ${(err as Error).message}`);
        }
        // Whether or not a quote was added, the views were rendered against
        // the old currency and have to be redrawn against the new one.
        broadcast({
          type: 'SYNC_PROGRESS',
          progress: { page: 0, totalNew: 0, done: true, message: 'Rates updated' },
        });
      })();
      return false;
    }
    case 'REFRESH_OPEN': {
      void (async () => {
        sendResponse({
          type: 'OPEN_SNAPSHOT',
          snapshot: await refreshOpen(),
        } satisfies FromBackground);
      })();
      return true; // async response
    }
    case 'GET_STATUS': {
      void (async () => {
        await ready;
        // Counts, never rows: the popup only ever shows how many there are, and
        // this answer is re-asked on every progress message of a long backfill.
        // Reading the stores themselves made each of those a full history read.
        const [metas, betCounts, txCounts, settings, known] = await Promise.all([
          getAllSyncMeta(),
          getBetCounts(),
          getRecordCounts('transactions'),
          getSettings(),
          getKnownAccounts(),
        ]);
        sendResponse({
          type: 'STATUS',
          // Every adapter, not only the ones already read - a bookmaker the
          // user has not added yet still has something to say for itself.
          accounts: adapters().map((adapter) => {
            // The login on the page that asked, where the asker is on the site;
            // otherwise whichever of them is identified. A panel drawn in one
            // account's tab must describe that account, not its neighbour.
            const here =
              (origin === null ? null : connectionAt(adapter.id, origin)) ??
              anyConnectionOf(adapter.id);
            const signedIn = here !== null && here.accountId !== null;
            const current = here === null ? null : accountOf(here);
            // The signed-in login's own progress where we know it; otherwise the
            // site's most recent one, so a bookmaker still reports itself while
            // no session is live.
            const mine = metas.filter((m) => m.account.bookmaker === adapter.id);
            const entry =
              (current !== null
                ? mine.find((m) => m.account.accountId === current.accountId)
                : undefined) ?? mine[0];
            const meta = entry?.meta ?? null;
            // Switched off in the settings: nothing is read for it, and saying
            // "Connected" about an account the sync now walks past would be a lie.
            const paused =
              entry !== undefined && settings.hiddenAccounts.includes(accountKey(entry.account));
            const state = paused
              ? { tone: 'idle' as const, label: 'Switched off in settings' }
              : connectionOf(meta);
            // Bets read fine, deposits and bonuses never arrive: the site keeps
            // its cashier on a session of its own and hands that out only on the
            // page that uses it. "Connected" was true of the bets and a lie about
            // everything else, and the reason was admitted in a log nobody opens.
            const moneyWaiting =
              adapter.needsBankingSession === true && signedIn && here?.banking == null;
            return {
              bookmaker: adapter.id,
              name: nameOf(adapter.id),
              accountId: current?.accountId ?? null,
              knownAccounts: known.filter((a) => a.bookmaker === adapter.id).length,
              consent: consent[adapter.id],
              // A captured session alone does not mean anyone is signed in -
              // Stake's cookie rides along with a stranger's requests too. The
              // login being named is what makes it a session worth acting on.
              signedIn,
              meta,
              // Only ever in place of "Connected": a real failure is the more
              // urgent answer and keeps the line.
              connection:
                state.tone === 'ok' && moneyWaiting
                  ? {
                      tone: 'stuck' as const,
                      label: 'Open your payments page once to read deposits and bonuses',
                    }
                  : state,
              bets: betCounts[adapter.id] ?? 0,
              transactions: txCounts[adapter.id] ?? 0,
            };
          }),
          pending,
          syncing,
        } satisfies FromBackground);
      })();
      return true; // async response
    }
    default:
      return false;
  }
});

/**
 * Without this, bets only land while the site is open and happens to call its
 * API. The alarm keeps the history current for as long as the captured token
 * lives; once it expires the sync just flips the badge to logged_out and waits
 * for the user to be on the site again.
 */
const AUTO_SYNC = 'autoSync';
const AUTO_SYNC_MINUTES = 10;

/** Only when missing: re-creating resets the countdown, and this worker is woken often. */
const scheduleAutoSync = async (): Promise<void> => {
  const existing = await chrome.alarms.get(AUTO_SYNC);
  if (existing === undefined)
    chrome.alarms.create(AUTO_SYNC, { periodInMinutes: AUTO_SYNC_MINUTES });
};

/**
 * Nothing about this extension is visible until a bookmaker's site is opened, so
 * a fresh install would otherwise sit silent. The welcome page is where the user
 * says yes to the whole idea once, instead of being asked per site out of nowhere.
 */
/**
 * The page scripts, put into tabs that were already open.
 *
 * A registered content script is placed when a document loads, so a bookmaker
 * the user had open before the extension was updated stays unwatched until they
 * navigate. Nobody reloads a site they are
 * already using because they just installed something, so the panel never
 * appeared and the extension looked like it did nothing at all.
 */
const adoptOpenTabs = async (): Promise<void> => {
  const files = [
    { file: 'content.js', world: 'ISOLATED' as const },
    { file: 'inject.js', world: 'MAIN' as const },
  ];
  for (const tab of await chrome.tabs.query({})) {
    if (tab.id === undefined || tab.url === undefined) continue;
    if (bookmakerForUrl(tab.url) === null) continue;
    for (const { file, world } of files) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: [file],
          world,
        });
      } catch {
        /* the tab would not take it; its next navigation places it anyway */
      }
    }
  }
};

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    void chrome.tabs.create({ url: chrome.runtime.getURL('index.html#/welcome') });
  }
  whenReady(() => void adoptOpenTabs());
});

/**
 * The question follows the user to whatever tab they end up in. It is drawn in
 * the page, so a site that signed in while its tab sat in the background had the
 * panel put where nobody was looking - and all the user ever saw was a "?" on a
 * toolbar icon they had no reason to click.
 */
chrome.tabs.onActivated.addListener(({ tabId }) => {
  if (pending === null) return;
  void (async () => {
    const asked = pending;
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab?.url === undefined || bookmakerForUrl(tab.url) !== asked) return;
    await showPanel(asked);
  })();
});

/**
 * A single-page site changes its URL without ever loading a document again, so
 * the content script's one report at DOMContentLoaded is everything the
 * extension hears from a tab left open all evening. Watching the tab covers the
 * moves the page makes for itself; the debounce is the one SITE_DETECTED uses,
 * so a burst of route changes still costs a single run.
 */
chrome.tabs.onUpdated.addListener((_tabId, change) => {
  if (change.url === undefined) return;
  const bookmaker = bookmakerForUrl(change.url);
  if (bookmaker === null) return;
  whenReady(() => {
    if (consent[bookmaker] !== true) return;
    if (dueConnections(bookmaker).length === 0) return;
    void sync('incremental', bookmaker);
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== AUTO_SYNC) return;
  void (async () => {
    await ready;
    // Sites with no tab open are skipped inside the run itself.
    await sync('incremental');
  })();
});

/**
 * An account that already has synced history was connected before consent
 * existed - asking now would be a prompt about something already being tracked.
 */
const restoreConsent = async (
  accounts: readonly { account: AccountRef; meta: SyncMeta }[],
): Promise<void> => {
  const stored = await chrome.storage.local.get('consent');
  const value: unknown = stored.consent;
  if (value && typeof value === 'object') consent = value as typeof consent;
  const implied = accounts.filter(
    (a) => a.meta.lastSyncAt !== null && consent[a.account.bookmaker] === undefined,
  );
  if (implied.length === 0) return;
  consent = { ...consent, ...Object.fromEntries(implied.map((a) => [a.account.bookmaker, true])) };
  await chrome.storage.local.set({ consent });
};

/** The mirrors seen in earlier browser sessions, so a tab on one is known again. */
const restoreOrigins = async (): Promise<void> => {
  const stored = await chrome.storage.local.get(adapters().map((a) => siteOriginKey(a.id)));
  for (const adapter of adapters()) {
    const origin: unknown = stored[siteOriginKey(adapter.id)];
    if (typeof origin === 'string') noteOrigin(adapter.id, origin);
  }
};

ready = (async () => {
  await restoreState();
  await restoreOrigins();
  await scheduleAutoSync();
  const accounts = await getAllSyncMeta();
  await restoreConsent(accounts);
  for (const { account, meta } of accounts) {
    // A fresh worker has no run in flight, so a stored 'syncing' is a run that
    // was killed mid-way - Chromium stops the worker while a long backfill is
    // still walking. Left alone it would claim forever that bets are coming in.
    // Whatever that run managed to write is real, so the account counts as read.
    // Only asked of an account that claims to be syncing: every wake-up used to
    // read the whole bet history to answer it, for accounts that were all idle.
    const healed: SyncMeta =
      meta.lastStatus !== 'syncing'
        ? meta
        : (await hasBets(account))
          ? {
              ...meta,
              lastStatus: 'synced',
              lastSyncAt: meta.lastSyncAt ?? new Date().toISOString(),
            }
          : { ...meta, lastStatus: 'logged_out' };
    if (healed !== meta) await setSyncMeta(account, healed);
    // An account that never synced has no status to report - counting its
    // default would make the badge speak for a bookmaker that isn't connected.
    if (healed.lastSyncAt === null) continue;
    statuses = { ...statuses, [accountKey(account)]: healed.lastStatus };
  }
  setBadge();
})();
