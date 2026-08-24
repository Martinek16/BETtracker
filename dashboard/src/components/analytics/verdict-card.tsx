import { useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  compareGroupKeys,
  groupSelectionsBy,
  selectionsOf,
  summarize,
  wilson,
  GOOD_LONG_RUN_YIELD_PCT,
  PROFITABLE_BETTOR_SHARE_PCT,
  TYPICAL_BOOKMAKER_MARGIN_PCT,
  type Bet,
} from '@betanal/shared';
import { CardHeadline, CardNote, NoteFigure } from '@/components/analytics/card-note';
import { IntervalBar } from '@/components/analytics/interval-bar';
import { QuestionCard } from '@/components/analytics/question-card';
import { ChartTooltip } from '@/components/charts/chart-frame';
import { EquityCurveChart, type EquityPointView } from '@/components/charts/equity-curve-chart';
import { DashboardCard, DashboardCardHeading } from '@/components/dashboard/dashboard-card';
import { useMinPicks } from '@/lib/held-back';
import { priceVerdict, verdictVar, type PriceVerdict } from '@/lib/price-verdict';
import { cn, compactMoney, formatMoney, formatPercent } from '@/lib/utils';

const AXIS = {
  tick: { fontSize: 9, fill: 'hsl(var(--muted-foreground))' },
  axisLine: false,
  tickLine: false,
} as const;

/**
 * A band's own name is its span - "1.75–2.00" - which is wider than a tick, so
 * the axis carries where the band starts and the tooltip says the span in full.
 */
const bandStart = (key: string): string => {
  if (key.startsWith('Under')) return `<${key.slice(5).trim()}`;
  return key.split('–')[0]?.trim() ?? key;
};

/** Quarters, so every gridline is a figure a reader already thinks in. */
const Y_TICKS = [0, 25, 50, 75, 100];

interface Band {
  key: string;
  /** How often the band actually won, in percent. */
  hitRate: number;
  /** How often its price said it would - the mark each bar is read against. */
  priced: number;
  /** Null while the band sits close enough to its price to be worth no verdict. */
  verdict: PriceVerdict;
  picks: number;
  thin: boolean;
}

/** The colour a bar carries, muted where the band is too near its price to call. */
const fillOf = (verdict: PriceVerdict): string => `hsl(var(--${verdictVar(verdict)}))`;

