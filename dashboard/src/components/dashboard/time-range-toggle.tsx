import { useEffect, useState } from 'react';
import type { TimeRange } from '@betanal/shared';
import { SegmentedToggle, type SegmentedOption } from '@/components/dashboard/segmented-toggle';
import { formatDate } from '@/lib/utils';

// Declared in shared because it is persisted in settings; re-exported here so
// every view keeps importing it from the component it belongs to.
export type { TimeRange };

/**
 * What the toolbar can be showing. A hand-picked window is not a setting — it
 * belongs to the session, not to "which period do pages open on" — so it widens
 * the toggle without widening the persisted `TimeRange`.
 */
export type RangeChoice = TimeRange | 'custom';

export const RANGE_OPTIONS: readonly SegmentedOption<TimeRange>[] = [
  { value: '7d', label: '1W' },
  { value: '14d', label: '14D' },
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: 'all', label: 'All' },
];

const TOGGLE_OPTIONS: readonly SegmentedOption<RangeChoice>[] = [
  ...RANGE_OPTIONS,
  { value: 'custom', label: 'Custom', title: 'Pick your own start and end date' },
];

/** `yyyy-mm-dd` in local time — `toISOString` would shift the day either side of UTC. */
export const isoDay = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Midnight of a `yyyy-mm-dd` day. Parsed at noon: bare dates are read as UTC. */
export const dayStart = (day: string): Date => {
  const d = new Date(`${day}T12:00:00`);
  d.setHours(0, 0, 0, 0);
  return d;
};

const today = (): Date => dayStart(isoDay(new Date()));

/**
 * Days between today and the same date `months` back. A flat 30/90/180 makes
 * "1 month" stop short — on Aug 4 it reaches Jul 5 and hides Jul 4 entirely.
 */
const daysBackForMonths = (months: number): number => {
  const now = today();
  // Land on the 1st before shifting the month, or "Mar 31 minus 1" overflows
  // a short February and bounces back into March.
  const back = new Date(now.getFullYear(), now.getMonth() - months, 1);
  const lastDay = new Date(back.getFullYear(), back.getMonth() + 1, 0).getDate();
  back.setDate(Math.min(now.getDate(), lastDay));
  return Math.round((now.getTime() - back.getTime()) / 86_400_000);
};

/** Whole calendar days spanned by a hand-picked window, ends included. */
const daysBetween = (from: string, to: string | null): number => {
  const end = to === null ? today() : dayStart(to);
  return Math.max(Math.round((end.getTime() - dayStart(from).getTime()) / 86_400_000), 0);
};

/** `null` means "no cutoff" (all time). */
export const rangeToDays = (
  range: RangeChoice,
  from: string | null = null,
  to: string | null = null,
): number | null => {
  if (range === 'custom') return from === null ? null : daysBetween(from, to);
  switch (range) {
    case '7d':
      return 7;
    case '14d':
      return 14;
    case '1m':
      return daysBackForMonths(1);
    case '3m':
      return daysBackForMonths(3);
    case '6m':
      return daysBackForMonths(6);
    case '1y':
      return daysBackForMonths(12);
    case 'all':
      return null;
  }
};

/**
 * Last day of the window as a timestamp, or `null` when it runs to today. Only a
 * hand-picked window can end in the past.
 */
export const rangeUntil = (range: RangeChoice, to: string | null = null): number | null =>
  range === 'custom' && to !== null ? dayStart(to).getTime() : null;

export const periodLabel = (
  range: RangeChoice,
  from: string | null = null,
  to: string | null = null,
): string => {
  if (range === 'custom') {
    if (from === null) return 'all time';
    return `${formatDate(dayStart(from).toISOString())} – ${
      to === null ? 'today' : formatDate(dayStart(to).toISOString())
    }`;
  }
  switch (range) {
    case '7d':
      return 'last 7 days';
    case '14d':
      return 'last 14 days';
    case '1m':
      return 'last month';
    case '3m':
      return 'last 3 months';
    case '6m':
      return 'last 6 months';
    case '1y':
      return 'last year';
    case 'all':
      return 'all time';
  }
};

interface TimeRangeToggleProps {
  value: RangeChoice;
  onChange: (value: RangeChoice) => void;
  /** Ends of the hand-picked window, as `yyyy-mm-dd`. */
  customFrom: string | null;
  customTo: string | null;
  onCustom: (from: string | null, to: string | null) => void;
  /** Oldest stored record — there is nothing before it to look at. */
  earliest: string | null;
  className?: string;
}

const DATE_INPUT_CLASS =
  'h-[23px] w-[74px] rounded-md border border-border bg-muted/30 px-1.5 text-center text-[10px] font-medium tabular-nums text-foreground';

/** `dd.mm.yyyy` as typed, in the `yyyy-mm-dd` every range function speaks. */
const parseEuDay = (text: string): string | null => {
  const match = /^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4})\.?$/.exec(text.trim());
  if (match === null) return null;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  // 31.02. is not a date: the constructor rolls it into March rather than failing.
  if (date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return null;
  return isoDay(date);
};

const euDay = (day: string): string => {
  const [year, month, date] = day.split('-');
  return `${date}.${month}.${year}`;
};

/**
 * One end of the window, written the way every date on screen is written. A
 * native date field was not usable here: it prints the browser's locale rather
 * than this one, and it reported every half-typed value — including years no
 * Date can hold, which took the page down with it. Only a whole, real date is
 * handed on; anything else is put back the moment the field is left.
 */
const DayInput = ({
  value,
  onCommit,
  title,
}: {
  value: string;
  onCommit: (day: string | null) => void;
  title: string;
}): JSX.Element => {
  const shown = value === '' ? '' : euDay(value);
  const [text, setText] = useState(shown);

  useEffect(() => setText(shown), [shown]);

  const commit = (): void => {
    const trimmed = text.trim();
    if (trimmed === '') {
      onCommit(null);
      return;
    }
    const day = parseEuDay(trimmed);
    if (day === null) setText(shown);
    else onCommit(day);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      placeholder="dd.mm.yyyy"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      title={title}
      className={DATE_INPUT_CLASS}
    />
  );
};

/**
 * The fixed periods plus a window of your own. The two pickers stay hidden until
 * Custom is on: a pair of date fields sitting next to a highlighted "6M" reads
 * as a second, contradicting answer to the same question.
 */
export const TimeRangeToggle = ({
  value,
  onChange,
  customFrom,
  customTo,
  onCustom,
  earliest,
  className,
}: TimeRangeToggleProps): JSX.Element => {
  const last = isoDay(new Date());
  const first = earliest === null ? undefined : isoDay(new Date(earliest));
  // Empty fields would say "no window at all"; the widest one is what Custom means
  // before anything is narrowed, and it is what the period already resolves to.
  const fromValue = customFrom ?? first ?? '';
  const toValue = customTo ?? last;

  return (
    <div className="inline-flex items-center gap-1.5">
      <SegmentedToggle
        value={value}
        options={TOGGLE_OPTIONS}
        onChange={onChange}
        className={className}
      />
      {value === 'custom' && (
        <div className="inline-flex items-center gap-1">
          {/* Neither end bounds the other: a window outside the data simply comes
              back empty, which is honest, and clamping while typing is not. */}
          <DayInput
            value={fromValue}
            onCommit={(day) => onCustom(day, customTo)}
            title="First day of the window"
          />
          <span className="text-[10px] text-muted-foreground">–</span>
          <DayInput
            value={toValue}
            onCommit={(day) => onCustom(customFrom, day)}
            title="Last day of the window"
          />
        </div>
      )}
    </div>
  );
};
