import { Fragment, useMemo } from 'react';
import {
  compareGroupKeys,
  countryCodeOf,
  groupSelectionsBy,
  groupSelectionsWithin,
  type Bet,
  type LegDimension,
  type SelectionStats,
} from '@betanal/shared';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ListFilter } from 'lucide-react';
import { sportIconFor } from '@/components/dashboard/live-score';
import { ProfitBar } from '@/components/dashboard/profit-bar';
import { flagUrl } from '@/lib/country-flags';
import { heldBack, useRankFloor } from '@/lib/held-back';
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

/** What the wide column draws: the money the row made, or how often it came in. */
type BarView = 'profit' | 'rate';
const BAR_VIEWS: readonly BarView[] = ['profit', 'rate'];

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

/**
 * Dimensions whose every group is one sport and nothing else, so the icon is a
 * column of its own rather than a mark pinned to the name. League and team are
 * already split per sport upstream; a market family spans several and an icon
 * beside it would be a guess at the mixture.
 */
const SPORT_COLUMN: ReadonlySet<LegDimension> = new Set<LegDimension>(['sport', 'league', 'team']);

/** The sport a row is wholly about, or null when it is about more than one. */
const sportOfRow = (dimension: LegDimension, stats: SelectionStats): string | null => {
  if (dimension === 'sport') return stats.label;
  if (!SPORT_COLUMN.has(dimension)) return null;
  return stats.sports[0] ?? null;
};

/**
 * A country as its flag. Written out, the name would be a column as wide as the
 * ones it sits beside, and the emoji flag Windows ships no glyph for draws as
 * two letters, so the picture is a file of its own.
 *
 * A group that is no country - "International", "Esports" - flies a world map,
 * a file of the same shape and size as the rest so the column stays a column.
 */
const CountryFlag = ({ country }: { country: string }): JSX.Element => (
  <img src={flagUrl(countryCodeOf(country) ?? 'world')} alt="" className="h-3 w-4 shrink-0" />
);

const COL = {
  rank: 'w-8 shrink-0',
  sport: 'w-6 shrink-0',
  country: 'w-9 shrink-0',
  group: 'min-w-0 flex-1',
  bar: 'hidden flex-1 lg:block',
  /* The column takes its share of the slack, the bar sits centred inside it -
     filling the column edge to edge would park it against Picks and read as
     that column's own. */
  barInner: 'mx-auto w-full max-w-[22rem]',
  picks: 'w-14 shrink-0',
  hit: 'w-20 shrink-0',
  implied: 'w-20 shrink-0',
  edge: 'w-20 shrink-0',
  units: 'w-16 shrink-0',
  money: 'w-20 shrink-0',
} as const;

