import type { Bet, LegDimension, SlipDimension } from '@betanal/shared';
import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { DashboardCard, DashboardCardHeading } from '@/components/dashboard/dashboard-card';
import { SegmentedToggle, type SegmentedOption } from '@/components/dashboard/segmented-toggle';
import { SelectionBreakdown } from '@/components/analytics/selection-breakdown';
import { SlipBreakdown } from '@/components/analytics/slip-breakdown';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDashboard, type AnalysisUnit } from '@/context/dashboard-context';
import { usePersistedState } from '@/lib/persisted-state';
import { cn } from '@/lib/utils';

/**
 * Slips are whole tickets, so only what the ticket itself is can group them -
 * sport and league belong to legs and collapse to "Mixed" on every builder.
 */
const SLIP_TABS: { key: SlipDimension; label: string }[] = [
  { key: 'betType', label: 'Slip type' },
  { key: 'stakeBand', label: 'Stake' },
  { key: 'slipOdds', label: 'Odds' },
  { key: 'isLive', label: 'Live / pre' },
  { key: 'exit', label: 'Cash-out' },
  { key: 'bookmaker', label: 'Bookmaker' },
];

const SLIP_TIME: SegmentedOption<SlipDimension>[] = [
  { value: 'hourOfDay', label: 'Hour' },
  { value: 'dayOfWeek', label: 'Day' },
  { value: 'month', label: 'Month' },
];

/**
 * One row per match or per priced line is thousands of rows nobody reads, so
 * both are grouped a level up: markets into families that open into their lines,
 * picks into the side they backed, which in an individual sport is one player.
 * Live / pre is left to the Time toggle, which
 * already carries In-play.
 */
const LEG_TABS: { key: LegDimension; label: string }[] = [
  { key: 'sport', label: 'Sport' },
  { key: 'league', label: 'League' },
  { key: 'marketFamily', label: 'Market' },
  { key: 'team', label: 'Team / Player' },
  { key: 'selectionType', label: 'Fav / Dog' },
  { key: 'oddsBracket', label: 'Odds' },
];

const LEG_TIME: SegmentedOption<LegDimension>[] = [
  { value: 'timeToEvent', label: 'To kick-off' },
  { value: 'hourOfDay', label: 'Hour' },
  { value: 'dayOfWeek', label: 'Day' },
  { value: 'month', label: 'Month' },
];

// Same skin as the SegmentedToggle used across the app, one step larger.
const TAB_CLASS =
  'rounded-[5px] px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground data-[state=active]:bg-foreground data-[state=active]:text-background';
const TABS_LIST_CLASS =
  'h-auto flex-wrap justify-start gap-0.5 rounded-md border border-border bg-muted/30 p-0.5';

const TIME_TAB = 'time';

/** An icon until it is wanted: clicking opens the box, leaving it empty shuts it
 * again. The border keeps one colour throughout, which used to flash on focus. */
