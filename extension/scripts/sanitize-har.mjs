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
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A key name read as words, so that `accessToken` and `x-access-token` are the
 * same name. Matching a bare substring instead is what made `design` a
 * signature and `spin` a PIN.
 */
const words = (name) =>
  String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();

/** The same name with the separators gone: `account_id` and `accountId` alike. */
const flat = (name) => words(name).replace(/[-_.]/g, '');

/**
 * Header and query names whose value is dropped outright. Matched on word
 * boundaries, but still loosely: a site inventing `x-punter-session` is covered
 * without an edit here.
 */
const SECRET_NAME =
  /(^|[-_.])(cookie|auth|authorization|token|session|secret|password|passwd|signature|sig|apikey|key|bearer|csrf|xsrf|jwt|otp|pin|credential)s?([-_.]|$)/;

const isSecretName = (name) => SECRET_NAME.test(words(name));

/**
 * Keys naming a person or an account. Replaced with a stable stand-in rather
 * than removed: an adapter often matches a bet's owner against the account it
 * was fetched for, and a fixture with the link cut would not exercise that.
 *
 * `id`, `no`, `ref` and `number` count only behind a person or an account.
 * On their own they are how a site numbers its pages, its bets and its
 * markets - the paging and the shape of a bet are two of the things the
 * recording exists to show, and pseudonymising them hides both.
 */
const IDENTITY_KEY =
  /^(.*(user|player|customer|account|profile|member|punter|owner|client)(id|ref|number|no)|.*(uuid|guid)|.*(first|last|full|display|nick|screen|login|user|real)name|name|surname|username|nickname|login|email|mail|phone|mobile|msisdn|iban|bic|swift|address|street|city|zip|zipcode|postcode|postalcode|ssn|taxid|passport|dob|birthdate|dateofbirth|documentnumber|holder|beneficiary)$/;

const isIdentityKey = (name) => IDENTITY_KEY.test(flat(name));

/**
 * A card number passes Luhn. A timestamp does not, thirteen digits though it
 * is - and every recording is full of timestamps, which is what used to make
 * the leak check refuse to write a perfectly clean file.
 */
const luhn = (digits) => {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = digits.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
};

/** Shapes that are a credential or an identity no matter what key holds them. */
const SECRET_VALUE = [
  { pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g }, // JWT
  { pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g }, // IBAN
  { pattern: /\b(?:\d[ -]?){13,19}\b/g, valid: (m) => luhn(m.replace(/[ -]/g, '')) }, // card
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g }, // email
  { pattern: /\b[0-9a-f]{32,}\b/gi }, // hex token
  // A digit is required because letters alone are how a site names a long
  // method: `testPredcasnoIzplaciloPodatkiZaIzplaciloListka` is 45 characters
  // and was being replaced with a hash, taking the endpoint's name - the one
  // thing an adapter is written from - out of the recording with it.
  { pattern: /\b[A-Za-z0-9_-]{40,}\b/g, valid: (m) => /\d/.test(m) }, // opaque token
];

const isSecretValue = ({ valid }, match) => valid === undefined || valid(match);

/** Response types worth keeping. Everything else is noise or a binary. */
const KEEP_TYPE = /(json|javascript|text\/plain|graphql)/i;

const REDACTED = 'REDACTED';

/**
 * The same input always yields the same stand-in, so two records that referred
 * to one account still do. Truncated because the length is not the point and a
 * 64-character hash makes a fixture unreadable.
 */
const pseudonym = (value, salt = '') =>
  createHash('sha256')
    .update(`${salt}${String(value)}`)
    .digest('hex')
    .slice(0, 12);

let redactions = 0;
const redact = (replacement) => {
  redactions += 1;
  return replacement;
};