interface SelectionBreakdownProps {
  bets: readonly Bet[];
  /**
   * Every bet in the window, whatever the bookmaker filter is set to. The names
   * and the flags on the rows are read from these, so narrowing the table to one
   * book never renames a competition or takes its flag away.
   */
  allBets: readonly Bet[];
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

/** The country column's header: which country the table is narrowed to. A list
 * rather than a grid, since three letters need their name beside them. */
const CountryPicker = ({
  countries,
  value,
  onChange,
}: {
  countries: readonly string[];
  value: string;
  onChange: (country: string) => void;
}): JSX.Element => (
  <DropdownMenu.Root>
    <DropdownMenu.Trigger
      aria-label="Pick a country"
      title={value === '' ? 'Pick a country' : value}
      className={cn(
        COL.country,
        'flex items-center outline-none',
        value === '' ? 'text-muted-foreground hover:text-foreground' : 'text-foreground',
      )}
    >
      {value === '' ? (
        <ListFilter aria-hidden className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <CountryFlag country={value} />
      )}
      <ChevronDown className="h-2.5 w-2.5 shrink-0" />
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align="start"
        sideOffset={4}
        className="scroll-area z-50 max-h-72 w-52 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
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
          All countries
        </DropdownMenu.Item>
        {countries.map((country) => (
          <DropdownMenu.Item
            key={country}
            onSelect={() => {
              onChange(country);
            }}
            className={cn(
              'flex cursor-pointer select-none items-center gap-1.5 rounded px-1.5 py-1 text-[10px] outline-none focus:bg-accent focus:text-accent-foreground',
              country === value && 'bg-accent text-accent-foreground',
            )}
          >
            <CountryFlag country={country} />
            <span className="truncate">{country}</span>
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>
);

/**
 * How often the picks came in, against how often the price said they would. The
 * bar is the record, the notch is the price: a bar past the notch is a row that
 * won more than it was paid to, and the gap between them is the whole story the
 * Difference column tells in a number.
 */
const RateTrack = ({ stats }: { stats: SelectionStats }): JSX.Element => (
  <div
    className="relative h-2 w-full rounded-full bg-muted/30"
    title={`Won ${formatPercent(stats.hitRate, 0)} of ${stats.decided} settled picks; the price said ${formatPercent(stats.meanImplied, 0)}${
      stats.withinChance ? '. Close enough to still be chance.' : ''
    }`}
  >
    <span
      className={cn(
        'absolute inset-y-0 left-0 rounded-l-full',
        stats.edgePp >= 0 ? 'bg-profit' : 'bg-loss',
        // A record a run of luck would explain just as well is drawn faint: the
        // colour is a claim, and this many picks do not support it yet.
        stats.withinChance && 'opacity-40',
      )}
      style={{ width: `${Math.min(100, Math.max(0, stats.hitRate))}%` }}
    />
    {/* Drawn past the track on both sides, as zero is on the profit bar: a mark
        inside the bar would read as part of it rather than as the line it is. */}
    <span
      className="absolute inset-y-[-3px] w-px bg-foreground/60"
      style={{ left: `${Math.min(100, Math.max(0, stats.meanImplied))}%` }}
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
  maxAbs,
  view,
  dimension,
  sportColumn,
  countryColumn,
  showImplied,
  currency,
  open,
}: {
  stats: SelectionStats;
  /** Numbered at the top level only; a split is read against its parent. */
  rank: number | null;
  depth: number;
  /** The biggest result in the table, which the longest bar stands for. */
  maxAbs: number;
  view: BarView;
  dimension: LegDimension;
  sportColumn: boolean;
  countryColumn: boolean;
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
      {countryColumn ? (
        <span
          className={cn(COL.country, 'flex items-center text-muted-foreground')}
          // Every country it is played in, not the one word standing for them.
          title={stats.countries.join(', ') || undefined}
        >
          {stats.country === null ? null : <CountryFlag country={stats.country} />}
        </span>
      ) : null}
      {/* Each level is indented inside the name column, so the numbers to the
          right of it stay under the headers they belong to. */}
      {/* Marks first, name after: a column of names all starting in the same
          place is read down in one go, which a name pushed along by whatever
          icon precedes it is not. */}
      <span className={cn(COL.group, 'flex min-w-0 items-center gap-2', depth > 1 && 'pl-4')}>
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
        <span
          className={cn('truncate', deep ? 'text-xs text-foreground' : 'text-sm font-medium')}
          title={stats.label}
        >
          {stats.label}
        </span>
      </span>
      {deep ? (
        <span className={COL.bar} />
      ) : (
        <div className={COL.bar}>
          {view === 'rate' ? (
            <div className={COL.barInner}>
              <RateTrack stats={stats} />
            </div>
          ) : (
            <div
              className={cn(COL.barInner, stats.withinChance && 'opacity-40')}
              title={`${formatMoney(stats.moneyPl, currency)} over ${stats.picks} picks, against the biggest mover in the table${
                stats.withinChance ? '. Close enough to the price to still be chance.' : ''
              }`}
            >
              <ProfitBar profit={stats.moneyPl} maxAbs={maxAbs} />
            </div>
          )}
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
  allBets,
  within,
  depth,
  maxAbs,
  view,
  thin,
  sportColumn,
  countryColumn,
  showImplied,
  currency,
  dimension,
  sortKey,
  desc,
}: {
  stats: SelectionStats;
  rank: number | null;
  bets: readonly Bet[];
  allBets: readonly Bet[];
  within: Path;
  depth: number;
  maxAbs: number;
  view: BarView;
  /** Too few picks to be ranked with the rest, so the row is held back. */
  thin: boolean;
  sportColumn: boolean;
  countryColumn: boolean;
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
    () => (open && child !== undefined ? groupSelectionsWithin(bets, path, child, allBets) : []),
    [open, child, bets, allBets, path],
  );

  const cells = (
    <GroupCells
      stats={stats}
      rank={rank}
      depth={depth}
      maxAbs={maxAbs}
      view={view}
      dimension={dimension}
      sportColumn={sportColumn}
      countryColumn={countryColumn}
      showImplied={showImplied}
      currency={currency}
      open={child === undefined ? null : open}
    />
  );
  const shell = cn(
    depth === 0
      ? 'rounded-md border border-border/60 bg-card/40'
      : 'border-l-2 border-border/40 bg-muted/10',
    // Held back rather than hidden: it sits under the line that says why, and
    // the plainer card keeps the ranked rows the ones the eye lands on.
    thin && 'border-dashed bg-transparent',
  );
  const line = depth === 0 ? 'px-3 py-2.5' : 'px-3 py-1.5';
  // The row a reader is on, lit under the cursor: nine columns of numbers are
  // easy to slip a line on, and nothing else says which line they are reading.
  const lit = 'hover:bg-muted/40';

  if (child === undefined) {
    return <li className={cn(shell, lit, 'flex items-center gap-3', line)}>{cells}</li>;
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
              allBets={allBets}
              within={path}
              depth={depth + 1}
              maxAbs={maxAbs}
              view={view}
              // The parent's own fade already covers its splits.
              thin={false}
              sportColumn={sportColumn}
              countryColumn={countryColumn}
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
  allBets,
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
  // One choice across the tabs: the column means the same thing on every one of
  // them, and a reader who asked for the rate asked it of the table, not of a tab.
  const [view, setView] = usePersistedState<BarView>(
    'analytics.selections.bar',
    'profit',
    BAR_VIEWS,
  );
  const [picked, setPicked] = usePersistedState(`analytics.selections.${dimension}.sport`, '');
  const [pickedCountry, setPickedCountry] = usePersistedState(
    `analytics.selections.${dimension}.country`,
    '',
  );
  // Grouping by odds already fixes what the price said, so the column would only
  // repeat the row's own name.
  const showImplied = dimension !== 'oddsBracket';
  const sportColumn = SPORT_COLUMN.has(dimension);
  // Not on the sport tab: the rows there are the sports, so picking one is the
  // table asking the reader to do its own grouping over again.
  const sportFilter = sportColumn && dimension !== 'sport';
  // Only the leagues: a country is where a competition is played, and the rows
  // of every other tab are made of several.
  const countryColumn = dimension === 'league';
  const allGroups = useMemo(
    () => groupSelectionsBy(bets, dimension, allBets).filter((g) => g.picks > 0),
    [bets, allBets, dimension],
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

  // Read the same way as the sports, and only from rows the sport filter leaves
  // standing, so the list never offers a country that would empty the table.
  const countries = useMemo(() => {
    const picks = new Map<string, number>();
    for (const group of allGroups) {
      if (sport !== '' && !group.sports.includes(sport)) continue;
      for (const name of group.countries) picks.set(name, (picks.get(name) ?? 0) + group.picks);
    }
    const often = [...picks].sort((a, b) => b[1] - a[1]).map(([name]) => name);
    // What is no country of its own leads, since it is where the competitions
    // nobody hosts end up and the reader looks for it by name, not by rank.
    const places = often.filter((name) => (countryCodeOf(name) ?? 'eu') !== 'eu');
    const nowhere = often.filter((name) => (countryCodeOf(name) ?? 'eu') === 'eu');
    // Then the five bet on most, and the rest alphabetically: past the fifth,
    // ranking is a list to read through and an alphabet is a list to look in.
    return [
      ...nowhere,
      ...places.slice(0, 5),
      ...places.slice(5).sort((a, b) => a.localeCompare(b)),
    ];
  }, [allGroups, sport]);
  const country = countryColumn && countries.includes(pickedCountry) ? pickedCountry : '';

  /**
   * A country narrows the picks, not the rows: a tour that plays fifty countries
   * is one row wherever it stops, and asking for Britain is asking what the
   * British stops did, not how the tour did everywhere.
   */
  const within = useMemo<Path>(() => (country === '' ? [] : [['country', country]]), [country]);
  const rows = useMemo(
    () =>
      country === ''
        ? allGroups
        : groupSelectionsWithin(bets, within, dimension, allBets).filter((g) => g.picks > 0),
    [country, allGroups, bets, allBets, dimension, within],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // The sport counts as part of the name, so "hockey" reaches every hockey
    // league without the word appearing in a single one of their titles.
    return rows.filter(
      (g) =>
        (sport === '' || g.sports.includes(sport)) &&
        (q === '' ||
          g.label.toLowerCase().includes(q) ||
          g.sports.some((s) => s.toLowerCase().includes(q)) ||
          g.countries.some((c) => c.toLowerCase().includes(q))),
    );
  }, [rows, query, sport]);

  // Sorting by size is exempt: the reader asked for the small ones there, and by
  // name the alphabet is the whole point.
  const thin = useRankFloor(filtered.length, sortKey === 'picks' || sortKey === 'key');

  const groups = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        // A group too small to have proved anything sinks below the ones that
        // have, whichever figure the table is sorted on. The row stays on screen
        // either way - hiding it would lose picks the totals above still count.
        if (thin !== 0) {
          const rank = Number(b.picks >= thin) - Number(a.picks >= thin);
          if (rank !== 0) return rank;
        }
        const diff =
          sortKey === 'key'
            ? compareGroupKeys(dimension, a.label, b.label)
            : a[sortKey] - b[sortKey];
        // Rows of the same size are read best-first, by how far the picks beat the
        // price they were taken at, rather than in the order they were grouped.
        if (diff === 0) return b.edgePp - a.edgePp;
        return desc ? -diff : diff;
      }),
    [filtered, sortKey, desc, dimension, thin],
  );

  const shown = heldBack(groups, (g) => g.picks, thin);
  // Read over the ranked rows on screen, so the longest bar is the biggest
  // result the reader can actually see. A held-back row is left out of the
  // scale - one lucky bet would flatten every bar the table is really about,
  // and its own bar simply runs the full width.
  const ranked = thin === 0 ? groups : groups.filter((g) => g.picks >= thin);
  const scale = ranked.length > 0 ? ranked : groups;
  const maxAbs = Math.max(...scale.map((g) => Math.abs(g.moneyPl)), 1);

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
        {!countryColumn ? null : countries.length === 0 ? (
          <span className={COL.country} />
        ) : (
          <CountryPicker countries={countries} value={country} onChange={setPickedCountry} />
        )}
        <SortHeaderCell label="Group" sortKey="key" widthClass={COL.group} {...header('key')} />
        <button
          type="button"
          onClick={() => {
            setView((v) => (v === 'profit' ? 'rate' : 'profit'));
          }}
          title={
            view === 'profit'
              ? 'What the group won or lost, against the biggest mover in the table. Faint while a run of luck would explain it as well. Click for how often it came in.'
              : 'How often the picks won, with the price the book set marked. Faint while a run of luck would explain it as well. Click for the money.'
          }
          className={cn(
            COL.bar,
            'text-center text-[10px] uppercase tracking-wide text-muted-foreground hover:text-foreground',
          )}
        >
          {view === 'profit' ? 'Loss / profit' : 'Won vs price'}
        </button>
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
          {shown.map(({ row: stats, rank, small, opens }) => (
            <Fragment key={stats.key}>
              {/* Where the ranked table ends and the rest begins, said in words:
                  a row below this line is not a worse result, it is a row with
                  too few picks to be one. */}
              {opens ? (
                <li className="flex items-center gap-2 px-3 pb-0.5 pt-3 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <span className="h-px w-4 bg-border" />
                  <span className="shrink-0">Under {thin} picks</span>
                  <span className="h-px flex-1 bg-border" />
                </li>
              ) : null}
              <GroupRow
                stats={stats}
                rank={rank}
                bets={bets}
                allBets={allBets}
                within={within}
                depth={0}
                maxAbs={maxAbs}
                view={view}
                thin={small}
                sportColumn={sportColumn}
                countryColumn={countryColumn}
                showImplied={showImplied}
                currency={currency}
                dimension={dimension}
                sortKey={sortKey}
                desc={desc}
              />
            </Fragment>
          ))}
        </ul>
      )}
    </div>
  );
};
