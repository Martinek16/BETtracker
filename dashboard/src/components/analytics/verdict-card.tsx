import { useMemo, useState } from 'react';
import {
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
import { EquityCurveChart, type EquityPointView } from '@/components/charts/equity-curve-chart';
import { DashboardCard, DashboardCardHeading } from '@/components/dashboard/dashboard-card';
import { cn, compactMoney, formatMoney, formatPercent } from '@/lib/utils';

/** Selections view: does the pick beat the price it was taken at? */
export const VerdictCard = ({ bets }: { bets: readonly Bet[] }): JSX.Element => {
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

  const edgePp = picks.hitRate - picks.implied;
  // Only claim an edge when the whole interval clears the price.
  const beatsPrice = picks.decided > 0 && picks.low > picks.implied;

  return (
    <DashboardCard className="flex h-full flex-col p-3">
      <DashboardCardHeading
        className="mb-3"
        title="Did your picks beat the price?"
        action={
          <CardHeadline tone={!beatsPrice ? 'neutral' : edgePp >= 0 ? 'profit' : 'loss'}>
            {!beatsPrice ? 'Too close' : edgePp >= 0 ? 'Yes' : 'No'}
          </CardHeadline>
        }
      />
      <IntervalBar low={picks.low} high={picks.high} marker={picks.implied} />
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        Bar = how often these picks won. Line = how often the odds said they would.
      </p>
      <CardNote>
        {'These picks won '}
        <NoteFigure tone={edgePp >= 0 ? 'profit' : 'loss'}>
          {formatPercent(picks.hitRate, 0)}
        </NoteFigure>
        {` of the time, the prices said ${formatPercent(picks.implied, 0)}. `}
        {!beatsPrice
          ? 'The gap sits inside what chance alone produces at this sample.'
          : edgePp >= 0
            ? 'The gap is wider than chance explains over this many picks.'
            : 'The gap is wider than chance explains, and it runs against you.'}
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
