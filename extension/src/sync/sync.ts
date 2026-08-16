/**
 * Shared sync machinery. Adapters own their paging, so what lives here is what
 * more than one of them needs: authenticated JSON with session-expiry
 * detection, the timestamp-cursor engine (for APIs that page by "placed before
 * X"), and the open-bets diff. Runs in the background SW.
 */

import {
  getBackfillState,
  getLatestPlacedAt,
  getPendingBets,
  putBets,
  setBackfillState,
} from '@betanal/shared';
import type { AccountRef, Bet, LiveScore } from '@betanal/shared';
import type {
  BookmakerAdapter,
  Credentials,
  SettledPage,
  SyncMode,
  SyncResult,
} from '../bookmakers/types';
import type { PageFetchResult, SyncProgress, ToContent } from '../messaging';

const MAX_PAGES = 1000;

/**
 * Thrown when an API rejects our captured session token (401/403). Sessions
 * expire server-side after a while idle; the background SW treats this as
 * "logged out" rather than a hard error and drops the stale token so it isn't
 * retried.
 */
export class SessionExpiredError extends Error {
  constructor(
    public readonly status: number,
    /** What the site said, and where we asked from. A bare status names neither. */
    detail = '',
  ) {
    super(`Session expired (HTTP ${status})${detail === '' ? '' : `: ${detail}`}`);
    this.name = 'SessionExpiredError';
  }
}

/**
 * No tab of the site is open, so its cookie session cannot be reached from here.
 * Deliberately not a `SessionExpiredError`: the session is very probably alive,
 * there is simply nowhere to ask from right now. Treating the two as one made
 * every run without an open tab drop a live token, reload a tab to get it back,
 * and fail again on the next run — the reconnect loop in the log.
 */
export class RelayUnavailableError extends Error {
  constructor(host: string) {
    super(`no ${host} tab open to make the request from`);
    this.name = 'RelayUnavailableError';
  }
}

/**
 * The site is asking us to stop for a while: a throttle, a 429, or a gateway
 * that is down. Its own class because the answer to it is neither "retry now"
 * nor "the session died" — it is to leave that bookmaker alone until it has had
 * time to recover, which is what the caller reads `retryAfterMs` for.
 */
export class RateLimitedError extends Error {
  constructor(
    public readonly retryAfterMs: number,
    reason: string,
  ) {
    super(reason);
    this.name = 'RateLimitedError';
  }
}

/** Long enough for a throttle window to pass without leaving the account cold all evening. */
export const RATE_LIMIT_BACKOFF_MS = 10 * 60_000;

/**
 * Hand the request to a tab of the same site and let its content script make it.
 *
 * A site whose session is a cookie only answers its own page: a request from the
 * service worker is never same-site with it, so the browser leaves the cookie off
 * and the site replies as if nobody were signed in. Null when no such tab is
 * open, which is not an error — there is simply nowhere to ask from.
 */
const fetchInPage = async (url: string, init: RequestInit): Promise<PageFetchResult | null> => {
  const message: ToContent = {
    type: 'PAGE_FETCH',
    url,
    init: {
      ...(init.method === undefined ? {} : { method: init.method }),
      ...(init.headers === undefined ? {} : { headers: init.headers as Record<string, string> }),
      ...(typeof init.body === 'string' ? { body: init.body } : {}),
    },
  };
  const { origin } = new URL(url);
  for (const tab of await chrome.tabs.query({ url: `${origin}/*` })) {
    if (tab.id === undefined) continue;
    try {
      // The top frame only: every frame runs its own content script, and each one
      // answering would make the same request as many times over.
      return (await chrome.tabs.sendMessage(tab.id, message, { frameId: 0 })) as PageFetchResult;
    } catch {
      /* no content script in that tab; try the next one */
    }
  }
  return null;
};

/**
 * What the site said when it refused. A status alone names no cause — a GraphQL
 * server answers 400 to a query it will not accept and puts the reason, the field
 * it choked on, in the body. Trimmed, because the body can be a whole page.
 */
