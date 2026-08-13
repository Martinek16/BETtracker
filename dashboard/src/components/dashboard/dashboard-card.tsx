import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface DashboardCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export const DashboardCard = ({
  children,
  className,
  ...props
}: DashboardCardProps): JSX.Element => (
  <div
    className={cn('overflow-hidden rounded-md border border-border bg-card p-5', className)}
    {...props}
  >
    {children}
  </div>
);

export const DashboardCardHeader = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): JSX.Element => (
  <div className={cn('mb-4 flex flex-wrap items-start justify-between gap-3', className)} {...props} />
);

/** Primary card title — use on every card so the section is identifiable. */
export const DashboardCardHeading = ({
  title,
  subtitle,
  action,
  sample,
  className,
}: {
  title: ReactNode;
  subtitle?: string;
  action?: ReactNode;
  /** How much the card is built on, e.g. "147 picks" — keeps counts out of the prose. */
  sample?: ReactNode;
  className?: string;
}): JSX.Element => (
  <div className={cn('mb-4 flex items-start justify-between gap-3', className)}>
    <div className="min-w-0">
      <h3 className="text-[0.95rem] font-semibold tracking-tight text-foreground">{title}</h3>
      {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
    </div>
    {action || sample ? (
      <div className="shrink-0 text-right">
        {action}
        {sample ? (
          <p className="text-[10px] tabular-nums text-muted-foreground">{sample}</p>
        ) : null}
      </div>
    ) : null}
  </div>
);

export const DashboardCardTitle = ({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>): JSX.Element => (
  <p className={cn('text-xs text-muted-foreground', className)} {...props} />
);

export const DashboardCardMetric = ({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>): JSX.Element => (
  <p className={cn('text-2xl font-semibold tracking-tight text-foreground tabular-nums', className)} {...props} />
);

