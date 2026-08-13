/** Centered-zero horizontal bar: green to the right for profit, red left for loss. */
export const ProfitBar = ({ profit, maxAbs }: { profit: number; maxAbs: number }): JSX.Element => {
  const pct = maxAbs === 0 ? 0 : (Math.abs(profit) / maxAbs) * 50;
  const positive = profit >= 0;
  return (
    <div className="relative h-2 w-full rounded-full bg-muted/30">
      {/* Zero, drawn past the track on both sides so the reader can see which
          side of it a bar sits on without measuring. */}
      <span className="absolute inset-y-[-3px] left-1/2 w-px -translate-x-1/2 bg-foreground/40" />
      {/* Only the outer end is rounded: a curve where the bar meets zero would
          read as a gap between the bar and the line it grows from. */}
      <span
        className={`absolute inset-y-0 transition-[width] duration-300 ${
          positive ? 'rounded-r-full' : 'rounded-l-full'
        }`}
        style={{
          width: `${pct}%`,
          [positive ? 'left' : 'right']: '50%',
          backgroundColor: `hsl(var(--${positive ? 'profit' : 'loss'}))`,
        }}
      />
    </div>
  );
};
