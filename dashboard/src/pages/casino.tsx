import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  accountKey,
  casinoByGame,
  casinoRoundCurve,
  casinoRoundTotals,
  casinoSessions,
  convertRounds,
  roundNet,
  type CasinoKind,
  type CasinoRound,
  type CasinoRoundTotals,
  type CasinoSession,
} from '@betanal/shared';
import {
  ArrowUpDown,
  Bomb,
  Cherry,
  ChevronDown,
  ChevronsDown,
  ChevronUp,
  Club,
  Coins,
  Diamond,
  Dices,
  Disc3,
  Gamepad2,
  Gem,
  Grid3x3,
  Joystick,
  Layers,
  Percent,
  Spade,
  Target,
  TrendingUp,
  X,
  type LucideIcon,
} from 'lucide-react';
import { ChartViewToggle, type TimelineChartView } from '@/components/dashboard/chart-view-toggle';
import { DashboardCard, DashboardCardHeading } from '@/components/dashboard/dashboard-card';
import { MetricCard } from '@/components/dashboard/metric-card';
import { ProfitTimelineChart } from '@/components/dashboard/profit-timeline-chart';
import { RunningPlChart } from '@/components/dashboard/running-pl-chart';
import { useDashboard } from '@/context/dashboard-context';
import { findAccount, useAllKnownAccounts } from '@/data/accounts';
import { getRates, loadCasinoRounds } from '@/data/source';
import { rangeCutoff, rangeEnd, type AxisTick, type ChartBucket } from '@/lib/chart-data';
import { usePersistedState } from '@/lib/persisted-state';
import { pickXLabelIndices } from '@/lib/profit-chart-scale';
import {
  cn,
  formatDate,
  formatMoney,
  formatNumber,
  formatPercent,
  formatTime,
  symbolOf,
} from '@/lib/utils';

/**
 * The rounds a site wrote down one by one, priced in the display currency. Empty
 * at every site that keeps no such record, which is all but one of them.
 */
const useRounds = (currency: string, nonce: number): CasinoRound[] => {
  const [rounds, setRounds] = useState<CasinoRound[]>([]);

  useEffect(() => {
    let active = true;
    void Promise.all([loadCasinoRounds(), getRates()]).then(([stored, rates]) => {
      if (active) setRounds(convertRounds(stored, rates, currency).converted);
    });
    return () => {
      active = false;
    };
  }, [currency, nonce]);

  return rounds;
};

const KIND_ICONS: Record<CasinoKind, LucideIcon> = {
  originals: Dices,
  slots: Cherry,
  live: Gamepad2,
  provider: Joystick,
};

/**
 * A mark of its own for the games played often enough to be recognised by it.
 * Anything else keeps the mark of the corner of the casino it was played in,
 * which is the honest answer for a slot nobody will meet twice.
 */
const GAME_ICONS: readonly (readonly [RegExp, LucideIcon])[] = [
  [/blackjack/, Spade],
  [/poker/, Club],
  [/baccarat/, Diamond],
  [/roulette|wheel/, Disc3],
  [/crash|limbo|slide/, TrendingUp],
  [/mines/, Bomb],
  [/plinko/, ChevronsDown],
  [/keno/, Grid3x3],
  [/dice/, Dices],
  [/hi-?lo/, ArrowUpDown],
  [/diamonds/, Gem],
  [/tower|cases/, Layers],
];

const gameIcon = (game: string, kind: CasinoKind): LucideIcon =>
  GAME_ICONS.find(([pattern]) => pattern.test(game.toLowerCase()))?.[1] ?? KIND_ICONS[kind];

const HEAD =
  'border-b border-border/60 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground';

const ROW = 'py-1 text-xs';

const Row = ({
  className,
  title,
  onClick,
  onHover,
  children,
}: {
  className?: string;
  title?: string;
  onClick?: () => void;
  /** Called with the row on entry and with `false` on exit. */
  onHover?: (over: boolean) => void;
  children: ReactNode;
}): JSX.Element => {
  const hover =
    onHover === undefined
      ? {}
      : { onMouseEnter: () => onHover(true), onMouseLeave: () => onHover(false) };

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex w-full items-center gap-2 text-left', className)}
      title={title}
      {...hover}
    >
      {children}
    </button>
  ) : (
    <div className={cn('flex items-center gap-2', className)} title={title} {...hover}>
      {children}
    </div>
  );
};