/** Selections view: does the pick beat the price it was taken at? */
export const VerdictCard = ({
  bets,
  className,
}: {
  bets: readonly Bet[];
  className?: string;
}): JSX.Element => {
  const minPicks = useMinPicks();
  const picks = useMemo(() => {
    const decided = selectionsOf(bets).filter(
      (sel) => sel.leg.status === 'won' || sel.leg.status === 'lost',
    );
    const won = decided.filter((sel) => sel.leg.status === 'won').length;
    const hitRate = decided.length === 0 ? 0 : (won / decided.length) * 100;
    const implied =
      decided.length === 0
        ? 0
        : (decided.reduce((sum, sel) => sum + 1 / sel.odds, 0) / decided.length) * 100;
    return { ...wilson(won, decided.length), decided: decided.length, won, hitRate, implied };
  }, [bets]);

  // The same reading the card below draws row by row, condensed to one curve:
  // where the prices said you would land, and where you actually did.
  const bands = useMemo<Band[]>(
    () =>
      groupSelectionsBy(bets, 'oddsBand')
        .filter((g) => g.decided > 0)
        .sort((a, b) => compareGroupKeys('oddsBand', a.key, b.key))
        .map((g) => ({
          key: g.key,
          hitRate: g.hitRate,
          priced: g.meanImplied,
          verdict: g.decided < minPicks ? null : priceVerdict(g.hitRate, g.meanImplied),
          picks: g.decided,
          thin: g.decided < minPicks,
        })),
    [bets, minPicks],
  );

  // The price is the one threshold that decides money: win more often than it
  // claims and you profit. Judging "no" against par instead left every honest
  // bettor in a middle band the card had no answer for.
  const beatsPrice = picks.decided > 0 && picks.low > picks.implied;
  const belowPrice = picks.decided > 0 && picks.high < picks.implied;

  return (
    <DashboardCard className={cn('flex min-h-0 flex-col p-3', className)}>
      <DashboardCardHeading
        className="mb-2"
        title="Did your picks beat the price?"
        action={
          <CardHeadline tone={beatsPrice ? 'profit' : belowPrice ? 'loss' : 'neutral'}>
            {picks.decided === 0 ? '—' : beatsPrice ? 'Yes' : belowPrice ? 'No' : 'Level'}
          </CardHeadline>
        }
      />
      {/* The whole period in one line, before the split below it. Unlabelled the
          track said nothing: which end is which is not guessable from a band. */}
      <div className="mb-1 flex items-baseline justify-between text-[10px] text-muted-foreground">
        <span>
          {'You won '}
          <NoteFigure tone={picks.hitRate >= picks.implied ? 'profit' : 'loss'}>
            {formatPercent(picks.hitRate, 1)}
          </NoteFigure>
        </span>
        <span>{`Price said ${formatPercent(picks.implied, 1)}`}</span>
      </div>
      <IntervalBar low={picks.low} high={picks.high} marker={picks.implied} value={picks.hitRate} />
      <div className="mt-2 min-h-[5rem] flex-1">
        {bands.length === 0 ? (
          <p className="text-sm text-muted-foreground">No settled picks in this period.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={bands} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid
                horizontal
                vertical={false}
                stroke="hsl(var(--border))"
                strokeOpacity={0.5}
              />
              <XAxis
                dataKey="key"
                interval={0}
                tickMargin={4}
                tickFormatter={bandStart}
                {...AXIS}
              />
              <YAxis
                {...AXIS}
                width={26}
                domain={[0, 100]}
                ticks={Y_TICKS}
                tickFormatter={(v: number) => `${String(v)}%`}
              />
              <Tooltip
                cursor={{ fill: 'hsl(var(--muted))', fillOpacity: 0.3 }}
                content={
                  <ChartTooltip<Band>
                    heading={(row) => `Odds ${row.key}`}
                    lines={(row) => [
                      `Won ${formatPercent(row.hitRate, 0)}, needed ${formatPercent(row.priced, 0)}`,
                      `${row.hitRate >= row.priced ? '+' : ''}${(row.hitRate - row.priced).toFixed(1)}pp against the price${row.verdict === null && !row.thin ? ' - near enough to call it level' : ''}`,
                      row.thin
                        ? `${String(row.picks)} picks - too few to read as a pattern.`
                        : `${String(row.picks)} settled picks`,
                    ]}
                  />
                }
              />
              <Bar dataKey="hitRate" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                {bands.map((row) => (
                  <Cell
                    key={row.key}
                    fill={fillOf(row.verdict)}
                    fillOpacity={row.thin ? 0.25 : row.verdict === null ? 0.5 : 0.85}
                  />
                ))}
              </Bar>
              {/* One mark, not two: the price is the line that decides money, and
                  a second line for the house cut only crowded it. */}
              <Line
                type="linear"
                dataKey="priced"
                stroke="hsl(var(--foreground))"
                strokeWidth={1.5}
                dot={{ r: 2, fill: 'hsl(var(--foreground))', strokeWidth: 0 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
      <CardNote>
        {'You won '}
        <NoteFigure tone={picks.hitRate >= picks.implied ? 'profit' : 'loss'}>
          {formatPercent(picks.hitRate, 1)}
        </NoteFigure>
        {` where the prices said ${formatPercent(picks.implied, 1)}. `}
        {beatsPrice
          ? 'Beating the price is more than the market hands out.'
          : belowPrice
            ? `Under it, like almost everyone: the book builds a ${String(TYPICAL_BOOKMAKER_MARGIN_PCT)}% margin into every price.`
            : 'Level with the price, so nothing here is yours yet.'}
        {
          ' Bars are how often each band won, the line how often it had to; grey means the two are too close to call.'
        }
      </CardNote>
    </DashboardCard>
  );
};

interface QuestionProps {
  bets: readonly Bet[];
  currency: string;
  open: boolean;
  onToggle: () => void;
}

/** Slips view: is the money actually coming back? */
export const WinningQuestion = ({ bets, currency, open, onToggle }: QuestionProps): JSX.Element => {
  const [point, setPoint] = useState<EquityPointView | null>(null);
  const money = useMemo(() => {
    const s = summarize(bets);
    return {
      staked: s.totalStaked,
      returned: s.totalReturn,
      profit: s.totalProfit,
      // The chart counts one point per settled slip, so its last tick is this.
      slip: s.settledBets,
      // Read off the money, not off the average slip: small winners beside one
      // large loser average out positive while the account is down.
      roi: s.roi,
    };
  }, [bets]);

  const tone = money.profit > 0 ? 'profit' : money.profit < 0 ? 'loss' : 'neutral';
  const answer = money.profit > 0 ? 'Yes' : money.profit < 0 ? 'No' : 'Level';

  // The line under the chart reads the same slip the figures above it do, so a
  // pointer halfway along the curve is answered rather than ignored.
  const shown = point ?? money;
  const roi =
    point === null ? money.roi : point.staked === 0 ? 0 : (point.profit / point.staked) * 100;
  // Said in the currency on screen, at a size anyone can picture: a hundred put
  // on, and what came back of it.
  const hundred = compactMoney(100, currency);
  const figure = cn('font-medium', roi >= 0 ? 'text-profit' : 'text-loss');
  // All three run to about one line: a note that grows by a line when the period
  // turns positive moves the card under it every time the pointer crosses zero.
  const context =
    roi < 0
      ? `The bookmaker keeps about ${compactMoney(TYPICAL_BOOKMAKER_MARGIN_PCT, currency)} of every ${hundred}, whoever wins.`
      : roi < GOOD_LONG_RUN_YIELD_PCT
        ? `Bettors who win over years keep about ${compactMoney(GOOD_LONG_RUN_YIELD_PCT, currency)} of every ${hundred}.`
        : `That is what the ${String(PROFITABLE_BETTOR_SHARE_PCT)} in 100 bettors who win over years keep.`;

  return (
    <QuestionCard
      title="Did you make money?"
      answer={answer}
      tone={tone}
      open={open}
      onToggle={onToggle}
    >
      <div className="h-40">
        <EquityCurveChart bets={bets} currency={currency} onHover={setPoint} />
      </div>
      {/* Fixed columns, exact amounts: the figures are read while the pointer
          moves along the curve, and a row that reflows on every slip is unreadable. */}
      <dl className="mt-1 grid grid-cols-4 gap-1.5 border-t border-border pt-2 text-center">
        {[
          { label: 'Staked', value: formatMoney(shown.staked, currency) },
          { label: 'Came back', value: formatMoney(shown.returned, currency) },
          // How many slips the figures beside it cover: all of them at rest, and
          // the one under the pointer while the curve is being read.
          { label: 'Slips', value: String(shown.slip) },
          { label: 'Profit', value: formatMoney(shown.profit, currency), strong: true },
        ].map((row) => (
          <div key={row.label}>
            <dt className="text-[10px] text-muted-foreground">{row.label}</dt>
            <dd
              className={cn(
                'text-xs font-medium tabular-nums text-foreground',
                row.strong && (shown.profit >= 0 ? 'text-profit' : 'text-loss'),
              )}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <CardNote>
        {`For every ${hundred} you staked, `}
        <span className={figure}>{compactMoney(100 + roi, currency)}</span>
        {' came back. '}
        <span className={figure}>{compactMoney(Math.abs(roi), currency)}</span>
        {roi < 0 ? ' stayed with the bookmaker. ' : ' more than you put in. '}
        {context}
      </CardNote>
    </QuestionCard>
  );
};
