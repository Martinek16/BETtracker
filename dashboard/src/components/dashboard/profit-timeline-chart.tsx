import { useMemo, useState } from 'react';
import { axisTicks, type AxisTick, type ChartBucket } from '@/lib/chart-data';
import { barGeometry, buildProfitChartScale, yTickLayout } from '@/lib/profit-chart-scale';
import { cn, formatMoney } from '@/lib/utils';
import { ChartEmpty } from '@/components/charts/chart-empty';
import { ChartTooltip, TOOLTIP_HALF_WIDTH } from './chart-tooltip';

interface ProfitTimelineChartProps {
  data: ChartBucket[];
  currency?: string;
  days?: number | null;
  className?: string;
  /** Nothing has ever been imported, as opposed to nothing in this window. */
  noSource?: boolean;
  /** Labels for buckets that are not calendar periods, which `days` cannot describe. */
  ticks?: AxisTick[];
  /** What one bucket counts, where it is not bets. */
  countLabel?: string;
}

export const ProfitTimelineChart = ({
  data,
  currency = 'EUR',
  days = null,
  className,
  noSource = false,
  ticks,
  countLabel = 'Bets',
}: ProfitTimelineChartProps): JSX.Element => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const scale = useMemo(
    () =>
      buildProfitChartScale(
        data.map((d) => d.profit),
        currency,
      ),
    [data, currency],
  );

  const xLabels = useMemo(() => ticks ?? axisTicks(data, days), [ticks, data, days]);

  if (data.length === 0 || scale === null) {
    return <ChartEmpty noSource={noSource} />;
  }

  const { yTicks, zeroPct, formatY } = scale;
  const showZeroLine = scale.yMin < 0 && scale.yMax > 0;
  const hovered = hoveredIndex === null ? null : data[hoveredIndex];

  return (
    <div className={cn('flex h-full min-h-0 flex-col overflow-hidden', className)}>
      {/* The label column is a sibling of the plot alone. Spanning the x-axis row
          too would stretch the 0–100% the labels sit in, dragging each one below
          its grid line and the last one down level with the dates. */}
      <div className="flex min-h-0 flex-1 gap-2 py-1.5">
        <div className="relative w-10 shrink-0">
          {yTicks.map((tick, i) => {
            const { pct, labelClassName } = yTickLayout(i, yTicks.length);
            return (
              <span
                key={tick}
                className={cn(
                  'absolute right-0 text-[10px] leading-none tabular-nums text-muted-foreground',
                  labelClassName,
                )}
                style={{ top: `${pct}%` }}
              >
                {formatY(tick)}
              </span>
            );
          })}
        </div>

        <div className="relative min-w-0 flex-1 overflow-hidden">
          {yTicks.map((tick, i) => {
            const { pct, lineClassName } = yTickLayout(i, yTicks.length);
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

          {/* No vertical padding: bars share the exact 0–100% box the grid lines
              are positioned in, so baselines land on the zero line. */}
          <div className="absolute inset-0 flex gap-1.5 px-1.5">
            {data.map((item, i) => {
              const profit = item.profit;
              const isPositive = profit >= 0;
              const isHovered = hoveredIndex === i;
              const { top, height } = barGeometry(profit, scale);

              return (
                <div
                  key={item.key}
                  className="relative min-w-0 flex-1"
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  <div
                    className={cn(
                      'relative h-full cursor-crosshair rounded-sm',
                      isHovered && 'bg-muted/20',
                    )}
                  >
                    {profit === 0 ? (
                      <div
                        className="absolute inset-x-0 h-px bg-border/60"
                        style={{ top: `${zeroPct}%` }}
                      />
                    ) : (
                      <div
                        className={cn(
                          'absolute inset-x-[3px] min-h-[2px] rounded-[3px] transition-opacity',
                          isPositive ? 'bg-profit' : 'bg-loss',
                          isHovered ? 'opacity-100' : 'opacity-85',
                        )}
                        style={{ top: `${top}%`, height: `${height}%` }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Rendered at plot level, not inside the ~10px-wide bar: a tooltip
              anchored to a bar overflows the clipped plot at either edge. */}
          {hovered && hoveredIndex !== null ? (
            <ChartTooltip
              placement="bottom"
              title={hovered.periodLabel ?? hovered.label}
              style={{
                left: `clamp(${TOOLTIP_HALF_WIDTH}px, ${
                  ((hoveredIndex + 0.5) / data.length) * 100
                }%, calc(100% - ${TOOLTIP_HALF_WIDTH}px))`,
                transform: 'translateX(-50%)',
              }}
              rows={[
                {
                  label: 'Profit',
                  value: formatMoney(hovered.profit, currency),
                  tone: hovered.profit >= 0 ? 'profit' : 'loss',
                },
                { label: 'Won', value: formatMoney(hovered.wins, currency), tone: 'profit' },
                { label: 'Lost', value: formatMoney(hovered.losses, currency), tone: 'loss' },
                { label: countLabel, value: String(hovered.bets), tone: 'neutral' },
              ]}
            />
          ) : null}
        </div>
      </div>

      {/* Mirrors the plot row's spacer + gap so each label stays centred on its bar.
          Labels are positioned over the bar rather than inside its column: a column
          is a few pixels wide once there are dozens of bars, and a label confined to
          it truncates down to a stub like "Jul…". */}
      <div className="flex h-5 shrink-0 gap-2">
        <div className="w-10 shrink-0" />
        <div className="min-w-0 flex-1 px-1.5">
          <div className="relative h-full">
            {xLabels.map(({ index, label }) => (
              <span
                key={index}
                className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] tabular-nums text-muted-foreground"
                style={{
                  left: `clamp(20px, ${((index + 0.5) / data.length) * 100}%, calc(100% - 20px))`,
                }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
