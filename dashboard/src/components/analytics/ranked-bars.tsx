import { cn } from '@/lib/utils';

export interface RankedRow {
  label: string;
  value: number;
  sample: number;
  /** Optional extra right-hand columns, e.g. units and the money behind them. */
  note?: string;
  extra?: string;
  /** Draw muted regardless of sample size — the figure is real, the pattern is not. */
  unreliable?: boolean;
  /** Hover text on the label, for anything that did not earn a column. */
  title?: string;
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
  // 1 draws every rate under 1 as a sliver nobody can compare.
  const max = Math.max(...rows.map((r) => Math.abs(r.value))) || 1;
  const shown = slots === undefined ? rows : rows.slice(0, slots);

  return (
    <ul className="space-y-1">
      <li className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
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
        return (
          <li key={row.label} className="flex items-center gap-2">
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
                  width: `${(Math.abs(row.value) / max) * 50}%`,
                  [row.value >= 0 ? 'left' : 'right']: '50%',
                  backgroundColor: `hsl(var(--${row.value >= 0 ? 'profit' : 'loss'}))`,
                }}
              />
            </div>
            <span
              className={cn(
                'w-14 shrink-0 text-right text-xs font-medium tabular-nums',
                row.value >= 0 ? 'text-profit' : 'text-loss',
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
