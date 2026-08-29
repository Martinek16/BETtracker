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
  formatLegEvent,
  formatLegSelection,
  sharedEventName,
  singleEventLabel,
  singlePickLabel,
  slipKind,
  slipLabel,
} from '@/lib/bet-display';
import { AccountIcon } from '@/components/dashboard/account-icon';
import {
  LegClock,
  Stat,
  liveOf,
  sportIconFor,
  statForLeg,
} from '@/components/dashboard/live-score';
import { StatusBadge } from '@/components/ui/badge';
import { TableCell, TableRow } from '@/components/ui/table';
import { useDashboard } from '@/context/dashboard-context';
import { cn, formatDateTime, formatMoney } from '@/lib/utils';

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
 * How the fixture is going, on the row that names it: how far the match is and
 * then the count the pick backed, in that order here as everywhere. Silent on
 * anything already decided.
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
      <LegClock leg={leg} live={liveOf(stats)} status={leg.status} />
      <Stat score={statForLeg(leg, stats)} />
    </span>
  );
};

/**
 * A slip that sits on one fixture is named by it - a single, and a bet builder,
 * which is one match bet several ways. A combo spans several fixtures and no
 * single name would be true of it, so it says only how many picks are folded in;
 * the legs themselves are one click away.
 */
const BetCell = ({ bet }: BetTableRowProps): JSX.Element => {
  const lead = bet.legs[0];
  const kind = slipKind(bet);
  const fixture = kind === 'single' ? singleEventLabel(bet) : sharedEventName(bet);
  if (lead === undefined || fixture === null) {
    return <p className="truncate text-center text-xs">{`${bet.legs.length} selections`}</p>;
  }

  return (
    <div className="flex min-w-0 items-baseline justify-center gap-1.5">
      <span className="truncate text-xs text-foreground">{fixture}</span>
      <span className="min-w-0 truncate text-[11px] text-muted-foreground">
        {kind === 'single' ? singlePickLabel(bet) : `${bet.legs.length} picks`}
      </span>
    </div>
  );
};

/**
 * The picks of one fixture, kept together.
 *
 * A builder is not always a slip of its own: a bookmaker will fold one into a
 * larger accumulator, so a four-leg slip can be two ordinary picks plus two
 * picks on a third match. Grouping by fixture rather than by slip kind is what
 * makes those two read as one match bet twice over instead of two matches.
 */
export const legGroups = (bet: Bet): BetLeg[][] => {
  const groups = new Map<string, BetLeg[]>();
  bet.legs.forEach((leg, index) => {
    // A leg naming no fixture is grouped with nothing, itself included.
    const key = leg.eventId ?? leg.event ?? `\u0000${index}`;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [leg]);
    else group.push(leg);
  });
  return [...groups.values()].sort((a, b) => kickoffMs(a[0]!) - kickoffMs(b[0]!));
};

/**
 * One pick of a slip, in the slip's own columns: price under Odds, result under
 * Status. `lead` is the first pick on its fixture and the only one to name it -
 * the picks that follow sit under that name, which is how a builder folded into
 * a bigger slip reads as one match bet several ways.
 */
