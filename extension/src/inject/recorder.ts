/**
 * Records a site's own API calls into a HAR file, so that adding a bookmaker
 * does not start with DevTools.
 *
 * The DevTools route asks a contributor to open F12, find the Network tab, tick
 * Preserve log, know that the default export strips the sign-in headers, turn on
 * a preference buried three levels deep to get an export that does not, and then
 * find the file. Every one of those is a place to stop. This is one click in the
 * popup, clicking through the account as usual, and a second click.
 *
 * It runs in the page's own world - the same place `inject.ts` runs for sites we
 * already read - because that is the only context where the site's `fetch` and
 * `XMLHttpRequest` can be seen at all.
 *
 * Header VALUES are never recorded, only their names. Which header carried the
 * session is the thing an adapter is written against; what was in it is the
 * thing that must never be shared. The sanitiser still runs over the result
 * afterwards, as a second net rather than the only one.
 */

/** Survives navigation inside the tab, which is how a bet history is browsed. */
const STORE_KEY = 'bettracker-recording';

/** Enough to walk several pages of history, not enough to fill sessionStorage. */
const MAX_ENTRIES = 300;
const MAX_BODY = 200_000;
const MAX_TOTAL = 4_000_000;

/** Only answers a parser could be written against. A font shows an adapter nothing. */
const KEEP_TYPE = /(json|graphql|text\/plain)/i;

const REDACTED = 'REDACTED';

interface NameValue {
  name: string;
  value: string;
}

export interface RecordedEntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    headers: NameValue[];
    queryString: NameValue[];
    postData?: { mimeType: string; text: string };
  };
  response: {
    status: number;
    statusText: string;
    headers: NameValue[];
    content: { mimeType: string; text: string };
  };
}

const clip = (text: string): string => (text.length > MAX_BODY ? text.slice(0, MAX_BODY) : text);

/**
 * The markup with its inline scripts emptied out.
 *
 * A site that draws its history as markup is the whole reason the page is kept,
 * but the bootstrap script beside that markup routinely carries the session the
 * page was loaded with - and this file is handed to a coding tool before the
 * sanitiser has ever seen it. A JSON block is left alone: on a site that renders
 * server-side, that is where the history actually is.
 */
export const withoutInlineScripts = (html: string): string =>
  html.replace(/<script\b([^>]*)>[\s\S]*?<\/script>/gi, (whole, attributes: string) =>
    /type\s*=\s*["']?[^"'>]*json/i.test(attributes) ? whole : `<script${attributes}></script>`,
  );

const queryOf = (url: string): NameValue[] => {
  try {
    return [...new URL(url).searchParams].map(([name, value]) => ({ name, value }));
  } catch {
    return [];
  }
};

/**
 * The names the page sent, each standing in for a value we deliberately never
 * read. Written as REDACTED rather than left out so the recording still says
 * which header the request carried.
 */
const headerNames = (headers: HeadersInit | undefined): NameValue[] => {
  const names: string[] = [];
  if (headers instanceof Headers) headers.forEach((_value, name) => names.push(name));
  else if (Array.isArray(headers)) for (const [name] of headers) names.push(name);
  else if (headers !== undefined) names.push(...Object.keys(headers));
  return names.map((name) => ({ name, value: REDACTED }));
};

/**
 * Words that only a betting account's own answers carry.
 *
 * Deliberately not `odds`: a scores site prints odds all over its pages, and a
 * check that a live-scores site passes is a check that answers nothing. What a
 * scores site never has is the reader's own money in it - a stake, a balance, a
 * payout - and that is the whole difference being asked about.
 */
const BETTING = /"[^"]*(stake|betslip|bet_slip|payout|wager|balance|withdraw|deposit)/i;

/**
 * Whether anything recorded looks like a betting account at all.
 *
 * A recording of the wrong kind of site parses to nothing, and without this the
 * reader finds that out five steps later, after a clone, a coding tool and a
 * build. It is a hint and never a gate: a site that names its fields in Slovene
 * would fail this and still be perfectly readable.
 */
export const looksLikeBetting = (entries: readonly RecordedEntry[]): boolean =>
  entries.some((entry) => BETTING.test(entry.response.content.text));

/** HAR 1.2, in the shape `scripts/sanitize-har.mjs` reads. */
export const harOf = (entries: readonly RecordedEntry[]) => ({
  log: {
    version: '1.2',
    creator: { name: 'bettracker-recorder', version: '1' },
    entries: [...entries],
  },
});

// ── Everything below only means anything inside a page ───────────────────────

const read = (): RecordedEntry[] => {
  try {
    return JSON.parse(sessionStorage.getItem(STORE_KEY) ?? '[]') as RecordedEntry[];
  } catch {
    return [];
  }
};

const entries: RecordedEntry[] = typeof window === 'undefined' ? [] : read();
let size = entries.reduce((total, entry) => total + entry.response.content.text.length, 0);
let writeTimer = 0;

const flush = (): void => {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(entries));
  } catch {
    /* the quota is the cap: keep what is in memory and stop growing the store */
  }
};

const record = (entry: RecordedEntry): void => {
  if (entries.length >= MAX_ENTRIES || size >= MAX_TOTAL) return;
  size += entry.response.content.text.length;
  entries.push(entry);
  window.clearTimeout(writeTimer);
  writeTimer = window.setTimeout(flush, 500);
};

interface Sent {
  startedDateTime: string;
  at: number;
  method: string;
  url: string;
  headers: NameValue[];
  body: string | null;
}

