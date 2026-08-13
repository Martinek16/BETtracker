import { BarChart3, LineChart } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TimelineChartView = 'bars' | 'line';

interface ChartViewToggleProps {
  value: TimelineChartView;
  onChange: (value: TimelineChartView) => void;
  className?: string;
}

const OPTIONS: { value: TimelineChartView; label: string; icon: typeof BarChart3 }[] = [
  { value: 'bars', label: 'Bars', icon: BarChart3 },
  { value: 'line', label: 'Line', icon: LineChart },
];

export const ChartViewToggle = ({ value, onChange, className }: ChartViewToggleProps): JSX.Element => (
  <div
    className={cn(
      'inline-flex rounded-md border border-border bg-muted/30 p-0.5 text-[11px]',
      className,
    )}
    role="group"
    aria-label="Chart view"
  >
    {OPTIONS.map(({ value: v, label, icon: Icon }) => (
      <button
        key={v}
        type="button"
        aria-pressed={value === v}
        aria-label={label}
        title={label}
        onClick={() => onChange(v)}
        className={cn(
          'inline-flex items-center justify-center rounded-[2px] px-2 py-1',
          value === v
            ? 'bg-foreground text-background'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <Icon size={13} strokeWidth={1.75} />
      </button>
    ))}
  </div>
);
