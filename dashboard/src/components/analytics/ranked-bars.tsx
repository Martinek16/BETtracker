import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface RankedRow {
  label: string;
  /** A flag or a sport's icon, drawn before the name. Undefined on every row
   *  where the dimension carries no such mark, and then no column is kept. */
  mark?: ReactNode;
  value: number;
  sample: number;
  /** Optional extra right-hand columns, e.g. units and the money behind them. */
  note?: string;
  extra?: string;
  /** Draw muted regardless of sample size - the figure is real, the pattern is not. */
  unreliable?: boolean;
  /** Hover text on the label, for anything that did not earn a column. */
  title?: string;
  /**
   * Where par sits for this row, when zero is not it. A hit rate is always
   * expected to land under its price by the bookmaker's own margin, so the bar
   * grows from that line and takes its colour from which side of it the row is
   * on - otherwise every honest row reads as a loss.
   */
  baseline?: number;
}

interface RankedBarsProps {
  rows: readonly RankedRow[];
  /** Headers for the label and value columns; the third names an optional sample
   *  column, left out where the count is context rather than a figure to read. */
  columns: readonly [string, string, string?];
  formatValue: (value: number) => string;
  noteColumn?: string;
  extraColumn?: string;
  /** Rows below this sample count render muted and never carry a verdict. */
  lowSample?: number;
  /** Most rows to draw; the rest are dropped. */
  slots?: number;
}

export const RankedBars = ({
  rows,
  columns,
  formatValue,
  noteColumn,
  extraColumn,
  lowSample = 10,
  slots,
}: RankedBarsProps): JSX.Element => {
  // Bars are read against the widest row, whatever the unit: a fixed ceiling of
  // 1 draws every rate under 1 as a sliver nobody can compare. Par lines count
  // towards the ceiling too, or a bar would grow off the end of its track.
  const max = Math.max(...rows.flatMap((r) => [Math.abs(r.value), Math.abs(r.baseline ?? 0)])) || 1;
  const shown = slots === undefined ? rows : rows.slice(0, slots);
  // One row without a flag must not shunt its name out of line with the rest,
  // so the column is kept for the whole list as soon as any row carries a mark.
  const marked = shown.some((row) => row.mark !== undefined);
  /** Where a figure sits on the track, 0–100, with zero in the middle. */
  const at = (value: number): number => 50 + (value / max) * 50;

  return (
    <ul className="space-y-1">
      {/* The list is allowed to run past its card and scroll, so the column names
          have to stay put - a bar with no header is a bar with no unit. */}
      <li className="sticky top-0 z-10 flex items-center gap-2 bg-card pb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {marked ? <span className="w-4 shrink-0" /> : null}
        <span className="min-w-0 flex-1 truncate">{columns[0]}</span>
        <span className="w-14 shrink-0 text-center">Loss/Win</span>
        <span className="w-14 shrink-0 text-right">{columns[1]}</span>
        {columns[2] === undefined ? null : (
          <span className="w-10 shrink-0 text-right">{columns[2]}</span>
        )}
        {noteColumn === undefined ? null : (
          <span className="w-12 shrink-0 text-right">{noteColumn}</span>
        )}
        {extraColumn === undefined ? null : (
          <span className="w-14 shrink-0 text-right">{extraColumn}</span>
        )}
      </li>
      {shown.map((row) => {
        const thin = row.sample < lowSample || row.unreliable === true;
        const base = row.baseline ?? 0;
        const good = row.value >= base;
        return (
          <li key={row.label} className="flex items-center gap-2">
            {marked ? (
              <span className="flex w-4 shrink-0 items-center justify-center">{row.mark}</span>
            ) : null}
            <span
              className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
              title={row.title ?? row.label}
            >
              {row.label}
            </span>
            <div className="relative h-2 w-14 shrink-0 rounded-full bg-muted/30">
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />
              <span
                className={cn('absolute inset-y-0 rounded-full', thin && 'opacity-30')}
                style={{
                  left: `${Math.min(at(base), at(row.value))}%`,
                  width: `${Math.abs(at(row.value) - at(base))}%`,
                  backgroundColor: `hsl(var(--${good ? 'profit' : 'loss'}))`,
                }}
              />
              {row.baseline === undefined ? null : (
                <span
                  className="absolute inset-y-[-2px] w-px bg-muted-foreground/70"
                  style={{ left: `${at(base)}%` }}
                />
              )}
            </div>
            <span
              className={cn(
                'w-14 shrink-0 text-right text-xs font-medium tabular-nums',
                good ? 'text-profit' : 'text-loss',
                // A thin row is faded, never recoloured: money that did not come
                // back is red however few slips are behind it.
                thin && 'opacity-60',
              )}
            >
              {formatValue(row.value)}
            </span>
            {columns[2] === undefined ? null : (
              <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                {row.sample}
              </span>
            )}
            {noteColumn === undefined ? null : (
              <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                {row.note ?? ''}
              </span>
            )}
            {extraColumn === undefined ? null : (
              <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                {row.extra ?? ''}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
};
