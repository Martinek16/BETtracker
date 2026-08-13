import { useEffect, useMemo, useState } from 'react';
import {
  breakEvenWinRate,
  drawdown,
  isSettled,
  profitOf,
  resolutionDate,
  stakeWeightedOdds,
  streaks,
  summarize,
  type Bet,
} from '@betanal/shared';
import { DashboardCard, DashboardCardHeading } from '@/components/dashboard/dashboard-card';
import { usePeriodCash } from '@/data/use-period-cash';
import { cn, compactMoney, formatNumber, formatPercent } from '@/lib/utils';

interface Row {
  label: string;
  value: string;
  tone?: 'profit' | 'loss';
  /** The long version, for a figure whose label cannot carry its own definition. */
  hint?: string;
}

const HOUR = 3_600_000;

/** Hours up to a day, then days: "6 h" and "0.25 days" say the same thing worse. */
const spellDuration = (ms: number): string =>
  ms < 24 * HOUR ? `${formatNumber(ms / HOUR, 0)} h` : `${formatNumber(ms / (24 * HOUR), 1)} days`;

const middle = (sorted: readonly number[]): number =>
  sorted.length === 0 ? 0 : (sorted[Math.floor((sorted.length - 1) / 2)] ?? 0);

/** Slips placed on the busiest single day of the period. */
const busiestDay = (bets: readonly Bet[]): number => {
  const perDay = new Map<string, number>();
  for (const bet of bets) {
    const day = bet.placedAt.slice(0, 10);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  return perDay.size === 0 ? 0 : Math.max(...perDay.values());
};

/** Longest stretch with no slip placed, in milliseconds. */
const longestBreak = (bets: readonly Bet[]): number => {
  const placed = bets.map((b) => Date.parse(b.placedAt)).sort((a, b) => a - b);
  let gap = 0;
  for (let i = 1; i < placed.length; i += 1) {
    gap = Math.max(gap, (placed[i] ?? 0) - (placed[i - 1] ?? 0));
  }
  return gap;
};

/** One line of the list, plus the gap under it. Rows are one size, always. */
const ROW_HEIGHT = 22;

/** How tall the card's body actually is, which decides how much of it is drawn. */
const useBodyHeight = (): [(node: HTMLDivElement | null) => void, number] => {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (node === null) return;
    const observer = new ResizeObserver(([entry]) => {
      setHeight(entry?.contentRect.height ?? 0);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [node]);

  return [setNode, height];
};

/**
 * The period's money, line by line, for the reader who wants the figure rather
 * than the verdict. Rows are written most useful first and the card simply stops
 * where it runs out of room: a squeezed column drops the footnotes, never the
 * headline. Nothing here is repeated from the cards above it.
 */
export const MoneyDetailCard = ({
  bets,
  currency,
}: {
  bets: readonly Bet[];
  currency: string;
}): JSX.Element => {
  const cash = usePeriodCash();
  const [bodyRef, height] = useBodyHeight();

  const rows = useMemo<readonly Row[]>(() => {
    const money = (amount: number): string => compactMoney(amount, currency);
    const s = summarize(bets);
    const settled = bets.filter(isSettled);
    // How hard the same money worked: every deposit staked, won back and staked
    // again counts once more. Under 1 the account was never fully turned over.
    const turnover = cash.deposits === 0 ? null : s.totalStaked / cash.deposits;
    const stakes = bets.map((b) => b.stake).sort((a, b) => a - b);
    // The middle stake, not the average: one slip at fifty times the rest drags an
    // average to a size the bettor never actually bets.
    const median = middle(stakes);
    const biggest = stakes.length === 0 ? 0 : (stakes[stakes.length - 1] ?? 0);
    const overUsual = median === 0 ? 0 : biggest / median;
    const run = streaks(bets);
    const dip = drawdown(bets).maxDrawdown;
    const odds = stakeWeightedOdds(bets);
    // One slip a day and thirty in a day read the same in every other figure here.
    const days = new Set(bets.map((b) => b.placedAt.slice(0, 10))).size;

    // The rate the prices demanded. Winning under it is a losing period however
    // good the run felt, and it is the one target a bettor can actually aim at.
    const needed = breakEvenWinRate(bets);
    const swings = settled.map(profitOf);
    const best = swings.length === 0 ? 0 : Math.max(...swings);
    const worst = swings.length === 0 ? 0 : Math.min(...swings);
    const total = swings.reduce((sum, x) => sum + Math.abs(x), 0);
    // How much of everything that moved came from one slip. High means the period
    // is a story about that slip, not about how the betting went.
    const concentration = total === 0 ? 0 : Math.max(Math.abs(best), Math.abs(worst)) / total;

    const open = bets.filter((b) => b.status === 'pending');
    const openStake = open.reduce((sum, b) => sum + b.stake, 0);
    const bonus = bets.reduce((sum, b) => sum + (b.bonusStake ?? 0), 0);
    const cashedOut = bets.filter((b) => b.status === 'cashed_out').length;
    const voided = bets.filter((b) => b.status === 'void').length;
    const waits = settled
      .map((b) => Date.parse(resolutionDate(b)) - Date.parse(b.placedAt))
      .filter((ms) => Number.isFinite(ms) && ms >= 0)
      .sort((a, b) => a - b);
    const gap = longestBreak(bets);
    const peakDay = busiestDay(bets);

    // Ordered by what a reader loses least by not seeing: the money and the
    // targets first, the housekeeping counts last. Rows that would read as a zero
    // are left out rather than printed empty.
    return [
      ...(needed === 0
        ? []
        : [
            {
              label: 'Win rate you needed',
              value: `${formatPercent(needed, 0)} · you won ${formatPercent(s.winRate, 0)}`,
              tone: (s.winRate >= needed ? 'profit' : 'loss') as 'profit' | 'loss',
              hint: 'The rate the prices you took demanded just to break even, against the rate you actually hit.',
            },
          ]),
      { label: 'Usual stake', value: money(median) },
      {
        label: 'Biggest stake',
        value:
          overUsual === 0 ? money(biggest) : `${money(biggest)} · ${formatNumber(overUsual, 0)}× usual`,
        hint: 'The largest single stake of the period, against the stake you usually place.',
      },
      { label: 'Odds your money rode', value: odds === 0 ? '—' : formatNumber(odds, 2) },
      ...(best === 0 ? [] : [{ label: 'Best slip', value: money(best), tone: 'profit' as const }]),
      ...(worst === 0 ? [] : [{ label: 'Worst slip', value: money(worst), tone: 'loss' as const }]),
      ...(concentration === 0
        ? []
        : [
            {
              label: 'One slip carried',
              value: formatPercent(concentration * 100, 0),
              hint: 'The share of everything that moved, up or down, that came from a single slip. Above about a third, the period is that slip.',
            },
          ]),
      { label: 'Deepest fall from a high', value: money(dip), tone: dip > 0 ? 'loss' : undefined },
      {
        label: 'Longest runs',
        value: `${formatNumber(run.longestWin, 0)} won · ${formatNumber(run.longestLoss, 0)} lost`,
        hint: 'The longest unbroken streak of each, in the order the slips settled.',
      },
      { label: 'Days you bet on', value: formatNumber(days, 0) },
      {
        label: 'Slips a day you bet',
        value: days === 0 ? '—' : formatNumber(s.totalBets / days, 1),
      },
      {
        label: 'Every deposit staked',
        value: turnover === null ? '—' : `${formatNumber(turnover, 1)}×`,
        hint: 'How many times over the money you put in was staked. Money won and staked again counts each time.',
      },
      ...(waits.length === 0
        ? []
        : [{ label: 'Wait for a result', value: spellDuration(middle(waits)) }]),
      ...(open.length > 0
        ? [
            {
              label: 'Still riding',
              value: `${money(openStake)} on ${formatNumber(open.length, 0)} slips`,
            },
          ]
        : []),
      ...(peakDay > 1 ? [{ label: 'Busiest day', value: `${formatNumber(peakDay, 0)} slips` }] : []),
      ...(gap > 0 ? [{ label: 'Longest break', value: spellDuration(gap) }] : []),
      ...(cashedOut > 0
        ? [
            {
              label: 'Taken early',
              value: `${formatNumber(cashedOut, 0)} slips · ${formatPercent((cashedOut / bets.length) * 100, 0)}`,
            },
          ]
        : []),
      ...(voided > 0 ? [{ label: 'Void or refunded', value: `${formatNumber(voided, 0)} slips` }] : []),
      ...(bonus > 0
        ? [
            {
              label: 'Staked with bonus money',
              value: `${money(bonus)} · ${formatPercent((bonus / s.totalStaked) * 100, 0)} of stake`,
            },
          ]
        : []),
    ];
  }, [bets, cash, currency]);

  // Before the first measurement everything is drawn; the card clips it either way.
  const fits = height === 0 ? rows.length : Math.floor(height / ROW_HEIGHT);

  return (
    <DashboardCard className="flex min-h-0 shrink grow basis-auto flex-col p-3">
      <DashboardCardHeading className="mb-2" title="Your numbers" />
      <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <dl className="min-h-0 flex-1 space-y-1.5 overflow-hidden">
          {rows.slice(0, Math.max(1, fits)).map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-3" title={row.hint}>
              <dt className="text-[11px] text-muted-foreground">{row.label}</dt>
              <dd
                className={cn(
                  'text-xs font-medium tabular-nums text-foreground',
                  row.tone === 'profit' && 'text-profit',
                  row.tone === 'loss' && 'text-loss',
                )}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </DashboardCard>
  );
};