const finish = (sent: Sent, response: Omit<RecordedEntry['response'], 'headers'>): void => {
  if (!KEEP_TYPE.test(response.content.mimeType) || response.content.text === '') return;
  record({
    startedDateTime: sent.startedDateTime,
    time: Math.round(performance.now() - sent.at),
    request: {
      method: sent.method,
      url: sent.url,
      httpVersion: 'HTTP/1.1',
      headers: sent.headers,
      queryString: queryOf(sent.url),
      ...(sent.body === null
        ? {}
        : { postData: { mimeType: 'application/json', text: clip(sent.body) } }),
    },
    response: {
      ...response,
      headers: [{ name: 'content-type', value: response.content.mimeType }],
      content: { ...response.content, text: clip(response.content.text) },
    },
  });
};

/**
 * The page as the server sent it. A site that draws its bet history as markup
 * makes no API call to record, and without this the recording would be empty
 * with nothing to say why - which is the one thing the sanitiser reports back.
 */
const pageEntry = (): RecordedEntry => ({
  startedDateTime: new Date().toISOString(),
  time: 0,
  request: {
    method: 'GET',
    url: window.location.href,
    httpVersion: 'HTTP/1.1',
    headers: [],
    queryString: queryOf(window.location.href),
  },
  response: {
    status: 200,
    statusText: 'OK',
    headers: [{ name: 'content-type', value: 'text/html' }],
    content: {
      mimeType: 'text/html',
      text: clip(withoutInlineScripts(document.documentElement.outerHTML)),
    },
  },
});

/**
 * Saved by the page rather than by the extension: the extension asks for no
 * download permission, and the file is built where the recording already lives.
 */
const save = (): SaveResult => {
  const har = harOf([...entries, pageEntry()]);
  const verdict = { calls: entries.length, betting: looksLikeBetting(har.log.entries) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(har)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${window.location.hostname}.har`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  entries.length = 0;
  size = 0;
  try {
    sessionStorage.removeItem(STORE_KEY);
  } catch {
    /* nothing left to clear */
  }
  return verdict;
};

/** What the popup says about the file, read off the recording it just wrote. */
export interface SaveResult {
  /** API calls recorded, the page itself aside. */
  calls: number;
  betting: boolean;
}

declare global {
  interface Window {
    /** Called by the popup's Stop button, through `chrome.scripting`. */
    __betTrackerSaveRecording?: () => SaveResult;
  }
}

const install = (): void => {
  // Injected once on the click and again by the registered script on every
  // navigation; the second copy would double every entry.
  if (window.__betTrackerSaveRecording !== undefined) return;
  window.__betTrackerSaveRecording = save;
  window.addEventListener('pagehide', flush);

  const originalFetch = window.fetch;
  window.fetch = function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    let sent: Sent | null = null;
    try {
      const request = input instanceof Request ? input : null;
      sent = {
        startedDateTime: new Date().toISOString(),
        at: performance.now(),
        method: (request?.method ?? init?.method ?? 'GET').toUpperCase(),
        url: new URL(request?.url ?? String(input), window.location.href).href,
        headers: headerNames(request?.headers ?? init?.headers),
        body: typeof init?.body === 'string' ? init.body : null,
      };
    } catch {
      /* never break the page over a recording */
    }
    // Always on `window`: a page calling bare `fetch(url)` hands this bundle
    // `undefined`, and `fetch` invoked on anything else throws.
    const promise = originalFetch.apply(window, [input, init] as Parameters<typeof originalFetch>);
    if (sent !== null) {
      const started = sent;
      promise
        .then((response) => {
          const mimeType = response.headers.get('content-type') ?? '';
          if (!KEEP_TYPE.test(mimeType)) return;
          return response
            .clone()
            .text()
            .then((text) => {
              finish(started, {
                status: response.status,
                statusText: response.statusText,
                content: { mimeType, text },
              });
            });
        })
        .catch(() => {
          /* the site's own failure, already its own problem */
        });
    }
    return promise;
  };

  const urlKey = Symbol('btRecUrl');
  const sentKey = Symbol('btRecSent');

  interface TrackedXHR extends XMLHttpRequest {
    [urlKey]?: string;
    [sentKey]?: Sent;
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function open(
    this: TrackedXHR,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ): void {
    try {
      this[urlKey] = new URL(String(url), window.location.href).href;
      this[sentKey] = {
        startedDateTime: new Date().toISOString(),
        at: performance.now(),
        method: method.toUpperCase(),
        url: this[urlKey],
        headers: [],
        body: null,
      };
    } catch {
      /* not a URL we can resolve; leave it unrecorded rather than break open() */
    }
    return originalOpen.apply(this, [method, url, ...rest] as Parameters<typeof originalOpen>);
  };

  const originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function setRequestHeader(
    this: TrackedXHR,
    name: string,
    value: string,
  ): void {
    this[sentKey]?.headers.push({ name, value: REDACTED });
    return originalSetHeader.call(this, name, value);
  };

  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function send(
    this: TrackedXHR,
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    const sent = this[sentKey];
    if (sent !== undefined) {
      if (typeof body === 'string') sent.body = body;
      this.addEventListener('load', () => {
        try {
          const mimeType = this.getResponseHeader('content-type') ?? '';
          if (!KEEP_TYPE.test(mimeType)) return;
          finish(sent, {
            status: this.status,
            statusText: this.statusText,
            content: { mimeType, text: this.responseText },
          });
        } catch {
          /* a responseType this reader cannot read as text */
        }
      });
    }
    return originalSend.call(this, body ?? null);
  };
};

if (typeof window !== 'undefined') install();