const FilterSearch = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}): JSX.Element => {
  const [open, setOpen] = useState(false);
  if (!open && value === '') {
    return (
      <button
        type="button"
        aria-label="Filter groups"
        onClick={() => {
          setOpen(true);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
      >
        <Search className="h-3.5 w-3.5" />
      </button>
    );
  }
  return (
    <div className="relative w-52">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        autoFocus
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onBlur={() => {
          setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onChange('');
            setOpen(false);
          }
        }}
        placeholder="Sport or name…"
        className="h-8 px-8 text-xs focus-visible:ring-0"
      />
      {value === '' ? null : (
        <button
          type="button"
          aria-label="Clear filter"
          onMouseDown={(e) => {
            // Ahead of the blur that would shut the box before the click lands.
            e.preventDefault();
            onChange('');
            setOpen(false);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};

const TabRow = <T extends string>({
  tabs,
  tab,
  onTab,
  timeOptions,
  timeDimension,
  onTimeDimension,
  query,
  onQuery,
}: {
  tabs: { key: T; label: string }[];
  tab: string;
  onTab: (tab: string) => void;
  timeOptions: SegmentedOption<T>[];
  timeDimension: T;
  onTimeDimension: (dimension: T) => void;
  query: string;
  onQuery: (query: string) => void;
}): JSX.Element => (
  <div className="mb-3 flex shrink-0 items-center gap-2">
    <TabsList data-tour="breakdown-tabs" className={TABS_LIST_CLASS}>
      {tabs.map(({ key, label }) => (
        <TabsTrigger key={key} value={key} className={TAB_CLASS}>
          {label}
        </TabsTrigger>
      ))}
      <TabsTrigger value={TIME_TAB} className={TAB_CLASS}>
        Time
      </TabsTrigger>
    </TabsList>
    <div className="ml-auto flex shrink-0 items-center gap-2">
      <SegmentedToggle
        className={cn('text-[11px]', tab === TIME_TAB ? '' : 'hidden')}
        value={timeDimension}
        options={timeOptions}
        onChange={(v) => {
          onTab(TIME_TAB);
          onTimeDimension(v);
        }}
      />
      <FilterSearch value={query} onChange={onQuery} />
    </div>
  </div>
);

const SlipSection = ({
  bets,
  currency,
  loading,
}: {
  bets: readonly Bet[];
  currency: string;
  loading: boolean;
}): JSX.Element => {
  const [tab, setTab] = usePersistedState<string>('analytics.slips.tab', 'betType', [
    ...SLIP_TABS.map((t) => t.key as string),
    TIME_TAB,
  ]);
  const [timeDimension, setTimeDimension] = usePersistedState<SlipDimension>(
    'analytics.slips.time',
    'dayOfWeek',
    SLIP_TIME.map((o) => o.value),
  );
  const [query, setQuery] = usePersistedState('analytics.slips.query', '');
  // One book selected above leaves the bookmaker tab a single row of itself.
  const { bookmaker } = useDashboard();
  const tabs = bookmaker === 'all' ? SLIP_TABS : SLIP_TABS.filter((t) => t.key !== 'bookmaker');
  const active = tab === TIME_TAB || tabs.some((t) => t.key === tab) ? tab : 'betType';
  const dimension: SlipDimension = active === TIME_TAB ? timeDimension : (active as SlipDimension);

  return (
    <Tabs value={active} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
      <TabRow
        tabs={tabs}
        tab={active}
        onTab={setTab}
        timeOptions={SLIP_TIME}
        timeDimension={timeDimension}
        onTimeDimension={setTimeDimension}
        query={query}
        onQuery={setQuery}
      />
      {/* Remounting on the dimension resets the sort to the one that dimension reads best in. */}
      <SlipBreakdown
        key={dimension}
        bets={bets}
        dimension={dimension}
        currency={currency}
        query={query}
        loading={loading}
      />
    </Tabs>
  );
};

const SelectionSection = ({
  bets,
  allBets,
  currency,
  loading,
}: {
  bets: readonly Bet[];
  allBets: readonly Bet[];
  currency: string;
  loading: boolean;
}): JSX.Element => {
  const [tab, setTab] = usePersistedState<string>('analytics.selections.tab', 'sport', [
    ...LEG_TABS.map((t) => t.key as string),
    TIME_TAB,
  ]);
  const [timeDimension, setTimeDimension] = usePersistedState<LegDimension>(
    'analytics.selections.time',
    'timeToEvent',
    LEG_TIME.map((o) => o.value),
  );
  const [query, setQuery] = usePersistedState('analytics.selections.query', '');
  const dimension: LegDimension = tab === TIME_TAB ? timeDimension : (tab as LegDimension);

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
      <TabRow
        tabs={LEG_TABS}
        tab={tab}
        onTab={setTab}
        timeOptions={LEG_TIME}
        timeDimension={timeDimension}
        onTimeDimension={setTimeDimension}
        query={query}
        onQuery={setQuery}
      />
      {/* Remounting on the dimension resets the sort to the one that dimension reads best in. */}
      <SelectionBreakdown
        key={dimension}
        bets={bets}
        allBets={allBets}
        dimension={dimension}
        currency={currency}
        query={query}
        loading={loading}
      />
    </Tabs>
  );
};

interface BreakdownsViewProps {
  bets: readonly Bet[];
  /** Every bet in the window, whatever the account toggle says - the vocabulary
   * the league names and country flags are read from. */
  allBets: readonly Bet[];
  unit: AnalysisUnit;
  currency: string;
  loading: boolean;
}

export const BreakdownsView = ({
  bets,
  allBets,
  unit,
  currency,
  loading,
}: BreakdownsViewProps): JSX.Element => (
  <DashboardCard className="flex h-full min-h-0 flex-col p-4" data-tour="breakdown-table">
    <DashboardCardHeading
      className="mb-3 shrink-0"
      title={unit === 'selections' ? 'Which picks came in' : 'Which slips paid'}
    />
    {unit === 'selections' ? (
      <SelectionSection
        key="selections"
        bets={bets}
        allBets={allBets}
        currency={currency}
        loading={loading}
      />
    ) : (
      <SlipSection key="slips" bets={bets} currency={currency} loading={loading} />
    )}
  </DashboardCard>
);
