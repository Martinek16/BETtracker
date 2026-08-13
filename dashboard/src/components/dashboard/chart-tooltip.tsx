import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Half the tooltip width — callers clamp their `left` by this so it stays inside the plot. */
export const TOOLTIP_HALF_WIDTH = 78;

interface ChartTooltipRow {
  label: string;
  value: string;
  tone?: 'profit' | 'loss' | 'neutral';
  /** Drawn left of the label, for a row that belongs to one bookmaker. */
  icon?: ReactNode;
}

interface ChartTooltipProps {
  title: string;
  rows: ChartTooltipRow[];
  className?: string;
  placement?: 'top' | 'bottom';
  /** Positions the tooltip explicitly; the caller owns the horizontal transform. */
  style?: CSSProperties;
}

export const ChartTooltip = ({
  title,
  rows,
  className,
  placement = 'top',
  style,
}: ChartTooltipProps): JSX.Element => {
  // Setting both `top` and `bottom` on an absolute box pins both edges and
  // squashes it, so a caller that positions vertically owns that axis alone.
  const ownsVertical = style?.top !== undefined || style?.bottom !== undefined;

  return (
    <div
      style={style}
      className={cn(
        'pointer-events-none absolute z-20 w-[150px]',
        style === undefined && 'left-1/2 -translate-x-1/2',
        'rounded-md border border-border bg-popover px-2.5 py-2 shadow-lg',
        !ownsVertical && placement === 'top' && 'bottom-full mb-1.5',
        !ownsVertical && placement === 'bottom' && 'top-1',
        className,
      )}
    >
      <p className="truncate text-[11px] font-semibold text-popover-foreground">{title}</p>
      <div className="mt-1.5 space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-[10px]">
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              {row.icon}
              <span className="truncate">{row.label}</span>
            </span>
            <span
              className={cn(
                'font-medium tabular-nums',
                row.tone === 'profit' && 'text-profit',
                row.tone === 'loss' && 'text-loss',
                (!row.tone || row.tone === 'neutral') && 'text-popover-foreground',
              )}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