const signTone = (value: number): 'profit' | 'loss' | 'neutral' =>
  value > 0 ? 'profit' : value < 0 ? 'loss' : 'neutral';

const toneClass = (value: number | null): string =>
  value === null || value === 0 ? 'text-foreground' : value > 0 ? 'text-profit' : 'text-loss';

/**
 * Rounds enough for a band to say something rather than describe one evening,
 * the most bands worth reading at once, and the share of the play beyond which
 * a single row stops telling you anything about where the money went.
 */
const MIN_BAND_ROUNDS = 12;
const MAX_BANDS = 10;
const MAX_BAND_SHARE = 0.25;

/**
 * The marks a stake is chosen at: 1, 1.5, 2, 3, 5, 7 and their decades, from a
 * tenth of a cent up. The ladder has to reach that low because a spin costing a
 * few cents is the ordinary case, and a rung nobody's stake reaches is free -
 * only the rungs the play crosses ever become a row.
 */
const STAKE_MARKS: readonly number[] = [-4, -3, -2, -1, 0, 1, 2, 3, 4].flatMap((power) =>
  [1, 1.5, 2, 3, 5, 7].map((step) => Number((step * 10 ** power).toPrecision(2))),
);

interface StakeBand extends GroupRow {
  /** Where the band starts, which is also the order the ladder is read in. */
  floor: number;
}

/**
 * The stake ladder. A round is grouped by what it cost rather than by what it
 * was played on, which is the only grouping that answers whether the money went
 * on the big rounds or was ground away by the small ones.
 *
 * The rungs stand at round prices, because that is where stakes are chosen, but
 * which of them are used depends on the play. A rung below too few rounds is
 * swallowed so no row is too thin to read; a rung is kept, even below the usual
 * count, where the next one would leave a row holding a quarter of the play.
 */
const stakeBands = (rounds: readonly CasinoRound[], currency: string): StakeBand[] => {
  if (rounds.length === 0) return [];
  const symbol = symbolOf(currency);
  // As many decimals as the figure itself carries: a ladder of cent spins needs
  // them, a ladder of blackjack hands would only be padded by them.
  const money = (value: number): string =>
    `${symbol}${formatNumber(value, Math.min(3, (String(value).split('.')[1] ?? '').length))}`;
  const label = (floor: number, ceiling: number | null): string =>
    ceiling === null ? `${money(floor)} and up` : `${money(floor)} – ${money(ceiling)}`;

  const sorted = [...rounds].sort((a, b) => a.stake - b.stake);
  const target = Math.max(MIN_BAND_ROUNDS, Math.ceil(sorted.length / MAX_BANDS));
  const ceilingRounds = Math.ceil(sorted.length * MAX_BAND_SHARE);

  // One bucket per rung the play actually reaches, before any of them are merged.
  const buckets: { floor: number; ceiling: number | null; group: CasinoRound[] }[] = [];
  let floor = 0;
  let group: CasinoRound[] = [];
  let mark = 0;
  for (const round of sorted) {
    while (mark < STAKE_MARKS.length && round.stake >= (STAKE_MARKS[mark] ?? 0)) {
      const crossed = STAKE_MARKS[mark] ?? 0;
      mark += 1;
      if (group.length > 0) {
        buckets.push({ floor, ceiling: crossed, group });
        group = [];
      }
      floor = crossed;
    }
    group.push(round);
  }
  buckets.push({ floor, ceiling: null, group });

  const bands: typeof buckets = [];
  for (const bucket of buckets) {
    const open = bands[bands.length - 1];
    const merged = open === undefined ? 0 : open.group.length + bucket.group.length;
    const keepOpen =
      open !== undefined &&
      open.group.length < target &&
      (merged <= ceilingRounds || open.group.length < MIN_BAND_ROUNDS);
    if (keepOpen && open) {
      open.group = [...open.group, ...bucket.group];
      open.ceiling = bucket.ceiling;
    } else {
      bands.push({ ...bucket });
    }
  }

  // A thin last band is the tail of the one below it, not a row of its own.
  const last = bands[bands.length - 1];
  const previous = bands[bands.length - 2];
  if (last && previous && last.group.length < MIN_BAND_ROUNDS) {
    previous.group = [...previous.group, ...last.group];
    previous.ceiling = last.ceiling;
    bands.pop();
  }

  // The ladder starts at the cheapest round actually played, not at the rung
  // below it: a band nobody's stake reaches down to is a wider claim than true.
  const first = bands[0];
  if (first) first.floor = first.group[0]?.stake ?? first.floor;

  return bands.map((band) => ({
    ...casinoRoundTotals(band.group),
    floor: band.floor,
    label: label(band.floor, band.ceiling),
  }));
};

