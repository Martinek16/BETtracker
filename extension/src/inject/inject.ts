/**
 * MAIN-world bridge. Injected into the page by the content script so it runs in
 * the site's own JS context. It observes the page's own authenticated calls and
 * forwards the auth headers to the content script.
 *
 * Everything site-specific comes from `bookmakers/capture` — that file has no
 * runtime imports on purpose, because anything pulled in here would resolve
 * against the *page's* globals (its IndexedDB, its fetch) rather than ours.
 *
 * It never makes its own requests — it only reads headers the page already sends.
 */

import { CAPTURE_RULES, bookmakerForHost } from '../bookmakers/capture';
import type { CaptureRule } from '../bookmakers/capture';

const BANKING_TAG = 'bettracker-banking';
const BRIDGE_TAG = 'bettracker-bridge';
const DATA_TAG = 'bettracker-data';

/**
 * The one rule that owns this page. Taken from the hostname when it is one we
 * ship, and otherwise left open until a request identifies the site — a mirror
 * we have never seen has an address that says nothing but makes the very same
 * calls, and that is what we read it from.
 */
let rule: CaptureRule | null =
  CAPTURE_RULES.find((r) => r.bookmaker === bookmakerForHost(window.location.hostname)) ?? null;

let lastSerialized = '';
let lastBankingSerialized = '';

const headerValue = (headers: HeadersInit | undefined, name: string): string | null => {
  if (!headers) return null;
  const lower = name.toLowerCase();
  if (headers instanceof Headers) return headers.get(name);
  if (Array.isArray(headers)) {
    for (const [k, v] of headers) if (k.toLowerCase() === lower) return v;
    return null;
  }
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return String(v);
  }
  return null;
};

const emitData = (kind: string, payload: unknown): void => {
  window.postMessage({ tag: DATA_TAG, kind, payload }, window.location.origin);
};

/**
 * Says something, in the app rather than in the bookmaker's console. This script
 * is the one part of the extension running inside the site's page, so anything
 * it printed would be printed to the site — read by whoever is looking at it,
 * and by the site's own scripts. It is relayed to the app's log instead.
 */
const report = (level: 'info' | 'warn', scope: string, message: string): void => {
  emitData('log', { level, scope, message });
};

/**
 * Rules read the host off the URL, so a relative one has to be resolved first —
 * a site calling its own API writes `/_api/graphql`, not the full address.
 */
const absolute = (url: string): string => new URL(url, window.location.href).href;

const isRelayUrl = (url: string): boolean => rule?.openBets?.(url) === true;

/** Each operation once: the site repeats them constantly while you browse. */
const seenOperations = new Set<string>();

/**
 * Watches the page's own API calls for the one thing worth saying: that they are
 * happening and carry no session we can read, which is why an account reads as
 * signed out while the site plainly shows it signed in. Said once per operation,
 * never with the answer, so no balance or address is ever recorded. Naming every
 * call instead would bury the rest of the log — a Stake page makes dozens.
 */
const observe = (url: string, body: unknown): void => {
  if (rule?.observe === undefined || typeof body !== 'string' || lastSerialized !== '') return;
  const name = rule.observe(url, body);
  if (name === null || seenOperations.has(name)) return;
  seenOperations.add(name);
  report('warn', rule.bookmaker, `no session on the page's ${name} call`);
};

/**
 * The user just did something to their account. Sent as the bare fact — no URL,
 * no body, no answer — so the background can re-read that login straight away
 * instead of waiting for the next alarm. It debounces this; the page can fire
 * several in a row while a slip is confirmed.
 */
const noteActivity = (url: string, body: unknown): void => {
  if (rule?.activity === undefined || typeof body !== 'string') return;
  if (rule.activity(url, body)) emitData('activity', null);
};