/** Scrubs the shapes that are dangerous wherever they appear in a string. */
const scrubText = (text) =>
  SECRET_VALUE.reduce(
    (acc, shape) =>
      acc.replace(shape.pattern, (match) =>
        isSecretValue(shape, match) ? redact(`x-${pseudonym(match)}`) : match,
      ),
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

/**
 * A stand-in shaped like what it replaces, so the file it is written into is
 * still the file it was. Digits stay digits: an account number sits in JSON as
 * a bare number, and `x-3f9a` in its place is not JSON at all.
 */
const standInText = (value) => {
  if (!/^\d+$/.test(value)) return `x-${pseudonym(value)}`;
  const digits = BigInt(`0x${pseudonym(value)}`)
    .toString()
    .padStart(value.length, '7')
    .slice(-value.length);
  // A leading zero is not a number JSON will parse back.
  return digits.startsWith('0') ? `1${digits.slice(1)}` : digits;
};

const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The identity the key names never gave away.
 *
 * `IDENTITY_KEY` recognises a person by the name of the field holding them, and
 * a bookmaker that does not write its fields in English defeats it completely:
 * a site answering `{"r4":"MIHA MARTINEK","r5":"Martinek16","r0":220326256}`
 * came through a full clean with every one of those intact. No shape says that
 * a string is somebody's name - team names and place names look identical - so
 * the contributor is asked, and what they answer goes wherever it appears:
 * bodies, headers and the URLs too.
 */
export const redactPersonal = (text, values) => {
  let count = 0;
  const cleaned = values
    .map((value) => String(value).trim())
    // Two characters would match inside half the words in the file, and the
    // damage of that lands in the fixtures rather than in a warning.
    .filter((value) => value.length >= 3);
  const out = cleaned.reduce(
    (acc, value) =>
      acc.replace(new RegExp(`\\b${escapeRe(value)}\\b`, 'gi'), () => {
        count += 1;
        return standInText(value);
      }),
    text,
  );
  return { text: out, redactions: count };
};

/** Walks a parsed body, redacting by key and scrubbing every string it passes. */
const scrubValue = (value, key = '') => {
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, key));
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [childKey, scrubValue(child, childKey)]),
    );
  if (isSecretName(key)) return value === null ? null : redact(REDACTED);
  if (isIdentityKey(key) && value !== null) return redact(standIn(key, value));
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
      // The name is the part an adapter is written against - which header
      // carries the session is exactly what a contributor needs to see.
      value: isSecretName(header.name) ? redact(REDACTED) : scrubText(String(header.value ?? '')),
    }));

const scrubQuery = (query = []) =>
  query.map(({ name, value }) => ({
    name,
    value: isSecretName(name)
      ? redact(REDACTED)
      : isIdentityKey(name)
        ? redact(standIn(name, value))
        : scrubText(String(value ?? '')),
  }));

/** Rebuilds the URL from the query that was just scrubbed, so the two agree. */
const scrubUrl = (url, query) => {
  try {
    const parsed = new URL(url);
    // Joined rather than handed to `searchParams`, which encodes what it is
    // given: a HAR stores the value as the site sent it, still percent-encoded,
    // so a second pass turned `a=%20` into `a=%2520` and an adapter written from
    // the clean recording asked the site a question it had never been asked.
    parsed.search = query.map(({ name, value }) => `${name}=${value}`).join('&');
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
  return (
    KEEP_TYPE.test(type) &&
    body.length > 0 &&
    !/\.(png|jpe?g|gif|svg|woff2?|css|ico)(\?|$)/i.test(entry.request?.url ?? '')
  );
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
    har: {
      log: { version: '1.2', creator: { name: 'bettracker-sanitize-har', version: '1' }, entries },
    },
    kept: entries.length,
    dropped: all.length - entries.length,
    rendered: all.filter(isRenderedPage).length,
    redactions,
  };
};

/**
 * One endpoint, with the numbers a site puts in a path taken out, so that
 * `/bets/1`, `/bets/2` and `/bets/3` read as the one page fetched three times
 * rather than as three endpoints. Counting them apart is what let a recording
 * of a single page look like a thorough one.
 */
