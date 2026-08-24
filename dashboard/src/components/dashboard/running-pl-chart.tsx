import { useMemo, useState } from 'react';
import { type EquityPoint } from '@betanal/shared';
import { rangeCutoff, rangeEnd } from '@/lib/chart-data';
import {
  axisLabelAlignAt,
  buildProfitChartScale,
  pctFromRatio,
  pickXLabelIndices,
  ratioFromPct,
  stepAreaPath,
  stepLinePath,
  toPctX,
  yTickLayout,
} from '@/lib/profit-chart-scale';
import { ChartEmpty } from '@/components/charts/chart-empty';
import { ChartTooltip, TOOLTIP_HALF_WIDTH } from './chart-tooltip';
import { cn, formatAxisDate, formatDate, formatMoney } from '@/lib/utils';

interface RunningPlChartProps {
  series: readonly EquityPoint[];
  currency?: string;
  days?: number | null;
  /** Midnight of the window's last day; `null` when it runs to now. */
  until?: number | null;
  className?: string;
  deltaLabel?: string;
  totalLabel?: string;
  /** Nothing has ever been imported, as opposed to nothing in this window. */
  noSource?: boolean;
  /**
   * Space the points evenly and count the axis in entries rather than in days.
   * A casino evening puts hundreds of rounds inside one hour, and on a time axis
   * that whole evening is a single vertical wall with nothing readable in it.
   */
  byIndex?: boolean;
}

const GRADIENT_ID = 'running-pl-fill';
const STROKE_ID = 'running-pl-stroke';
const DAY_MS = 86_400_000;
const MAX_X_TICKS = 6;

