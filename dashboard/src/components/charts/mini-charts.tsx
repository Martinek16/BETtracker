import { useMemo } from 'react';
import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Bet } from '@betanal/shared';
import { ChartTooltip } from '@/components/charts/chart-frame';
import { formatMoney } from '@/lib/utils';

const AXIS = {
  tick: { fontSize: 9, fill: 'hsl(var(--muted-foreground))' },
  tickLine: false,
  stroke: 'hsl(var(--border))',
} as const;

/** Tick money without the symbol: the currency is said in the tooltip already. */
const tickAmount = (value: number): string => {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value >= 10 ? String(Math.round(value)) : String(Number(value.toFixed(2)));
};

/** 1, 2, 5, 10, 20 … — the round numbers an axis is read in. */
const NICE = [1, 2, 5];

/** Round steps spanning the stakes, so the axis climbs by tens, not by odd cents. */
const moneyTicks = (low: number, high: number): number[] => {
  const steps: number[] = [];
  for (let power = Math.floor(Math.log10(low)); power <= Math.ceil(Math.log10(high)); power += 1) {
    for (const base of NICE) steps.push(base * 10 ** power);
  }
  const inside = steps.filter((v) => v >= low && v <= high);
  if (inside.length <= 4) return inside;
  // Too many rungs for the height: keep every nth so the spacing stays even.
  const stride = Math.ceil(inside.length / 4);
  return inside.filter((_, i) => i % stride === 0);
};

/** Slip numbers at an even, round step: 1, 100, 200 … rather than 1, 97, 229. */
const slipTicks = (count: number): number[] => {
  if (count <= 1) return [1];
  const rough = count / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = (NICE.find((base) => base * power >= rough) ?? 10) * power;
  const ticks = [1];
  for (let at = step; at <= count; at += step) ticks.push(at);
  return ticks;
};

/** Value at a fraction through an ascending list, halfway between neighbours. */
const quantile = (sorted: readonly number[], at: number): number => {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * at;
  const low = Math.floor(pos);
  const high = Math.ceil(pos);
  return (sorted[low] ?? 0) + ((sorted[high] ?? 0) - (sorted[low] ?? 0)) * (pos - low);
};

/**
 * Every stake in the order it was placed, against the usual one. Drawn bare
 * rather than in a `ChartFrame`: it sits inside another card, and a frame there
 * would put a border inside a border.
 */
export const StakeSparkline = ({
  bets,
  currency,
}: {
  bets: readonly Bet[];
  currency: string;
}): JSX.Element => {
  const { data, median, floor, yTicks, xTicks } = useMemo(() => {
    const sorted = [...bets].sort((a, b) => a.placedAt.localeCompare(b.placedAt));
    const stakes = sorted.map((b) => b.stake).sort((a, b) => a - b);
    const positive = stakes.filter((s) => s > 0);
    // The middle stake, not the mean: one €500 slip drags an average off every
    // stake actually placed.
    const middle = quantile(stakes, 0.5);
    // A log axis cannot start at zero, and cent stakes beside €100 ones are a
    // flat line on a linear one.
    const low = positive.length === 0 ? 0.01 : Math.min(...positive);
    const high = positive.length === 0 ? 1 : Math.max(...positive);
    return {
      data: sorted.map((b, i) => ({ index: i + 1, stake: b.stake })),
      median: middle,
      floor: low,
      // Round rungs rather than recharts' own log ticks, which round two of them
      // to the same label and read as an axis repeating itself.
      yTicks: moneyTicks(low, high),
      xTicks: slipTicks(sorted.length),
    };
  }, [bets]);

  return (
    // Stacked above its neighbours: the widest tick leans out of the plot, and
    // an opaque sibling would otherwise paint over it.
    <div className="relative z-10 mt-2 h-28 shrink-0 overflow-visible border-t border-border pt-1">
      <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 0, bottom: -4, left: -6 }}>
            {/* Named, so the axis and the tooltip count slips from one rather
                than from the zero-based index recharts falls back to. */}
            <XAxis dataKey="index" ticks={xTicks} {...AXIS} />
            <YAxis
              {...AXIS}
              // Narrow on purpose: the ticks carry no currency symbol, and a
              // four-figure one is left to lean out over the card's own padding
              // rather than push the whole plot to the right.
              width={26}
              scale="log"
              domain={[floor, 'dataMax']}
              allowDataOverflow
              ticks={yTicks}
              tickFormatter={tickAmount}
            />
            <ReferenceLine
              y={median}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="3 3"
            />
            <Tooltip
              cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeDasharray: '3 3' }}
              content={
                <ChartTooltip<{ index: number; stake: number }>
                  heading={(row) => `Slip #${String(row.index)}`}
                  lines={(row) => [
                    `Staked ${formatMoney(row.stake, currency)}`,
                    `Usual stake ${formatMoney(median, currency)}`,
                  ]}
                />
              }
            />
            <Line
              type="monotone"
              dataKey="stake"
              stroke="hsl(var(--foreground))"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