const endpointOf = (url) => {
  try {
    const { host, pathname } = new URL(url);
    return (
      host +
      pathname
        .replace(/\/\d+(?=\/|$)/g, '/:n')
        .replace(/\/[0-9a-f-]{8,}(?=\/|$)/gi, '/:id')
        .replace(/\/$/, '')
    );
  } catch {
    return url;
  }
};

const queryOf = (url) => {
  try {
    return new URL(url).search;
  } catch {
    return '';
  }
};

/**
 * What a bookmaker folder has to be written from, and the page each one is
 * found on.
 *
 * Recognised by the name the site gives its own endpoint, which means a site
 * that does not name things in English matches nothing here. So a miss is
 * reported as "not recognised" and never as "not recorded" - the difference
 * matters, because the first is a shrug and the second would send a
 * contributor back to record pages they already have.
 */
const NEEDS = [
  {
    name: 'Bet history',
    pattern: /bet|wager|ticket|coupon|slip|histor/i,
    where: 'your settled bets, paging back to the oldest one you have',
  },
  {
    name: 'Open bets',
    pattern: /open|pending|unsettled|active|inplay|in-play|live/i,
    where: 'your open bets - unsettled, pending, in play',
  },
  {
    name: 'Balance',
    pattern: /balance|wallet|fund|cash(?!out)/i,
    where: 'your balance, wherever the site shows it',
  },
  {
    name: 'Money in and out',
    pattern: /transaction|deposit|withdraw|payment|cashier|banking|finance/i,
    where: 'deposits and withdrawals',
  },
  {
    name: 'Bonuses',
    pattern: /bonus|freebet|free-bet|promo|reward|rakeback|voucher/i,
    where: 'bonuses and free bets, if the site has them',
  },
];

/**
 * What a recording actually holds, endpoint by endpoint.
 *
 * This is the check that was missing. Between saving a recording and finding
 * out it was not enough there used to be an evening of writing a parser: the
 * count of surviving calls says nothing about whether any of them is a bet
 * history, and a recording of one page sanitises just as cleanly as a thorough
 * one.
 *
 * `paged` is the reliable half: one endpoint asked three different ways is
 * paging, in any language, and a folder written from a recording without it can
 * only ever read the first page.
 */
export const coverage = (entries) => {
  const byEndpoint = new Map();
  for (const entry of entries) {
    // A script is kept in the file because a site sometimes hides its history in
    // one, but counting it as an endpoint made every recording look thorough: a
    // single page pulling ten bundles read as ten endpoints, and the "this is
    // one page of a site" warning below then never fired for anybody.
    if (/javascript/i.test(entry.response?.content?.mimeType ?? '')) continue;
    const url = entry.request?.url ?? '';
    const seen = byEndpoint.get(endpointOf(url)) ?? { calls: 0, queries: new Set() };
    seen.calls += 1;
    seen.queries.add(queryOf(url));
    byEndpoint.set(endpointOf(url), seen);
  }
  const endpoints = [...byEndpoint]
    .map(([path, seen]) => ({ path, calls: seen.calls, paged: seen.queries.size > 2 }))
    .sort((a, b) => b.calls - a.calls);
  return {
    endpoints,
    paged: endpoints.filter((endpoint) => endpoint.paged).map((endpoint) => endpoint.path),
    recognised: NEEDS.filter((need) => endpoints.some((e) => need.pattern.test(e.path))).map(
      (need) => need.name,
    ),
    unrecognised: NEEDS.filter((need) => !endpoints.some((e) => need.pattern.test(e.path))),
  };
};

/** How many endpoints a recording of a single page tends to come out at. */
const TOO_FEW = 3;

/**
 * The verdict, in the words a contributor needs rather than as counts they have
 * to interpret. Returned as lines rather than printed, so the same text serves
 * the sanitiser and `add-bookmaker`, and so it can be tested.
 */
