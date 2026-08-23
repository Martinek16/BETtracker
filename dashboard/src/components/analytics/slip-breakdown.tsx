import { Fragment, useMemo } from 'react';
import {
  compareGroupKeys,
  formatOdds,
  groupBy,
  slipKeyer,
  profitOf,
  resolvedStake,
  shrunkYield,
  totalProfit,
  type Bet,
  type GroupStats,
  type SlipDimension,
} from '@betanal/shared';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { ProfitBar } from '@/components/dashboard/profit-bar';
import { useDashboard } from '@/context/dashboard-context';
import { heldBack, useRankFloor } from '@/lib/held-back';
import { usePersistedState } from '@/lib/persisted-state';
import { cn, formatDateTime, formatMoney, formatPercent, symbolOf } from '@/lib/utils';

type SortKey =
  | 'key'
  | 'bets'
  | 'staked'
  | 'medianOdds'
  | 'winRate'
  | 'roi'
  | 'unitsPl'
  | 'profit'
  | 'ranked';

const SORT_KEYS: readonly SortKey[] = [
  'key',
  'bets',
  'staked',
  'medianOdds',
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

/** Groupings whose own name already tells you the price of everything in them. */
const ODDS_IS_THE_GROUPING: ReadonlySet<SlipDimension> = new Set<SlipDimension>([
  'slipOdds',
  'selectionType',
  'betType',
  'legCount',
]);

// Shared column widths so the header and every row line up identically.
const COL = {
  lead: 'w-4 shrink-0',
  rank: 'w-8 shrink-0',
  /* Slip groups are short words - 'Treble', 'Monday', '1.50–2.00' - so the
     column is sized for them and the slack goes to the bar, which uses it. */
  group: 'w-44 min-w-0 shrink-0',
  bar: 'hidden flex-1 lg:block',
  /* The column takes its share of the slack, the bar sits centred inside it -
     filling the column edge to edge would park it against Slips and read as
     that column's own. */
  barInner: 'mx-auto w-full max-w-[22rem]',
  staked: 'w-20 shrink-0',
  count: 'w-14 shrink-0',
  odds: 'w-20 shrink-0',
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
  recent,
  strip,
  showOdds,
  thin,
  dimension,
  currency,
}: {
  group: RankedGroup;
  /** Null on a held-back row, which is not ranked with the rest. */
  rank: number | null;
  maxAbs: number;
  recent: readonly Bet[];
  strip: StripView;
  showOdds: boolean;
  /** Too few slips to be ranked with the rest, so the row is held back. */
  thin: boolean;
  dimension: SlipDimension;
  currency: string;
}): JSX.Element => {
  const { oddsFormat } = useDashboard();
  // Stake bands are bare numbers, which say nothing on their own once a book
  // settles in more than one currency.
  const label = dimension === 'stakeBand' ? `${group.key} ${symbolOf(currency)}` : group.key;

  return (
    <li
      className={cn(
        'rounded-md border border-border/60 bg-card/40',
        // Held back rather than hidden: it sits under the line that says why, and
        // the plainer card keeps the ranked rows the ones the eye lands on.
        thin && 'border-dashed bg-transparent',
      )}
    >
      <div className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
        {/* The gutter the header reserves, so the columns line up under it. */}
        <span className={COL.lead} />
        <span
          className={cn(COL.rank, 'text-[10px] font-medium tabular-nums text-muted-foreground')}
        >
          {rank === null ? '' : `${rank}.`}
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
          className={cn(COL.count, 'text-center text-[11px] tabular-nums text-muted-foreground')}
        >
          {group.bets}
        </span>
        {showOdds ? (
          <span
            className={cn(COL.odds, 'text-center text-[11px] tabular-nums text-muted-foreground')}
          >
            @{formatOdds(group.medianOdds, oddsFormat)}
          </span>
        ) : null}
        <span className={cn(COL.wr, 'text-center text-[11px] tabular-nums text-muted-foreground')}>
          {formatPercent(group.winRate, 0)}
        </span>
        <span
          className={cn(COL.staked, 'text-center text-[11px] tabular-nums text-muted-foreground')}
        >
          {formatMoney(group.staked, currency)}
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
      </div>
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
  // Every tab opens in its own order - single before combo, small stake before
  // large - because these groups are a sequence rather than a ranking, and a
  // sequence read out of order says nothing about where the money goes. Any
  // other order is a click on a heading away.
  const [sortKey, setSortKey] = usePersistedState<SortKey>(
    `analytics.slips.${dimension}.sortKey`,
    'key',
    SORT_KEYS,
  );
  const [desc, setDesc] = usePersistedState(`analytics.slips.${dimension}.desc`, false);
  const [strip, setStrip] = usePersistedState<StripView>(
    'analytics.slips.strip',
    'profit',
    STRIP_VIEWS,
  );
  // Dropped wherever the grouping already decides the price: an odds band and a
  // favourite/underdog split are the column under another name, and a fold count
  // fixes it too - four legs multiply out long however they were picked.
  const showOdds = !ODDS_IS_THE_GROUPING.has(dimension);

  const recentByKey = useMemo(() => {
    const map = new Map<string, Bet[]>();
    if (strip !== 'results') return map;
    const byTime = [...bets].sort((a, b) => a.placedAt.localeCompare(b.placedAt));
    // The same keyer the groups were built with: a band cut to fit this period
    // has no fixed name to look up.
    const keyOf = slipKeyer(bets, dimension);
    for (const bet of byTime) {
      const key = keyOf(bet);
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q === '' ? allGroups : allGroups.filter((g) => g.key.toLowerCase().includes(q));
  }, [allGroups, query]);

  // Sorting by size is exempt: the reader asked for the small ones there, and by
  // name the sequence is the whole point.
  const thin = useRankFloor(filtered.length, sortKey === 'bets' || sortKey === 'key');

  const groups = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        // A group too small to have proved anything sinks below the ones that
        // have, whichever figure the table is sorted on. It stays on screen -
        // hiding it would lose slips the totals above still count.
        if (thin !== 0) {
          const rank = Number(b.bets >= thin) - Number(a.bets >= thin);
          if (rank !== 0) return rank;
        }
        const diff =
          sortKey === 'key' ? compareGroupKeys(dimension, a.key, b.key) : a[sortKey] - b[sortKey];
        // Two groups the same size are read best-first rather than in whatever
        // order the grouping happened to build them, and the shrunk yield is what
        // "best" means here - a lucky single slip does not head the tie.
        if (diff === 0) return b.ranked - a.ranked;
        return desc ? -diff : diff;
      }),
    [filtered, sortKey, desc, dimension, thin],
  );

  const shown = heldBack(groups, (g) => g.bets, thin);

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (allGroups.length === 0) {
    return <p className="text-sm text-muted-foreground">No data for this dimension.</p>;
  }

  // Read over the ranked rows, so the longest bar is the biggest result the
  // reader can act on rather than one lucky slip flattening the rest.
  const ranked = thin === 0 ? allGroups : allGroups.filter((g) => g.bets >= thin);
  const scale = ranked.length > 0 ? ranked : allGroups;
  const maxAbs = Math.max(...scale.map((g) => Math.abs(g.profit)), 1);

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
          label="Slips"
          sortKey="bets"
          numeric
          widthClass={COL.count}
          {...header('bets')}
        />
        {showOdds ? (
          <SortHeaderCell
            label="Typical odds"
            sortKey="medianOdds"
            numeric
            widthClass={COL.odds}
            {...header('medianOdds')}
          />
        ) : null}
        <SortHeaderCell
          label="Won"
          sortKey="winRate"
          numeric
          widthClass={COL.wr}
          {...header('winRate')}
        />
        {/* Between what came back as a share of the stake and the money itself:
            the stake is what both of those are measured against. */}
        <SortHeaderCell
          label="Staked"
          sortKey="staked"
          numeric
          widthClass={COL.staked}
          {...header('staked')}
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
          {shown.map(({ row: group, rank, small, opens }) => (
            <Fragment key={group.key}>
              {/* Where the ranked table ends and the rest begins, said in words:
                  a row below this line is not a worse result, it is a row with
                  too few slips to be one. */}
              {opens ? (
                <li className="flex items-center gap-2 px-3 pb-0.5 pt-3 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <span className="h-px w-4 bg-border" />
                  <span className="shrink-0">Under {thin} slips</span>
                  <span className="h-px flex-1 bg-border" />
                </li>
              ) : null}
              <GroupRow
                group={group}
                rank={rank}
                maxAbs={maxAbs}
                recent={recentByKey.get(group.key) ?? []}
                strip={strip}
                showOdds={showOdds}
                thin={small}
                dimension={dimension}
                currency={currency}
              />
            </Fragment>
          ))}
        </ul>
      )}
    </div>
  );
};
