/** Horizontal 0–100% track with the confidence interval drawn as a band. */
export const IntervalBar = ({
  low,
  high,
  marker,
  fair,
  value,
}: {
  low: number;
  high: number;
  marker: number;
  /** Where the price sits once the house cut is taken out of it: par, not zero.
   *  Landing between this and `marker` is the margin, not a mistake. */
  fair?: number;
  /** What actually landed. The band alone says where it could be, not where it is. */
  value?: number;
}): JSX.Element => (
  <div className="relative h-2 w-full rounded-full bg-muted/30">
    {fair === undefined ? null : (
      <span
        className="absolute inset-y-0 bg-muted-foreground/15"
        style={{ left: `${Math.min(fair, marker)}%`, width: `${Math.abs(marker - fair)}%` }}
      />
    )}
    <span
      className="absolute inset-y-0 rounded-full bg-foreground/25"
      style={{ left: `${low}%`, width: `${Math.max(0, high - low)}%` }}
    />
    {fair === undefined ? null : (
      <span
        className="absolute inset-y-[-2px] w-0.5 bg-muted-foreground/60"
        style={{ left: `${fair}%` }}
      />
    )}
    <span className="absolute inset-y-[-2px] w-0.5 bg-foreground" style={{ left: `${marker}%` }} />
    {value === undefined ? null : (
      <span
        className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
        style={{
          left: `${value}%`,
          backgroundColor: `hsl(var(--${value >= marker ? 'profit' : 'loss'}))`,
        }}
      />
    )}
  </div>
);
