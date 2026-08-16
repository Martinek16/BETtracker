import type { ReactNode } from 'react';
import { CardNote } from '@/components/analytics/card-note';
import { DashboardCard } from '@/components/dashboard/dashboard-card';

export const TOOLTIP_STYLE = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  color: 'hsl(var(--popover-foreground))',
  fontSize: 12,
} as const;

interface ChartTooltipProps<T> {
  /** What to write under the heading. One line per fact, shortest first. */
  lines: (row: T) => readonly string[];
  /** Heading, where the axis label is not already the name of the thing. */
  heading?: (row: T) => string;
  /** Recharts fills these in when it clones the element it was handed. */
  active?: boolean;
  payload?: readonly { payload?: T }[];
  label?: string | number;
}

/**
 * One hover panel for every chart in the app, so a reading means the same thing
 * wherever it is taken. Recharts' own tooltip prints a coloured key and a raw
 * value, which says the number without saying what it is.
 */
export const ChartTooltip = <T,>({
  lines,
  heading,
  active,
  payload,
  label,
}: ChartTooltipProps<T>): JSX.Element | null => {
  const row = payload?.[0]?.payload;
  if (active !== true || row === undefined) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 shadow-md">
      <p className="text-[11px] font-semibold text-popover-foreground">
        {heading === undefined ? String(label ?? '') : heading(row)}
      </p>
      <ul className="mt-0.5 space-y-px">
        {lines(row).map((line) => (
          <li key={line} className="text-[11px] leading-snug text-muted-foreground">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
};

interface ChartFrameProps {
  title: string;
  /** What the plot says and how to read it, under it - where every card ends. */
  note?: string;
  children: ReactNode;
}

export const ChartFrame = ({ title, note, children }: ChartFrameProps): JSX.Element => (
  <DashboardCard className="flex min-h-0 flex-1 flex-col gap-1 p-3">
    <h3 className="text-xs font-semibold text-foreground">{title}</h3>
    <div className="min-h-[5rem] flex-1">{children}</div>
    {note === undefined ? null : <CardNote>{note}</CardNote>}
  </DashboardCard>
);