const refusal = (body: string): string => {
  // A maintenance or error page says what it is in its title and then spends
  // several kilobytes on a base64 font. Cutting the first 300 characters of that
  // yields the font, which is unreadable and — being slightly different every
  // time — also defeats the log's "same line again" folding.
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(body)?.[1]?.trim();
  if (title !== undefined && title !== '') return title;
  return body.replace(/\s+/g, ' ').trim().slice(0, 300);
};

/**
 * A non-2xx answer as the caller should treat it. 429 is a throttle by
 * definition and 5xx is the site being unable to answer at all; both mean the
 * next request is no more likely to work than this one was, so they back the
 * whole bookmaker off rather than being retried on the next beat.
 */
const httpFailure = (status: number, url: string, body: string): Error => {
  const message = `HTTP ${status} for ${url}: ${refusal(body)}`;
  if (status === 429 || status >= 500) return new RateLimitedError(RATE_LIMIT_BACKOFF_MS, message);
  return new Error(message);
};

/**
 * Fetch + parse JSON, turning a rejected session into SessionExpiredError.
 *
 * `viaPage` is for sites the worker cannot speak to on its own (see above). With
 * no tab of theirs open there is nowhere to make the request from, which is
 * `RelayUnavailableError` and not an expiry: the run waits for the next visit.
 */
export const authedJson = async (
  url: string,
  init: RequestInit,
  viaPage = false,
): Promise<unknown> => {
  if (viaPage) {
    const relayed = await fetchInPage(url, init);
    if (relayed === null) throw new RelayUnavailableError(new URL(url).host);
    if (relayed.status === 401 || relayed.status === 403)
      throw new SessionExpiredError(
        relayed.status,
        `from the tab, ${refusal(relayed.body) || 'with an empty body'}`,
      );
    if (relayed.status === 0) throw new Error(`${url} unreachable from the page: ${relayed.body}`);
    if (relayed.status < 200 || relayed.status >= 300)
      throw httpFailure(relayed.status, url, relayed.body);
    return JSON.parse(relayed.body);
  }
  const res = await fetch(url, init);
  if (res.status === 401 || res.status === 403)
    throw new SessionExpiredError(
      res.status,
      `from the worker, ${refusal(await res.text()) || 'with an empty body'}`,
    );
  if (!res.ok) throw httpFailure(res.status, url, await res.text());
  return res.json();
};

/** Cursor APIs here expect `YYYY-MM-DDTHH:mm:ss` (no timezone suffix). */
export const toApiTimestamp = (iso: string): string =>
  new Date(iso).toISOString().replace(/\.\d+/, '').replace('Z', '').slice(0, 19);

const toMs = (iso: string): number => Date.parse(iso);

/** A minute ahead, so a bet placed this second is still strictly before it. */
export const nowCursor = (): string => toApiTimestamp(new Date(Date.now() + 60_000).toISOString());

export interface CursorSync {
  account: AccountRef;
  /** One page of settled bets placed strictly before the given cursor. */
  fetchPage(placedBefore: string): Promise<SettledPage>;
}

/**
 * Paginate a settled-bets API backwards in time and upsert what it returns.
 * Used by every bookmaker that pages by timestamp; ones that page by offset
 * write their own loop instead.
 */
