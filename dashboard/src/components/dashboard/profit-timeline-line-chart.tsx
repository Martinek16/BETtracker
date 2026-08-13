import { useMemo, useState } from 'react';
import type { Bookmaker } from '@betanal/shared';
import { axisTicks, type ChartBucket } from '@/lib/chart-data';
import { AccountIcon } from './account-icon';
import {
  axisLabelAlign,
  buildProfitChartScale,
  ratioFromPct,
  smoothAreaPath,
  smoothLinePath,
  toPctX,
  yTickLayout,
} from '@/lib/profit-chart-scale';
import { ChartEmpty } from '@/components/charts/chart-empty';
import { ChartTooltip, TOOLTIP_HALF_WIDTH } from './chart-tooltip';
import { cn, formatMoney } from '@/lib/utils';

const FILL_GRADIENT_ID = 'profit-line-fill';
const STROKE_GRADIENT_ID = 'profit-line-stroke';

/** One account's running total over the same buckets as `data`. */
export interface TimelineSeries {
  bookmaker: Bookmaker;
  label: string;
  color: string;
  /** Cumulative profit at each bucket, same length and order as `data`. */
  values: number[];
}

interface ProfitTimelineLineChartProps {
  data: ChartBucket[];
  currency?: string;
  days?: number | null;
  className?: string;
  /**
   * Two or more accounts split the line into one per account. A single account
   * keeps the green-above-zero / red-below-zero curve, which says more than a
   * lone coloured line would.
   */
  series?: TimelineSeries[];
  /** Nothing has ever been imported, as opposed to nothing in this window. */
  noSource?: boolean;
}

