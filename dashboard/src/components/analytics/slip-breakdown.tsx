import { useMemo } from 'react';
import {
  betMatchesGroup,
  compareGroupKeys,
  formatOdds,
  groupBy,
  isLiveBet,
  keyForSlip,
  profitOf,
  resolvedStake,
  shrunkYield,
  totalProfit,
  type Bet,
  type GroupStats,
  type SlipDimension,
} from '@betanal/shared';
import { ArrowDown, ArrowUp, ChevronRight } from 'lucide-react';
import { betDisplayTitle, betLegLines } from '@/lib/bet-display';
import { ProfitBar } from '@/components/dashboard/profit-bar';
import { StatusBadge } from '@/components/ui/badge';
import { useDashboard } from '@/context/dashboard-context';
import { usePersistedState } from '@/lib/persisted-state';
import { cn, formatDateTime, formatMoney, formatPercent, symbolOf } from '@/lib/utils';

type SortKey =
  | 'key'
  | 'bets'
  | 'staked'
  | 'averageOdds'
  | 'winRate'
  | 'roi'
  | 'unitsPl'
  | 'profit'
  | 'ranked';

const SORT_KEYS: readonly SortKey[] = [
  'key',
  'bets',
  'staked',
  'averageOdds',
  'winRate',
  'roi',
  'unitsPl',
  'profit',
  'ranked',
];

/** What the wide column draws: the group's net, or how it got there. */
type StripView = 'profit' | 'results';

const STRIP_VIEWS: readonly StripView[] = ['profit', 'results'];

/** Enough slips to show a run, few enough to fit the column at any width. */
const RECENT = 14;

// Shared column widths so the header and every row line up identically.
const COL = {
  lead: 'w-4 shrink-0',
  rank: 'w-8 shrink-0',
  /* Slip groups are short words - 'Treble', 'Monday', '1.50–2.00' - so the
     column is sized for them and the slack goes to the bar, which uses it. */
  group: 'w-44 min-w-0 shrink-0',
  bar: 'hidden flex-1 lg:block',
  /* The column takes its share of the slack, the bar sits centred inside it -
     filling the column edge to edge would park it against Staked and read as
     that column's own. */
  barInner: 'mx-auto w-full max-w-[22rem]',
  staked: 'w-20 shrink-0',
  count: 'w-14 shrink-0',
  odds: 'w-14 shrink-0',
  wr: 'w-12 shrink-0',
  roi: 'w-14 shrink-0',
  units: 'w-16 shrink-0',
  pl: 'w-20 shrink-0',
} as const;

interface RankedGroup extends GroupStats {
  ranked: number;
}

interface SlipBreakdownProps {
  bets: readonly Bet[];
  dimension: SlipDimension;
  currency: string;
  /** Group-name filter, owned by the toolbar above the table. */
  query: string;
  loading?: boolean;
}

