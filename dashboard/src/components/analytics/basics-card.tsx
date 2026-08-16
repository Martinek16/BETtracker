import { useMemo } from 'react';
import { flatUnitProfit, selectionsOf, summarize, type Bet } from '@betanal/shared';
import { useDashboard, type AnalysisUnit } from '@/context/dashboard-context';
import { DashboardCard } from '@/components/dashboard/dashboard-card';
import { usePeriodCash } from '@/data/use-period-cash';
import { cn, formatMoney, formatPercent } from '@/lib/utils';

interface BasicsCardProps {
  bets: readonly Bet[];
  unit: AnalysisUnit;
  currency: string;
}

interface Line {
  label: string;
  value: string;
  tone?: 'profit' | 'loss';
}

/** Groups are drawn separated by a rule. */
const Groups = ({ groups }: { groups: readonly (readonly Line[])[] }): JSX.Element => (
  <dl>
    {groups.map((group, i) => (
      <div
        key={group[0]?.label ?? i}
        className={cn('space-y-1.5', i > 0 && 'mt-2.5 border-t border-border pt-2')}
      >
        {group.map((line) => (
          <div key={line.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-[11px] text-muted-foreground">{line.label}</dt>
            <dd
              className={cn(
                'text-xs font-medium tabular-nums text-foreground',
                line.tone === 'profit' && 'text-profit',
                line.tone === 'loss' && 'text-loss',
              )}
            >
              {line.value}
            </dd>
          </div>
        ))}
      </div>
    ))}
  </dl>
);

export const BasicsCard = ({ bets, unit, currency }: BasicsCardProps): JSX.Element => {
  const { transactions } = useDashboard();
  const cash = usePeriodCash();

  /** Money in and out over the selected period, tied to what was staked in it. */
  const money = useMemo<readonly Line[]>(() => {
    if (transactions.length === 0) return [];
    return [
      { label: 'Deposited', value: formatMoney(cash.deposits, currency) },
      { label: 'Withdrawn', value: formatMoney(cash.withdrawals, currency) },
      {
        label: 'Cash flow profit',
        value: formatMoney(cash.cashFlow, currency),
        tone: cash.cashFlow >= 0 ? 'profit' : 'loss',
      },
    ];
  }, [transactions, cash, currency]);

  const groups = useMemo<readonly (readonly Line[])[]>(() => {
    if (unit === 'selections') {
      const picks = selectionsOf(bets);
      const won = picks.filter((s) => s.leg.status === 'won').length;
      const lost = picks.filter((s) => s.leg.status === 'lost').length;
      const other = picks.filter(
        (s) => s.leg.status === 'void' || s.leg.status === 'cashed_out',
      ).length;
      const decided = won + lost;
      const settled = picks.filter((s) => s.leg.status === 'won' || s.leg.status === 'lost');
      const hitRate = decided === 0 ? 0 : (won / decided) * 100;
      const implied =
        decided === 0 ? 0 : (settled.reduce((sum, s) => sum + 1 / s.odds, 0) / decided) * 100;
      const meanOdds = decided === 0 ? 0 : settled.reduce((sum, s) => sum + s.odds, 0) / decided;
      // A leg of a combo never had its own money, so the only P/L here is the
      // explicit "what if every pick had been a 1-unit single" counterfactual.
      const unitsPl = settled.reduce((sum, s) => sum + flatUnitProfit(s.leg), 0);

      return [
        [
          { label: 'Picks', value: String(picks.length) },
          { label: 'Won', value: String(won), tone: 'profit' },
          { label: 'Lost', value: String(lost), tone: 'loss' },
          { label: 'Void or cashed out', value: String(other) },
        ],
        [
          { label: 'Win rate', value: decided === 0 ? '—' : formatPercent(hitRate, 1) },
          // Mean of 1/odds: how often the prices themselves said these picks win.
          {
            label: 'The prices said',
            value: decided === 0 ? '—' : formatPercent(implied, 1),
          },
          { label: 'Average price', value: decided === 0 ? '—' : meanOdds.toFixed(2) },
        ],
        [
          {
            label: 'If each pick were 1 unit',
            value: decided === 0 ? '—' : `${unitsPl >= 0 ? '+' : ''}${unitsPl.toFixed(1)}u`,
            tone: unitsPl >= 0 ? 'profit' : 'loss',
          },
          {
            label: 'Per 100 units staked',
            value: decided === 0 ? '—' : formatPercent((unitsPl / decided) * 100, 1),
            tone: unitsPl >= 0 ? 'profit' : 'loss',
          },
        ],
      ];
    }

    const s = summarize(bets);
    const won = bets.filter((b) => b.status === 'won').length;
    const lost = bets.filter((b) => b.status === 'lost').length;

    // Three blocks, three stories: what happened, what the betting did to the
    // money, and how much of it actually moved in or out of the account.
    return [
      [
        { label: 'Slips', value: String(s.totalBets) },
        { label: 'Won', value: String(won), tone: 'profit' },
        { label: 'Lost', value: String(lost), tone: 'loss' },
        { label: 'Win rate', value: formatPercent(s.winRate, 1) },
      ],
      [
        { label: 'Staked', value: formatMoney(s.totalStaked, currency) },
        { label: 'Returned', value: formatMoney(s.totalReturn, currency) },
        {
          label: 'Betting profit',
          value: formatMoney(s.totalProfit, currency),
          tone: s.totalProfit >= 0 ? 'profit' : 'loss',
        },
      ],
    ];
  }, [bets, unit, currency]);

  // Cash in and out sits under the record it paid for, not above it. A single
  // pick never had its own money, so the account's cashflow belongs to slips only.
  const shown = unit === 'slips' && money.length > 0 ? [...groups, money] : groups;

  return (
    <DashboardCard className="flex shrink-0 flex-col p-3">
      <Groups groups={shown} />
    </DashboardCard>
  );
};