const LegRow = ({
  bet,
  leg,
  lead,
  last,
  groupOdds,
  showAccount,
  scores,
}: {
  bet: Bet;
  leg: BetLeg;
  lead: boolean;
  /** Last pick on this fixture, so the rule below it closes the group. */
  last: boolean;
  /** Price of the whole fixture group, on its first row only. */
  groupOdds: number | null;
  showAccount: boolean;
  scores: Record<string, LiveScore[]> | undefined;
}): JSX.Element => {
  const { oddsFormat } = useDashboard();
  const Sport = sportIconFor(leg.sport ?? bet.sport, bet.bookmaker);
  // The pick's own price is already beside its name; only the builder's
  // combined price is missing from the open rows, and it belongs to the fixture.
  const odds = lead ? groupOdds : null;
  // Picks on one fixture are padded as a block, not one by one: the padding
  // between two of them was the gap that made them read as separate bets.
  const pad = cn(lead ? 'pt-1' : 'pt-0', last ? 'pb-1' : 'pb-0');

  return (
    <TableRow
      className={cn(
        // Lifted off the table it sits in: what a slip opens into is one block
        // of detail, and a shade of its own is what says where it ends.
        'bg-muted/40 hover:bg-muted/50',
        // Ruled off per fixture, not per pick: a line between two picks on one
        // match cuts apart the thing the grouping is there to hold together.
        last ? 'border-border' : 'border-transparent',
      )}
    >
      {showAccount ? <TableCell className={pad} /> : null}
      {/* The kickoff, under the slip's own placement date: the column reads as
          dates throughout, and it is what the order is by. Said once per
          fixture, since every pick on it shares the one kickoff. */}
      <TableCell
        className={cn(
          pad,
          'whitespace-nowrap text-center align-top text-[11px] leading-tight text-muted-foreground/70',
        )}
      >
        {!lead || leg.eventDate == null ? '' : formatDateTime(leg.eventDate)}
      </TableCell>
      {/* Across Bet and Type: held in the Bet column alone the legs sat half a
          table away from the date they are ordered by. */}
      <TableCell colSpan={2} className={cn(pad, 'overflow-hidden align-top')}>
        <div className="flex min-w-0 items-start gap-2">
          {lead ? (
            <Sport aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
          ) : (
            <span aria-hidden className="h-3.5 w-3.5 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            {lead ? (
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-[11px] font-semibold leading-tight',
                    // A match that was called off is struck through and says
                    // nothing else: it has no clock and no count to report.
                    leg.status === 'void'
                      ? 'text-muted-foreground line-through'
                      : 'text-foreground',
                  )}
                >
                  {formatLegEvent(leg)}
                </span>
                <Live leg={leg} scores={scores} />
              </span>
            ) : null}
            <span className="block truncate text-[11px] leading-tight text-muted-foreground/70">
              {formatLegSelection(leg, oddsFormat)}
            </span>
          </div>
        </div>
      </TableCell>
      <TableCell
        className={cn(
          pad,
          'text-center align-top tabular-nums text-[11px] leading-tight text-muted-foreground/70',
        )}
      >
        {odds == null ? '' : formatOdds(odds, oddsFormat)}
      </TableCell>
      <TableCell className={pad} />
      <TableCell className={pad} />
      <TableCell className={pad} />
      <TableCell className={cn(pad, 'text-center align-top')}>
        <span className="inline-block origin-center scale-[0.85]">
          <StatusBadge status={leg.status} live={isLiveLeg(leg, Date.now(), scores)} />
        </span>
      </TableCell>
    </TableRow>
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
        className={cn(
          'border-border',
          expandable ? 'cursor-pointer' : '',
          // The slip an open block belongs to takes the same shade, so the two
          // read as one thing rather than a row with strangers under it.
          expanded ? 'bg-muted/40' : '',
        )}
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
        <TableCell className="whitespace-nowrap text-center text-[11px] text-muted-foreground">
          {formatDateTime(bet.placedAt)}
        </TableCell>
        <TableCell className="overflow-hidden">
          {/* The score stays out of the shut row: what is on the slip fits the
              width, the fixture's own state is a click away with the picks. */}
          <BetCell bet={bet} />
        </TableCell>
        <TableCell className="overflow-hidden text-center text-xs text-muted-foreground">
          {slipLabel(bet)}
        </TableCell>
        <TableCell className="text-center tabular-nums text-xs text-muted-foreground">
          {formatOdds(bet.odds, oddsFormat)}
        </TableCell>
        <TableCell className="text-center tabular-nums text-sm">
          {formatMoney(bet.stake, bet.currency)}
        </TableCell>
        {/* The colour rides on what came back rather than on the difference:
            what a punter looks for down this table is the money returned, and
            the P/L beside it says the same thing in figures either way. */}
        <TableCell
          className={cn(
            'text-center tabular-nums text-sm',
            bet.status === 'pending' ? undefined : pl >= 0 ? 'text-profit' : 'text-loss',
          )}
        >
          {formatReturn(bet)}
        </TableCell>
        <TableCell className="text-center tabular-nums text-xs font-medium">
          {bet.status === 'pending' ? '—' : formatMoney(pl, bet.currency)}
        </TableCell>
        <TableCell className="text-center">
          {/* With the scores, so a slip reads Live only while its match is
              actually being played - the same rule the slip panel goes by. */}
          <StatusBadge status={bet.status} live={isLiveBet(bet, Date.now(), scores)} />
        </TableCell>
      </TableRow>

      {/* In kickoff order, as the slip panel lists them: a slip reads as the
          evening it plays out rather than the order the picks were added in. */}
      {expanded
        ? legGroups(bet).flatMap((legs, group) => {
            // One price for the group where the picks were priced as a builder,
            // and it belongs on the fixture, not on any one pick inside it.
            const groupOdds = legs.length > 1 ? (legs[0]?.groupOdds ?? null) : null;
            return legs.map((leg, index) => (
              <LegRow
                key={`${bet.betId}-leg-${group}-${index}`}
                bet={bet}
                leg={leg}
                lead={index === 0}
                last={index === legs.length - 1}
                groupOdds={groupOdds}
                showAccount={showAccount}
                scores={scores}
              />
            ));
          })
        : null}
    </>
  );
};
