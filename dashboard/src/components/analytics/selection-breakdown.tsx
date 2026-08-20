import { useMemo } from 'react';
import {
  compareGroupKeys,
  groupSelectionsBy,
  groupSelectionsWithin,
  type Bet,
  type LegDimension,
  type SelectionStats,
} from '@betanal/shared';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ListFilter } from 'lucide-react';
import { sportIconFor } from '@/components/dashboard/live-score';
import { usePersistedState } from '@/lib/persisted-state';
import { cn, formatMoney, formatPercent } from '@/lib/utils';

type SortKey =
  | 'key'
  | 'picks'
  | 'hitRate'
  | 'meanImplied'
  | 'edgePp'
  | 'meanOdds'
  | 'flatUnitsPl'
  | 'moneyPl';

const SORT_KEYS: readonly SortKey[] = [
  'key',
  'picks',
  'hitRate',
  'meanImplied',
  'edgePp',
  'meanOdds',
  'flatUnitsPl',
  'moneyPl',
];

/**
 * What a row opens into. A market family opens into the lines it was priced at;
 * every other row opens into the sports it spans, which is the split a reader
 * was reaching for when they asked what a figure was made of. A row that holds
 * one sport has nothing to open into.
 */
const childOf = (dimension: LegDimension, stats: SelectionStats): LegDimension | undefined => {
  if (dimension === 'marketFamily') return 'marketLine';
  if (dimension === 'sport') return undefined;
  return stats.sports.length > 1 ? 'sport' : undefined;
};

/** The groups entered to reach a row, outermost first. */
type Path = readonly (readonly [LegDimension, string])[];

const TOP: Path = [];

/**
 * Dimensions whose every group is one sport and nothing else, so the icon is a
 * column of its own rather than a mark pinned to the name. League and team are
 * already split per sport upstream; a market family spans several and an icon
 * beside it would be a guess at the mixture.
 */
const SPORT_COLUMN: ReadonlySet<LegDimension> = new Set<LegDimension>([
  'sport',
  'league',
  'team',
]);

/** The sport a row is wholly about, or null when it is about more than one. */
const sportOfRow = (dimension: LegDimension, stats: SelectionStats): string | null => {
  if (dimension === 'sport') return stats.label;
  if (!SPORT_COLUMN.has(dimension)) return null;
  return stats.sports[0] ?? null;
};

const COL = {
  rank: 'w-8 shrink-0',
  sport: 'w-6 shrink-0',
  group: 'min-w-0 flex-1',
  interval: 'hidden flex-1 lg:block',
  picks: 'w-14 shrink-0',
  hit: 'w-20 shrink-0',
  implied: 'w-20 shrink-0',
  edge: 'w-20 shrink-0',
  units: 'w-16 shrink-0',
  money: 'w-20 shrink-0',
} as const;

interface SelectionBreakdownProps {
  bets: readonly Bet[];
  dimension: LegDimension;
  currency: string;
  /** Group-name filter, owned by the toolbar above the table. */
  query: string;
  loading?: boolean;
}

/** Real money: a single's whole result, a combo leg's even share of its slip's. */
const MoneyCell = ({
  stats,
  currency,
  className,
}: {
  stats: SelectionStats;
  currency: string;
  className: string;
}): JSX.Element => (
  <span
    className={cn(
      COL.money,
      'text-center tabular-nums',
      className,
      stats.moneyPl >= 0 ? 'text-profit' : 'text-loss',
    )}
    title={`${stats.singles} of ${stats.picks} picks were a slip of their own; the rest count their share of a combo`}
  >
    {formatMoney(stats.moneyPl, currency)}
  </span>
);

/** Wins first, since a count is what a reader checks a rate against. */
const HitCell = ({
  stats,
  className,
}: {
  stats: SelectionStats;
  className: string;
}): JSX.Element => (
  <span
    className={cn(COL.hit, 'flex items-baseline justify-center gap-1 tabular-nums')}
    title={`${stats.won} of ${stats.decided} settled picks won`}
  >
    <span className={cn('text-foreground', className)}>{stats.won}</span>
    <span className="text-[10px] text-muted-foreground">{formatPercent(stats.hitRate, 0)}</span>
  </span>
);

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

