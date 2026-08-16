/**
 * Strips a HAR recording down to something safe to hand to someone else.
 *
 * A HAR captured while signed in to a bookmaker is a complete copy of the
 * session: the cookies, the bearer tokens, the account number, the name on the
 * account and every deposit ever made. It is the single most dangerous file in
 * this workflow, and the whole contribution flow depends on one being shared.
 *
 * So this errs towards destroying too much. Header and query values that look
 * like credentials go regardless of whether they are; identifiers are replaced
 * with a hash of themselves, which keeps cross-references inside the file
 * intact without keeping the identity; anything that is not a JSON or text
 * response is dropped whole, because a parser is never written against a font.
 *
 * Amounts and odds are deliberately kept. They are what an adapter has to be
 * proven against, and a stake of 12.50 with no name and no account behind it
 * identifies nobody.
 *
 * Usage: pnpm sanitize-har              picks up the recording you just saved
 *        pnpm sanitize-har <in.har> [out.har|outDir]
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Header and query names whose value is dropped outright. Matched loosely: a
 * site inventing `x-punter-session` should be covered without an edit here.
 */
const SECRET_NAME =
  /(cookie|auth|token|session|secret|password|passwd|signature|sig|key|bearer|csrf|xsrf|jwt|otp|pin|credential)/i;

/**
 * Keys naming a person or an account. Replaced with a stable stand-in rather
 * than removed: an adapter often matches a bet's owner against the account it
 * was fetched for, and a fixture with the link cut would not exercise that.
 */
const IDENTITY_KEY =
  /^(.*(user|player|customer|account|profile|member|punter|owner|client)?(id|uuid|guid|ref|number|no)|.*(first|last|full|display|nick|screen|login|user|real)name|username|nickname|login|email|mail|phone|mobile|msisdn|iban|bic|swift|address|street|city|zip|zipcode|postcode|postalcode|ssn|taxid|passport|dob|birthdate|dateofbirth|documentnumber)$/i;

/** Keys that are a secret wherever they turn up, including inside a body. */
const SECRET_KEY = SECRET_NAME;

/** Shapes that are a credential or an identity no matter what key holds them. */
const SECRET_VALUE = [
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, // JWT
  /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, // IBAN
  /\b(?:\d[ -]?){13,19}\b/g, // card number
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, // email
  /\b[0-9a-f]{32,}\b/gi, // hex token
  /\b[A-Za-z0-9_-]{40,}\b/g, // opaque token
];

/** Response types worth keeping. Everything else is noise or a binary. */
const KEEP_TYPE = /(json|javascript|text\/plain|graphql)/i;

const REDACTED = 'REDACTED';

/**
 * The same input always yields the same stand-in, so two records that referred
 * to one account still do. Truncated because the length is not the point and a
 * 64-character hash makes a fixture unreadable.
 */
const pseudonym = (value, salt = '') =>
  createHash('sha256').update(`${salt}${String(value)}`).digest('hex').slice(0, 12);

let redactions = 0;
const redact = (replacement) => {
  redactions += 1;
  return replacement;
};

/** Scrubs the shapes that are dangerous wherever they appear in a string. */
const scrubText = (text) =>
  SECRET_VALUE.reduce(
    (acc, pattern) => acc.replace(pattern, (match) => redact(`x-${pseudonym(match)}`)),
    text,
  );

/**
 * An identifier keeps its type where it can. A numeric id turned into a string
 * would change what the adapter's parser is handed, and the fixture would stop
 * resembling the response it came from.
 */
const standIn = (key, value) => {
  if (typeof value === 'number') return Number.parseInt(pseudonym(value, key).slice(0, 9), 16);
  if (typeof value !== 'string' || value === '') return value;
  // A stand-in that still looked like an email would be caught by the leak
  // check on the way out, so the key name is left to say what the field was.
  return pseudonym(value, key);
};

/** Walks a parsed body, redacting by key and scrubbing every string it passes. */
const scrubValue = (value, key = '') => {
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, key));
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [childKey, scrubValue(child, childKey)]),
    );
  if (SECRET_KEY.test(key)) return value === null ? null : redact(REDACTED);
  if (IDENTITY_KEY.test(key) && value !== null) return redact(standIn(key, value));
  return typeof value === 'string' ? scrubText(value) : value;
};

/**
 * Bodies arrive as text and are usually JSON. Re-parsing lets the key rules
 * apply; anything that will not parse still gets the value scrubbers, because
 * an unparseable body is no reason to publish a token in it.
 */
const scrubBody = (text) => {
  if (typeof text !== 'string' || text === '') return text;
  try {
    return JSON.stringify(scrubValue(JSON.parse(text)));
  } catch {
    return scrubText(text);
  }
};

const scrubHeaders = (headers = []) =>
  headers
    .filter((header) => !/^cookie$|^set-cookie$/i.test(header.name))
    .map((header) => ({
      name: header.name,
      // The name is the part an adapter is written against — which header
      // carries the session is exactly what a contributor needs to see.
      value: SECRET_NAME.test(header.name) ? redact(REDACTED) : scrubText(String(header.value ?? '')),
    }));

const scrubQuery = (query = []) =>
  query.map(({ name, value }) => ({
    name,
    value: SECRET_NAME.test(name)
      ? redact(REDACTED)
      : IDENTITY_KEY.test(name)
        ? redact(standIn(name, value))
        : scrubText(String(value ?? '')),
  }));

/** Rebuilds the URL from the query that was just scrubbed, so the two agree. */
const scrubUrl = (url, query) => {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    for (const { name, value } of query) parsed.searchParams.append(name, value);
    return scrubText(parsed.toString());
  } catch {
    return scrubText(url);
  }
};

