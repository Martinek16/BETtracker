import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Bet } from '@betanal/shared';
import { equityCurve } from '@betanal/shared';
import { compactMoney } from '@/lib/utils';
import { ChartEmpty } from './chart-empty';

export interface EquityPointView {
  /** 1 for the first settled slip, so the reader counts from one bet, not none. */
  slip: number;
  staked: number;
  returned: number;
  profit: number;
}

interface EquityCurveChartProps {
  bets: readonly Bet[];
  currency?: string;
  /** Reports the slip under the pointer so the caller can read its own figures out. */
  onHover?: (point: EquityPointView | null) => void;
}

/** Running profit, slip by slip. Green above the break-even line, red below it. */
export const EquityCurveChart = ({
  bets,
  currency = 'EUR',
  onHover,
}: EquityCurveChartProps): JSX.Element => {
  const curve = equityCurve(bets);
  if (curve.length === 0) return <ChartEmpty title="No settled bets to chart" hint="" />;

  const stakes = new Map(bets.map((b) => [b.betId, b.stake]));
  let staked = 0;
  const data = curve.map((p, i) => {
    staked += stakes.get(p.betId) ?? 0;
    return {
      slip: i + 1,
      cumulative: p.cumulative,
      staked,
      returned: staked + p.cumulative,
      profit: p.cumulative,
    };
  });
  const values = data.map((p) => p.cumulative);
  const high = Math.max(...values, 0);
  const low = Math.min(...values, 0);
  // Where zero falls in the drawn range, so the colour changes on the line itself.
  const zero = high === low ? 1 : high / (high - low);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={data}
        margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
        onMouseMove={(state) => {
          const i = state.activeTooltipIndex;
          onHover?.(i === undefined || data[i] === undefined ? null : data[i]);
        }}
        onMouseLeave={() => {
          onHover?.(null);
        }}
      >
        <defs>
          <linearGradient id="equityStroke" x1="0" y1="0" x2="0" y2="1">
            <stop offset={zero} stopColor="hsl(var(--profit))" />
            <stop offset={zero} stopColor="hsl(var(--loss))" />
          </linearGradient>
          <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--profit))" stopOpacity={0.3} />
            <stop offset={zero} stopColor="hsl(var(--profit))" stopOpacity={0} />
            <stop offset={zero} stopColor="hsl(var(--loss))" stopOpacity={0} />
            <stop offset="100%" stopColor="hsl(var(--loss))" stopOpacity={0.3} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <YAxis
          width={44}
          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => compactMoney(v, currency)}
        />
        {/* Names what the figures underneath are read at: slip 1 to slip N. */}
        <XAxis
          dataKey="slip"
          height={14}
          interval="preserveStartEnd"
          minTickGap={24}
          tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
          tickLine={false}
          axisLine={false}
        />
        {/* Break-even: solid so it reads as one line, faint so it stays behind the curve. */}
        <ReferenceLine
          y={0}
          stroke="hsl(var(--muted-foreground))"
          strokeOpacity={0.35}
          strokeWidth={1}
        />
        {/* No panel: the figures under the chart are the readout. Only the cursor line stays. */}
        <Tooltip cursor={{ stroke: 'hsl(var(--muted-foreground))' }} content={() => null} />
        <Area
          type="monotone"
          dataKey="cumulative"
          stroke="url(#equityStroke)"
          strokeWidth={2}
          fill="url(#equityFill)"
          isAnimationActive={false}
          activeDot={{ r: 3, stroke: 'none', fill: 'hsl(var(--foreground))' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};