/**
 * A sitting a bar, oldest first. There is no calendar bucket that fits a casino:
 * a day holding one evening's play is that evening drawn with its date blurred,
 * and a day holding none is a gap the play never had.
 */
const sessionBuckets = (sessions: readonly CasinoSession[]): ChartBucket[] =>
  [...sessions].reverse().map((session) => ({
    key: session.startedAt,
    label: formatDate(session.startedAt),
    periodLabel: `${formatDate(session.startedAt)} · ${formatTime(session.startedAt)} – ${formatTime(session.endedAt)}`,
    wins: session.rounds.reduce((sum, round) => sum + Math.max(roundNet(round), 0), 0),
    losses: session.rounds.reduce((sum, round) => sum + Math.max(-roundNet(round), 0), 0),
    profit: session.totals.net,
    bets: session.totals.rounds,
  }));

const sessionTicks = (buckets: readonly ChartBucket[]): AxisTick[] =>
  pickXLabelIndices(buckets.length, 6).map((index) => ({
    index,
    label: buckets[index]?.label ?? '',
  }));

type GroupSort = 'label' | 'rounds' | 'staked' | 'returned' | 'rtp';

const GROUP_COLUMNS: readonly { key: GroupSort; label: string; width: string }[] = [
  { key: 'rounds', label: 'Rounds', width: 'w-10' },
  { key: 'staked', label: 'Staked', width: 'w-16' },
  { key: 'returned', label: 'Paid out', width: 'w-16' },
  { key: 'rtp', label: 'Return', width: 'w-12' },
];

const SortHead = ({
  label,
  width,
  active,
  desc,
  onClick,
}: {
  label: string;
  width: string;
  active: boolean;
  desc: boolean;
  onClick: () => void;
}): JSX.Element => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'flex items-center justify-center gap-0.5 hover:text-foreground',
      width,
      active && 'text-foreground',
    )}
  >
    {label}
    {active && (desc ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)}
  </button>
);

/** Anything the round totals can be grouped into and read as a row. */
type GroupRow = CasinoRoundTotals & { label: string };

/**
 * One of the breakdowns, sorted by whichever column was last clicked. They hold
 * the same figures over different groupings, so they are one table read twice
 * rather than two tables kept in step by hand.
 */
