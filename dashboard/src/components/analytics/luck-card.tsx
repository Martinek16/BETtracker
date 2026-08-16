import { useMemo } from 'react';
import { edgeConfidence, normalTail, type Bet } from '@betanal/shared';
import { CardNote } from '@/components/analytics/card-note';
import { QuestionCard } from '@/components/analytics/question-card';
import { cn, compactMoney, formatNumber } from '@/lib/utils';

interface LuckCardProps {
  bets: readonly Bet[];
  currency: string;
  open: boolean;
  onToggle: () => void;
}

/** Above this the projection is guesswork about a book that will never be filled. */
const SLIP_FORECAST_CAP = 10_000;

/**
 * How many settled slips it would take for a run at this pace to clear break even.
 * The spread shrinks with the square root of the count, so the target is the
 * current count scaled by how far short of the 95% mark the run currently falls.
 */
const slipsToTell = (sample: number, z: number): number | null => {
  if (z === 0 || !Number.isFinite(z)) return null;
  return Math.ceil(sample * (1.96 / z) ** 2);
};

export const LuckCard = ({ bets, currency, open, onToggle }: LuckCardProps): JSX.Element => {
  const info = useMemo(() => edgeConfidence(bets), [bets]);

  const money = (amount: number): string => compactMoney(amount, currency);
  const z = Math.abs(info.tStat);
  const good = info.yield >= 0;
  const empty = info.sample === 0;
  const sure = info.significant;
  // Off centre but still touching break even: a lean, not a finding.
  const leaning = !sure && z >= 1;

  // Out of a hundred bettors with no edge at all, how many would land at least
  // this far from break even by luck. A share, not an interval: nobody has to
  // picture a range to know what "12 in 100" means.
  const inHundred = normalTail(z) * 100;
  const rare = inHundred < 0.5;
  const share = rare ? 'fewer than 1' : formatNumber(inHundred, 0);

  const needed = slipsToTell(info.sample, z);

  // Named after what drove the run, not after whether it paid: a losing book that
  // clears chance is still skill doing the driving, just the wrong way round.
  const answer = empty
    ? 'Too soon'
    : sure
      ? good
        ? 'Skill'
        : 'Skill gap'
      : leaning
        ? 'Leaning'
        : 'Luck';

  // The bar is drawn over whatever the interval covers plus break even, so the
  // reader sees the gap to zero rather than a number they have to picture.
  const low = Math.min(info.ciLow, 0);
  const high = Math.max(info.ciHigh, 0);
  const span = high - low || 1;
  const at = (value: number): string => `${String(((value - low) / span) * 100)}%`;

  const figure = cn('font-medium', good ? 'text-profit' : 'text-loss');
  const hundred = money(100);

  return (
    <QuestionCard title="Was it luck or skill?" answer={answer} open={open} onToggle={onToggle}>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'Came back per 100', value: money(100 + info.yield), money: true },
          { label: 'Luck alone does this', value: `${share} in 100` },
          { label: 'Settled slips', value: String(info.sample) },
        ].map((row) => (
          <div key={row.label}>
            <dt className="text-[10px] text-muted-foreground">{row.label}</dt>
            <dd
              className={cn(
                'text-xs font-medium tabular-nums text-foreground',
                row.money === true && !empty && (good ? 'text-profit' : 'text-loss'),
              )}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="relative mt-2.5 h-2 rounded-full bg-muted/30">
        <span
          className="absolute h-full rounded-full bg-foreground/25"
          style={{
            left: at(info.ciLow),
            width: `${String(((info.ciHigh - info.ciLow) / span) * 100)}%`,
          }}
        />
        <span
          className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
          style={{ left: at(info.yield) }}
        />
        {/* Break even, marked on the bar itself: the whole answer is whether the
            shaded range still covers this line. */}
        <span
          className="absolute h-3 w-px -translate-x-1/2 -translate-y-0.5 bg-muted-foreground/60"
          style={{ left: at(0) }}
        />
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        Bar = where your real return most likely sits. Line = break even.
      </p>
      <CardNote>
        {empty ? (
          'Nothing settled this period, so there is nothing to weigh against luck.'
        ) : (
          <>
            {`Every ${hundred} staked came back as `}
            <span className={figure}>{money(100 + info.yield)}</span>
            {`. Out of 100 bettors with no edge, about ${share} would end up this far ${good ? 'ahead' : 'behind'} on luck alone`}
            {sure
              ? ', so luck does not cover it.'
              : leaning
                ? ' - uncommon, but not enough to rule luck out.'
                : ', so luck covers it.'}
            {sure || needed === null
              ? ''
              : needed > SLIP_FORECAST_CAP
                ? ` At this pace it would take over ${formatNumber(SLIP_FORECAST_CAP, 0)} settled slips to tell.`
                : ` At this pace it would take about ${formatNumber(needed, 0)} settled slips to tell.`}
          </>
        )}
      </CardNote>
    </QuestionCard>
  );
};
