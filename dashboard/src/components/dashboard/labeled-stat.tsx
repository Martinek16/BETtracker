import { cn } from '@/lib/utils';

interface LabeledStatProps {
  label: string;
  value: string;
  hint?: string;
  valueClassName?: string;
}

export const LabeledStat = ({
  label,
  value,
  hint,
  valueClassName,
}: LabeledStatProps): JSX.Element => (
  <div className="space-y-1">
    <p className="text-[11px] text-muted-foreground">{label}</p>
    <p className={cn('text-sm font-semibold tabular-nums', valueClassName)}>{value}</p>
    {hint ? <p className="text-[10px] text-muted-foreground">{hint}</p> : null}
  </div>
);