const GroupTable = <T extends GroupRow>({
  title,
  nameLabel,
  groups,
  nameOf,
  iconOf,
  titleOf,
  compareLabel,
  defaultSort = 'staked',
  picked,
  onPick,
  currency,
}: {
  title: string;
  nameLabel: string;
  groups: readonly T[];
  nameOf: (group: T) => string;
  /** Left off where the rows are bands rather than things with a face. */
  iconOf?: (group: T) => LucideIcon;
  titleOf: (group: T) => string | undefined;
  /** How the name column orders, where alphabetical would be the wrong order. */
  compareLabel?: (a: T, b: T) => number;
  /** The column the table opens on, where the biggest row is not the first one. */
  defaultSort?: GroupSort;
  /** The row the chart above is currently narrowed to, if any. */
  picked?: string | null;
  onPick?: (group: T) => void;
  currency: string;
}): JSX.Element => {
  const [sort, setSort] = useState<GroupSort>(defaultSort);
  const [desc, setDesc] = useState(defaultSort !== 'label');

  const sorted = useMemo(() => {
    const value = (group: T): number =>
      sort === 'label' ? 0 : sort === 'rtp' ? (group.rtp ?? -1) : group[sort];
    const byLabel = compareLabel ?? ((a: T, b: T): number => nameOf(a).localeCompare(nameOf(b)));
    return [...groups].sort((a, b) => {
      const diff = sort === 'label' ? byLabel(a, b) : value(a) - value(b) || 0;
      return desc ? -diff : diff;
    });
  }, [groups, sort, desc, nameOf, compareLabel]);

  const click = (key: GroupSort) => (): void => {
    setDesc(key === sort ? !desc : key !== 'label');
    setSort(key);
  };

  return (
    <DashboardCard className="flex min-h-0 flex-col p-4">
      <DashboardCardHeading className="mb-2" title={title} />
      {/* Reserves the body's scrollbar gutter so the columns stay aligned. */}
      <Row className={cn(HEAD, 'scroll-gutter overflow-y-scroll pr-2')}>
        {iconOf && <span className="w-3 shrink-0" />}
        <SortHead
          label={nameLabel}
          width="flex-1 !justify-start"
          active={sort === 'label'}
          desc={desc}
          onClick={click('label')}
        />
        {GROUP_COLUMNS.map((column) => (
          <SortHead
            key={column.key}
            label={column.label}
            width={column.width}
            active={sort === column.key}
            desc={desc}
            onClick={click(column.key)}
          />
        ))}
      </Row>
      <div className="scroll-area min-h-0 flex-1 overflow-y-auto pr-2">
        {sorted.map((group) => {
          const Icon = iconOf?.(group);
          return (
            <Row
              key={group.label}
              className={cn(
                ROW,
                onPick && 'rounded px-1 hover:bg-muted/40',
                picked === group.label && 'bg-muted/60',
              )}
              onClick={onPick && (() => onPick(group))}
            >
              {Icon && <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />}
              <span className="flex-1 truncate first-letter:uppercase" title={titleOf(group)}>
                {nameOf(group)}
              </span>
              <span className="w-10 text-center tabular-nums text-muted-foreground">
                {group.rounds}
              </span>
              <span className="w-16 text-center tabular-nums text-muted-foreground">
                {formatMoney(group.staked, currency)}
              </span>
              <span className={cn('w-16 text-center tabular-nums', toneClass(group.net))}>
                {formatMoney(group.returned, currency)}
              </span>
              <span className="w-12 text-center tabular-nums text-muted-foreground">
                {group.rtp === null ? '—' : formatPercent(group.rtp * 100, 0)}
              </span>
            </Row>
          );
        })}
      </div>
    </DashboardCard>
  );
};

/**
 * The casino, which the sportsbook figures otherwise swallow.
 *
 * Every figure here is built from the rounds themselves, so the period picker
 * cuts them the way it cuts bets: a round happened at a moment and belongs to
 * whatever window holds that moment. Nothing on the page is a lifetime tally,
 * which is why nothing on it contradicts the picker above it.
 */
