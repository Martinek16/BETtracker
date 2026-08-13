/** Horizontal 0–100% track with the confidence interval drawn as a band. */
export const IntervalBar = ({
  low,
  high,
  marker,
}: {
  low: number;
  high: number;
  marker: number;
}): JSX.Element => (
  <div className="relative h-2 w-full rounded-full bg-muted/30">
    <span
      className="absolute inset-y-0 rounded-full bg-foreground/25"
      style={{ left: `${low}%`, width: `${Math.max(0, high - low)}%` }}
    />
    <span
      className="absolute inset-y-[-2px] w-0.5 bg-foreground"
      style={{ left: `${marker}%` }}
    />
  </div>
);