export const recordingReport = (found) => {
  const lines = [];
  const endpoints = found.endpoints.length;

  lines.push(
    '',
    `  The recording holds ${endpoints} endpoint${endpoints === 1 ? '' : 's'}:`,
    ...found.endpoints
      .slice(0, 12)
      .map(
        (endpoint) =>
          `    ${endpoint.path}  (${endpoint.calls} call${endpoint.calls === 1 ? '' : 's'}${endpoint.paged ? ', paged' : ''})`,
      ),
  );
  if (found.endpoints.length > 12) lines.push(`    ... and ${endpoints - 12} more`);

  if (found.recognised.length > 0)
    lines.push('', `  Recognised by name: ${found.recognised.join(', ')}.`);

  if (found.unrecognised.length > 0)
    lines.push(
      '',
      '  Not recognised by name. Either the page was never opened, or the site',
      '  simply does not name it in English - check the list above yourself:',
      ...found.unrecognised.map((need) => `    ${need.name} - ${need.where}`),
    );

  if (endpoints < TOO_FEW)
    lines.push(
      '',
      '  That is about one page of a site. A folder cannot be written from it.',
      '  Record again, and this time open every page in the list above, waiting',
      '  for each to finish before moving on.',
    );
  else if (found.paged.length === 0)
    lines.push(
      '',
      '  No endpoint was asked twice for different pages, so nothing here shows',
      '  how the site pages. Record again and page back through your bet history:',
      '  without it the folder can only ever read your most recent bets.',
    );

  return lines;
};

/** A recording too thin to write anything from, whatever the site is called. */
export const tooThin = (found) => found.endpoints.length < TOO_FEW;

/**
 * Where a leak sits, never what it says. Printing the value would put the
 * credential in a terminal and a screenshot of it in the next bug report.
 */
const where = (text, index) => {
  const before = text.slice(0, index);
  const line = before.split('\n').length;
  const key = /"([^"]+)"\s*:/.exec(before.slice(before.lastIndexOf('\n') + 1))?.[1];
  return key === undefined ? `line ${line}` : `line ${line}, key "${key}"`;
};

/** The check that matters: nothing recognisably secret survives a round trip. */
export const findLeaks = (text) =>
  SECRET_VALUE.flatMap((shape) =>
    [...text.matchAll(shape.pattern)]
      .filter((m) => !m[0].startsWith('x-') && isSecretValue(shape, m[0]))
      .map((m) => where(text, m.index)),
  );

/** `har/` at the top of the checkout, wherever the command was run from. */
const HAR_DIR = join(fileURLToPath(new URL('../../', import.meta.url)), 'har');

/**
 * Make the folder the recording goes into, on install. Git cannot carry it -
 * the folder is ignored precisely because of what people drop in it - so a
 * fresh checkout tells the contributor to save the file somewhere that is not
 * there. The note is for whoever opens the folder later and wonders.
 */
export const makeHarDir = () => {
  mkdirSync(HAR_DIR, { recursive: true });
  writeFileSync(
    join(HAR_DIR, 'README.txt'),
    'Browser recordings (.har) live here. You do not have to put one here\n' +
      'yourself - `pnpm add-bookmaker` looks in your Downloads folder and files\n' +
      'it for you.\n\n' +
      'BETtracker can make the recording too: open the bookmaker, click the\n' +
      'extension icon, press "Record this site", click through your history and\n' +
      'press "Save recording". DevTools is only needed where that cannot see the\n' +
      'calls.\n\n' +
      'If you started with `pnpm add-bookmaker`, it is watching this folder as\n' +
      'well and carries on by itself the moment a file appears - and if one is\n' +
      'already here, it offers you that instead of waiting. On your own, the next\n' +
      'command is `pnpm sanitize-har`.\n\n' +
      'One folder per bookmaker, named after the site: har/stake/, har/bet365/.\n' +
      'Recordings of two sites in one heap read as one site with a strange mix of\n' +
      'pages, and the answer to "which of these is bet365" is the folder name.\n\n' +
      'A raw recording holds your live session. This folder is ignored by git and\n' +
      'CI rejects a pull request carrying one, but nothing stops you sending it by\n' +
      'hand - so share only the .sanitized.har that the command writes beside it.\n',
  );
};

