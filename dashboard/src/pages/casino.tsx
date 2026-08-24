import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  accountKey,
  casinoByGame,
  casinoByKind,
  casinoRoundCurve,
  casinoRoundTotals,
  casinoSessions,
  convertRounds,
  roundNet,
  type CasinoGroup,
  type CasinoKind,
  type CasinoRound,
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
  type LucideIcon,
} from 'lucide-react';
import { DashboardCard, DashboardCardHeading } from '@/components/dashboard/dashboard-card';
import { MetricCard } from '@/components/dashboard/metric-card';
import { RunningPlChart } from '@/components/dashboard/running-pl-chart';
import { useDashboard } from '@/context/dashboard-context';
import { findAccount, useAllKnownAccounts } from '@/data/accounts';
import { getRates, loadCasinoRounds } from '@/data/source';
import { rangeCutoff, rangeEnd } from '@/lib/chart-data';
import { cn, formatDate, formatMoney, formatPercent, formatTime } from '@/lib/utils';

/**
 * The rounds a site wrote down one by one, priced in the display currency. Empty
 * at every site that keeps no such record, which is all but one of them.
 */
const useRounds = (currency: string): CasinoRound[] => {
  const [rounds, setRounds] = useState<CasinoRound[]>([]);

  useEffect(() => {
    let active = true;
    void Promise.all([loadCasinoRounds(), getRates()]).then(([stored, rates]) => {
      if (active) setRounds(convertRounds(stored, rates, currency).converted);
    });
    return () => {
      active = false;
    };
  }, [currency]);

  return rounds;
};

const KIND_NAMES: Record<CasinoKind, string> = {
  originals: 'The site’s own games',
  slots: 'Slots',
  live: 'Live tables',
  provider: 'Other studios',
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
  children,
}: {
  className?: string;
  title?: string;
  children: ReactNode;
}): JSX.Element => (
  <div className={cn('flex items-center gap-2', className)} title={title}>
    {children}
  </div>
);

const signTone = (value: number): 'profit' | 'loss' | 'neutral' =>
  value > 0 ? 'profit' : value < 0 ? 'loss' : 'neutral';

const toneClass = (value: number | null): string =>
  value === null || value === 0 ? 'text-foreground' : value > 0 ? 'text-profit' : 'text-loss';

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

/**
 * One of the two breakdowns, sorted by whichever column was last clicked. Both
 * hold the same figures over different groupings, so they are one table read
 * twice rather than two tables kept in step by hand.
 */
const GroupTable = ({
  title,
  nameLabel,
  groups,
  nameOf,
  iconOf,
  titleOf,
  currency,
}: {
  title: string;
  nameLabel: string;
  groups: readonly CasinoGroup[];
  nameOf: (group: CasinoGroup) => string;
  iconOf: (group: CasinoGroup) => LucideIcon;
  titleOf: (group: CasinoGroup) => string | undefined;
  currency: string;
}): JSX.Element => {
  const [sort, setSort] = useState<GroupSort>('staked');
  const [desc, setDesc] = useState(true);

  const sorted = useMemo(() => {
    const value = (group: CasinoGroup): number =>
      sort === 'label' ? 0 : sort === 'rtp' ? (group.rtp ?? -1) : group[sort];
    return [...groups].sort((a, b) => {
      const diff = sort === 'label' ? nameOf(a).localeCompare(nameOf(b)) : value(a) - value(b) || 0;
      return desc ? -diff : diff;
    });
  }, [groups, sort, desc, nameOf]);

  const click = (key: GroupSort) => (): void => {
    setDesc(key === sort ? !desc : key !== 'label');
    setSort(key);
  };

  return (
    <DashboardCard className="flex min-h-0 flex-col p-4">
      <DashboardCardHeading className="mb-2" title={title} />
      {/* Reserves the body's scrollbar gutter so the columns stay aligned. */}
      <Row className={cn(HEAD, 'scroll-gutter overflow-y-scroll')}>
        <span className="w-3 shrink-0" />
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
      <div className="scroll-area min-h-0 flex-1 overflow-y-auto">
        {sorted.map((group) => {
          const Icon = iconOf(group);
          return (
            <Row key={group.label} className={ROW}>
              <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate first-letter:uppercase" title={titleOf(group)}>
                {nameOf(group)}
              </span>
              <span className="w-10 text-right tabular-nums text-muted-foreground">
                {group.rounds}
              </span>
              <span className="w-16 text-right tabular-nums text-muted-foreground">
                {formatMoney(group.staked, currency)}
              </span>
              <span className={cn('w-16 text-right tabular-nums', toneClass(group.net))}>
                {formatMoney(group.returned, currency)}
              </span>
              <span className="w-12 text-right tabular-nums text-muted-foreground">
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
  const { bookmaker, currency, days, until } = useDashboard();
  const logins = useAllKnownAccounts();
  const allRounds = useRounds(currency);

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
  const curve = useMemo(() => casinoRoundCurve(rounds), [rounds]);
  const games = useMemo(() => casinoByGame(rounds), [rounds]);
  const kinds = useMemo(() => casinoByKind(rounds), [rounds]);
  const sessions = useMemo(() => casinoSessions(rounds), [rounds]);

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
            <DashboardCardHeading className="mb-3" title="Casino over time" />
            <div className="min-h-0 flex-1 overflow-hidden">
              <RunningPlChart
                series={curve}
                currency={currency}
                days={days}
                until={until}
                deltaLabel="This round"
                totalLabel="Casino result"
              />
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
              currency={currency}
            />
            <GroupTable
              title="By type"
              nameLabel="Type"
              groups={kinds}
              nameOf={(group) => KIND_NAMES[group.kind]}
              iconOf={(group) => KIND_ICONS[group.kind]}
              titleOf={(group) => `${formatPercent(group.share * 100, 0)} of the turnover`}
              currency={currency}
            />
          </div>
        </div>

        <DashboardCard className="flex h-full min-h-0 flex-col p-4">
          <DashboardCardHeading className="mb-2" title="Sittings" />
          <Row className={HEAD}>
            <span className="w-3 shrink-0" />
            <span className="flex-1">Game</span>
            <span className="w-16 text-center">Staked</span>
            <span className="w-12 text-center">Odds</span>
            <span className="w-16 text-center">Paid out</span>
          </Row>
          <div className="scroll-area min-h-0 flex-1 overflow-y-auto">
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
                    <Row key={round.id} className={ROW} title={formatTime(round.playedAt)}>
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