const tryCapture = (url: string, getHeader: (name: string) => string | null): void => {
  // Until one rule has answered, every rule is asked. They match on the API the
  // request goes to, so whichever answers is the platform this page runs on.
  for (const candidate of rule === null ? CAPTURE_RULES : [rule]) {
    const fields = candidate.auth(url, getHeader);
    if (fields !== null) {
      rule = candidate;
      const serialized = JSON.stringify(fields);
      if (serialized !== lastSerialized) {
        lastSerialized = serialized;
        // Not logged here: every frame of the site runs its own copy of this
        // script and the token is re-issued while browsing, so this point is
        // reached many times for one sign-in. The background says it once.
        window.postMessage(
          { tag: BRIDGE_TAG, bookmaker: candidate.bookmaker, fields },
          window.location.origin,
        );
      }
    }
    const banking = candidate.banking?.(url, getHeader) ?? null;
    if (banking !== null) {
      const serialized = JSON.stringify(banking);
      if (serialized !== lastBankingSerialized) {
        lastBankingSerialized = serialized;
        window.postMessage(
          { tag: BANKING_TAG, bookmaker: candidate.bookmaker, fields: banking },
          window.location.origin,
        );
      }
    }
  }
};

// ── Patch fetch ──────────────────────────────────────────────────────────────
const originalFetch = window.fetch;
window.fetch = function patchedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  let capturedUrl = '';
  try {
    const url = absolute(input instanceof Request ? input.url : String(input));
    capturedUrl = url;
    const reqHeaders = input instanceof Request ? input.headers : init?.headers;
    const getHeader = (name: string): string | null =>
      input instanceof Request ? input.headers.get(name) : headerValue(reqHeaders, name);
    tryCapture(url, getHeader);
    observe(url, init?.body);
    noteActivity(url, init?.body);
  } catch {
    /* never break the page */
  }
  // Always on `window`, never on the call site's `this`. This bundle is strict,
  // so a page calling bare `fetch(url)` hands us `undefined`, and `fetch` invoked
  // on anything but the window throws "Illegal invocation" — which would take the
  // site's own request down with it.
  const promise = originalFetch.apply(window, [input, init] as Parameters<typeof originalFetch>);
  if (capturedUrl !== '' && isRelayUrl(capturedUrl)) {
    promise
      .then((res) => res.clone().json())
      .then((json) => emitData('open-bets', json))
      .catch(() => {
        /* response not JSON or already consumed; ignore */
      });
  }
  return promise;
};

// ── Patch XMLHttpRequest ─────────────────────────────────────────────────────
const OriginalXHR = window.XMLHttpRequest;
const urlKey = Symbol('btUrl');
const headersKey = Symbol('btHeaders');

interface TrackedXHR extends XMLHttpRequest {
  [urlKey]?: string;
  [headersKey]?: Record<string, string>;
}

const originalOpen = OriginalXHR.prototype.open;
OriginalXHR.prototype.open = function open(
  this: TrackedXHR,
  method: string,
  url: string | URL,
  ...rest: unknown[]
): void {
  try {
    this[urlKey] = absolute(String(url));
  } catch {
    /* not a URL we can resolve; leave it uncaptured rather than break open() */
  }
  this[headersKey] = {};
  return originalOpen.apply(this, [method, url, ...rest] as Parameters<typeof originalOpen>);
};

const originalSetHeader = OriginalXHR.prototype.setRequestHeader;
OriginalXHR.prototype.setRequestHeader = function setRequestHeader(
  this: TrackedXHR,
  name: string,
  value: string,
): void {
  const store = this[headersKey];
  if (store) store[name.toLowerCase()] = value;
  return originalSetHeader.call(this, name, value);
};

const originalSend = OriginalXHR.prototype.send;
OriginalXHR.prototype.send = function send(this: TrackedXHR, body?: Document | XMLHttpRequestBodyInit | null): void {
  try {
    const url = this[urlKey];
    const store = this[headersKey] ?? {};
    if (url) {
      tryCapture(url, (name: string): string | null => store[name.toLowerCase()] ?? null);
      observe(url, body);
      noteActivity(url, body);
    }
    if (url && isRelayUrl(url)) {
      this.addEventListener('load', () => {
        try {
          emitData('open-bets', JSON.parse(this.responseText));
        } catch {
          /* response not JSON; ignore */
        }
      });
    }
  } catch {
    /* never break the page */
  }
  return originalSend.call(this, body ?? null);
};