export const ProfitTimelineLineChart = ({
  data,
  currency = 'EUR',
  days = null,
  className,
  series,
  noSource = false,
}: ProfitTimelineLineChartProps): JSX.Element => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // A line reads as one continuous quantity, so it plots the running total. The
  // bar view already answers "what did this day do"; drawing the same per-period
  // figure as a curve implies a trend between points that isn't there.
  const running = useMemo(() => {
    let total = 0;
    return data.map((d) => {
      total += d.profit;
      return total;
    });
  }, [data]);

  const split = series !== undefined && series.length >= 2;

  const scale = useMemo(
    () =>
      buildProfitChartScale(
        split ? series!.flatMap((s) => s.values) : running,
        currency,
      ),
    [split, series, running, currency],
  );

  const points = useMemo(() => {
    if (scale === null) return [];
    return running.map((total, i) => ({
      x: toPctX(i, data.length),
      y: scale.toPctY(total),
    }));
  }, [running, data.length, scale]);

  const seriesPoints = useMemo(() => {
    if (scale === null || !split) return [];
    return series!.map((s) => ({
      ...s,
      points: s.values.map((total, i) => ({ x: toPctX(i, data.length), y: scale.toPctY(total) })),
    }));
  }, [split, series, data.length, scale]);

  const xLabels = useMemo(() => axisTicks(data, days), [data, days]);

  if (data.length === 0 || scale === null) {
    return <ChartEmpty noSource={noSource} />;
  }

  // Crosshair and tooltip belong to the cursor, so they exist only while it is
  // over the plot. A fallback index leaves them on screen after the mouse has
  // gone, reading as a hover that isn't happening.
  const active = hoveredIndex === null ? null : data[hoveredIndex];
  const activePoint = hoveredIndex === null ? null : points[hoveredIndex];
  const endPoint = points[points.length - 1];
  // Every curve the crosshair crosses, not just the combined one: with a split
  // chart the tooltip has to clear the highest of them.
  const hoveredYs =
    hoveredIndex === null
      ? []
      : split
        ? seriesPoints.flatMap((s) => {
            const p = s.points[hoveredIndex];
            return p === undefined ? [] : [p.y];
          })
        : activePoint == null
          ? []
          : [activePoint.y];
  const tipBelow = hoveredYs.length > 0 && Math.min(...hoveredYs) < 46;
  const linePath = smoothLinePath(points);
  const areaPath = smoothAreaPath(points, scale.zeroPct);
  const showZeroLine = scale.yMin < 0 && scale.yMax > 0;
  // Hard colour stop at the zero line so the line/fill is green above 0, red below.
  const zeroOffset = Math.max(0, Math.min(100, scale.zeroPct));
  // The marker sits on the curve, so it takes the curve's own colour there —
  // which is the running total's sign, not the period's profit.
  const runningTone = (index: number): string =>
    (running[index] ?? 0) >= 0 ? 'hsl(var(--profit))' : 'hsl(var(--loss))';
  // The crosshair x is shared: every series is sampled at the same bucket.
  const crosshairX = hoveredIndex === null ? null : toPctX(hoveredIndex, data.length);

  // Points are inset by X_PAD, so the raw cursor ratio has to be mapped back
  // through the same inset or the crosshair snaps to a point beside the cursor.
  const resolveIndex = (clientX: number, rect: DOMRect): number => {
    if (data.length <= 1) return 0;
    const ratio = ratioFromPct(((clientX - rect.left) / rect.width) * 100);
    return Math.round(ratio * (data.length - 1));
  };

  return (
    <div className={cn('flex h-full min-h-0 flex-col overflow-hidden', className)}>
      {split ? (
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1">
          {seriesPoints.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      ) : null}

      {/* The label column is a sibling of the plot alone. Spanning the x-axis row
          too would stretch the 0–100% the labels sit in, dragging each one below
          its grid line and the last one down level with the dates. */}
      <div className="flex min-h-0 flex-1 gap-2 py-1.5">
        <div className="relative w-10 shrink-0">
          {scale.yTicks.map((tick, i) => {
            const { pct, labelClassName } = yTickLayout(i, scale.yTicks.length);
            return (
              <span
                key={tick}
                className={cn(
                  'absolute right-0 text-[10px] leading-none tabular-nums text-muted-foreground',
                  labelClassName,
                )}
                style={{ top: `${pct}%` }}
              >
                {scale.formatY(tick)}
              </span>
            );
          })}
        </div>

        <div
          className="relative min-w-0 flex-1 overflow-hidden"
          onMouseMove={(e) =>
            setHoveredIndex(resolveIndex(e.clientX, e.currentTarget.getBoundingClientRect()))
          }
          onMouseLeave={() => setHoveredIndex(null)}
        >
            {scale.yTicks.map((tick, i) => {
              const { pct, lineClassName } = yTickLayout(i, scale.yTicks.length);
              return (
                <div
                  key={`grid-${tick}`}
                  className={cn(
                    'pointer-events-none absolute inset-x-0 border-t',
                    tick === 0 && showZeroLine ? 'border-border/60' : 'border-border/15',
                    lineClassName,
                  )}
                  style={{ top: `${pct}%` }}
                />
              );
            })}

            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {/* userSpaceOnUse, not the default objectBoundingBox: the latter
                  measures offsets against the path's own bounding box, so the
                  colour stop lands wherever the line happens to peak instead of
                  on zero — painting part of a losing stretch green. */}
              <defs>
                <linearGradient
                  id={FILL_GRADIENT_ID}
                  gradientUnits="userSpaceOnUse"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="100"
                >
                  <stop offset="0%" stopColor="hsl(var(--profit))" stopOpacity={0.22} />
                  <stop offset={`${zeroOffset}%`} stopColor="hsl(var(--profit))" stopOpacity={0} />
                  <stop offset={`${zeroOffset}%`} stopColor="hsl(var(--loss))" stopOpacity={0} />
                  <stop offset="100%" stopColor="hsl(var(--loss))" stopOpacity={0.22} />
                </linearGradient>
                <linearGradient
                  id={STROKE_GRADIENT_ID}
                  gradientUnits="userSpaceOnUse"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="100"
                >
                  <stop offset="0%" stopColor="hsl(var(--profit))" />
                  <stop offset={`${zeroOffset}%`} stopColor="hsl(var(--profit))" />
                  <stop offset={`${zeroOffset}%`} stopColor="hsl(var(--loss))" />
                  <stop offset="100%" stopColor="hsl(var(--loss))" />
                </linearGradient>
              </defs>

              {split ? (
                // No area fill per account: two translucent bands over each other
                // read as a third colour that means nothing.
                seriesPoints.map((s) => (
                  <path
                    key={s.label}
                    d={smoothLinePath(s.points)}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ))
              ) : (
                <>
                  <path d={areaPath} fill={`url(#${FILL_GRADIENT_ID})`} stroke="none" />
                  <path
                    d={linePath}
                    fill="none"
                    stroke={`url(#${STROKE_GRADIENT_ID})`}
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </>
              )}

              {crosshairX !== null ? (
                <line
                  x1={crosshairX}
                  y1={0}
                  x2={crosshairX}
                  y2={100}
                  stroke="hsl(var(--foreground))"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                  opacity={0.2}
                />
              ) : null}
            </svg>

            {!split && hoveredIndex === null && endPoint ? (
              <span
                className="pointer-events-none absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${endPoint.x}%`,
                  top: `${endPoint.y}%`,
                  backgroundColor: runningTone(running.length - 1),
                }}
              />
            ) : null}

            {/* Solid, in the colour of the curve it sits on: a ringed marker on a
                white plate reads as its own mark rather than a point on the line. */}
            {!split && hoveredIndex !== null && activePoint ? (
              <span
                className="pointer-events-none absolute z-[5] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${activePoint.x}%`,
                  top: `${activePoint.y}%`,
                  backgroundColor: runningTone(hoveredIndex),
                }}
              />
            ) : null}

            {split && hoveredIndex !== null
              ? seriesPoints.map((s) => {
                  const p = s.points[hoveredIndex];
                  if (p === undefined) return null;
                  return (
                    <span
                      key={s.label}
                      className="pointer-events-none absolute z-[5] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                      style={{ left: `${p.x}%`, top: `${p.y}%`, backgroundColor: s.color }}
                    />
                  );
                })
              : null}

          {/* Same component and same rows as the bar view: switching the toggle
              should change the drawing, not what the chart is willing to tell you. */}
          {active && hoveredIndex !== null && crosshairX !== null ? (
            <ChartTooltip
              title={active.periodLabel ?? active.label}
              style={{
                // Set beside the crosshair rather than centred on it, so the box
                // never covers the points it is describing. It swaps sides at the
                // halfway mark to stay inside the plot.
                left:
                  crosshairX < 50
                    ? `calc(${crosshairX}% + 10px)`
                    : `calc(${crosshairX}% - ${TOOLTIP_HALF_WIDTH * 2 + 10}px)`,
                // Pinned to whichever edge the points aren't near. Anchoring it to
                // a point's own y lets the box run past the clipped plot.
                ...(tipBelow ? { bottom: 4 } : { top: 4 }),
              }}
              rows={
                split
                  ? seriesPoints.map((s) => ({
                      label: s.label,
                      value: formatMoney(s.values[hoveredIndex] ?? 0, currency),
                      tone: (s.values[hoveredIndex] ?? 0) >= 0 ? ('profit' as const) : ('loss' as const),
                      icon: (
                        <AccountIcon
                          bookmaker={s.bookmaker}
                          className="h-3 w-3 shrink-0 overflow-hidden rounded-[2px]"
                        />
                      ),
                    }))
                  : [
                      {
                        label: 'Profit',
                        value: formatMoney(active.profit, currency),
                        tone: active.profit >= 0 ? ('profit' as const) : ('loss' as const),
                      },
                      { label: 'Won', value: formatMoney(active.wins, currency), tone: 'profit' as const },
                      { label: 'Lost', value: formatMoney(active.losses, currency), tone: 'loss' as const },
                      { label: 'Bets', value: String(active.bets), tone: 'neutral' as const },
                    ]
              }
            />
          ) : null}
        </div>
      </div>

      {/* Mirrors the plot row's spacer + gap so each label stays over its point. */}
      <div className="flex h-5 shrink-0 gap-2">
        <div className="w-10 shrink-0" />
        <div className="relative min-w-0 flex-1">
          {xLabels.map(({ index, label }) => {
            const align = axisLabelAlign(index, data.length);
            return (
              <span
                key={index}
                className={cn(
                  'absolute whitespace-nowrap text-[10px] tabular-nums text-muted-foreground',
                  align.className,
                )}
                style={align.style}
              >
                {label}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};
