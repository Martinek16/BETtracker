import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  decisiveBets,
  groupBy,
  TYPICAL_BOOKMAKER_MARGIN_PCT,
  type Bet,
  type GroupStats,
  type SlipDimension,
} from '@betanal/shared';
import { ChartEmpty } from '@/components/charts/chart-empty';
import { ChartFrame, ChartTooltip } from '@/components/charts/chart-frame';
import { useMinPicks } from '@/lib/held-back';
import { formatMoney, formatPercent } from '@/lib/utils';

interface Row extends GroupStats {
  thin: boolean;
  /** Percentage points between how often the band won and how often its price said it would. */
  gap: number;
}

const AXIS = {
  tick: { fontSize: 9, fill: 'hsl(var(--muted-foreground))' },
  axisLine: false,
  tickLine: false,
} as const;

const toneOf = (value: number): string => (value >= 0 ? 'hsl(var(--profit))' : 'hsl(var(--loss))');

/** Both metrics on these charts are read in percent, and the scale is a scale. */
const tickPercent = (value: number): string => `${String(Math.round(value))}%`;

/**
 * A band's own name is its span - "1.75–2.00" - which is four times the width a
 * tick has. Written as where the band starts, the axis reads as one climbing
 * scale and the tooltip still says the span in full. Names without a span, like
 * a leg count, are already the number.
 */
const bandStart = (key: string): string => key.split('–')[0]?.replace(/\s+/g, '') ?? key;

/**
 * The two ends of the split, in the reader's own numbers. A plot is worth its
 * room only if it names what it found, and the ends are what a band chart is
 * read for - the middle is the same story told quieter. Thin bands are left out
 * of the naming unless there is nothing else, since one slip is not an end.
 */
const extremesOf = (
  data: readonly Row[],
  dataKey: 'roi' | 'gap',
  say: (row: Row) => string,
): string | null => {
  const solid = data.filter((row) => !row.thin);
  const ranked = [...(solid.length >= 2 ? solid : data)].sort((a, b) => b[dataKey] - a[dataKey]);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  if (best === undefined || worst === undefined || best === worst) return null;
  return `Best ${say(best)}, worst ${say(worst)}.`;
};

/**
 * Bands sorted by their own average rather than by label, so the order holds
 * whatever the band edges are named.
 */
const bandsOf = (
  bets: readonly Bet[],
  by: (g: GroupStats) => number,
  dimension: SlipDimension,
  minBets: number,
): Row[] =>
  groupBy(decisiveBets(bets), dimension)
    .filter((g) => g.bets > 0)
    .sort((a, b) => by(a) - by(b))
    .map((g) => ({
      ...g,
      thin: g.bets < minBets,
      // A price of 2.50 claims 40%: the gap to what actually landed is the only
      // reading here that money cannot fake.
      gap: g.winRate - g.meanImplied,
    }));

const Bars = ({
  data,
  dataKey,
  guides,
  lines,
  minBets,
}: {
  data: readonly Row[];
  dataKey: 'roi' | 'gap';
  /** Slips a band needs before its bar is drawn at full strength. */
  minBets: number;
  /** Horizontal marks the bars are read against, solid unless dashed. */
  guides: readonly { y: number; dashed?: boolean }[];
  lines: (row: Row) => readonly string[];
}): JSX.Element => (
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={[...data]} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
      {/* Left to recharts to thin: forcing every band label draws them into each
          other on a narrow card, and an unreadable label says less than none. */}
      <XAxis dataKey="key" minTickGap={4} tickFormatter={bandStart} {...AXIS} />
      <YAxis {...AXIS} width={30} tickCount={4} tickFormatter={tickPercent} />
      {guides.map((guide) => (
        <ReferenceLine
          key={guide.y}
          y={guide.y}
          stroke={guide.dashed === true ? 'hsl(var(--muted-foreground))' : 'hsl(var(--border))'}
          strokeDasharray={guide.dashed === true ? '3 3' : undefined}
        />
      ))}
      <Tooltip
        cursor={{ fill: 'hsl(var(--muted))', fillOpacity: 0.3 }}
        content={
          <ChartTooltip<Row>
            heading={(row) => row.key}
            lines={(row) => [
              ...lines(row),
              ...(row.thin
                ? [`Under ${String(minBets)} slips - a figure, not yet a pattern.`]
                : []),
            ]}
          />
        }
      />
      <Bar dataKey={dataKey} radius={[2, 2, 0, 0]} isAnimationActive={false}>
        {data.map((row) => (
          <Cell key={row.key} fill={toneOf(row[dataKey])} fillOpacity={row.thin ? 0.35 : 0.85} />
        ))}
      </Bar>
    </BarChart>
  </ResponsiveContainer>
);

