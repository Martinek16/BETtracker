import { useMemo } from 'react';
import { usePersistedState } from '@/lib/persisted-state';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Gift,
  List,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { bonusesByTransaction } from '@betanal/shared';
import { AccountIcon } from '@/components/dashboard/account-icon';
import { DashboardCard, DashboardCardHeading } from '@/components/dashboard/dashboard-card';
import { MetricCard } from '@/components/dashboard/metric-card';
import { SegmentedToggle, type SegmentedOption } from '@/components/dashboard/segmented-toggle';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDashboard } from '@/context/dashboard-context';
import { rangeCutoff, rangeEnd } from '@/lib/chart-data';
import { cn, formatDate, formatMoney, formatTime } from '@/lib/utils';

type Filter = 'all' | 'deposit' | 'withdrawal' | 'bonus';

const filterOption = (
  value: Filter,
  label: string,
  Icon: LucideIcon,
): SegmentedOption<Filter> => ({
  value,
  label: <Icon size={13} strokeWidth={1.75} />,
  title: label,
});

const FILTERS: readonly SegmentedOption<Filter>[] = [
  filterOption('all', 'All', List),
  filterOption('deposit', 'Deposits', ArrowDownToLine),
  filterOption('withdrawal', 'Withdrawals', ArrowUpFromLine),
  filterOption('bonus', 'With bonus', Gift),
];