const scrubEntry = (entry) => {
  const query = scrubQuery(entry.request?.queryString);
  return {
    startedDateTime: entry.startedDateTime,
    time: entry.time,
    request: {
      method: entry.request.method,
      url: scrubUrl(entry.request.url, query),
      httpVersion: entry.request.httpVersion,
      headers: scrubHeaders(entry.request.headers),
      queryString: query,
      cookies: [],
      postData: entry.request.postData && {
        mimeType: entry.request.postData.mimeType,
        text: scrubBody(entry.request.postData.text),
      },
    },
    response: {
      status: entry.response.status,
      statusText: entry.response.statusText,
      headers: scrubHeaders(entry.response.headers),
      cookies: [],
      content: {
        mimeType: entry.response.content?.mimeType,
        text: scrubBody(entry.response.content?.text),
      },
    },
  };
};

/**
 * Only the calls a parser could be written against survive. Images, fonts and
 * stylesheets are most of a HAR by size and none of it by value, and a request
 * that returned nothing shows an adapter nothing.
 */
const isInteresting = (entry) => {
  const type = entry.response?.content?.mimeType ?? '';
  const body = entry.response?.content?.text ?? '';
  return KEEP_TYPE.test(type) && body.length > 0 && !/\.(png|jpe?g|gif|svg|woff2?|css|ico)(\?|$)/i.test(entry.request?.url ?? '');
};

/**
 * Pages the site rendered on the server, thrown away with the fonts.
 *
 * Counted separately because dropping them is the one case where the number of
 * survivors does not explain itself: a site that answers its bet history as
 * markup leaves a contributor holding a recording that sanitises to almost
 * nothing, with no hint that the site is the reason rather than their capture.
 */
const isRenderedPage = (entry) =>
  /text\/html/i.test(entry.response?.content?.mimeType ?? '') &&
  (entry.response?.content?.text ?? '').length > 0;

export const sanitizeHar = (har) => {
  redactions = 0;
  const all = har.log?.entries ?? [];
  const entries = all.filter(isInteresting).map(scrubEntry);
  return {
    har: { log: { version: '1.2', creator: { name: 'bettracker-sanitize-har', version: '1' }, entries } },
    kept: entries.length,
    dropped: all.length - entries.length,
    rendered: all.filter(isRenderedPage).length,
    redactions,
  };
};

/** The check that matters: nothing recognisably secret survives a round trip. */
export const findLeaks = (text) =>
  SECRET_VALUE.flatMap((pattern) => [...text.matchAll(pattern)].map((m) => m[0])).filter(
    (found) => !found.startsWith('x-'),
  );

/** `har/` at the top of the checkout, wherever the command was run from. */
const HAR_DIR = join(fileURLToPath(new URL('../../', import.meta.url)), 'har');

/**
 * The folders a browser saves into, newest recording first.
 *
 * Looked through so that nobody has to find the file, move it into the project
 * or type a path. Pressing save is the whole of the contributor's side of this
 * step, and every instruction after it was a chance to get lost.
 */
const findRecording = () => {
  const home = homedir();
  return [HAR_DIR, join(home, 'Downloads'), join(home, 'OneDrive', 'Downloads')]
    .flatMap((folder) => {
      try {
        return readdirSync(folder)
          .filter((name) => name.endsWith('.har') && !name.endsWith('.sanitized.har'))
          .map((name) => join(folder, name));
      } catch {
        return []; // no such folder on this machine
      }
    })
    .map((path) => ({ path, at: statSync(path).mtimeMs }))
    .sort((a, b) => b.at - a.at)[0]?.path;
};

const main = () => {
  const [given, output] = process.argv.slice(2);
  const input = given ?? findRecording();
  if (input === undefined) {
    console.error(
      'No .har file found in har/ or your Downloads folder.\n' +
        'Record your bet history first: F12, Network tab, tick Preserve log, click\n' +
        'through your account, then right-click the list and Save all as HAR with content.',
    );
    process.exit(1);
  }
  if (given === undefined) console.log(`reading ${input}`);

  const target = (() => {
    if (output === undefined) {
      // Into the project, not back into Downloads: this is the copy the rest of
      // the work reads, and it belongs where git is already told to ignore it.
      mkdirSync(HAR_DIR, { recursive: true });
      return join(HAR_DIR, `${basename(input, '.har')}.sanitized.har`);
    }
    try {
      if (statSync(output).isDirectory())
        return join(output, `${basename(input, '.har')}.sanitized.har`);
    } catch {
      /* not an existing directory: treat as a file path */
    }
    return output;
  })();

  const result = sanitizeHar(JSON.parse(readFileSync(input, 'utf8')));
  const text = JSON.stringify(result.har, null, 2);

  const leaks = findLeaks(text);
  if (leaks.length > 0) {
    console.error(`refusing to write: ${leaks.length} value(s) still look like credentials`);
    process.exit(1);
  }

  writeFileSync(target, text);
  console.log(
    `${target}\n  kept ${result.kept} API calls, dropped ${result.dropped} others, redacted ${result.redactions} values`,
  );
  if (result.rendered > 0 && result.kept === 0) {
    console.log(
      `\n  All ${result.rendered} of the pages you recorded came back as HTML and none as data.\n` +
        '  This site draws your history on the server, so there is no API call to\n' +
        '  read it from, and an adapter cannot be written the way the existing ones\n' +
        '  are. Worth raising in a Discussion before you spend an evening on it.',
    );
  }
  console.log('  Read it before sharing it. This tool is a net, not a guarantee.');
};

if (process.argv[1]?.endsWith('sanitize-har.mjs')) main();
