/**
 * Content script (ISOLATED world). Relays credentials captured by the MAIN-world
 * bridge to the background service worker, and reports login state.
 *
 * The bridge is declared in the manifest with `"world": "MAIN"` rather than
 * appended to the page as a <script>: Stake serves `script-src 'strict-dynamic'`,
 * under which a tag we add carries no nonce and is refused, so nothing could be
 * read there at all. A manifest-declared script is placed by the browser and CSP
 * does not apply to it.
 */

import type { Bookmaker } from '@betanal/shared';
import {
  bookmakerForHost,
  isPageBankingMessage,
  isPageBridgeMessage,
  isPageDataMessage,
  type PageFetchInit,
  type PageFetchResult,
  type ToBackground,
  type ToContent,
} from '../messaging';
import { scrapeBalance } from './balance';
import { showPanel } from './overlay';

/**
 * Which bookmaker this page is. Known from the address on the sites we ship; on
 * a mirror the user enabled by hand it stays null until the page's own API calls
 * name it, which the bridge does in every message it sends.
 */
let BOOKMAKER = bookmakerForHost(window.location.host);

/**
 * The page itself rather than one of its frames. This script runs in all frames
 * because the site's authenticated calls are made from them, but everything that
 * describes *the page* belongs to the page alone: a bookmaker embeds a dozen
 * frames, and each one was announcing the visit, scraping the balance and running
 * a MutationObserver over its own subtree. The origin a frame reports is its own,
 * too, so a payment iframe was filing the visit under the wrong address.
 */
const TOP = window.top === window;

// When the extension is reloaded/updated, this content script keeps running in
// the page but its chrome.runtime context is gone. Any chrome.* call then throws
// "Extension context invalidated" synchronously (not as a rejected promise). We
// detect that, tear down our watchers, and stop calling chrome.* APIs.
let observer: MutationObserver | null = null;
let balanceInterval: number | undefined;

const teardown = (): void => {
  observer?.disconnect();
  observer = null;
  if (balanceInterval !== undefined) {
    clearInterval(balanceInterval);
    balanceInterval = undefined;
  }
};

const contextValid = (): boolean => {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
};

const send = (message: ToBackground): void => {
  if (!contextValid()) {
    teardown();
    return;
  }
  try {
    chrome.runtime.sendMessage(message).catch(() => {
      /* background may be asleep; it wakes on next event */
    });
  } catch {
    // Orphaned after an extension reload - stop trying.
    teardown();
  }
};

/**
 * The bridge has named the site from its own API calls. On a mirror this is the
 * first moment we know what we are looking at, so the visit is announced and the
 * balance watched from here rather than on load.
 */
const adopt = (named: Bookmaker): void => {
  if (BOOKMAKER !== null) return;
  BOOKMAKER = named;
  reportInitialState();
  startBalanceWatcher();
};

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) return;
  if (isPageBridgeMessage(event.data)) {
    adopt(event.data.bookmaker);
    send({
      type: 'CREDENTIALS',
      credentials: { bookmaker: event.data.bookmaker, fields: event.data.fields },
    });
    return;
  }
  if (isPageBankingMessage(event.data)) {
    adopt(event.data.bookmaker);
    send({
      type: 'BANKING_CREDENTIALS',
      banking: { bookmaker: event.data.bookmaker, fields: event.data.fields },
    });
    return;
  }
  if (!isPageDataMessage(event.data)) return;
  // Ahead of the bookmaker check on purpose: the lines worth reading most are
  // the ones from before the site was identified.
  if (event.data.kind === 'log') {
    const line = event.data.payload as { level?: unknown; scope?: unknown; message?: unknown };
    if (typeof line.scope === 'string' && typeof line.message === 'string') {
      send({
        type: 'LOG',
        level: line.level === 'warn' || line.level === 'error' ? line.level : 'info',
        scope: line.scope,
        message: line.message,
      });
    }
    return;
  }
  if (BOOKMAKER === null) return;
  if (event.data.kind === 'open-bets') {
    send({ type: 'OPEN_BETS', bookmaker: BOOKMAKER, payload: event.data.payload });
    return;
  }
  if (event.data.kind === 'activity') {
    send({ type: 'ACTIVITY', bookmaker: BOOKMAKER });
  }
});

