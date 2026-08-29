import { profitOf, resolutionDate, type Bet } from '@betanal/shared';
import { pickXLabelIndices } from '@/lib/profit-chart-scale';
import { EU_LOCALE } from '@/lib/utils';

/**
 * Which date a bet belongs under for period filtering and P/L bucketing.
 *
 * Settled bets follow their settlement, because that is when the money moved -
 * bucketing by placement hides a bet that was placed three weeks ago and paid out
 * yesterday. Pending bets have no result yet, so they sit at the point you
 * committed the stake.
 */
export const periodDate = (bet: Bet): string =>
  bet.status === 'pending' ? bet.placedAt : resolutionDate(bet);

const periodTime = (bet: Bet): number => new Date(periodDate(bet)).getTime();

export interface ChartBucket {
  key: string;
  label: string;
  /** Full span, for the tooltip. The axis only has room for the start date. */
  periodLabel?: string;
  wins: number;
  losses: number;
  profit: number;
  bets: number;
}

/** Calendar keys in local timezone - avoids UTC slice mismatches with iterateMonths. */
const calendarDayKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const calendarMonthKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const calendarYearKey = (date: Date): string => String(date.getFullYear());

const dayKeyFromIso = (iso: string): string => calendarDayKey(new Date(iso));

const monthKeyFromIso = (iso: string): string => calendarMonthKey(new Date(iso));

const yearKeyFromIso = (iso: string): string => calendarYearKey(new Date(iso));

const formatDay = (key: string): string =>
  new Date(`${key}T12:00:00`).toLocaleDateString(EU_LOCALE, { month: 'short', day: 'numeric' });

const formatMonth = (key: string, includeYear = false): string => {
  const [y, m] = key.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString(EU_LOCALE, {
    month: 'short',
    ...(includeYear ? { year: '2-digit' } : {}),
  });
};

const weekStartKey = (date: Date): string => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return calendarDayKey(d);
};

const formatWeek = (key: string): string => formatDay(key);

const weekBucket = (key: string): ChartBucket => {
  const end = new Date(`${key}T12:00:00`);
  end.setDate(end.getDate() + 6);
  return {
    key,
    label: formatWeek(key),
    periodLabel: `${formatDay(key)} – ${formatDay(calendarDayKey(end))}`,
    wins: 0,
    losses: 0,
    profit: 0,
    bets: 0,
  };
};

const addBucket = (map: Map<string, ChartBucket>, key: string, label: string, bet: Bet): void => {
  const existing = map.get(key);
  const bucket = existing ?? { key, label, wins: 0, losses: 0, profit: 0, bets: 0 };
  const p = profitOf(bet);
  bucket.bets += 1;
  bucket.profit += p;
  if (p >= 0) bucket.wins += Math.abs(p);
  else bucket.losses += Math.abs(p);
  map.set(key, bucket);
};

const ensureBucket = (map: Map<string, ChartBucket>, key: string, label: string): ChartBucket => {
  const existing = map.get(key);
  if (existing) return existing;
  const bucket = { key, label, wins: 0, losses: 0, profit: 0, bets: 0 };
  map.set(key, bucket);
  return bucket;
};

const betDateRange = (bets: readonly Bet[]): { first: Date; last: Date } | null => {
  if (bets.length === 0) return null;
  const sorted = [...bets].sort((a, b) => periodDate(a).localeCompare(periodDate(b)));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return null;
  return { first: new Date(periodDate(first)), last: new Date(periodDate(last)) };
};

const monthSpan = (bets: readonly Bet[]): number => {
  const range = betDateRange(bets);
  if (!range) return 0;
  return (
    (range.last.getFullYear() - range.first.getFullYear()) * 12 +
    (range.last.getMonth() - range.first.getMonth()) +
    1
  );
};

/**
 * Midnight of the last day in the window. `until` is any moment inside that day;
 * `null` means the window runs to today, which is every range but a hand-picked one.
 */
const periodAnchor = (until: number | null = null): Date => {
  const d = new Date(until ?? Date.now());
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Start of the day `days` back from the anchor, so the boundary day is included
 * whole. Cutting at `now - days * 24h` drops that morning's bets - asking for a
 * month on Aug 4 would show nothing from Jul 4 before the current time of day.
 */
export const rangeCutoff = (days: number, until: number | null = null): number => {
  const d = periodAnchor(until);
  d.setDate(d.getDate() - days);
  return d.getTime();
};

/**
 * Exclusive end of the window. `Infinity` without a picked end date: a bet whose
 * match is still ahead belongs to the period that is running now, and clamping
 * to midnight tonight would drop it.
 */
export const rangeEnd = (until: number | null = null): number => {
  if (until === null) return Infinity;
  const d = periodAnchor(until);
  d.setDate(d.getDate() + 1);
  return d.getTime();
};

export const filterBetsByRange = (
  bets: readonly Bet[],
  days: number | null,
  until: number | null = null,
): Bet[] => {
  if (days === null && until === null) return [...bets];
  const cutoff = days === null ? -Infinity : rangeCutoff(days, until);
  const end = rangeEnd(until);
  return bets.filter((b) => {
    const t = periodTime(b);
    return t >= cutoff && t < end;
  });
};

const monthSpanFromDates = (first: Date, last: Date): number =>
  (last.getFullYear() - first.getFullYear()) * 12 + (last.getMonth() - first.getMonth()) + 1;

const iterateMonthKeys = (from: Date, to: Date): string[] => {
  const keys: string[] = [];
  const start = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);

  for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
    keys.push(calendarMonthKey(d));
  }
  return keys;
};

