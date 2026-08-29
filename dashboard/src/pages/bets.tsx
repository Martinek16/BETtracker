import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { usePersistedState } from '@/lib/persisted-state';
import { ArrowRight, ChevronDown, ChevronUp, Ticket } from 'lucide-react';
import { profitOf, type Bet } from '@betanal/shared';
import { BetTableRow } from '@/components/dashboard/bet-table-row';
import { betSearchText, SLIP_KIND_LABEL, singleEventLabel, slipKind } from '@/lib/bet-display';
import { DashboardCard, DashboardCardHeading } from '@/components/dashboard/dashboard-card';
import { SegmentedToggle, type SegmentedOption } from '@/components/dashboard/segmented-toggle';
import { SearchBox } from '@/components/dashboard/search-box';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDashboard } from '@/context/dashboard-context';
import { useLiveBets } from '@/data/live-bets';
import { cn, formatTime } from '@/lib/utils';

type SortKey = 'date' | 'type' | 'bet' | 'odds' | 'stake' | 'return' | 'pl' | 'status';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'all' | 'won' | 'lost' | 'other';

const STATUS_OPTIONS: readonly SegmentedOption<StatusFilter>[] = [
  { value: 'won', label: 'Won', title: 'Winning bets' },
  { value: 'lost', label: 'Lost', title: 'Losing bets' },
  { value: 'other', label: 'Other', title: 'Void, cashed out and still open' },
  { value: 'all', label: 'All', title: 'Every bet' },
];

/** "Other" is everything that neither won nor lost, so no bet can fall out of the tabs. */
const matchesStatus = (bet: Bet, filter: StatusFilter): boolean => {
  if (filter === 'all') return true;
  if (filter === 'other') return bet.status !== 'won' && bet.status !== 'lost';
  return bet.status === filter;
};

const COLUMNS: ReadonlyArray<{ key: SortKey; label: string }> = [
  { key: 'date', label: 'Date' },
  { key: 'type', label: 'Type' },
  { key: 'bet', label: 'Bet' },
  { key: 'odds', label: 'Odds' },
  { key: 'stake', label: 'Stake' },
  { key: 'return', label: 'Return' },
  { key: 'pl', label: 'P/L' },
  { key: 'status', label: 'Status' },
];

const NUMERIC_COLUMNS = new Set<SortKey>(['odds', 'stake', 'return', 'pl']);

/** Sorts on what the column actually shows, not on the underlying field. */
const SORT_VALUE: Record<SortKey, (bet: Bet) => string | number> = {
  date: (bet) => bet.placedAt,
  type: (bet) => SLIP_KIND_LABEL[slipKind(bet)],
  bet: (bet) => (slipKind(bet) === 'single' ? singleEventLabel(bet) : `${bet.legs.length} `),
  odds: (bet) => bet.odds,
  stake: (bet) => bet.stake,
  return: (bet) => bet.actualReturn,
  pl: (bet) => profitOf(bet),
  status: (bet) => bet.status,
};

/**
 * Settled rows drawn before the table asks to be read further. A season is a few
 * thousand slips and years of them are far more; handing all of that to the DOM
 * at once locks the tab for as long as it takes to lay out.
 */
const PAGE = 200;

interface SortHeadProps {
  column: { key: SortKey; label: string };
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
}

const SortHead = ({ column, sort, onSort }: SortHeadProps): JSX.Element => {
  const active = sort.key === column.key;
  const Arrow = active && sort.dir === 'asc' ? ChevronUp : ChevronDown;
  // Money and odds sit over the digits they head, which are right-aligned.
  const numeric = NUMERIC_COLUMNS.has(column.key);
  return (
    <TableHead
      className="text-[11px] uppercase tracking-wide"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(column.key)}
        className={cn(
          'group flex items-center gap-1 uppercase transition-colors hover:text-foreground',
          numeric && 'ml-auto',
        )}
      >
        {column.label}
        <Arrow
          size={12}
          strokeWidth={2}
          className={active ? 'text-foreground' : 'opacity-0 group-hover:opacity-40'}
        />
      </button>
    </TableHead>
  );
};