/**
 * The folders a browser saves into, newest recording first.
 *
 * Looked through so that nobody has to find the file, move it into the project
 * or type a path. Pressing save is the whole of the contributor's side of this
 * step, and every instruction after it was a chance to get lost.
 *
 * `site` narrows it to that bookmaker's own folder, which is the difference
 * between reading the site being added and reading whichever one was recorded
 * most recently.
 */
export const findRecording = (site) => {
  const home = homedir();
  const inside = (folder) => {
    try {
      return readdirSync(folder, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(folder, entry.name));
    } catch {
      return [];
    }
  };

  const own = site === undefined ? undefined : join(HAR_DIR, site);
  const roots =
    own !== undefined && existsSync(own)
      ? [own]
      : [HAR_DIR, ...inside(HAR_DIR), join(home, 'Downloads'), join(home, 'OneDrive', 'Downloads')];

  return roots
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
  const args = process.argv.slice(2);
  if (args[0] === '--make-folder') {
    makeHarDir();
    return;
  }
  const personal = args
    .filter((arg) => arg.startsWith('--me='))
    .flatMap((arg) => arg.slice('--me='.length).split(','));
  const [given, output] = args.filter((arg) => !arg.startsWith('--'));
  const input = given ?? findRecording();
  if (input === undefined) {
    console.error(
      'No .har file found in har/ or your Downloads folder.\n' +
        'Record your bet history first. With BETtracker installed in the browser you\n' +
        'are signed in with, its toolbar icon offers "Record this site", and then\n' +
        '"Save recording" - no DevTools in it at all.\n' +
        'Without it: F12, Network tab, tick Preserve log, click through your account,\n' +
        'then right-click the list and export the log. Take the export WITH sensitive\n' +
        'data where your browser offers both: the sanitized one has the sign-in\n' +
        'headers stripped, and those are what an adapter is written to.',
    );
    process.exit(1);
  }
  if (given === undefined) console.log(`reading ${input}`);

  const target = (() => {
    if (output === undefined) {
      // Into the project, not back into Downloads: this is the copy the rest of
      // the work reads, and it belongs where git is already told to ignore it.
      // Beside the recording when that is already one of the site's folders, so
      // the pair stays together and neither has to be told which site it is.
      const beside = dirname(input);
      const folder = beside.startsWith(HAR_DIR) ? beside : HAR_DIR;
      mkdirSync(folder, { recursive: true });
      return join(folder, `${basename(input, '.har')}.sanitized.har`);
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
  const mine = redactPersonal(JSON.stringify(result.har, null, 2), personal);
  const text = mine.text;
  result.redactions += mine.redactions;

  const leaks = findLeaks(text);
  if (leaks.length > 0) {
    console.error(
      `refusing to write: ${leaks.length} value(s) still look like credentials.\n` +
        `Nothing was written and your recording is untouched. In the file that\n` +
        `would have been written, they sit at:\n  ` +
        `${leaks.join('\n  ')}\n` +
        'The key names say what was missed. If the tool is wrong about them, that\n' +
        'is worth an issue - the values are deliberately not printed here.',
    );
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
  } else {
    console.log(recordingReport(coverage(result.har.log.entries)).join('\n'));
  }
  if (personal.length === 0)
    console.log(
      '\n  Nothing was given to redact by hand. A field named `name` or `email` is\n' +
        '  replaced automatically, but a site that names its fields `r4` and `r5` -\n' +
        '  or names them in its own language - hides your name from that entirely.\n' +
        '  Search the file for your own name, and if it is in there, run:\n' +
        `    pnpm sanitize-har ${basename(input)} --me="Your Name,yourNickname,12345678"`,
    );
  console.log('\n  Read it before sharing it. This tool is a net, not a guarantee.');
};

if (process.argv[1]?.endsWith('sanitize-har.mjs')) main();
