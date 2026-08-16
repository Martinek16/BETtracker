import { useMemo } from 'react';
import {
  compareGroupKeys,
  groupSelectionsBy,
  groupSelectionsWithin,
  type Bet,
  type LegDimension,
  type SelectionStats,
} from '@betanal/shared';
import { ArrowDown, ArrowUp, ChevronRight } from 'lucide-react';
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

/** The one dimension that opens: a family into the priced lines under it. */
const DRILLDOWN: Partial<Record<LegDimension, LegDimension>> = { marketFamily: 'marketLine' };

const COL = {
  lead: 'w-4 shrink-0',
  rank: 'w-8 shrink-0',
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
 * The sport a group belongs to, when it belongs to exactly one. A market that
 * several sports were bet in is not a sport's market, so it stays unmarked.
 */
const SportMark = ({ stats }: { stats: SelectionStats }): JSX.Element | null => {
  if (stats.sports.length !== 1) return null;
  const Glyph = sportIconFor(stats.sports[0]!);
  return (
    <span className="shrink-0" title={stats.sports[0]}>
      <Glyph aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
    </span>
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

/** The lines a market family was built from - still aggregates, never single bets. */
const MarketLines = ({
  lines,
  showImplied,
  currency,
  sortKey,
  desc,
}: {
  lines: readonly SelectionStats[];
  showImplied: boolean;
  currency: string;
  sortKey: SortKey;
  desc: boolean;
}): JSX.Element => {
  if (lines.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">No markets here.</p>;
  }
  // The order the table is being read in, so opening a family does not reshuffle.
  const sorted = [...lines].sort((a, b) => {
    if (sortKey === 'key') {
      return desc ? b.label.localeCompare(a.label) : a.label.localeCompare(b.label);
    }
    const diff = a[sortKey] - b[sortKey];
    return desc ? -diff : diff;
  });
  return (
    <ul className="space-y-px">
      {sorted.map((line) => (
        <li
          key={line.key}
          className="flex items-center gap-3 border-l-2 border-border/40 bg-muted/10 px-3 py-1.5"
        >
          <span className={COL.lead} />
          <span className={COL.rank} />
          <span className={cn(COL.group, 'flex min-w-0 items-center gap-2')}>
            <SportMark stats={line} />
            <span className="truncate text-xs text-foreground" title={line.label}>
              {line.label}
            </span>
          </span>
          <span className={COL.interval} />
          <span
            className={cn(COL.picks, 'text-center text-[11px] tabular-nums text-muted-foreground')}
            title={`${line.decided} settled`}
          >
            {line.picks}
          </span>
          <HitCell stats={line} className="text-[11px]" />
          {showImplied ? (
            <span
              className={cn(
                COL.implied,
                'text-center text-[11px] tabular-nums text-muted-foreground',
              )}
            >
              {formatPercent(line.meanImplied, 0)}
            </span>
          ) : null}
          <span
            className={cn(
              COL.edge,
              'text-center text-[11px] tabular-nums',
              line.edgePp >= 0 ? 'text-profit' : 'text-loss',
            )}
          >
            {line.edgePp >= 0 ? '+' : ''}
            {line.edgePp.toFixed(1)}%
          </span>
          <MoneyCell stats={line} currency={currency} className="text-[11px]" />
          <span
            className={cn(
              COL.units,
              'text-center text-[11px] font-medium tabular-nums',
              line.flatUnitsPl >= 0 ? 'text-profit' : 'text-loss',
            )}
          >
            {line.flatUnitsPl >= 0 ? '+' : ''}
            {line.flatUnitsPl.toFixed(1)}u
          </span>
        </li>
      ))}
    </ul>
  );
};

const GroupCells = ({
  stats,
  rank,
  showImplied,
  showSport,
  currency,
}: {
  stats: SelectionStats;
  rank: number;
  showImplied: boolean;
  showSport: boolean;
  currency: string;
}): JSX.Element => {
  return (
    <>
      <span className={cn(COL.rank, 'text-[10px] font-medium tabular-nums text-muted-foreground')}>
        {rank}.
      </span>
      <span className={cn(COL.group, 'flex min-w-0 items-center gap-2')}>
        {showSport ? <SportMark stats={stats} /> : null}
        <span className="truncate text-sm font-medium" title={stats.label}>
          {stats.label}
        </span>
      </span>
      <div className={COL.interval}>
        <IntervalTrack stats={stats} />
      </div>
      <span
        className={cn(COL.picks, 'text-center text-[11px] tabular-nums text-muted-foreground')}
        title={`${stats.decided} settled`}
      >
        {stats.picks}
      </span>
      <HitCell stats={stats} className="text-[11px] font-medium" />
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
          'text-center text-[11px] font-medium tabular-nums',
          stats.edgePp >= 0 ? 'text-profit' : 'text-loss',
        )}
      >
        {stats.edgePp >= 0 ? '+' : ''}
        {stats.edgePp.toFixed(1)}%
      </span>
      <MoneyCell stats={stats} currency={currency} className="text-[11px] font-medium" />
      <span
        className={cn(
          COL.units,
          'text-center text-sm font-semibold tabular-nums',
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
 * it, which is the whole reason this view crawled. Only a market family opens,
 * and only into more figures.
 */
const GroupRow = ({
  stats,
  rank,
  bets,
  showImplied,
  currency,
  dimension,
  sortKey,
  desc,
}: {
  stats: SelectionStats;
  rank: number;
  bets: readonly Bet[];
  showImplied: boolean;
  currency: string;
  dimension: LegDimension;
  sortKey: SortKey;
  desc: boolean;
}): JSX.Element => {
  const child = DRILLDOWN[dimension];
  const [open, setOpen] = usePersistedState(
    `analytics.selections.${dimension}.open.${stats.key}`,
    false,
  );
  const lines = useMemo(
    () =>
      open && child !== undefined ? groupSelectionsWithin(bets, dimension, stats.key, child) : [],
    [open, child, bets, dimension, stats.key],
  );

  const cells = (
    <GroupCells
      stats={stats}
      rank={rank}
      showImplied={showImplied}
      // A family is the market itself, whichever sport priced it; the sport only
      // means something on the lines it opens into.
      showSport={child === undefined}
      currency={currency}
    />
  );

  if (child === undefined) {
    return (
      <li className="flex items-center gap-3 rounded-md border border-border/60 bg-card/40 px-3 py-2.5">
        <span className={COL.lead} />
        {cells}
      </li>
    );
  }

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
        {cells}
      </button>
      {open ? (
        <div className="border-t border-border/60 pb-1 pt-1">
          <MarketLines
            lines={lines}
            showImplied={showImplied}
            currency={currency}
            sortKey={sortKey}
            desc={desc}
          />
        </div>
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
  // Grouping by odds already fixes what the price said, so the column would only
  // repeat the row's own name.
  const showImplied = dimension !== 'oddsBracket';
  const allGroups = useMemo(
    () => groupSelectionsBy(bets, dimension).filter((g) => g.picks > 0),
    [bets, dimension],
  );

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    // The sport counts as part of the name, so "hockey" reaches every hockey
    // league without the word appearing in a single one of their titles.
    const filtered =
      q === ''
        ? allGroups
        : allGroups.filter(
            (g) =>
              g.label.toLowerCase().includes(q) ||
              g.sports.some((sport) => sport.toLowerCase().includes(q)),
          );
    return [...filtered].sort((a, b) => {
      const diff =
        sortKey === 'key' ? compareGroupKeys(dimension, a.label, b.label) : a[sortKey] - b[sortKey];
      return desc ? -diff : diff;
    });
  }, [allGroups, query, sortKey, desc, dimension]);

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
        <span className={COL.lead} />
        <span className={COL.rank} />
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
        <p className="px-3 py-2 text-sm text-muted-foreground">No groups match “{query}”.</p>
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