export const TransactionsPage = (): JSX.Element => {
  const { days, until, transactions, bonuses, currency, activeBookmakers } = useDashboard();
  // Naming the account only means something when there is more than one.
  const showAccount = activeBookmakers.length >= 2;

  // Sorted here rather than only on load, so imported and manually added rows
  // interleave by their exact timestamp instead of by insertion order.
  const ledger = useMemo(
    () => [...transactions].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)),
    [transactions],
  );

  const bonusByDeposit = useMemo(
    () => bonusesByTransaction(transactions, bonuses),
    [transactions, bonuses],
  );

  const [filter, setFilter] = usePersistedState<Filter>('transactions.filter', 'all', [
    'all',
    'deposit',
    'withdrawal',
    'bonus',
  ]);
  const cutoff = days === null ? 0 : rangeCutoff(days, until);
  const end = rangeEnd(until);
  // The cards read the period; the log reads the period and the kind on top.
  const inPeriod = useMemo(
    () =>
      ledger.filter((t) => {
        const at = Date.parse(t.occurredAt);
        return at >= cutoff && at < end;
      }),
    [ledger, cutoff, end],
  );
  const visible = useMemo(
    () =>
      inPeriod.filter((t) => {
        if (filter === 'all') return true;
        if (filter === 'bonus') return bonusByDeposit.has(t.id);
        return t.kind === filter;
      }),
    [inPeriod, filter, bonusByDeposit],
  );

  // Bonus money is not a transaction, so it never lands in the ledger - but on a
  // cash-flow page it is the one figure that says how much came in for free.
  const grants = useMemo(
    () =>
      bonuses.filter((b) => {
        const at = Date.parse(b.grantedAt);
        return at >= cutoff && at < end;
      }),
    [bonuses, cutoff, end],
  );
  const grantedTotal = grants.reduce((sum, b) => sum + b.grantedAmount, 0);

  const totals = useMemo(() => {
    let deposits = 0;
    let withdrawals = 0;
    let depositCount = 0;
    for (const t of inPeriod) {
      if (t.kind === 'deposit') {
        deposits += t.amount;
        depositCount += 1;
      } else withdrawals += t.amount;
    }
    return {
      deposits,
      withdrawals,
      net: deposits - withdrawals,
      depositCount,
      withdrawalCount: inPeriod.length - depositCount,
    };
  }, [inPeriod]);

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <div className="shrink-0">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            icon={Wallet}
            label={totals.net < 0 ? 'Net withdrawn' : 'Net deposited'}
            value={formatMoney(Math.abs(totals.net), currency)}
            note={`${inPeriod.length} transaction${inPeriod.length === 1 ? '' : 's'}`}
            tone={totals.net > 0 ? 'loss' : totals.net < 0 ? 'profit' : 'neutral'}
          />
          <MetricCard
            icon={ArrowDownToLine}
            label="Deposits"
            value={formatMoney(totals.deposits, currency)}
            note={`${totals.depositCount} time${totals.depositCount === 1 ? '' : 's'}`}
            tone="loss"
          />
          <MetricCard
            icon={ArrowUpFromLine}
            label="Withdrawals"
            value={formatMoney(totals.withdrawals, currency)}
            note={`${totals.withdrawalCount} time${totals.withdrawalCount === 1 ? '' : 's'}`}
            tone="profit"
          />
          <MetricCard
            icon={Gift}
            label="Bonus money"
            value={formatMoney(grantedTotal, currency)}
            note={`${grants.length} bonus${grants.length === 1 ? '' : 'es'}`}
          />
        </div>
      </div>

      <DashboardCard className="flex min-h-0 flex-1 flex-col">
        <DashboardCardHeading
          className="mb-1.5 items-center"
          title={<span className="normal-case">History log</span>}
          action={<SegmentedToggle value={filter} options={FILTERS} onChange={setFilter} />}
        />
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {ledger.length === 0 ? 'No transactions yet.' : 'No transactions in this period.'}
          </p>
        ) : (
          <Table
            className="table-fixed"
            containerClassName="min-h-0 flex-1"
            /* Amount is left-aligned inside the last column, which is what keeps
               the figures off the card's edge without needing a spacer column. */
            cols={
              <colgroup>
                {showAccount ? <col className="w-[6%]" /> : null}
                <col className={showAccount ? 'w-[19%]' : 'w-[20%]'} />
                <col className={showAccount ? 'w-[37%]' : 'w-[40%]'} />
                <col className={showAccount ? 'w-[19%]' : 'w-[20%]'} />
                <col className={showAccount ? 'w-[19%]' : 'w-[20%]'} />
              </colgroup>
            }
            head={
              <TableHeader className="bg-card">
                <TableRow>
                  {showAccount ? <TableHead /> : null}
                  <TableHead className="text-center">Date</TableHead>
                  {/* The chip below is inset by its own padding, so the label
                      needs the same offset to sit over the text, not the cell. */}
                  <TableHead className="pr-5 text-right">Type</TableHead>
                  <TableHead />
                  <TableHead className="text-left">Amount</TableHead>
                </TableRow>
              </TableHeader>
            }
          >
            <TableBody>
              {visible.map((t) => {
                const isDeposit = t.kind === 'deposit';
                const bonus = bonusByDeposit.get(t.id);
                return (
                  <TableRow key={t.id}>
                    {showAccount ? (
                      <TableCell className="pr-0">
                        <AccountIcon bookmaker={t.bookmaker} className="h-5 w-5 text-[10px]" />
                      </TableCell>
                    ) : null}
                    <TableCell className="whitespace-nowrap text-center tabular-nums">
                      {formatDate(t.occurredAt)}{' '}
                      <span className="text-[11px] text-muted-foreground/90">
                        {formatTime(t.occurredAt)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize',
                          isDeposit ? 'bg-loss/10 text-loss' : 'bg-profit/10 text-profit',
                        )}
                      >
                        {isDeposit ? <ArrowDownToLine size={12} /> : <ArrowUpFromLine size={12} />}
                        {t.kind}
                      </span>
                    </TableCell>
                    {/* Own column, deliberately outside `Amount`: a grant is a
                        promise, not money moved, and must never read as part of
                        the sum next to it. */}
                    <TableCell className="whitespace-nowrap py-0 pr-0 text-right">
                      {bonus !== undefined && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-pending/10 px-2 py-0.5 text-[11px] font-medium text-pending"
                          title={`Bonus ${bonus.name}${
                            bonus.code === null ? '' : ` (${bonus.code})`
                          } · ${bonus.status}`}
                        >
                          <Gift size={12} strokeWidth={1.75} />
                          {`+${formatMoney(bonus.grantedAmount, bonus.currency).replace(/^[+−-]/, '')}`}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-left font-medium tabular-nums">
                      {isDeposit ? '+' : '−'}
                      {formatMoney(t.amount, t.currency).replace(/^[+−-]/, '')}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </DashboardCard>
    </div>
  );
};