/**
 * The sport column's header: which sport the table is narrowed to. A grid rather
 * than a list, because a sport is read as its icon and a column of twenty names
 * is a scroll where a shape would have done.
 */
const SportPicker = ({
  sports,
  value,
  onChange,
}: {
  sports: readonly string[];
  value: string;
  onChange: (sport: string) => void;
}): JSX.Element => {
  // No word in the head: it is a column of marks, and the label was wider than
  // the marks under it, which pushed the name column away from them.
  const Picked = value === '' ? ListFilter : sportIconFor(value);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Pick a sport"
        title={value === '' ? 'Pick a sport' : value}
        className={cn(
          COL.sport,
          'flex items-center outline-none',
          value === '' ? 'text-muted-foreground hover:text-foreground' : 'text-foreground',
        )}
      >
        <Picked aria-hidden className="h-3.5 w-3.5 shrink-0" />
        <ChevronDown className="h-2.5 w-2.5 shrink-0" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className="z-50 w-52 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <DropdownMenu.Item
            onSelect={() => {
              onChange('');
            }}
            className={cn(
              'cursor-pointer select-none rounded px-1.5 py-1 text-[10px] outline-none focus:bg-accent focus:text-accent-foreground',
              value === '' && 'bg-accent text-accent-foreground',
            )}
          >
            All sports
          </DropdownMenu.Item>
          <div className="grid grid-cols-4 gap-0.5">
            {sports.map((sport) => {
              const Icon = sportIconFor(sport);
              return (
                <DropdownMenu.Item
                  key={sport}
                  onSelect={() => {
                    onChange(sport);
                  }}
                  className={cn(
                    'flex cursor-pointer select-none flex-col items-center gap-0.5 rounded px-0.5 py-1 text-[9px] leading-none outline-none focus:bg-accent focus:text-accent-foreground',
                    sport === value && 'bg-accent text-accent-foreground',
                  )}
                >
                  {/* Held at 16px while the words around it shrink: a sport is
                      told apart by its shape, and a smaller one is a smudge. */}
                  <Icon aria-hidden className="h-4 w-4" />
                  <span className="w-full truncate text-center" title={sport}>
                    {sport}
                  </span>
                </DropdownMenu.Item>
              );
            })}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

/** Wilson interval as a band on a 0–100% track, with the implied price marked. */
const IntervalTrack = ({ stats }: { stats: SelectionStats }): JSX.Element => (
  <div className="relative h-2 w-full rounded-full bg-muted/30">
    <span
      className="absolute inset-y-0 rounded-full bg-foreground/25"
      style={{
        left: `${stats.wilsonLow}%`,
        width: `${Math.max(0, stats.wilsonHigh - stats.wilsonLow)}%`,
      }}
    />
    <span
      className="absolute inset-y-[-2px] w-0.5 bg-foreground"
      style={{ left: `${stats.meanImplied}%` }}
    />
  </div>
);

/** The order the table is being read in, so opening a row does not reshuffle it. */
const sortRows = (
  rows: readonly SelectionStats[],
  sortKey: SortKey,
  desc: boolean,
): SelectionStats[] =>
  [...rows].sort((a, b) => {
    if (sortKey === 'key') {
      return desc ? b.label.localeCompare(a.label) : a.label.localeCompare(b.label);
    }
    const diff = a[sortKey] - b[sortKey];
    if (diff === 0) return b.edgePp - a.edgePp;
    return desc ? -diff : diff;
  });

const GroupCells = ({
  stats,
  rank,
  depth,
  dimension,
  sportColumn,
  showImplied,
  currency,
  open,
}: {
  stats: SelectionStats;
  /** Numbered at the top level only; a split is read against its parent. */
  rank: number | null;
  depth: number;
  dimension: LegDimension;
  sportColumn: boolean;
  showImplied: boolean;
  currency: string;
  /** Whether the row is open, or null where it has nothing to open into. */
  open: boolean | null;
}): JSX.Element => {
  const deep = depth > 0;
  const sport = sportOfRow(dimension, stats);
  // Where the whole table is one sport per row the icon stands in its own
  // column; a sport split opened out of a market keeps its icon on the name,
  // since the rows above it in that table have no sport of their own.
  const Column = sportColumn && sport !== null ? sportIconFor(sport) : null;
  // Beside the name, a row that is wholly one sport says so. A row spanning
  // several says nothing and carries the arrow into the split instead, which is
  // where the sports it is made of are actually named.
  const Mark = sportColumn || stats.sports.length !== 1 ? null : sportIconFor(stats.sports[0]!);
  return (
    <>
      <span className={cn(COL.rank, 'text-[10px] font-medium tabular-nums text-muted-foreground')}>
        {rank === null ? null : `${rank}.`}
      </span>
      {sportColumn ? (
        <span className={cn(COL.sport, 'flex items-center')} title={sport ?? undefined}>
          {Column === null ? null : (
            <Column aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </span>
      ) : null}
      {/* Each level is indented inside the name column, so the numbers to the
          right of it stay under the headers they belong to. */}
      <span className={cn(COL.group, 'flex min-w-0 items-center gap-2', depth > 1 && 'pl-4')}>
        <span
          className={cn('truncate', deep ? 'text-xs text-foreground' : 'text-sm font-medium')}
          title={stats.label}
        >
          {stats.label}
        </span>
        {open === null ? (
          Mark === null ? null : (
            <span className="flex shrink-0 items-center" title={stats.sports[0]}>
              <Mark aria-hidden className="h-3.5 w-3.5 text-muted-foreground/70" />
            </span>
          )
        ) : (
          <ChevronRight
            aria-hidden
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-90',
            )}
          />
        )}
      </span>
      {deep ? (
        <span className={COL.interval} />
      ) : (
        <div className={COL.interval}>
          <IntervalTrack stats={stats} />
        </div>
      )}
      <span
        className={cn(COL.picks, 'text-center text-[11px] tabular-nums text-muted-foreground')}
        title={`${stats.decided} settled`}
      >
        {stats.picks}
      </span>
      <HitCell stats={stats} className={cn('text-[11px]', !deep && 'font-medium')} />
      {showImplied ? (
        <span
          className={cn(COL.implied, 'text-center text-[11px] tabular-nums text-muted-foreground')}
        >
          {formatPercent(stats.meanImplied, 0)}
        </span>
      ) : null}
      <span
        className={cn(
          COL.edge,
          'text-center text-[11px] tabular-nums',
          !deep && 'font-medium',
          stats.edgePp >= 0 ? 'text-profit' : 'text-loss',
        )}
      >
        {stats.edgePp >= 0 ? '+' : ''}
        {stats.edgePp.toFixed(1)}%
      </span>
      <MoneyCell
        stats={stats}
        currency={currency}
        className={cn('text-[11px]', !deep && 'font-medium')}
      />
      <span
        className={cn(
          COL.units,
          'text-center tabular-nums',
          deep ? 'text-[11px] font-medium' : 'text-sm font-semibold',
          stats.flatUnitsPl >= 0 ? 'text-profit' : 'text-loss',
        )}
      >
        {stats.flatUnitsPl >= 0 ? '+' : ''}
        {stats.flatUnitsPl.toFixed(1)}u
      </span>
    </>
  );
};

/**
 * A group is a figure, not a drawer: opening one used to render every bet under
 * it, which is the whole reason this view crawled. A row opens into more figures
 * and nothing else - the lines a market was priced at, then the sports it was
 * priced in.
 */
const GroupRow = ({
  stats,
  rank,
  bets,
  within,
  depth,
  sportColumn,
  showImplied,
  currency,
  dimension,
  sortKey,
  desc,
}: {
  stats: SelectionStats;
  rank: number | null;
  bets: readonly Bet[];
  within: Path;
  depth: number;
  sportColumn: boolean;
  showImplied: boolean;
  currency: string;
  dimension: LegDimension;
  sortKey: SortKey;
  desc: boolean;
}): JSX.Element => {
  const child = childOf(dimension, stats);
  const path = useMemo<Path>(
    () => [...within, [dimension, stats.key]],
    [within, dimension, stats.key],
  );
  const [open, setOpen] = usePersistedState(
    `analytics.selections.open.${path.map(([d, k]) => `${d}:${k}`).join('>')}`,
    false,
  );
  const rows = useMemo(
    () => (open && child !== undefined ? groupSelectionsWithin(bets, path, child) : []),
    [open, child, bets, path],
  );

  const cells = (
    <GroupCells
      stats={stats}
      rank={rank}
      depth={depth}
      dimension={dimension}
      sportColumn={sportColumn}
      showImplied={showImplied}
      currency={currency}
      open={child === undefined ? null : open}
    />
  );
  const shell =
    depth === 0
      ? 'rounded-md border border-border/60 bg-card/40'
      : 'border-l-2 border-border/40 bg-muted/10';
  const line = depth === 0 ? 'px-3 py-2.5' : 'px-3 py-1.5';
  // The row a reader is on, lit under the cursor: nine columns of numbers are
  // easy to slip a line on, and nothing else says which line they are reading.
  const lit = 'hover:bg-muted/40';

  if (child === undefined) {
    return (
      <li className={cn(shell, lit, 'flex items-center gap-3', line)}>{cells}</li>
    );
  }

  return (
    <li className={shell}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn('flex w-full items-center gap-3 text-left', lit, line)}
      >
        {cells}
      </button>
      {open ? (
        <ul className={cn('space-y-px', depth === 0 && 'border-t border-border/60 py-1')}>
          {sortRows(rows, sortKey, desc).map((row) => (
            <GroupRow
              key={row.key}
              stats={row}
              rank={null}
              bets={bets}
              within={path}
              depth={depth + 1}
              sportColumn={sportColumn}
              showImplied={showImplied}
              currency={currency}
              dimension={child}
              sortKey={sortKey}
              desc={desc}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
};

export const SelectionBreakdown = ({
  bets,
  dimension,
  currency,
  query,
  loading = false,
}: SelectionBreakdownProps): JSX.Element => {
  // Every tab opens the same way: most-backed first. Volume is what makes the
  // rest of the row worth reading, and one order across the tabs beats each tab
  // having its own. The sequence dimensions are a click on Group away.
  const [sortKey, setSortKey] = usePersistedState<SortKey>(
    `analytics.selections.${dimension}.sortKey`,
    'picks',
    SORT_KEYS,
  );
  const [desc, setDesc] = usePersistedState(`analytics.selections.${dimension}.desc`, true);
  const [picked, setPicked] = usePersistedState(`analytics.selections.${dimension}.sport`, '');
  // Grouping by odds already fixes what the price said, so the column would only
  // repeat the row's own name.
  const showImplied = dimension !== 'oddsBracket';
  const sportColumn = SPORT_COLUMN.has(dimension);
  // Not on the sport tab: the rows there are the sports, so picking one is the
  // table asking the reader to do its own grouping over again.
  const sportFilter = sportColumn && dimension !== 'sport';
  const allGroups = useMemo(
    () => groupSelectionsBy(bets, dimension).filter((g) => g.picks > 0),
    [bets, dimension],
  );

  // The sports these rows are actually made of, the most-backed first. Taken
  // from the data rather than from a list, so a sport nobody bets on is never
  // offered and a new one needs no edit here.
  const sports = useMemo(() => {
    const picks = new Map<string, number>();
    for (const group of allGroups) {
      for (const sport of group.sports) picks.set(sport, (picks.get(sport) ?? 0) + group.picks);
    }
    return [...picks].sort((a, b) => b[1] - a[1]).map(([sport]) => sport);
  }, [allGroups]);
  // A sport picked on a run that had it, on a range of dates that does not, is
  // an empty table with nothing saying why.
  const sport = sportFilter && sports.includes(picked) ? picked : '';

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    // The sport counts as part of the name, so "hockey" reaches every hockey
    // league without the word appearing in a single one of their titles.
    const filtered = allGroups.filter(
      (g) =>
        (sport === '' || g.sports.includes(sport)) &&
        (q === '' ||
          g.label.toLowerCase().includes(q) ||
          g.sports.some((s) => s.toLowerCase().includes(q))),
    );
    return [...filtered].sort((a, b) => {
      const diff =
        sortKey === 'key' ? compareGroupKeys(dimension, a.label, b.label) : a[sortKey] - b[sortKey];
      // Rows of the same size are read best-first, by how far the picks beat the
      // price they were taken at, rather than in the order they were grouped.
      if (diff === 0) return b.edgePp - a.edgePp;
      return desc ? -diff : diff;
    });
  }, [allGroups, query, sport, sortKey, desc, dimension]);

  const shown = groups.map((stats, i) => ({ stats, rank: i + 1 }));

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (allGroups.length === 0) {
    return <p className="text-sm text-muted-foreground">No data for this dimension.</p>;
  }

  const onSort = (key: SortKey): void => {
    if (key === sortKey) {
      setDesc((v) => !v);
    } else {
      setSortKey(key);
      setDesc(key !== 'key');
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
        <span className={COL.rank} />
        {!sportColumn ? null : sportFilter ? (
          <SportPicker sports={sports} value={sport} onChange={setPicked} />
        ) : (
          <span className={COL.sport} />
        )}
        <SortHeaderCell label="Group" sortKey="key" widthClass={COL.group} {...header('key')} />
        <span
          className={cn(COL.interval, 'text-[10px] uppercase tracking-wide text-muted-foreground')}
        >
          Your range · line = the price
        </span>
        <SortHeaderCell
          label="Picks"
          sortKey="picks"
          numeric
          widthClass={COL.picks}
          {...header('picks')}
        />
        <SortHeaderCell
          label="You win"
          sortKey="hitRate"
          numeric
          widthClass={COL.hit}
          {...header('hitRate')}
        />
        {showImplied ? (
          <SortHeaderCell
            label="Odds said"
            sortKey="meanImplied"
            numeric
            widthClass={COL.implied}
            {...header('meanImplied')}
          />
        ) : null}
        <SortHeaderCell
          label="Difference"
          sortKey="edgePp"
          numeric
          widthClass={COL.edge}
          {...header('edgePp')}
        />
        <SortHeaderCell
          label="Profit"
          sortKey="moneyPl"
          numeric
          widthClass={COL.money}
          {...header('moneyPl')}
        />
        <SortHeaderCell
          label="Units"
          sortKey="flatUnitsPl"
          numeric
          widthClass={COL.units}
          {...header('flatUnitsPl')}
        />
      </div>

      {groups.length === 0 ? (
        <p className="px-3 py-2 text-sm text-muted-foreground">
          {query.trim() === ''
            ? `No ${sport.toLowerCase()} groups here.`
            : `No groups match “${query}”.`}
        </p>
      ) : (
        // Always scroll, never auto: a list short enough to lose its scrollbar
        // gets 6px wider and drags every column out from under its header.
        <ul className="scroll-area min-h-0 flex-1 space-y-1.5 overflow-y-scroll">
          {shown.map(({ stats, rank }) => (
            <GroupRow
              key={stats.key}
              stats={stats}
              rank={rank}
              bets={bets}
              within={TOP}
              depth={0}
              sportColumn={sportColumn}
              showImplied={showImplied}
              currency={currency}
              dimension={dimension}
              sortKey={sortKey}
              desc={desc}
            />
          ))}
        </ul>
      )}
    </div>
  );
};