// Heuristic logged-out detection: a site shows a login/registration entry point
// when no session exists, and an account menu when one does. Weak on its own,
// which is why nothing is read on the strength of it - it only decides whether
// the popup is allowed to tell someone to sign in.
const looksLoggedOut = (): boolean => {
  const loginLink = document.querySelector(
    '[href*="login" i], [data-testid*="login" i], .login, #login',
  );
  const accountMenu = document.querySelector(
    '[data-testid*="account" i], [class*="account" i], [href*="logout" i]',
  );
  return loginLink !== null && accountMenu === null;
};

/**
 * Said again whenever it changes, not once at load. Sites sign in through a
 * modal without navigating anywhere, so a page that showed a login form when it
 * loaded goes on saying so for the rest of the visit - which is how an account
 * that was plainly signed in kept being told to sign in.
 */
let lastSignedOut: boolean | null = null;

const reportLogin = (): void => {
  if (BOOKMAKER === null || !TOP) return;
  const signedOut = looksLoggedOut();
  if (signedOut === lastSignedOut) return;
  lastSignedOut = signedOut;
  send({ type: 'PAGE_LOGIN', bookmaker: BOOKMAKER, signedOut });
};

/**
 * The background asks for the panel where it used to ask Chrome for the toolbar
 * popup: in the page it is ours to shape, and it appears over the site the user
 * is already looking at rather than under the toolbar.
 */
/**
 * A request the background cannot make for itself. A site that authenticates
 * with a session cookie only answers its own page: an extension is never
 * same-site with it, so the cookie is left off and the site replies as if nobody
 * were signed in. Made from here instead, where the user's own session goes out.
 *
 * Only ever the site's own address: the background builds the URL from the API
 * base this very page handed it, and what comes back is relayed unread.
 */
const pageFetch = async (url: string, init: PageFetchInit): Promise<PageFetchResult> => {
  try {
    const res = await fetch(url, { ...init, credentials: 'include' });
    return { status: res.status, body: await res.text() };
  } catch (err) {
    return { status: 0, body: (err as Error).message };
  }
};

chrome.runtime.onMessage.addListener((message: ToContent, _sender, sendResponse): boolean => {
  if (message.type === 'SHOW_PANEL') {
    showPanel(message.bookmaker);
    return false;
  }
  void pageFetch(message.url, message.init).then(sendResponse);
  return true; // async response
});

const reportInitialState = (): void => {
  if (BOOKMAKER === null || !TOP) return;
  // Announce every visit: the background answers with the consent prompt the
  // first time it sees a site, and ignores it afterwards.
  send({ type: 'SITE_DETECTED', bookmaker: BOOKMAKER, origin: window.location.origin });
  reportLogin();
};

// ── Balance scraping ─────────────────────────────────────────────────────────
// The balance is rendered into the page (no API exposes it). We re-scrape on DOM
// mutations (throttled) and on a slow interval, sending only when it changes.
let lastBalanceAmount: number | null = null;
let scrapeScheduled = false;

const reportBalance = (): void => {
  if (BOOKMAKER === null) return;
  const balance = scrapeBalance();
  if (balance === null || balance.amount === lastBalanceAmount) return;
  lastBalanceAmount = balance.amount;
  send({ type: 'BALANCE', bookmaker: BOOKMAKER, balance });
};

const scheduleScrape = (): void => {
  if (scrapeScheduled) return;
  scrapeScheduled = true;
  setTimeout(() => {
    scrapeScheduled = false;
    reportBalance();
    // The same redraw that puts a balance on screen is the one that replaces the
    // login link with the account menu.
    reportLogin();
  }, 1500);
};

const startBalanceWatcher = (): void => {
  if (!TOP) return;
  reportBalance();
  if (document.body) {
    observer = new MutationObserver(scheduleScrape);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
  balanceInterval = setInterval(reportBalance, 30_000) as unknown as number;
};

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  reportInitialState();
  startBalanceWatcher();
} else {
  window.addEventListener('DOMContentLoaded', () => {
    reportInitialState();
    startBalanceWatcher();
  });
}
