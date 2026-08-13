import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardCard } from './dashboard-card';

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  subtitle?: string;
  /** Count or context set beside the label instead of under the figure, which keeps the card one line shorter. */
  note?: string;
  tone?: 'profit' | 'loss' | 'neutral';
  /** Lights the icon up. For a run worth noticing, never for the figure's sign. */
  iconHot?: boolean;
  /** Set to make the whole card a switch between two readings of the same metric. */
  onClick?: () => void;
  title?: string;
}

export const MetricCard = ({
  icon: Icon,
  label,
  value,
  subtitle,
  note,
  tone = 'neutral',
  iconHot = false,
  onClick,
  title,
}: MetricCardProps): JSX.Element => (
  <DashboardCard
    className={cn(
      'flex flex-col gap-2 p-3.5',
      onClick && 'cursor-pointer outline-none',
    )}
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onKeyDown={
      onClick
        ? (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onClick();
            }
          }
        : undefined
    }
    title={title}
  >
    <div className="flex items-start gap-2">
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40',
          iconHot ? 'text-orange-500' : 'text-muted-foreground',
        )}
      >
        <Icon
          size={15}
          strokeWidth={1.75}
          className={cn(iconHot && 'animate-ember motion-reduce:animate-none')}
        />
      </span>
      <p
        className="min-w-0 flex-1 truncate pt-1.5 text-xs font-bold leading-snug text-muted-foreground"
        title={label}
      >
        {label}
      </p>
      {note ? (
        <p className="shrink-0 pt-1.5 text-[11px] leading-snug text-muted-foreground/80" title={note}>
          {note}
        </p>
      ) : null}
    </div>

    <div className="min-w-0">
      <p
        className={cn(
          'truncate text-xl font-semibold leading-none tracking-tight tabular-nums',
          tone === 'profit' && 'text-profit',
          tone === 'loss' && 'text-loss',
          tone === 'neutral' && 'text-foreground',
        )}
        title={value}
      >
        {value}
      </p>
      {subtitle ? (
        <p className="mt-1.5 truncate text-[11px] leading-snug text-muted-foreground/90">{subtitle}</p>
      ) : null}
    </div>
  </DashboardCard>
);
