import { CalendarOff, PlugZap, type LucideIcon } from 'lucide-react';

interface ChartEmptyProps {
  icon?: LucideIcon;
  /**
   * True when nothing has ever been imported, so the chart is empty because no
   * account is connected - not because the chosen window happens to be quiet.
   * The two read the same on screen but need opposite next steps.
   */
  noSource?: boolean;
  title?: string;
  hint?: string;
}

export const ChartEmpty = ({
  icon,
  noSource = false,
  title,
  hint,
}: ChartEmptyProps): JSX.Element => {
  const Icon = icon ?? (noSource ? PlugZap : CalendarOff);

  return (
    <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-2 px-4 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-muted/40 text-muted-foreground">
        <Icon size={20} strokeWidth={1.5} />
      </span>
      <p className="text-sm font-medium text-foreground">
        {title ?? (noSource ? 'No data imported yet' : 'Nothing in this period')}
      </p>
      <p className="max-w-[260px] text-xs leading-relaxed text-muted-foreground">
        {hint ??
          (noSource
            ? 'Connect a bookmaker account and run a sync. Your betting history appears here once it has been imported.'
            : 'No bets fall inside the selected time range. Try a wider period.')}
      </p>
    </div>
  );
};
