import { useState } from 'react';
import {
  formatOdds,
  isLiveBet,
  isLiveLeg,
  profitOf,
  type Bet,
  type BetLeg,
  type LiveScore,
} from '@betanal/shared';
import {
  SLIP_KIND_LABEL,
  formatLegEvent,
  formatLegSelection,
  singleEventLabel,
  singlePickLabel,
  slipKind,
} from '@/lib/bet-display';
import { AccountIcon } from '@/components/dashboard/account-icon';
import { LegClock, Stat, liveOf, statForLeg } from '@/components/dashboard/live-score';
import { StatusBadge } from '@/components/ui/badge';
import { TableCell, TableRow } from '@/components/ui/table';
import { useDashboard } from '@/context/dashboard-context';
import { formatDateTime, formatMoney } from '@/lib/utils';

interface BetTableRowProps {
  bet: Bet;
  /** Leading icon column, drawn only while more than one account holds data. */
  showAccount?: boolean;
  /** In-play figures by event id. Empty for a settled row, which has none. */
  scores?: Record<string, LiveScore[]>;
}

const formatReturn = (bet: Bet): string =>
  bet.status === 'pending' ? '—' : formatMoney(bet.actualReturn, bet.currency);

/** Sorts last, so a fixture with no kickoff never displaces one that has it. */
const kickoffMs = (leg: BetLeg): number => {
  const ms = leg.eventDate == null ? Number.NaN : Date.parse(leg.eventDate);
  return Number.isNaN(ms) ? Infinity : ms;
};

/**
 * How the fixture is going, on the row that names it: the count the pick backed
 * and how far the match is. Silent on anything already decided.
 */
const Live = ({
  leg,
  scores,
}: {
  leg: BetLeg;
  scores: Record<string, LiveScore[]> | undefined;
}): JSX.Element => {
  const stats = leg.eventId === undefined ? undefined : scores?.[leg.eventId];
  return (
    <span className="flex shrink-0 items-baseline gap-1.5 text-xs">
      <Stat score={statForLeg(leg, stats)} />
      <LegClock leg={leg} live={liveOf(stats)} status={leg.status} />
    </span>
  );
};

/**
 * Singles name the fixture with the pick alongside it. Multiples say only how
 * many selections are folded in - the legs themselves are one click away, and
 * spelling them out here is more text than the row can carry.
 */
const BetCell = ({ bet, scores }: BetTableRowProps): JSX.Element => {
  const lead = bet.legs[0];
  if (slipKind(bet) !== 'single' || lead === undefined) {
    return <p className="truncate text-sm">{`${bet.legs.length} selections`}</p>;
  }

  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <span className="truncate text-sm text-foreground">{singleEventLabel(bet)}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {singlePickLabel(bet)}
      </span>
      <Live leg={lead} scores={scores} />
    </div>
  );
};

export const BetTableRow = ({
  bet,
  showAccount = false,
  scores,
}: BetTableRowProps): JSX.Element => {
  const [expanded, setExpanded] = useState(false);
  const { oddsFormat } = useDashboard();
  const pl = profitOf(bet);
  const expandable = bet.legs.length > 1;
  const toggle = (): void => setExpanded((open) => !open);

  return (
    <>
      <TableRow
        className={expandable ? 'cursor-pointer border-border' : 'border-border'}
        {...(expandable
          ? {
              // Every combo carries it; the tour points at whichever comes first.
              'data-tour': 'combo-row',
              role: 'button',
              tabIndex: 0,
              'aria-expanded': expanded,
              onClick: toggle,
              onKeyDown: (e: React.KeyboardEvent): void => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggle();
                }
              },
            }
          : {})}
      >
        {showAccount ? (
          <TableCell className="pr-0">
            <AccountIcon bookmaker={bet.bookmaker} className="h-5 w-5 text-[10px]" />
          </TableCell>
        ) : null}
        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
          {formatDateTime(bet.placedAt)}
        </TableCell>
        <TableCell className="overflow-hidden text-sm">{SLIP_KIND_LABEL[slipKind(bet)]}</TableCell>
        <TableCell className="overflow-hidden">
          <BetCell bet={bet} scores={scores} />
        </TableCell>
        <TableCell className="tabular-nums text-sm">{formatOdds(bet.odds, oddsFormat)}</TableCell>
        <TableCell className="tabular-nums text-sm">
          {formatMoney(bet.stake, bet.currency)}
        </TableCell>
        <TableCell className="tabular-nums text-sm">{formatReturn(bet)}</TableCell>
        <TableCell
          className="tabular-nums text-sm font-medium"
          style={
            bet.status === 'pending'
              ? undefined
              : { color: `hsl(var(--${pl >= 0 ? 'profit' : 'loss'}))` }
          }
        >
          {bet.status === 'pending' ? '—' : formatMoney(pl, bet.currency)}
        </TableCell>
        <TableCell>
          {/* With the scores, so a slip reads Live only while its match is
              actually being played - the same rule the slip panel goes by. */}
          <StatusBadge status={bet.status} live={isLiveBet(bet, Date.now(), scores)} />
        </TableCell>
      </TableRow>

      {expanded
        ? // In kickoff order, as the slip panel lists them: a combo reads as the
          // evening it plays out rather than the order the picks were added in.
          [...bet.legs]
            .sort((a, b) => kickoffMs(a) - kickoffMs(b))
            .map((leg, index) => (
              <TableRow
                key={`${bet.betId}-leg-${index}`}
                className="border-border bg-muted/10 hover:bg-muted/15"
              >
                {showAccount ? <TableCell className="py-1.5" /> : null}
                {/* The kickoff, under the slip's own placement date: the column
                  reads as dates throughout, and it is what the order is by. */}
                <TableCell className="whitespace-nowrap py-1.5 text-[11px] leading-tight text-muted-foreground/70">
                  {leg.eventDate == null ? '' : formatDateTime(leg.eventDate)}
                </TableCell>
                <TableCell className="py-1.5" />
                <TableCell className="overflow-hidden border-l-2 border-border/40 py-1.5 pl-4">
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-[11px] font-semibold leading-tight text-foreground">
                      {formatLegEvent(leg)}
                    </span>
                    <Live leg={leg} scores={scores} />
                  </span>
                  <span className="block truncate text-[11px] leading-tight text-muted-foreground/70">
                    {formatLegSelection(leg, oddsFormat)}
                  </span>
                </TableCell>
                <TableCell className="py-1.5 tabular-nums text-[11px] leading-tight text-muted-foreground/70">
                  {leg.odds != null ? formatOdds(leg.odds, oddsFormat) : '—'}
                </TableCell>
                <TableCell className="py-1.5" />
                <TableCell className="py-1.5" />
                <TableCell className="py-1.5" />
                <TableCell className="py-1.5">
                  <span className="inline-block origin-left scale-[0.85]">
                    <StatusBadge status={leg.status} live={isLiveLeg(leg, Date.now(), scores)} />
                  </span>
                </TableCell>
              </TableRow>
            ))
        : null}
    </>
  );
};