const dailyBuckets = (
  bets: readonly Bet[],
  days: number,
  until: number | null = null,
): ChartBucket[] => {
  const cutoff = rangeCutoff(days, until);
  const map = new Map<string, ChartBucket>();
  const dayKeys: string[] = [];

  // `days` back through the last day inclusive - the boundary day is part of the range.
  for (let i = days; i >= 0; i -= 1) {
    const d = periodAnchor(until);
    d.setDate(d.getDate() - i);
    const key = calendarDayKey(d);
    dayKeys.push(key);
    map.set(key, { key, label: formatDay(key), wins: 0, losses: 0, profit: 0, bets: 0 });
  }

  for (const bet of bets) {
    if (periodTime(bet) < cutoff) continue;
    const key = dayKeyFromIso(periodDate(bet));
    const bucket = map.get(key);
    if (!bucket) continue;
    addBucket(map, key, bucket.label, bet);
  }

  return dayKeys.map((k) => map.get(k)!);
};

const weeklyBuckets = (
  bets: readonly Bet[],
  days: number,
  until: number | null = null,
): ChartBucket[] => {
  const cutoff = rangeCutoff(days, until);
  const map = new Map<string, ChartBucket>();
  const weekKeys: string[] = [];

  // Walk week starts from the cutoff week to the last one. Stepping back in 7s
  // from `days` skips the final week whenever `days` isn't a multiple of 7, so a
  // quiet week just gone would leave no bar at all.
  const endKey = weekStartKey(periodAnchor(until));
  const cursor = new Date(`${weekStartKey(new Date(cutoff))}T12:00:00`);
  for (;;) {
    const key = calendarDayKey(cursor);
    if (!map.has(key)) {
      map.set(key, weekBucket(key));
      weekKeys.push(key);
    }
    if (key >= endKey) break;
    cursor.setDate(cursor.getDate() + 7);
  }

  for (const bet of bets) {
    if (periodTime(bet) < cutoff) continue;
    const key = weekStartKey(new Date(periodDate(bet)));
    if (!map.has(key)) {
      map.set(key, weekBucket(key));
      weekKeys.push(key);
    }
    addBucket(map, key, map.get(key)!.label, bet);
  }

  return weekKeys.map((k) => map.get(k)!);
};

const yearlyBuckets = (bets: readonly Bet[]): ChartBucket[] => {
  const range = betDateRange(bets);
  if (!range) return [];

  const map = new Map<string, ChartBucket>();
  const yearKeys: string[] = [];

  for (let y = range.first.getFullYear(); y <= range.last.getFullYear(); y += 1) {
    const key = String(y);
    map.set(key, { key, label: key, wins: 0, losses: 0, profit: 0, bets: 0 });
    yearKeys.push(key);
  }

  for (const bet of bets) {
    const key = yearKeyFromIso(periodDate(bet));
    if (!map.has(key)) {
      map.set(key, { key, label: key, wins: 0, losses: 0, profit: 0, bets: 0 });
      yearKeys.push(key);
    }
    addBucket(map, key, map.get(key)!.label, bet);
  }

  return [...new Set(yearKeys)].sort().map((k) => map.get(k)!);
};

const monthlyBuckets = (
  bets: readonly Bet[],
  days: number | null,
  until: number | null = null,
): ChartBucket[] => {
  const map = new Map<string, ChartBucket>();

  if (days === null) {
    const range = betDateRange(bets);
    if (!range) return [];

    const startMonth = new Date(range.first.getFullYear(), range.first.getMonth(), 1);
    const lastBetMonth = new Date(range.last.getFullYear(), range.last.getMonth(), 1);
    const currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endMonth = lastBetMonth > currentMonth ? lastBetMonth : currentMonth;
    const includeYear = monthSpanFromDates(startMonth, endMonth) > 12;

    const monthKeys = iterateMonthKeys(startMonth, endMonth);
    for (const key of monthKeys) {
      ensureBucket(map, key, formatMonth(key, includeYear));
    }

    for (const bet of bets) {
      const key = monthKeyFromIso(periodDate(bet));
      const bucket = ensureBucket(map, key, formatMonth(key, includeYear));
      addBucket(map, key, bucket.label, bet);
    }

    const orderedKeys = [...new Set([...monthKeys, ...map.keys()])].sort();
    return orderedKeys.map((k) => map.get(k)!);
  }

  const cutoff = rangeCutoff(days, until);
  const start = new Date(cutoff);
  start.setDate(1);
  const last = periodAnchor(until);
  const includeYear = monthSpanFromDates(start, last) > 12;
  const monthKeys = iterateMonthKeys(start, last);

  for (const key of monthKeys) {
    ensureBucket(map, key, formatMonth(key, includeYear));
  }

  for (const bet of bets) {
    if (periodTime(bet) < cutoff) continue;
    const key = monthKeyFromIso(periodDate(bet));
    const bucket = ensureBucket(map, key, formatMonth(key, includeYear));
    addBucket(map, key, bucket.label, bet);
  }

  return monthKeys.map((k) => map.get(k)!);
};

