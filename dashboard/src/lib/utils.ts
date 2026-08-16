import { clsx, type ClassValue } from 'clsx';
import type { NumberFormat, SymbolPosition } from '@betanal/shared';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));

/** Dates keep one European pattern; only the digits follow the setting. */
export const EU_LOCALE = 'sl-SI';

const NUMBER_LOCALES: Record<NumberFormat, string> = { eu: 'sl-SI', us: 'en-US' };

let numberLocale = NUMBER_LOCALES.eu;
let symbolFirst = false;

/**
 * Amounts are printed from plain functions in dozens of places, so the choice
 * is kept here instead of being threaded through every caller. The dashboard
 * sets it while reading settings, which is before the render that prints them.
 */
export const setNumberFormat = (format: NumberFormat, position: SymbolPosition): void => {
  numberLocale = NUMBER_LOCALES[format];
  symbolFirst = position === 'before';
};

const symbols = new Map<string, string>();

/**
 * The mark a currency is written with. Intl knows it for the ISO codes and
 * echoes anything else back unchanged, which is the right answer for a book
 * settling in USDT: the code is its symbol.
 */
export const symbolOf = (currency: string): string => {
  const known = symbols.get(currency);
  if (known !== undefined) return known;
  let symbol = currency;
  try {
    const parts = new Intl.NumberFormat('en-US', { style: 'currency', currency })
      .formatToParts(0)
      .find((part) => part.type === 'currency');
    if (parts !== undefined) symbol = parts.value;
  } catch {
    /* not an ISO code: the code itself is what gets printed */
  }
  symbols.set(currency, symbol);
  return symbol;
};

const decimals = (value: number, digits: number, least = digits): string =>
  new Intl.NumberFormat(numberLocale, {
    minimumFractionDigits: least,
    maximumFractionDigits: digits,
  }).format(value);

/**
 * The sign leads, always: a minus tucked between the symbol and the digits
 * reads as part of the number. A lettered mark (USDT, CHF) keeps its space on
 * both sides - only a true symbol sits flush against the figure.
 */
const withSymbol = (digits: string, negative: boolean, currency: string): string => {
  const symbol = symbolOf(currency);
  const sign = negative ? '-' : '';
  const gap = /^\p{L}/u.test(symbol) ? ' ' : '';
  return symbolFirst ? `${sign}${symbol}${gap}${digits}` : `${sign}${digits} ${symbol}`;
};

/** The ISO codes, which are the ones that carry an official number of places. */
const isoCurrencies = new Set(Intl.supportedValuesOf('currency'));

/**
 * How many places a figure is written to. A currency on the ISO list has an
 * answer of its own - two for the euro, none for the yen - and Intl knows it.
 * A coin has none, and writing two would round 0.003 BTC away to nothing, so
 * the places follow the size of the figure instead: the smaller the holding,
 * the further down it has to be read to say anything at all.
 */
const digitsFor = (value: number, currency: string): number => {
  if (isoCurrencies.has(currency))
    return (
      new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  const abs = Math.abs(value);
  if (abs === 0 || abs >= 1000) return 2;
  if (abs >= 1) return 4;
  return 8;
};

/**
 * A currency's own places are exact, so a euro keeps both of them even when the
 * cents are zero. The places a coin is given are only room to be read in, and
 * filling that room with zeros makes a short figure look long, so they go.
 */
export const formatAmount = (value: number, currency = 'EUR'): string => {
  const digits = digitsFor(value, currency);
  const least = isoCurrencies.has(currency) ? digits : Math.min(2, digits);
  return decimals(Math.abs(value), digits, least);
};

export const formatMoney = (value: number, currency = 'EUR'): string =>
  withSymbol(formatAmount(value, currency), value < 0, currency);

/**
 * Money for a row that cannot grow: the cents of a four-figure sum say nothing
 * a punter reads, and carrying them is what pushes the figure onto a second line.
 */
export const tightMoney = (value: number, currency = 'EUR'): string =>
  Math.abs(value) >= 1000
    ? withSymbol(decimals(Math.abs(value), 0), value < 0, currency)
    : formatMoney(value, currency);

/** Axis-sized money: thousands and millions collapse so ticks stay narrow. */
export const compactMoney = (value: number, currency: string): string => {
  const abs = Math.abs(value);
  const negative = value < 0;
  if (abs >= 1_000_000) return withSymbol(`${decimals(abs / 1_000_000, 1)}M`, negative, currency);
  if (abs >= 1_000) return withSymbol(`${decimals(abs / 1_000, 1)}K`, negative, currency);
  return withSymbol(decimals(abs, 0), negative, currency);
};

export const formatPercent = (value: number, digits = 1): string => `${decimals(value, digits)}%`;

export const formatNumber = (value: number, digits = 2): string => decimals(value, digits);

const dateTimeOptions: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
};

const dateOptions: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
};

export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(EU_LOCALE, dateOptions);

/**
 * Compact, period-aware x-axis date label. Short ranges show day+month; long
 * ranges (≥6 months / all time) collapse to month+year so labels stay readable
 * and representative of the selected period.
 */
export const formatAxisDate = (iso: string, days: number | null): string => {
  const d = new Date(iso);
  if (days === null || days > 180) {
    return d.toLocaleDateString(EU_LOCALE, { month: 'short' });
  }
  return d.toLocaleDateString(EU_LOCALE, { day: '2-digit', month: 'short' });
};

export const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString(EU_LOCALE, dateTimeOptions);

export const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString(EU_LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