/**
 * Whether the prices held up, band by band. The zero line is the market's own
 * claim: a price of 2.50 says you win 40% of the time. Hits against that promise
 * rather than money, because money at long odds is one slip away from anything.
 * No closing price is stored, so this reads against the price taken.
 */
export const OddsPnlChart = ({
  bets,
  currency,
}: {
  bets: readonly Bet[];
  currency: string;
}): JSX.Element => {
  const minBets = useMinPicks();
  const data = useMemo(
    () => bandsOf(bets, (g) => g.medianOdds, 'slipOdds', minBets),
    [bets, minBets],
  );

  return (
    <ChartFrame
      title="Did the prices hold up?"
      note={[
        extremesOf(
          data,
          'gap',
          (row) =>
            `${row.key} at ${row.gap >= 0 ? '+' : ''}${formatPercent(row.gap, 0)} against its price`,
        ),
        'A price of 2.50 promises you win 40% of the time; bars are how far off that promise the band landed, and labels the price it starts at.',
      ]
        .filter((line) => line !== null)
        .join(' ')}
    >
      {data.length === 0 ? (
        <ChartEmpty
          title="No settled slips"
          hint="Prices are read from slips that have won or lost."
        />
      ) : (
        <Bars
          minBets={minBets}
          data={data}
          dataKey="gap"
          guides={[{ y: 0 }]}
          lines={(row) => [
            `Won ${formatPercent(row.winRate, 0)}, the price promised ${formatPercent(row.meanImplied, 0)}`,
            `${row.gap >= 0 ? '+' : ''}${formatPercent(row.gap, 1)} against the promise`,
            `${String(row.bets)} settled slips · ${formatMoney(row.profit, currency)}`,
          ]}
        />
      )}
    </ChartFrame>
  );
};

/** How many legs the slip carried, against what came back per 100 staked. */
export const LegCountChart = ({
  bets,
  currency,
}: {
  bets: readonly Bet[];
  currency: string;
}): JSX.Element => {
  const minBets = useMinPicks();
  const data = useMemo(
    () => bandsOf(bets, (g) => Number.parseInt(g.key, 10), 'legCount', minBets),
    [bets, minBets],
  );

  return (
    <ChartFrame
      title="Legs on the slip"
      note={[
        extremesOf(data, 'roi', (row) => `${row.key} at ${formatPercent(row.roi, 0)}`),
        `Every leg pays the house its cut again, so the dashed −${String(TYPICAL_BOOKMAKER_MARGIN_PCT)}% is the shallowest a long slip can sit.`,
      ]
        .filter((line) => line !== null)
        .join(' ')}
    >
      {data.length === 0 ? (
        <ChartEmpty
          title="No settled slips"
          hint="Leg counts are read from slips that have won or lost."
        />
      ) : (
        <Bars
          minBets={minBets}
          data={data}
          dataKey="roi"
          guides={[{ y: 0 }, { y: -TYPICAL_BOOKMAKER_MARGIN_PCT, dashed: true }]}
          lines={(row) => [
            `${formatMoney(row.profit, currency)} on ${formatMoney(row.staked, currency)} staked`,
            `${formatPercent(row.roi, 1)} back on every 100`,
            `${String(row.bets)} settled slips`,
          ]}
        />
      )}
    </ChartFrame>
  );
};

/**
 * Whether the bigger stakes were the better bets. Return per 100 staked rather
 * than raw profit - a band holding one large slip would otherwise tower over
 * every other band without being any better.
 */
export const StakeOutcomeChart = ({
  bets,
  currency,
}: {
  bets: readonly Bet[];
  currency: string;
}): JSX.Element => {
  const minBets = useMinPicks();
  const data = useMemo(
    () => bandsOf(bets, (g) => (g.bets === 0 ? 0 : g.staked / g.bets), 'stakeBand', minBets),
    [bets, minBets],
  );

  return (
    <ChartFrame
      title="Stake size against outcome"
      note={[
        extremesOf(data, 'roi', (row) => `${row.key} at ${formatPercent(row.roi, 0)}`),
        'Counted per 100 staked, so a band holding one large slip cannot tower on size alone.',
      ]
        .filter((line) => line !== null)
        .join(' ')}
    >
      {data.length === 0 ? (
        <ChartEmpty
          title="No settled slips"
          hint="Stake sizes are read from slips that have won or lost."
        />
      ) : (
        <Bars
          minBets={minBets}
          data={data}
          dataKey="roi"
          guides={[{ y: 0 }, { y: -TYPICAL_BOOKMAKER_MARGIN_PCT, dashed: true }]}
          lines={(row) => [
            `${formatMoney(row.profit, currency)} on ${formatMoney(row.staked, currency)} staked`,
            `${formatPercent(row.roi, 1)} back on every 100`,
            `${String(row.bets)} settled slips`,
          ]}
        />
      )}
    </ChartFrame>
  );
};