export const CasinoPage = (): JSX.Element => {
  const { bookmaker, currency, days, until, nonce } = useDashboard();
  const logins = useAllKnownAccounts();
  const allRounds = useRounds(currency, nonce);

  const casinoKeys = useMemo(
    () =>
      new Set(
        logins
          .filter(
            (login) =>
              (bookmaker === 'all' || login.bookmaker === bookmaker) &&
              findAccount(login.bookmaker)?.hasCasino === true,
          )
          .map((login) => accountKey(login)),
      ),
    [logins, bookmaker],
  );

  // Rounds are single moments, so unlike a lifetime tally they take the period
  // picker without lying: what was played in a window is what was played.
  const rounds = useMemo(() => {
    const from = days === null ? -Infinity : rangeCutoff(days, until);
    const to = days === null ? Infinity : rangeEnd(until);
    return allRounds.filter((round) => {
      const at = Date.parse(round.playedAt);
      return casinoKeys.has(accountKey(round)) && at >= from && at < to;
    });
  }, [allRounds, casinoKeys, days, until]);

  const played = useMemo(() => casinoRoundTotals(rounds), [rounds]);
  const games = useMemo(() => casinoByGame(rounds), [rounds]);
  const bands = useMemo(() => stakeBands(rounds, currency), [rounds, currency]);
  const sessions = useMemo(() => casinoSessions(rounds), [rounds]);

  const [chartView, setChartView] = usePersistedState<TimelineChartView>(
    'casino.chartView',
    'line',
    ['bars', 'line'],
  );
  // One game's own run, picked from the table below. A game the period no longer
  // holds narrows to nothing, so the pick is dropped rather than drawn empty.
  const [game, setGame] = useState<string | null>(null);
  // The round the sittings list is being pointed at, marked on the curve so the
  // two panels are read as one thing rather than two.
  const [markedRound, setMarkedRound] = useState<string | null>(null);
  const picked = games.find((group) => group.label === game) ?? null;
  const PickedIcon = picked === null ? Dices : gameIcon(picked.label, picked.kind);
  const shown = useMemo(
    () => (picked === null ? rounds : rounds.filter((round) => round.game === picked.label)),
    [rounds, picked],
  );
  const curve = useMemo(() => casinoRoundCurve(shown), [shown]);
  const buckets = useMemo(() => sessionBuckets(casinoSessions(shown)), [shown]);
  const ticks = useMemo(() => sessionTicks(buckets), [buckets]);

  const money = (value: number | null): string =>
    value === null ? '—' : formatMoney(value, currency);

  if (casinoKeys.size === 0) {
    return (
      <DashboardCard className="p-5">
        <DashboardCardHeading
          title="Casino"
          subtitle="No connected account runs a casino off its betting wallet."
        />
        <p className="text-sm text-muted-foreground">
          This page fills itself the moment such an account is connected.
        </p>
      </DashboardCard>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-5">
        <MetricCard
          icon={Dices}
          label="Casino result"
          value={money(played.net)}
          subtitle={`${played.rounds} rounds in this period`}
          tone={signTone(played.net)}
        />
        <MetricCard
          icon={Coins}
          label="Staked"
          value={money(played.staked)}
          subtitle={
            played.rounds === 0 ? 'Spun through' : `${money(played.staked / played.rounds)} a round`
          }
        />
        <MetricCard
          icon={Percent}
          label="Actual return"
          value={played.rtp === null ? '—' : formatPercent(played.rtp * 100)}
          subtitle="Came back per unit staked"
          tone={played.rtp === null ? 'neutral' : signTone(played.rtp - 1)}
        />
        <MetricCard
          icon={Target}
          label="Rounds that paid"
          value={played.rounds === 0 ? '—' : formatPercent((played.won / played.rounds) * 100)}
          subtitle={`${played.won} of ${played.rounds} came back over the stake`}
        />
        <MetricCard
          icon={TrendingUp}
          label="Best round"
          value={played.bestRound === null ? '—' : money(roundNet(played.bestRound))}
          subtitle={
            played.worstRound === null
              ? 'Nothing played yet'
              : `Worst ${money(roundNet(played.worstRound))} · ${played.worstRound.game}`
          }
          tone={played.bestRound === null ? 'neutral' : signTone(roundNet(played.bestRound))}
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-3">
        <div className="flex min-h-0 flex-col gap-3 xl:col-span-2">
          <DashboardCard className="flex min-h-0 flex-[12] flex-col p-4">
            <DashboardCardHeading
              className="mb-3"
              title={
                picked === null ? (
                  'Round by round'
                ) : (
                  <span className="flex items-center gap-2 text-lg">
                    <PickedIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <span className="truncate first-letter:uppercase">{picked.label}</span>
                  </span>
                )
              }
              subtitle={
                picked === null
                  ? chartView === 'line'
                    ? 'Running casino result, a step per round'
                    : 'What each sitting finished at'
                  : `${picked.rounds} rounds · ${money(picked.net)}`
              }
              action={
                <div className="flex items-center gap-2">
                  {picked === null ? null : (
                    <button
                      type="button"
                      onClick={() => setGame(null)}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <X size={12} />
                      All games
                    </button>
                  )}
                  <ChartViewToggle value={chartView} onChange={setChartView} primary="line" />
                </div>
              }
            />
            <div className="min-h-0 flex-1 overflow-hidden">
              {chartView === 'line' ? (
                <RunningPlChart
                  series={curve}
                  currency={currency}
                  byIndex
                  markedId={markedRound}
                  deltaLabel="This round"
                  totalLabel="Casino result"
                />
              ) : (
                <ProfitTimelineChart
                  data={buckets}
                  currency={currency}
                  ticks={ticks}
                  countLabel="Rounds"
                />
              )}
            </div>
          </DashboardCard>

          <div className="grid min-h-0 flex-[13] gap-3 sm:grid-cols-2">
            <GroupTable
              title="Games"
              nameLabel="Game"
              groups={games}
              nameOf={(group) => group.label}
              iconOf={(group) => gameIcon(group.label, group.kind)}
              titleOf={(group) => group.provider ?? undefined}
              picked={game}
              onPick={(group) => setGame(game === group.label ? null : group.label)}
              currency={currency}
            />
            <GroupTable
              title="By stake"
              nameLabel="Stake"
              groups={bands}
              nameOf={(group) => group.label}
              titleOf={(group) =>
                `${formatPercent((group.staked / played.staked) * 100, 0)} of the turnover`
              }
              compareLabel={(a, b) => a.floor - b.floor}
              defaultSort="label"
              currency={currency}
            />
          </div>
        </div>

        <DashboardCard className="flex h-full min-h-0 flex-col p-4">
          <DashboardCardHeading className="mb-2" title="Sittings" />
          {/* Reserves the body's scrollbar gutter so the columns stay aligned. */}
          <Row className={cn(HEAD, 'scroll-gutter overflow-y-scroll pr-2')}>
            <span className="w-3 shrink-0" />
            <span className="flex-1">Game</span>
            <span className="w-16 text-center">Staked</span>
            <span className="w-12 text-center">Odds</span>
            <span className="w-16 text-center">Paid out</span>
          </Row>
          <div className="scroll-area min-h-0 flex-1 overflow-y-auto pr-2">
            {sessions.map((session) => (
              <div key={session.startedAt}>
                <Row className="mt-3 first:mt-2">
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {formatDate(session.startedAt)}
                  </span>
                  <span className="h-px flex-1 bg-border/60" />
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {formatMoney(session.totals.net, currency)}
                  </span>
                </Row>
                {session.rounds.map((round) => {
                  const Icon = gameIcon(round.game, round.kind);
                  return (
                    <Row
                      key={round.id}
                      className={cn(ROW, 'rounded px-1', markedRound === round.id && 'bg-muted/60')}
                      title={formatTime(round.playedAt)}
                      onHover={(over) => setMarkedRound(over ? round.id : null)}
                    >
                      <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span
                        className="flex-1 truncate first-letter:uppercase"
                        title={round.provider ?? undefined}
                      >
                        {round.game}
                      </span>
                      <span className="w-16 text-right tabular-nums text-muted-foreground">
                        {formatMoney(round.stake, currency)}
                      </span>
                      <span className="w-12 text-right tabular-nums text-muted-foreground">
                        {round.multiplier.toFixed(2)}×
                      </span>
                      {/* What came back, coloured by whether it beat the stake. */}
                      <span
                        className={cn(
                          'w-16 text-right tabular-nums',
                          toneClass(round.payout - round.stake),
                        )}
                      >
                        {formatMoney(round.payout, currency)}
                      </span>
                    </Row>
                  );
                })}
              </div>
            ))}
          </div>
        </DashboardCard>
      </div>
    </div>
  );
};