const SortHeaderCell = ({
  label,
  sortKey,
  active,
  desc,
  numeric = false,
  widthClass,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  desc: boolean;
  numeric?: boolean;
  widthClass: string;
  onSort: (key: SortKey) => void;
}): JSX.Element => (
  <button
    type="button"
    onClick={() => onSort(sortKey)}
    className={cn(
      'relative flex items-center gap-1 text-[10px] uppercase tracking-wide hover:text-foreground',
      numeric ? 'justify-center' : 'justify-start',
      active ? 'text-foreground' : 'text-muted-foreground',
      widthClass,
    )}
  >
    <span className="truncate">{label}</span>
    {active ? (
      // Out of the flow on the numeric columns: in the flow it pushes the label
      // off centre, and the label is what the values below are read against.
      <span className={cn('shrink-0', numeric && 'absolute right-0')}>
        {desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
      </span>
    ) : null}
  </button>
);

const MatchRows = ({ bets, currency }: { bets: readonly Bet[]; currency: string }): JSX.Element => {
  const { oddsFormat } = useDashboard();
  if (bets.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">No matching bets.</p>;
  }
  const sorted = [...bets].sort((a, b) => b.placedAt.localeCompare(a.placedAt));
  return (
    <ul className="space-y-px">
      {sorted.map((bet) => {
        const pl = profitOf(bet);
        const combo = bet.legs.length > 1;
        return (
          <li
            key={bet.betId}
            className="flex items-start gap-3 border-l-2 border-border/40 bg-muted/10 px-3 py-2"
          >
            <span className="w-[7.5rem] shrink-0 whitespace-nowrap text-[11px] leading-tight text-muted-foreground">
              {formatDateTime(bet.placedAt)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">{betDisplayTitle(bet)}</p>
              {combo ? (
                <ul className="mt-0.5 space-y-px">
                  {betLegLines(bet).map((line, i) => (
                    <li
                      key={`${bet.betId}-${String(i)}`}
                      className="truncate text-[10px] leading-tight text-muted-foreground/70"
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="truncate text-[10px] leading-tight text-muted-foreground/70">
                  {bet.selection ?? bet.marketType ?? '—'}
                </p>
              )}
            </div>
            <span className="w-12 shrink-0 text-center text-[11px] tabular-nums text-muted-foreground">
              @{formatOdds(bet.odds, oddsFormat)}
            </span>
            <span className="w-16 shrink-0 text-center text-[11px] tabular-nums text-muted-foreground">
              {formatMoney(bet.stake, currency)}
            </span>
            <span
              className="w-16 shrink-0 text-center text-[11px] font-medium tabular-nums"
              style={{
                color:
                  bet.status === 'pending'
                    ? undefined
                    : `hsl(var(--${pl >= 0 ? 'profit' : 'loss'}))`,
              }}
            >
              {bet.status === 'pending' ? '—' : formatMoney(pl, currency)}
            </span>
            {/* Fixed width: 'Cashed out' is twice the width of 'Won', and a badge
                that sets its own width drags every column left of it out of line. */}
            <span className="flex w-20 shrink-0 justify-center">
              <span className="origin-center scale-[0.85] whitespace-nowrap">
                <StatusBadge status={bet.status} live={isLiveBet(bet)} />
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
};

const STATUS_COLOR: Record<string, string> = {
  won: 'hsl(var(--profit))',
  lost: 'hsl(var(--loss))',
  cashed_out: 'hsl(var(--cashedOut))',
  void: 'hsl(var(--muted-foreground) / 0.4)',
  pending: 'hsl(var(--open))',
};

/** The group's last slips in the order they were placed, so a run of losses
 * reads as a run rather than as one averaged figure. */
const ResultStrip = ({
  recent,
  currency,
}: {
  recent: readonly Bet[];
  currency: string;
}): JSX.Element => (
  <div className="flex items-center gap-[3px]">
    {recent.map((bet) => (
      <span
        key={bet.betId}
        title={`${formatDateTime(bet.placedAt)} · ${bet.status} · ${formatMoney(profitOf(bet), currency)}`}
        className="h-3.5 w-1.5 shrink-0 rounded-[2px]"
        style={{ backgroundColor: STATUS_COLOR[bet.status] }}
      />
    ))}
  </div>
);

const GroupRow = ({
  group,
  rank,
  maxAbs,
  bets,
  recent,
  strip,
  showOdds,
  dimension,
  currency,
}: {
  group: RankedGroup;
  rank: number;
  maxAbs: number;
  bets: readonly Bet[];
  recent: readonly Bet[];
  strip: StripView;
  showOdds: boolean;
  dimension: SlipDimension;
  currency: string;
}): JSX.Element => {
  const { oddsFormat } = useDashboard();
  const [open, setOpen] = usePersistedState(
    `analytics.slips.${dimension}.open.${group.key}`,
    false,
  );
  const matches = useMemo(
    () => (open ? bets.filter((b) => betMatchesGroup(b, dimension, group.key)) : []),
    [open, bets, dimension, group.key],
  );
  // Stake bands are bare numbers, which say nothing on their own once a book
  // settles in more than one currency.
  const label = dimension === 'stakeBand' ? `${group.key} ${symbolOf(currency)}` : group.key;

  return (
    <li className="rounded-md border border-border/60 bg-card/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/20"
      >
        <ChevronRight
          className={cn(
            COL.lead,
            'h-3.5 text-muted-foreground transition-transform',
            open && 'rotate-90',
          )}
        />
        <span
          className={cn(COL.rank, 'text-[10px] font-medium tabular-nums text-muted-foreground')}
        >
          {rank}.
        </span>
        <span className={cn(COL.group, 'flex min-w-0 items-center gap-2')}>
          <span className="truncate text-sm font-medium" title={label}>
            {label}
          </span>
        </span>
        <div className={COL.bar}>
          <div className={COL.barInner}>
            {strip === 'results' ? (
              <ResultStrip recent={recent} currency={currency} />
            ) : (
              <ProfitBar profit={group.profit} maxAbs={maxAbs} />
            )}
          </div>
        </div>
        <span
          className={cn(COL.staked, 'text-center text-[11px] tabular-nums text-muted-foreground')}
        >
          {formatMoney(group.staked, currency)}
        </span>
        <span
          className={cn(COL.count, 'text-center text-[11px] tabular-nums text-muted-foreground')}
        >
          {group.bets}
        </span>
        {showOdds ? (
          <span
            className={cn(COL.odds, 'text-center text-[11px] tabular-nums text-muted-foreground')}
          >
            @{formatOdds(group.averageOdds, oddsFormat)}
          </span>
        ) : null}
        <span className={cn(COL.wr, 'text-center text-[11px] tabular-nums text-muted-foreground')}>
          {formatPercent(group.winRate, 0)}
        </span>
        <span className={cn(COL.roi, 'text-center text-[11px] tabular-nums text-muted-foreground')}>
          {formatPercent(group.roi, 0)}
        </span>
        <span
          className={cn(COL.pl, 'text-center text-[11px] font-medium tabular-nums')}
          style={{ color: `hsl(var(--${group.profit >= 0 ? 'profit' : 'loss'}))` }}
        >
          {formatMoney(group.profit, currency)}
        </span>
        <span
          className={cn(COL.units, 'text-center text-sm font-semibold tabular-nums')}
          style={{ color: `hsl(var(--${group.unitsPl >= 0 ? 'profit' : 'loss'}))` }}
        >
          {group.unitsPl >= 0 ? '+' : ''}
          {group.unitsPl.toFixed(1)}u
        </span>
      </button>
      {open ? (
        <div className="border-t border-border/60 pb-1 pt-1">
          <MatchRows bets={matches} currency={currency} />
        </div>
      ) : null}
    </li>
  );
};

export const SlipBreakdown = ({
  bets,
  dimension,
  currency,
  query,
  loading = false,
}: SlipBreakdownProps): JSX.Element => {
  // Every tab opens the same way, most-backed first, so moving between them does
  // not also change what the list is saying. Any other order is a click away.
  const [sortKey, setSortKey] = usePersistedState<SortKey>(
    `analytics.slips.${dimension}.sortKey`,
    'bets',
    SORT_KEYS,
  );
  const [desc, setDesc] = usePersistedState(`analytics.slips.${dimension}.desc`, true);
  const [strip, setStrip] = usePersistedState<StripView>(
    'analytics.slips.strip',
    'profit',
    STRIP_VIEWS,
  );
  // Grouping by odds already fixes the group's price, so the column would only
  // repeat the row's own name.
  const showOdds = dimension !== 'slipOdds';

  const recentByKey = useMemo(() => {
    const map = new Map<string, Bet[]>();
    if (strip !== 'results') return map;
    const byTime = [...bets].sort((a, b) => a.placedAt.localeCompare(b.placedAt));
    for (const bet of byTime) {
      const key = keyForSlip(bet, dimension);
      const list = map.get(key);
      if (list === undefined) {
        map.set(key, [bet]);
      } else {
        list.push(bet);
        if (list.length > RECENT) list.shift();
      }
    }
    return map;
  }, [bets, dimension, strip]);

  const allGroups = useMemo<RankedGroup[]>(() => {
    const staked = resolvedStake(bets);
    const globalYield = staked === 0 ? 0 : (totalProfit(bets) / staked) * 100;
    // Ranked by yield shrunk toward the book average, so a lucky n=1 segment
    // cannot head the table. The displayed ROI stays raw - shrinking it would lie.
    return groupBy(bets, dimension)
      .filter((g) => g.bets > 0)
      .map((g) => ({ ...g, ranked: shrunkYield(g.bets, g.roi, globalYield) }));
  }, [bets, dimension]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered =
      q === '' ? allGroups : allGroups.filter((g) => g.key.toLowerCase().includes(q));
    return [...filtered].sort((a, b) => {
      const diff =
        sortKey === 'key' ? compareGroupKeys(dimension, a.key, b.key) : a[sortKey] - b[sortKey];
      return desc ? -diff : diff;
    });
  }, [allGroups, query, sortKey, desc, dimension]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (allGroups.length === 0) {
    return <p className="text-sm text-muted-foreground">No data for this dimension.</p>;
  }

  const maxAbs = Math.max(...allGroups.map((g) => Math.abs(g.profit)), 1);

  // Clicking a column sorts by it; clicking the active column flips direction.
  const onSort = (key: SortKey): void => {
    if (key === sortKey) {
      setDesc((v) => !v);
    } else {
      setSortKey(key);
      setDesc(key !== 'key'); // text ascending by default, numbers descending
    }
  };

  const header = (key: SortKey): { active: boolean; desc: boolean; onSort: typeof onSort } => ({
    active: sortKey === key,
    desc,
    onSort,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Reserves the body's scrollbar gutter, and the row border it does not
          draw, so the columns stay aligned with the ones below. */}
      <div className="scroll-gutter mb-2 flex shrink-0 items-center gap-3 overflow-y-scroll border border-transparent px-3">
        <span className={COL.lead} />
        <span className={COL.rank} />
        <SortHeaderCell label="Group" sortKey="key" widthClass={COL.group} {...header('key')} />
        <button
          type="button"
          onClick={() => {
            setStrip((v) => (v === 'profit' ? 'results' : 'profit'));
          }}
          title="Switch between the group's net and its run of results"
          className={cn(
            COL.bar,
            'text-center text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground',
          )}
        >
          {strip === 'profit' ? 'Loss / profit' : `Last ${RECENT} results`}
        </button>
        <SortHeaderCell
          label="Staked"
          sortKey="staked"
          numeric
          widthClass={COL.staked}
          {...header('staked')}
        />
        <SortHeaderCell
          label="Slips"
          sortKey="bets"
          numeric
          widthClass={COL.count}
          {...header('bets')}
        />
        {showOdds ? (
          <SortHeaderCell
            label="Odds"
            sortKey="averageOdds"
            numeric
            widthClass={COL.odds}
            {...header('averageOdds')}
          />
        ) : null}
        <SortHeaderCell
          label="Won"
          sortKey="winRate"
          numeric
          widthClass={COL.wr}
          {...header('winRate')}
        />
        <SortHeaderCell
          label="Return"
          sortKey="roi"
          numeric
          widthClass={COL.roi}
          {...header('roi')}
        />
        <SortHeaderCell
          label="Profit"
          sortKey="profit"
          numeric
          widthClass={COL.pl}
          {...header('profit')}
        />
        <SortHeaderCell
          label="Units"
          sortKey="unitsPl"
          numeric
          widthClass={COL.units}
          {...header('unitsPl')}
        />
      </div>

      {/* The list always scrolls, never auto: one short enough to lose its
          scrollbar gets 6px wider and drags every column out from under its header. */}
      {groups.length === 0 ? (
        <p className="px-3 py-2 text-sm text-muted-foreground">No groups match “{query}”.</p>
      ) : (
        <ul className="scroll-area min-h-0 flex-1 space-y-1.5 overflow-y-scroll">
          {groups.map((group, i) => (
            <GroupRow
              key={group.key}
              group={group}
              rank={i + 1}
              maxAbs={maxAbs}
              bets={bets}
              recent={recentByKey.get(group.key) ?? []}
              strip={strip}
              showOdds={showOdds}
              dimension={dimension}
              currency={currency}
            />
          ))}
        </ul>
      )}
    </div>
  );
};