export const runCursorSync = async (
  cfg: CursorSync,
  mode: SyncMode,
  onProgress: (progress: SyncProgress) => void,
): Promise<SyncResult> => {
  let added = 0;
  let skipped = 0;
  let pages = 0;

  // ── Phase A: forward catch ────────────────────────────────────────────────
  // Pull everything newer than the latest stored bet (and re-check the oldest
  // still-pending bet to pick up freshly-settled results). Cheap: usually 0-1
  // pages. Skipped on a fresh DB — Phase B handles the initial load.
  const latest = await getLatestPlacedAt(cfg.account);
  const pending = await getPendingBets(cfg.account);
  const oldestPending = pending.reduce<string | null>(
    (min, b) => (min === null || b.placedAt < min ? b.placedAt : min),
    null,
  );
  const forwardCandidates = [latest, oldestPending].filter((v): v is string => v !== null);
  const forwardBoundary =
    forwardCandidates.length === 0
      ? null
      : forwardCandidates.reduce((min, v) => (toMs(v) < toMs(min) ? v : min));

  if (forwardBoundary !== null) {
    let placedBefore = nowCursor();
    for (; pages < MAX_PAGES; ) {
      const page = await cfg.fetchPage(placedBefore);
      pages += 1;
      added += await putBets(page.bets);
      skipped += page.skipped;
      if (page.bets.length === 0 || page.nextCursor === null) break;
      if (toMs(page.nextCursor) <= toMs(forwardBoundary)) break;
      const nextBefore = toApiTimestamp(page.nextCursor);
      if (toMs(nextBefore) >= toMs(placedBefore)) break;
      placedBefore = nextBefore;
      onProgress({
        page: pages,
        totalNew: added,
        done: false,
        kind: 'bets',
        message: `Caught up new bets (page ${pages}, ${added} new)`,
      });
    }
  }

  // ── Phase B: resumable backward backfill ──────────────────────────────────
  // Walk old history newest→oldest, persisting the cursor after every page so
  // an interrupted run (MV3 SW termination, token expiry) resumes here instead
  // of restarting from "now" — which is why old history previously never loaded.
  // `full` mode restarts the backfill from scratch.
  if (mode === 'full')
    await setBackfillState(cfg.account, { oldestFetchedAt: null, historyComplete: false });
  let { oldestFetchedAt, historyComplete } = await getBackfillState(cfg.account);

  if (!historyComplete) {
    let placedBefore = oldestFetchedAt !== null ? toApiTimestamp(oldestFetchedAt) : nowCursor();
    for (; pages < MAX_PAGES; ) {
      const page = await cfg.fetchPage(placedBefore);
      pages += 1;
      added += await putBets(page.bets);
      skipped += page.skipped;

      if (page.bets.length === 0 || page.nextCursor === null) {
        await setBackfillState(cfg.account, { oldestFetchedAt, historyComplete: true });
        onProgress({
          page: pages,
          totalNew: added,
          done: false,
          kind: 'bets',
          message: `Backfill: reached end of history`,
        });
        break;
      }

      const nextBefore = toApiTimestamp(page.nextCursor);
      oldestFetchedAt = page.nextCursor;
      // Persist before the advance check so progress survives termination.
      await setBackfillState(cfg.account, { oldestFetchedAt, historyComplete: false });
      // Cursor not advancing (clustered timestamps within one second) → stop to
      // avoid an infinite loop; treat as complete.
      if (toMs(nextBefore) >= toMs(placedBefore)) {
        await setBackfillState(cfg.account, { oldestFetchedAt, historyComplete: true });
        break;
      }
      placedBefore = nextBefore;
      onProgress({
        page: pages,
        totalNew: added,
        done: false,
        kind: 'bets',
        message: `Backfilling history (page ${pages}, ${added} new)`,
      });
    }
  }

  return { added, pages, skipped };
};

export interface OpenBetsSync {
  bets: Bet[];
  added: number;
  /** In-play counts that came with the same payload, keyed by event id. */
  scores: Record<string, LiveScore[]>;
}

/**
 * Fetch the currently open bets and upsert them. Throws on a dead token — the
 * panel needs to know, while a full sync swallows it so the run still succeeds.
 */
export const syncOpenBets = async (
  adapter: BookmakerAdapter,
  creds: Credentials,
  account: AccountRef,
): Promise<OpenBetsSync> => {
  const { bets, scores } = await adapter.openBets(creds, account);
  return { bets, added: bets.length > 0 ? await putBets(bets) : 0, scores: scores ?? {} };
};

/**
 * Ids that were open at the previous poll and are missing now — i.e. just
 * settled. Deliberately not diffed against all locally-pending bets: those
 * include old records the paged endpoint never returns, so the diff would be
 * non-empty on every single poll.
 */
export const disappearedBetIds = (
  previousOpenIds: readonly string[],
  open: readonly Bet[],
): string[] => {
  const stillOpen = new Set(open.map((b) => b.betId));
  return previousOpenIds.filter((id) => !stillOpen.has(id));
};