export type TimelineGranularity = 'day' | 'week' | 'month' | 'year';

/** How wide one bucket is for a range, before any bets are looked at. */
export const timelineGranularity = (
  bets: readonly Bet[],
  days: number | null,
  until: number | null = null,
): TimelineGranularity => {
  if (days === null) {
    // Months stay readable well past a couple of years - a year per bar hides
    // every run and drawdown inside it, which is the whole point of the chart.
    // Yearly is only for histories too long to fit a bar per month.
    return monthSpan(filterBetsByRange(bets, days, until)) > 60 ? 'year' : 'month';
  }
  if (days <= 31) return 'day';
  // Anything longer than a month goes weekly. Monthly hides too much: a whole
  // bad fortnight can vanish inside a month that finished up.
  // Past a year a bar per week is unreadable, so those go monthly.
  if (days > 400) return 'month';
  return 'week';
};

const bucketsAt = (
  filtered: readonly Bet[],
  granularity: TimelineGranularity,
  days: number | null,
  until: number | null,
): ChartBucket[] => {
  switch (granularity) {
    case 'year':
      return yearlyBuckets(filtered);
    case 'month':
      return monthlyBuckets(filtered, days, until);
    case 'day':
      return dailyBuckets(filtered, days ?? 0, until);
    case 'week':
      return weeklyBuckets(filtered, days ?? 0, until);
  }
};

/** Main timeline chart - daily, weekly, monthly, or yearly depending on range. */
export const timelineBuckets = (
  bets: readonly Bet[],
  days: number | null,
  until: number | null = null,
): ChartBucket[] => {
  const filtered = filterBetsByRange(bets, days, until);
  if (filtered.length === 0) return [];
  return bucketsAt(filtered, timelineGranularity(bets, days, until), days, until);
};

/**
 * The same buckets at a granularity decided elsewhere. Splitting a period per
 * account and letting each subset pick its own granularity gives key sets that
 * cannot be lined up - one account's month against another's year - so the
 * choice is made once over the whole period and handed down.
 */
export const timelineBucketsAt = (
  bets: readonly Bet[],
  granularity: TimelineGranularity,
  days: number | null,
  until: number | null = null,
): ChartBucket[] => {
  const filtered = filterBetsByRange(bets, days, until);
  if (filtered.length === 0) return [];
  return bucketsAt(filtered, granularity, days, until);
};

export interface AxisTick {
  index: number;
  label: string;
}

/** Every nth bucket counting back from the last, so the newest is always labelled. */
const everyNth = (buckets: readonly ChartBucket[], step: number): AxisTick[] =>
  buckets.flatMap((b, i) =>
    (buckets.length - 1 - i) % step === 0 ? [{ index: i, label: b.label }] : [],
  );

/** First bucket of each calendar group, labelled by the group rather than the bucket. */
const groupStarts = (
  buckets: readonly ChartBucket[],
  groupOf: (key: string) => string,
  labelOf: (key: string) => string,
): AxisTick[] => {
  let prev = '';
  return buckets.flatMap((b, i) => {
    const group = groupOf(b.key);
    if (group === prev) return [];
    prev = group;
    return [{ index: i, label: labelOf(group) }];
  });
};

/**
 * X-axis labels for a set of timeline buckets.
 *
 * Density follows the range rather than a fixed label budget: a week has room for
 * every day, and a multi-year history is unreadable when consecutive labels are
 * "sep 23" then "apr 24" - those want one marker per calendar year instead.
 */
export const axisTicks = (buckets: readonly ChartBucket[], days: number | null): AxisTick[] => {
  if (buckets.length === 0) return [];

  // Daily buckets.
  if (days !== null && days <= 31) {
    if (days <= 7) return everyNth(buckets, 1);
    if (days <= 14) return everyNth(buckets, 2);
    return pickXLabelIndices(buckets.length, 5).map((i) => ({
      index: i,
      label: buckets[i]!.label,
    }));
  }

  // Weekly buckets: one marker per month it passes through.
  if (days !== null) {
    return groupStarts(
      buckets,
      (key) => key.slice(0, 7),
      // A year-long range repeats a month name at both ends without the year.
      (month) => formatMonth(month, days > 180),
    );
  }

  // All time - yearly buckets already label themselves.
  if (buckets[0]!.key.length === 4) return everyNth(buckets, 1);

  // Monthly buckets: a marker per month once it fits, otherwise per year.
  if (buckets.length <= 14) return everyNth(buckets, 1);
  return groupStarts(
    buckets,
    (key) => key.slice(0, 4),
    (year) => year,
  );
};