export const RunningPlChart = ({
  series,
  currency = 'EUR',
  days = null,
  until = null,
  className,
  deltaLabel = 'Bet P/L',
  totalLabel = 'Running total',
  noSource = false,
  byIndex = false,
}: RunningPlChartProps): JSX.Element => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const scale = useMemo(
    () =>
      buildProfitChartScale(
        series.map((p) => p.cumulative),
        currency,
      ),
    [series, currency],
  );

  // The x-axis is time, not event order: two entries minutes apart must not take
  // the same width as two months apart. For a fixed range the axis spans exactly
  // that window, so the dates below are the same whatever the data does.
  const domain = useMemo(() => {
    const stamps = series.map((p) => Date.parse(p.date)).filter((t) => Number.isFinite(t));
    if (stamps.length === 0) return null;
    const end = days === null ? Math.max(...stamps) : until === null ? Date.now() : rangeEnd(until);
    const start = days === null ? Math.min(...stamps) : rangeCutoff(days, until);
    return end > start ? { start, end, span: end - start } : null;
  }, [series, days, until]);

  const plotPoints = useMemo(() => {
    if (scale === null || series.length === 0) return [];
    return series.map((p, i) => ({
      x: byIndex
        ? toPctX(i, series.length)
        : domain === null
          ? 50
          : pctFromRatio((Date.parse(p.date) - domain.start) / domain.span),
      y: scale.toPctY(p.cumulative),
      point: p,
    }));
  }, [series, scale, domain, byIndex]);

  // Ticks step back from the end of the window in whole days, so the gaps are an
  // equal number of days and the newest date is always labelled. Splitting the
  // span into fixed fractions lands ticks mid-day, and rounding those to dates
  // gives ragged gaps that read as a missing day rather than a sampled axis.
  // Duplicate labels are still dropped: an all-time range of a few weeks formats
  // every tick to the same month.
  const xTicks = useMemo(() => {
    // Counting entries: the label is the round's own number, not its date.
    if (byIndex) {
      return pickXLabelIndices(series.length, MAX_X_TICKS).map((i) => ({
        at: i,
        pct: toPctX(i, series.length),
        label: String(i + 1),
      }));
    }
    if (domain === null) return [];
    const spanDays = Math.max(1, Math.round(domain.span / DAY_MS));
    const stride = Math.ceil(spanDays / (MAX_X_TICKS - 1)) * DAY_MS;

    const ticks: { at: number; pct: number; label: string }[] = [];
    let prev = '';
    for (let at = domain.end; at >= domain.start; at -= stride) {
      const label = formatAxisDate(new Date(at).toISOString(), days);
      if (label === prev) continue;
      prev = label;
      ticks.push({ at, pct: pctFromRatio((at - domain.start) / domain.span), label });
    }
    return ticks.reverse();
  }, [domain, days, byIndex, series.length]);

  if (series.length === 0 || scale === null) {
    return <ChartEmpty noSource={noSource} />;
  }

  const isHovering = hoveredIndex !== null;
  const activeIndex = isHovering ? hoveredIndex : null;
  const active = activeIndex !== null ? plotPoints[activeIndex] : null;
  // Flip the tooltip below the point when the point sits high in the plot, so
  // it never escapes the clipped chart box and stays readable.
  const tipBelow = active != null && active.y < 46;
  // Anchor the line to both edges of the window: flat at the starting value
  // before the first event, flat at the running total after the last. Without
  // this the whole curve bunches into whatever sliver of time contains data.
  const first = plotPoints[0];
  const last = plotPoints[plotPoints.length - 1];
  const linePoints =
    first && last
      ? [
          { x: pctFromRatio(0), y: scale.toPctY(first.point.cumulative - first.point.profit) },
          ...plotPoints,
          { x: pctFromRatio(1), y: last.y },
        ]
      : plotPoints;
  const linePath = stepLinePath(linePoints);
  const areaPath = stepAreaPath(linePoints, scale.zeroPct);
  const showZeroLine = scale.yMin < 0 && scale.yMax > 0;
  const profitColor = 'hsl(var(--profit))';
  const lossColor = 'hsl(var(--loss))';
  // Hard color stop at the zero line so the line/fill is green above 0, red below.
  const zeroOffset = Math.max(0, Math.min(100, scale.zeroPct));

  // Pick the point nearest in time to the cursor, since points are no longer
  // evenly spaced across the plot.
  const resolveIndex = (clientX: number, rect: DOMRect): number => {
    if (series.length <= 1) return 0;
    const ratio = ratioFromPct(((clientX - rect.left) / rect.width) * 100);
    if (byIndex) return Math.round(ratio * (series.length - 1));
    if (domain === null) return 0;
    const at = domain.start + ratio * domain.span;
    let best = 0;
    let bestGap = Infinity;
    series.forEach((p, i) => {
      const gap = Math.abs(Date.parse(p.date) - at);
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    });
    return best;
  };

  return (
    <div className={cn('flex h-full min-h-0 flex-col overflow-hidden', className)}>
      {/* The label column is a sibling of the plot alone. Spanning the x-axis row
          too would stretch the 0–100% the labels sit in, dragging each one below
          its grid line and the last one down level with the dates. */}
      <div className="flex min-h-0 flex-1 gap-2 py-1.5">
        <div className="relative w-8 shrink-0">
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
            <defs>
              <linearGradient
                id={STROKE_ID}
                gradientUnits="userSpaceOnUse"
                x1="0"
                y1="0"
                x2="0"
                y2="100"
              >
                <stop offset="0%" stopColor={profitColor} />
                <stop offset={`${zeroOffset}%`} stopColor={profitColor} />
                <stop offset={`${zeroOffset}%`} stopColor={lossColor} />
                <stop offset="100%" stopColor={lossColor} />
              </linearGradient>
              <linearGradient
                id={GRADIENT_ID}
                gradientUnits="userSpaceOnUse"
                x1="0"
                y1="0"
                x2="0"
                y2="100"
              >
                <stop offset="0%" stopColor={profitColor} stopOpacity={0.22} />
                <stop offset={`${zeroOffset}%`} stopColor={profitColor} stopOpacity={0} />
                <stop offset={`${zeroOffset}%`} stopColor={lossColor} stopOpacity={0} />
                <stop offset="100%" stopColor={lossColor} stopOpacity={0.22} />
              </linearGradient>
            </defs>
            <path d={areaPath} fill={`url(#${GRADIENT_ID})`} stroke="none" />
            <path
              d={linePath}
              fill="none"
              stroke={`url(#${STROKE_ID})`}
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {isHovering && active ? (
              <line
                x1={active.x}
                y1={0}
                x2={active.x}
                y2={100}
                stroke="hsl(var(--foreground))"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                opacity={0.25}
              />
            ) : null}
          </svg>

          {/* Solid, in the colour of the curve it sits on: a ringed marker on a
                white plate reads as its own mark rather than a point on the line. */}
          {isHovering && active ? (
            <span
              className="pointer-events-none absolute z-[5] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${active.x}%`,
                top: `${active.y}%`,
                backgroundColor: active.point.cumulative >= 0 ? profitColor : lossColor,
              }}
            />
          ) : null}

          {/* Pinned to whichever edge the point isn't near, same as the timeline
                chart. Anchoring the box to the point's own position runs it out
                of the clipped plot at the edges, where it can't be read at all. */}
          {isHovering && active ? (
            <ChartTooltip
              title={formatDate(active.point.date)}
              style={{
                left: `clamp(${TOOLTIP_HALF_WIDTH}px, ${active.x}%, calc(100% - ${TOOLTIP_HALF_WIDTH}px))`,
                ...(tipBelow ? { bottom: 4 } : { top: 4 }),
                transform: 'translateX(-50%)',
              }}
              rows={[
                {
                  label: deltaLabel,
                  value: formatMoney(active.point.profit, currency),
                  tone: active.point.profit >= 0 ? 'profit' : 'loss',
                },
                {
                  label: totalLabel,
                  value: formatMoney(active.point.cumulative, currency),
                  tone: active.point.cumulative >= 0 ? 'profit' : 'loss',
                },
              ]}
            />
          ) : null}
        </div>
      </div>

      {/* Mirrors the plot row's spacer + gap so each label stays over its point. */}
      <div className="flex h-5 shrink-0 gap-2">
        <div className="w-8 shrink-0" />
        <div className="relative min-w-0 flex-1">
          {xTicks.map(({ at, pct, label }) => {
            const align = axisLabelAlignAt(pct);
            return (
              <span
                key={at}
                className={cn(
                  'absolute truncate text-[10px] tabular-nums text-muted-foreground',
                  align.className,
                )}
                style={{ ...align.style, maxWidth: '33%' }}
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
