/**
 * Daily exchange rates for the currencies the stored records actually use.
 *
 * Fetched here rather than in the dashboard because the extension holds host
 * permissions and is not bound by a page's CORS rules. Nothing already in the
 * table is overwritten: a rate is a fact about a day that has passed, and a
 * later revision would silently move every number derived from it.
 */

import {
  RATE_BASE,
  dayOf,
  getAllBalances,
  getAllBets,
  getAllBonuses,
  getAllTransactions,
  getRates,
  getSettings,
  log,
  missingRates,
  setRates,
  type RateTable,
} from '@betanal/shared';

/**
 * European Central Bank reference rates, published daily, no key required.
 * The versioned host, not the old `api.frankfurter.app`: that one now redirects
 * here, and a redirect off a host the manifest grants is refused as cross-origin.
 */
const FEED = 'https://api.frankfurter.dev/v1';

/** `rateFor` backtracks over closed days, so the window opens before the oldest need. */
const LEAD_DAYS = 10;

const shiftDay = (day: string, deltaDays: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + deltaDays * 86_400_000).toISOString().slice(0, 10);

const getJson = async (url: string): Promise<unknown> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from the rate feed`);
  return res.json();
};

/**
 * The feed answers 400 for a symbol it does not know, which would cost us the
 * fiat rates in the same request. Crypto is not quoted here - that rate comes
 * from the bookmaker that deals in it.
 */
let quoted: Set<string> | null = null;

const quotedCurrencies = async (): Promise<Set<string>> => {
  if (quoted === null)
    quoted = new Set(Object.keys((await getJson(`${FEED}/currencies`)) as object));
  return quoted;
};

/** One request covers every day and currency in the window. */
const fetchWindow = async (
  from: string,
  to: string,
  currencies: readonly string[],
): Promise<RateTable> => {
  const url = `${FEED}/${from}..${to}?base=${RATE_BASE}&symbols=${currencies.join(',')}`;
  const body = (await getJson(url)) as { rates?: RateTable };
  return body.rates ?? {};
};

/**
 * Daily closes for a coin against EUR. The bookmakers that deal in crypto only
 * publish today's price, which cannot value a bet placed a year ago - that is
 * the difference between betting performance and the coin's own price swing.
 *
 * ponytail: one request per coin covers ~2.7 years; page backwards with
 * `endTime` if a wallet's history ever reaches further than that.
 */
const CRYPTO_FEED = 'https://api.binance.com/api/v3/klines';
const CRYPTO_MAX_DAYS = 1000;

/** Most coins have no EUR book; the dollar stablecoin is the pair they all share. */
const BRIDGE = 'USDT';

/** Daily closes for one pair. Empty when the feed does not trade that symbol. */
const closesFor = async (symbol: string, fromDay: string): Promise<Record<string, number>> => {
  const startTime = Date.parse(`${fromDay}T00:00:00Z`);
  const url = `${CRYPTO_FEED}?symbol=${symbol}&interval=1d&startTime=${startTime}&limit=${CRYPTO_MAX_DAYS}`;
  let rows: unknown[];
  try {
    rows = (await getJson(url)) as unknown[];
  } catch {
    return {};
  }
  const closes: Record<string, number> = {};
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const openTime = Number(row[0]);
    const close = Number(row[4]);
    if (!Number.isFinite(openTime) || !Number.isFinite(close) || close <= 0) continue;
    closes[new Date(openTime).toISOString().slice(0, 10)] = close;
  }
  return closes;
};

const fetchCryptoDays = async (currency: string, fromDay: string): Promise<RateTable> => {
  const table: RateTable = {};

  // The feed quotes EUR per coin; the table holds units per 1 EUR.
  for (const [day, close] of Object.entries(await closesFor(`${currency}${RATE_BASE}`, fromDay))) {
    table[day] = { [currency]: 1 / close };
  }
  if (Object.keys(table).length > 0) return table;

  const perEur = await closesFor(`${RATE_BASE}${BRIDGE}`, fromDay); // USDT per 1 EUR
  if (currency === BRIDGE) {
    for (const [day, close] of Object.entries(perEur)) table[day] = { [BRIDGE]: close };
    return table;
  }
  for (const [day, close] of Object.entries(await closesFor(`${currency}${BRIDGE}`, fromDay))) {
    const bridge = perEur[day];
    if (bridge === undefined) continue;
    table[day] = { [currency]: bridge / close }; // (USDT/EUR) ÷ (USDT/coin) = coins per EUR
  }
  return table;
};

/**
 * Fill in the rates the stored records need and the table cannot serve yet.
 * Returns how many quotes were added, so a caller can report a no-op cheaply.
 */
export const syncRates = async (): Promise<number> => {
  const [bets, transactions, bonuses, balances, settings, table] = await Promise.all([
    getAllBets(),
    getAllTransactions(),
    getAllBonuses(),
    getAllBalances(),
    getSettings(),
    getRates(),
  ]);

  const needs = [
    ...bets.map((b) => ({ currency: b.currency, day: dayOf(b.placedAt) })),
    ...transactions.map((t) => ({ currency: t.currency, day: dayOf(t.occurredAt) })),
    ...bonuses.map((b) => ({ currency: b.currency, day: dayOf(b.grantedAt) })),
    ...balances.flatMap((b) =>
      b.currency === null ? [] : [{ currency: b.currency, day: dayOf(b.capturedAt) }],
    ),
  ];
  // Every conversion goes through the base, so the target currency needs a quote
  // on each of those days too, even when no record is actually held in it.
  const days = [...new Set(needs.map((n) => n.day))];
  const missing = missingRates(
    [...needs, ...days.map((day) => ({ currency: settings.currency, day }))],
    table,
  );
  if (missing.length === 0) return 0;

  const known = await quotedCurrencies();
  log(
    'info',
    'rates',
    `missing ${missing.length} quotes: ${[...new Set(missing.map((m) => m.currency))].join(', ')}`,
  );
  const wanted = [...new Set(missing.map((m) => m.currency))];
  const currencies = wanted.filter((c) => known.has(c));
  const sorted = missing.map((m) => m.day).sort();
  const from = shiftDay(sorted[0] ?? '', -LEAD_DAYS);

  const fetched: RateTable = {};
  if (currencies.length > 0) {
    Object.assign(fetched, await fetchWindow(from, sorted[sorted.length - 1] ?? '', currencies));
  }
  for (const currency of wanted.filter((c) => !known.has(c) && c !== RATE_BASE)) {
    try {
      for (const [day, quotes] of Object.entries(await fetchCryptoDays(currency, from))) {
        fetched[day] = { ...(fetched[day] ?? {}), ...quotes };
      }
    } catch {
      // Not a pair this feed trades. The records stay unconverted and excluded,
      // which is the honest outcome - inventing a rate would not be.
    }
  }

  const merged: RateTable = { ...table };
  let added = 0;
  for (const [day, quotes] of Object.entries(fetched)) {
    const next = { ...(merged[day] ?? {}) };
    for (const [currency, rate] of Object.entries(quotes)) {
      if (typeof rate !== 'number' || rate <= 0 || next[currency] !== undefined) continue;
      next[currency] = rate;
      added += 1;
    }
    merged[day] = next;
  }
  if (added > 0) await setRates(merged);
  else log('warn', 'rates', 'the feeds answered with nothing usable');
  return added;
};
