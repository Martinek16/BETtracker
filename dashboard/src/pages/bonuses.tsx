import { Fragment, useMemo } from 'react';
import { Gift } from 'lucide-react';
import { usePersistedState } from '@/lib/persisted-state';
import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts';
import {
  bonusesByTransaction,
  hasUntrackedOutcome,
  realizedBonusValue,
  summarizeBonuses,
  type Bonus,
} from '@betanal/shared';
import { AccountIcon } from '@/components/dashboard/account-icon';
import { DashboardCard } from '@/components/dashboard/dashboard-card';
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
import { cn, formatDate, formatMoney } from '@/lib/utils';

/**
 * `released` is the only end state that means the wagering requirement was met.
 * `completed` sounds like success but is not - it is the bonus money being
 * wagered away - so it must not read as a win.
 */
const STATUS_TONE: Record<string, string> = {
  completed: 'bg-profit/10 text-profit',
};

const StatusBadge = ({ status }: { status: string }): JSX.Element => (
  <span
    className={cn(
      'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize',
      STATUS_TONE[status] ?? 'bg-muted text-muted-foreground',
    )}
  >
    {status}
  </span>
);

/** Ring fills with turnover already done; the number is what is still owed. */
const WageringDial = ({
  done,
  required,
  size = 132,
}: {
  done: number;
  required: number;
  size?: number;
}): JSX.Element => {
  const pct = required > 0 ? Math.min(100, (done / required) * 100) : 100;
  const compact = size < 100;
  return (
    <div className="relative shrink-0" style={{ height: size, width: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="74%"
          outerRadius="100%"
          startAngle={90}
          endAngle={-270}
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          data={[{ value: pct }]}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar
            background={{ fill: 'hsl(var(--muted))' }}
            dataKey="value"
            cornerRadius={999}
            fill="hsl(var(--primary))"
            isAnimationActive={false}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cn(
            'font-semibold leading-none tabular-nums',
            compact ? 'text-[11px]' : 'text-lg',
          )}
        >
          {`${pct.toFixed(0)}%`}
        </span>
      </div>
    </div>
  );
};

const Fact = ({ label, value }: { label: string; value: string }): JSX.Element => (
  <div>
    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="whitespace-nowrap text-sm font-medium tabular-nums">{value}</p>
  </div>
);

/**
 * The four numbers that describe any grant, live or finished, so an active card
 * and an expanded history row read the same. Rollover is quoted against the
 * deposit, which is what the terms multiply - not against the bonus itself.
 */
const wageredLabel = (bonus: Bonus): string =>
  bonus.wageringRequired > 0
    ? `${formatMoney(bonus.wageringDone, bonus.currency)} of ${formatMoney(
        bonus.wageringRequired,
        bonus.currency,
      )}`
    : 'Not required';

const BonusFacts = ({
  bonus,
  deposit,
  wagering = true,
}: {
  bonus: Bonus;
  deposit?: number;
  /** Off where the card shows the same number as a caption on its dial instead. */
  wagering?: boolean;
}): JSX.Element => (
  <>
    <Fact
      label="Deposited"
      value={deposit === undefined ? '—' : formatMoney(deposit, bonus.currency)}
    />
    <Fact label="Bonus" value={formatMoney(bonus.grantedAmount, bonus.currency)} />
    <Fact
      label="Rollover"
      value={
        bonus.wageringRequired > 0 && deposit !== undefined && deposit > 0
          ? `${(bonus.wageringRequired / deposit).toFixed(0)}×`
          : '—'
      }
    />
    {wagering && <Fact label="Wagered" value={wageredLabel(bonus)} />}
  </>
);

export const BonusesPage = (): JSX.Element => {
  const { days, until, bonuses, transactions, currency, activeBookmakers, loading } =
    useDashboard();
  // Naming the account only means something when there is more than one.
  const showAccount = activeBookmakers.length >= 2;
  const [openRow, setOpenRow] = usePersistedState<string | null>('bonuses.openRow', null);

  /** What the grant cost: the bookmaker links no deposit, so it is matched on time. */
  const depositFor = useMemo(() => {
    const byBonus = new Map<string, number>();
    const paired = bonusesByTransaction(transactions, bonuses);
    const amounts = new Map(transactions.map((t) => [t.id, t.amount]));
    for (const [txId, bonus] of paired) byBonus.set(bonus.id, amounts.get(txId) ?? 0);
    return byBonus;
  }, [transactions, bonuses]);

  const active = useMemo(() => bonuses.filter((b) => b.status === 'active'), [bonuses]);

  const cutoff = days === null ? 0 : rangeCutoff(days, until);
  const end = rangeEnd(until);
  const history = useMemo(
    () =>
      bonuses.filter((b) => {
        if (b.status === 'active') return false;
        const at = Date.parse(b.grantedAt);
        return at >= cutoff && at < end;
      }),
    [bonuses, cutoff, end],
  );
  const summary = useMemo(() => summarizeBonuses(history), [history]);

  if (!loading && active.length === 0 && history.length === 0) {
    return (
      <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <Gift className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">No bonuses</p>
        <p className="text-xs text-muted-foreground">
          A free bet or deposit match appears here once the bookmaker grants one.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 pb-2">
      {active.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Active bonuses</h2>
          <div className="grid gap-3 lg:grid-cols-3">
            {active.map((b) => (
              <DashboardCard key={b.id} className="flex items-start gap-4 p-5">
                <div className="min-w-0 flex-1 space-y-5">
                  <div>
                    <h3 className="truncate text-lg font-semibold">{b.name}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">{b.description}</p>
                  </div>

                  <div className="grid grid-cols-3 gap-x-4">
                    <BonusFacts bonus={b} deposit={depositFor.get(b.id)} wagering={false} />
                  </div>

                  <div className="grid grid-cols-3 gap-x-4">
                    <Fact label="In wallet" value={formatMoney(b.currentAmount, b.currency)} />
                    <Fact
                      label="Expires"
                      value={b.expiresAt === null ? 'No end date' : formatDate(b.expiresAt)}
                    />
                  </div>
                </div>
                {/* Stretched so the badge sits at the title's line and the dial ends level
                    with the last fact row. */}
                <div className="flex shrink-0 flex-col items-center justify-between gap-1.5 self-stretch">
                  <div className="self-end">
                    <StatusBadge status={b.status} />
                  </div>
                  <div className="flex flex-col items-center gap-1.5">
                    <WageringDial done={b.wageringDone} required={b.wageringRequired} size={104} />
                    <span className="whitespace-nowrap text-sm font-medium tabular-nums">
                      {wageredLabel(b)}
                    </span>
                  </div>
                </div>
              </DashboardCard>
            ))}
          </div>
        </section>
      )}

      {history.length > 0 && (
        <DashboardCard className="flex min-h-0 flex-1 flex-col p-4">
          <div className="mb-1.5 flex items-center justify-between gap-4 text-sm">
            <span className="font-semibold">Bonus history</span>
            <span className="text-xs text-muted-foreground">
              {`${formatMoney(summary.realized, currency)} realized of ${formatMoney(
                summary.granted,
                currency,
              )} granted`}
            </span>
          </div>
          <Table
            className="table-fixed"
            containerClassName="min-h-0 flex-1"
            cols={
              <colgroup>
                {showAccount ? <col className="w-[6%]" /> : null}
                <col className={showAccount ? 'w-[13%]' : 'w-[14%]'} />
                <col className={showAccount ? 'w-[40%]' : 'w-[42%]'} />
                <col className={showAccount ? 'w-[10%]' : 'w-[11%]'} />
                <col className={showAccount ? 'w-[10%]' : 'w-[11%]'} />
                <col className={showAccount ? 'w-[10%]' : 'w-[11%]'} />
                <col className="w-[11%]" />
              </colgroup>
            }
            head={
              <TableHeader className="bg-card">
                <TableRow>
                  {showAccount ? <TableHead /> : null}
                  <TableHead>Granted</TableHead>
                  <TableHead>Bonus</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Face value</TableHead>
                  <TableHead className="text-right">Worth</TableHead>
                </TableRow>
              </TableHeader>
            }
          >
            <TableBody>
              {history.map((b) => {
                const untracked = hasUntrackedOutcome(b);
                const realized = realizedBonusValue(b);
                const deposit = depositFor.get(b.id);
                return (
                  <Fragment key={b.id}>
                    <TableRow
                      className={cn(
                        'cursor-pointer [&>td]:py-2',
                        openRow === b.id &&
                          'border-b-0 border-l-2 border-l-primary bg-primary/[0.06] hover:bg-primary/[0.06]',
                      )}
                      onClick={() => setOpenRow((id) => (id === b.id ? null : b.id))}
                    >
                      {showAccount ? (
                        <TableCell className="pr-0">
                          <AccountIcon bookmaker={b.bookmaker} className="h-5 w-5 text-[10px]" />
                        </TableCell>
                      ) : null}
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {formatDate(b.grantedAt)}
                      </TableCell>
                      <TableCell className="truncate" title={b.code ?? b.name}>
                        {b.description ?? b.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{b.type}</TableCell>
                      <TableCell>
                        <StatusBadge status={b.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatMoney(b.grantedAmount, b.currency)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-medium tabular-nums',
                          !untracked && realized > 0 ? 'text-profit' : 'text-muted-foreground',
                        )}
                        title={
                          untracked
                            ? 'Free bet winnings are paid to the real balance, so the bookmaker never reports what this was worth'
                            : undefined
                        }
                      >
                        {untracked ? '—' : formatMoney(realized, b.currency)}
                      </TableCell>
                    </TableRow>
                    {openRow === b.id && (
                      <TableRow className="border-l-2 border-l-primary bg-primary/[0.06] hover:bg-primary/[0.06]">
                        <TableCell
                          colSpan={showAccount ? 7 : 6}
                          className={cn('py-2.5', showAccount ? 'pl-[19%]' : 'pl-[14%]')}
                        >
                          <div className="flex items-center gap-6">
                            <div className="grid flex-1 grid-cols-4 gap-x-6">
                              <BonusFacts bonus={b} deposit={deposit} />
                            </div>
                            <WageringDial
                              done={b.wageringDone}
                              required={b.wageringRequired}
                              size={56}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </DashboardCard>
      )}
    </div>
  );
};