export const BetsPage = (): JSX.Element => {
  const { bets, periodBets, loading, periodLabel, activeBookmakers } = useDashboard();
  // The same open slips and figures the panel shows, from the one poll they
  // share - so a bet the book has since moved on reads alike in both places.
  const { bets: liveBets, scores, refreshedAt } = useLiveBets();
  // Naming the account only means something when there is more than one.
  const showAccount = activeBookmakers.length >= 2;
  const columnCount = showAccount ? COLUMNS.length + 1 : COLUMNS.length;
  const [sortKey, setSortKey] = usePersistedState<SortKey>(
    'bets.sortKey',
    'date',
    Object.keys(SORT_VALUE) as SortKey[],
  );
  const [sortDir, setSortDir] = usePersistedState<SortDir>('bets.sortDir', 'desc', ['asc', 'desc']);
  const sort = useMemo(() => ({ key: sortKey, dir: sortDir }), [sortKey, sortDir]);
  const [status, setStatus] = usePersistedState<StatusFilter>('bets.status', 'all', [
    'all',
    'won',
    'lost',
    'other',
  ]);
  const [query, setQuery] = usePersistedState('bets.query', '');
  const needle = query.trim().toLowerCase();
  const [shown, setShown] = useState(PAGE);

  const toggleSort = (key: SortKey): void => {
    setSortDir((current) =>
      sortKey === key ? (current === 'asc' ? 'desc' : 'asc') : key === 'date' ? 'desc' : 'asc',
    );
    setSortKey(key);
  };

  // Active (open) bets are pinned on top regardless of the period filter, so
  // live slips show immediately instead of only appearing once settled. Sorting
  // runs inside each group rather than across both, which would bury them.
  const { openBets, settled } = useMemo(() => {
    const keep = (bet: Bet): boolean =>
      matchesStatus(bet, status) && (needle === '' || betSearchText(bet).includes(needle));
    const compare = (a: Bet, b: Bet): number => {
      const left = SORT_VALUE[sort.key](a);
      const right = SORT_VALUE[sort.key](b);
      const delta =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right));
      return sort.dir === 'asc' ? delta : -delta;
    };
    return {
      openBets: liveBets.filter((b) => b.status === 'pending' && keep(b)).sort(compare),
      settled: periodBets.filter((b) => b.status !== 'pending' && keep(b)).sort(compare),
    };
  }, [liveBets, periodBets, status, needle, sort]);

  // A new question deserves its answer from the top, not from wherever the last
  // one had been read down to.
  useEffect(() => setShown(PAGE), [status, needle, sort]);

  const visibleSettled = settled.length > shown ? settled.slice(0, shown) : settled;
  const total = openBets.length + settled.length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DashboardCard className="flex min-h-0 flex-1 flex-col">
        <DashboardCardHeading
          className="mb-3 items-center"
          title="Bet history"
          action={
            <div className="flex items-stretch gap-2">
              <SearchBox
                data-tour="bets-search"
                value={query}
                onChange={setQuery}
                placeholder="Search bets…"
                width="w-56"
              />
              <div className="flex items-stretch" data-tour="bets-status">
                <SegmentedToggle value={status} options={STATUS_OPTIONS} onChange={setStatus} />
              </div>
            </div>
          }
        />
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : total === 0 ? (
          <p className="text-sm text-muted-foreground">
            {needle !== '' || status !== 'all'
              ? 'No bets match this search or filter.'
              : bets.length > 0
                ? `No bets in ${periodLabel}. Try a wider time range (e.g. All) - filtering uses bet placement date, not match date.`
                : 'No bets yet. Visit bet-at-home while logged in, open bet history, then force full resync from the extension popup.'}
          </p>
        ) : (
          <Table
            data-tour="bets-table"
            className="table-fixed"
            containerClassName="min-h-0 flex-1"
            cols={
              <colgroup>
                {showAccount ? <col className="w-[2.75rem]" /> : null}
                <col className="w-[9rem]" />
                <col className="w-[9.5rem]" />
                <col />
                <col className="w-[4.5rem]" />
                <col className="w-[5.5rem]" />
                <col className="w-[5.5rem]" />
                <col className="w-[5.5rem]" />
                <col className="w-[6.5rem]" />
              </colgroup>
            }
            head={
              <TableHeader className="bg-card">
                <TableRow className="border-border" data-tour="bets-sort">
                  {showAccount ? <TableHead /> : null}
                  {COLUMNS.map((column) => (
                    <SortHead key={column.key} column={column} sort={sort} onSort={toggleSort} />
                  ))}
                </TableRow>
              </TableHeader>
            }
          >
            <TableBody>
              {openBets.length > 0 ? (
                <>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableCell
                      colSpan={columnCount}
                      className="bg-muted/20 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span>Active · {openBets.length} open</span>
                        {/* The way out of the table sits with the band that
                            names what it leads to, not up in the card title. */}
                        <span className="flex items-center gap-3">
                          {refreshedAt !== null && (
                            <span className="font-normal normal-case tracking-normal">
                              last refreshed{' '}
                              <span className="tabular-nums">
                                {formatTime(new Date(refreshedAt).toISOString())}
                              </span>
                            </span>
                          )}
                          <Link
                            to="/bets/open"
                            title="Every open slip on one page"
                            className="inline-flex items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-medium normal-case tracking-normal text-foreground transition-colors hover:bg-primary/20"
                          >
                            <Ticket className="h-3 w-3" />
                            Open bets
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        </span>
                      </span>
                    </TableCell>
                  </TableRow>
                  {openBets.map((bet) => (
                    <BetTableRow
                      key={bet.betId}
                      bet={bet}
                      showAccount={showAccount}
                      scores={scores}
                    />
                  ))}
                  {settled.length > 0 ? (
                    <TableRow className="border-border hover:bg-transparent">
                      <TableCell
                        colSpan={columnCount}
                        className="py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        Settled
                      </TableCell>
                    </TableRow>
                  ) : null}
                </>
              ) : null}
              {visibleSettled.map((bet) => (
                <BetTableRow key={bet.betId} bet={bet} showAccount={showAccount} />
              ))}
              {settled.length > visibleSettled.length ? (
                <TableRow className="border-border hover:bg-transparent">
                  <TableCell colSpan={columnCount} className="p-0">
                    <button
                      type="button"
                      onClick={() => setShown((n) => n + PAGE)}
                      className="w-full py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
                    >
                      Show more · {visibleSettled.length} of {settled.length}
                    </button>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        )}
      </DashboardCard>
    </div>
  );
};
