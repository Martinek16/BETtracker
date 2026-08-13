/**
 * Currency conversion for accounts held in different currencies.
 *
 * Stored records are never rewritten — a bet placed in BTC stays a BTC bet.
 * Conversion happens once, on the way into the dashboard, so every calculation
 * downstream keeps working on plain numbers that are already comparable.
 *
 * Rates are looked up at the date of the record, not today. Converting a
 * year-old crypto bet at today's price would credit or blame the bettor for the
 * coin's move rather than for the bet.
 */

import type { Bet, Bonus, Transaction } from './types';

/** ISO date (YYYY-MM-DD) -> currency code -> units of that currency per 1 BASE. */
export type RateTable = Record<string, Record<string, number>>;

/** The currency every rate in the table is quoted against. */
export const RATE_BASE = 'EUR';

/** How far back to look for a usable rate: weekends, holidays, feed outages. */
const MAX_BACKTRACK_DAYS = 10;

export const dayOf = (isoTimestamp: string): string => isoTimestamp.slice(0, 10);

const shiftDay = (day: string, deltaDays: number): string => {
  const t = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(t)) return day;
  return new Date(t + deltaDays * 86_400_000).toISOString().slice(0, 10);
};

/**
 * Rate for a currency on a date, falling back to the most recent earlier day.
 * Never falls forward: a rate from after the record did not exist yet.
 * Returns null when nothing usable is within reach.
 */
export const rateFor = (table: RateTable, currency: string, day: string): number | null => {
  if (currency === RATE_BASE) return 1;
  for (let back = 0; back <= MAX_BACKTRACK_DAYS; back += 1) {
    const rate = table[shiftDay(day, -back)]?.[currency];
    if (typeof rate === 'number' && rate > 0) return rate;
  }
  return null;
};

/**
 * Convert an amount into `target`, or null when the rate is unknown. Null is
 * deliberate: a missing rate must surface as an excluded record, never as a
 * silently wrong total.
 */
export const convertAmount = (
  amount: number,
  from: string,
  day: string,
  table: RateTable,
  target: string,
): number | null => {
  if (from === target) return amount;
  const fromRate = rateFor(table, from, day);
  const targetRate = rateFor(table, target, day);
  if (fromRate === null || targetRate === null) return null;
  return (amount / fromRate) * targetRate;
};

/** Converts every monetary field of a record, or returns null if any rate is missing. */
export const convertBet = (bet: Bet, table: RateTable, target: string): Bet | null => {
  if (bet.currency === target) return bet;
  const day = dayOf(bet.placedAt);
  const rate = convertAmount(1, bet.currency, day, table, target);
  if (rate === null) return null;
  return {
    ...bet,
    currency: target,
    sourceCurrency: bet.currency,
    fxRate: rate,
    stake: bet.stake * rate,
    ...(bet.bonusStake === undefined ? {} : { bonusStake: bet.bonusStake * rate }),
    potentialReturn: bet.potentialReturn * rate,
    actualReturn: bet.actualReturn * rate,
    ...(bet.currentPotentialReturn === undefined
      ? {}
      : { currentPotentialReturn: bet.currentPotentialReturn * rate }),
    ...(bet.cashOutValue === undefined ? {} : { cashOutValue: bet.cashOutValue * rate }),
  };
};

export const convertTransaction = (
  txn: Transaction,
  table: RateTable,
  target: string,
): Transaction | null => {
  if (txn.currency === target) return txn;
  const rate = convertAmount(1, txn.currency, dayOf(txn.occurredAt), table, target);
  if (rate === null) return null;
  return {
    ...txn,
    currency: target,
    sourceCurrency: txn.currency,
    fxRate: rate,
    amount: txn.amount * rate,
  };
};

export const convertBonus = (bonus: Bonus, table: RateTable, target: string): Bonus | null => {
  if (bonus.currency === target) return bonus;
  const rate = convertAmount(1, bonus.currency, dayOf(bonus.grantedAt), table, target);
  if (rate === null) return null;
  return {
    ...bonus,
    currency: target,
    grantedAmount: bonus.grantedAmount * rate,
    currentAmount: bonus.currentAmount * rate,
    wageringRequired: bonus.wageringRequired * rate,
    wageringDone: bonus.wageringDone * rate,
  };
};

export interface Converted<T> {
  converted: T[];
  /** Records left out because no rate was available. Shown, never summed. */
  skipped: T[];
}

const partition = <T>(
  rows: readonly T[],
  convert: (row: T) => T | null,
): Converted<T> => {
  const converted: T[] = [];
  const skipped: T[] = [];
  for (const row of rows) {
    const result = convert(row);
    if (result === null) skipped.push(row);
    else converted.push(result);
  }
  return { converted, skipped };
};

export const convertBets = (rows: readonly Bet[], t: RateTable, target: string): Converted<Bet> =>
  partition(rows, (b) => convertBet(b, t, target));

export const convertTransactions = (
  rows: readonly Transaction[],
  t: RateTable,
  target: string,
): Converted<Transaction> => partition(rows, (r) => convertTransaction(r, t, target));

export const convertBonuses = (
  rows: readonly Bonus[],
  t: RateTable,
  target: string,
): Converted<Bonus> => partition(rows, (b) => convertBonus(b, t, target));

/**
 * The (currency, day) pairs a set of records needs but the table cannot serve.
 * The extension uses this to fetch exactly the missing rates and nothing else.
 */
export const missingRates = (
  needs: readonly { currency: string; day: string }[],
  table: RateTable,
): { currency: string; day: string }[] => {
  const seen = new Set<string>();
  const out: { currency: string; day: string }[] = [];
  for (const need of needs) {
    const key = `${need.day}|${need.currency}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (rateFor(table, need.currency, need.day) === null) out.push(need);
  }
  return out;
};
