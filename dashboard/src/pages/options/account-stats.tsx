import {
  decisiveBets,
  isLoss,
  isWin,
  summarizeBonuses,
  totalReturn,
  totalStaked,
  walletLedger,
  type Bet,
  type Bonus,
  type Transaction,
} from '@betanal/shared';
import { DashboardCard } from '@/components/dashboard/dashboard-card';
import type { AccountInfo } from '@/data/accounts';
import { cn, formatMoney } from '@/lib/utils';

interface StatDef {
  id: string;
  label: string;
  value: string;
  tone?: string;
  /** A line the ones above it add up to, drawn apart from them. */
  total?: true;
  /** Starts a new run of lines, without claiming to sum the ones above. */
  apart?: true;
}

interface Sector {
  id: string;
  label: string;
  stats: StatDef[];
}

/** Lifetime turnover the site reports itself, in the display currency. */
interface Wagered {
  sports: number;
  casino: number;
}

/**
 * Everything read off this account: the bets first, because they are what the
 * app is for, then the money, ending on the one line that says whether the two
 * agree with what the account actually holds.
 */
const buildSectors = (
  account: AccountInfo,
  bets: readonly Bet[],
  transactions: readonly Transaction[],
  bonuses: readonly Bonus[],
  balance: number | null,
  vault: number | null,
  wagered: Wagered | null,
  currency: string,
): Sector[] => {
  const decisive = decisiveBets(bets);
  // Settled includes void slips: their stake comes straight back, so they weigh
  // nothing in the result and leaving them out would only hide them.
  const settled = bets.filter((bet) => bet.status !== 'pending');
  const realizedBonus = summarizeBonuses(bonuses).realized;
  const { deposits, withdrawals, betResult, heldInOpenBets, stakedFromBonus, expected } =
    walletLedger(bets, transactions, bonuses, balance);

  const money = (amount: number): string => formatMoney(amount, currency);
  const plus = (amount: number): string => (amount > 0 ? `+${money(amount)}` : money(amount));
  const signed = (amount: number): string | undefined =>
    amount === 0 ? undefined : amount > 0 ? 'text-profit' : 'text-loss';

  // The vault is the account's money too — the site just keeps it out of betting
  // reach, and its own header leaves it out. Counting only what is bettable would
  // read money put aside as money that went missing.
  const held = balance === null ? null : balance + (vault ?? 0);
  const gap = held === null ? null : held - expected;
  // The casino shares this wallet and is never written down as a bet, so what it
  // took can only be read off the money the bets and payments cannot explain.
  const casinoResult = account.hasCasino === true ? gap : null;

  const wallet: StatDef[] = [
    // Coloured from the pocket's side, not the account's: money paid in is money
    // gone, money taken out is money back.
    { id: 'sum.deposits', label: 'Deposits', value: plus(deposits), tone: 'text-loss' },
    { id: 'sum.withdrawals', label: 'Withdrawals', value: plus(-withdrawals), tone: 'text-profit' },
    {
      id: 'sum.bets',
      label: 'Bets result',
      value: plus(betResult),
      tone: signed(betResult),
      apart: true,
    },
  ];
  if (account.hasCasino === true)
    wallet.push({
      id: 'sum.casino',
      label: 'Casino result',
      value: casinoResult === null ? '—' : plus(casinoResult),
      tone: casinoResult === null ? undefined : signed(casinoResult),
    });
  if (realizedBonus !== 0)
    wallet.push({
      id: 'sum.bonus',
      label: 'Bonus released',
      value: plus(realizedBonus),
      tone: 'text-profit',
    });
  if (heldInOpenBets !== 0)
    wallet.push({
      id: 'sum.open',
      label: 'Stake on open bets',
      value: plus(-heldInOpenBets),
      tone: 'text-loss',
    });
  wallet.push({
    id: 'sum.balance',
    label: 'Balance',
    value: balance === null ? 'not read' : money(balance),
    total: true,
  });
  // Its own line rather than folded into the balance: the site keeps the two
  // apart, and a single figure would hide how much is out of betting reach.
  if (vault !== null)
    wallet.push({ id: 'sum.vault', label: 'In the vault', value: money(vault) });

  const betStats: StatDef[] = [
    { id: 'bets.count', label: 'Bets placed', value: String(bets.length) },
    {
      id: 'bets.won',
      label: 'Won',
      value: String(decisive.filter(isWin).length),
      tone: 'text-profit',
    },
    {
      id: 'bets.lost',
      label: 'Lost',
      value: String(decisive.filter(isLoss).length),
      tone: 'text-loss',
    },
    { id: 'bets.staked', label: 'Staked', value: money(totalStaked(settled)) },
  ];
  // The site's own lifetime turnover next to ours: the two agreeing is the only
  // check that the bet history was read whole rather than from some page down.
  if (wagered !== null)
    betStats.push({
      id: 'bets.wageredBySite',
      label: 'Staked, as the site counts it',
      value: money(wagered.sports),
    });
  if (stakedFromBonus > 0)
    betStats.push({
      id: 'bets.bonusStake',
      label: 'Of that from bonus money',
      value: money(stakedFromBonus),
    });
  betStats.push(
    { id: 'bets.returned', label: 'Returned', value: money(totalReturn(settled)) },
    {
      id: 'bets.result',
      label: 'Bets result',
      value: plus(betResult),
      tone: signed(betResult),
      total: true,
    },
  );

  const sectors: Sector[] = [{ id: 'bets', label: 'Bets', stats: betStats }];

  // Only where the site actually runs one off the same wallet. A wallet named
  // after a casino in the payment feed is not one: a sportsbook-only account
  // still routes some payments through it.
  if (account.hasCasino === true)
    sectors.push({
      id: 'casino',
      label: 'Casino',
      stats: [
        {
          id: 'casino.played',
          label: 'Wagered',
          value: wagered === null ? 'not read' : money(wagered.casino),
        },
        {
          id: 'casino.result',
          label: 'Casino result',
          value: casinoResult === null ? '—' : plus(casinoResult),
          tone: casinoResult === null ? undefined : signed(casinoResult),
          total: true,
        },
      ],
    });

  sectors.push({ id: 'sum', label: 'Money', stats: wallet });
  return sectors;
};

/**
 * The figures themselves, not a settings screen — every other page is built
 * from these, so there is nothing here to switch off.
 */
export const AccountStats = ({
  account,
  bets,
  transactions,
  bonuses,
  balance,
  vault,
  wagered,
  currency,
}: {
  account: AccountInfo;
  bets: Bet[];
  transactions: Transaction[];
  bonuses: Bonus[];
  balance: number | null;
  vault: number | null;
  wagered: Wagered | null;
  currency: string;
}): JSX.Element => (
  <DashboardCard className="flex min-h-0 flex-col overflow-y-auto">
    {buildSectors(account, bets, transactions, bonuses, balance, vault, wagered, currency).map((sector) => (
      <div key={sector.id} className="border-t border-border/60 pb-2 first:border-0">
        <p className="pt-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {sector.label}
        </p>
        <div className="flex flex-col pl-3 pt-1">
          {sector.stats.map((stat) => (
            <div
              key={stat.id}
              className={cn(
                'flex items-baseline gap-3 py-1.5 text-sm',
                stat.apart === true && 'mt-1 border-t border-border/60 pt-2',
                stat.total === true && 'mt-1 border-t border-border/60 pt-2 font-semibold',
              )}
            >
              <span className="min-w-0 text-foreground">{stat.label}</span>
              <span className={cn('ml-auto shrink-0 tabular-nums', stat.tone ?? 'text-foreground')}>
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    ))}
  </DashboardCard>
);
