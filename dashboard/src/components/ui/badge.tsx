import { type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import type { BetStatus } from '@betanal/shared';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'text-foreground',
        won: 'border-transparent bg-profit/15 text-profit',
        lost: 'border-transparent bg-loss/15 text-loss',
        void: 'border-transparent bg-muted text-muted-foreground',
        pending: 'border-transparent bg-open/15 text-open',
        live: 'border-transparent bg-live/15 text-live',
        cashed_out: 'border-transparent bg-cashedOut/15 text-cashedOut',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = ({ className, variant, ...props }: BadgeProps): JSX.Element => (
  <span className={cn(badgeVariants({ variant }), className)} {...props} />
);

const STATUS_LABEL: Record<BetStatus, string> = {
  won: 'Won',
  lost: 'Lost',
  void: 'Void',
  pending: 'Open',
  cashed_out: 'Cashed out',
};

/** `live` says the event has started, which the status alone cannot tell apart. */
export const StatusBadge = ({
  status,
  live = false,
}: {
  status: BetStatus;
  live?: boolean;
}): JSX.Element => {
  const inPlay = status === 'pending' && live;
  return <Badge variant={inPlay ? 'live' : status}>{inPlay ? 'Live' : STATUS_LABEL[status]}</Badge>;
};
