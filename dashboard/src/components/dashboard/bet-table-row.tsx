import { useState } from 'react';
import {
  formatOdds,
  isLiveBet,
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
import { cn, formatDate, formatDateTime, formatMoney, formatTime } from '@/lib/utils';

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
    return <p className="truncate text-xs">{`${bet.legs.length} selections`}</p>;
  }

  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
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
 * The fixtures of a slip, told where each day of it starts and ends. Which
 * kickoffs share a day is a question about the date as it is written, not about
 * the instant behind it - two of them can be hours apart and still one evening.
 */
export const legDays = (
  bet: Bet,
): { legs: BetLeg[]; showDay: boolean; endsDay: boolean; ruled: boolean }[] => {
  const groups = legGroups(bet);
  const days = groups.map((legs) => {
    const at = legs[0]?.eventDate;
    return at == null ? null : formatDate(at);
  });
  return groups.map((legs, index) => ({
    legs,
    showDay: index === 0 || days[index] !== days[index - 1],
    endsDay: index === groups.length - 1 || days[index] !== days[index + 1],
    // A rule falls between two days and nowhere else - not under the last
    // fixture of the slip, where the shade already says the block has ended.
    ruled: index < groups.length - 1 && days[index] !== days[index + 1],
  }));
};

/** The colour a settled pick carries now that it has no badge of its own. */
const LEG_TONE: Record<string, string> = {
  won: 'text-profit',
  lost: 'text-loss',
  void: 'text-muted-foreground/50',
};

const legTone = (status: string): string => LEG_TONE[status] ?? 'text-muted-foreground/70';

/**
 * How the fixture went, from the picks made on it: one loss settles it, and it
 * is only won once every pick on it is. This is what the sport icon is coloured
 * by, so a builder says its result once instead of once per pick.
 */
const groupStatus = (legs: readonly BetLeg[]): string => {
  if (legs.some((leg) => leg.status === 'lost')) return 'lost';
  if (legs.every((leg) => leg.status === 'won')) return 'won';
  if (legs.every((leg) => leg.status === 'void')) return 'void';
  return 'pending';
};

/**
 * One pick of a slip, in the slip's own columns: price under Odds. `lead` is the
 * first pick on its fixture and the only one to name it - the picks that follow
 * sit under that name, which is how a builder folded into a bigger slip reads as
 * one match bet several ways.
 *
 * The result is carried by colour rather than by a badge per fixture: a slip of
 * five picks printed Won five times down its right edge, which is five readings
 * of a thing the row already says.
 */
const LegRow = ({
  bet,
  leg,
  lead,
  last,
  status,
  groupOdds,
  showDay,
  endsDay,
  ruled,
  showAccount,
  scores,
}: {
  bet: Bet;
  leg: BetLeg;
  lead: boolean;
  /** Last pick on this fixture, so the padding below it closes the group. */
  last: boolean;
  /** How the whole fixture went, which is what its icon is coloured by. */
  status: string;
  /** Price of the whole fixture group, on its first row only. */
  groupOdds: number | null;
  /** First fixture of its day, and so the only one to spell the date out. */
  showDay: boolean;
  /** Last fixture of its day, which is given a little more room below it. */
  endsDay: boolean;
  /** A day follows this one, so a rule closes it off. */
  ruled: boolean;
  showAccount: boolean;
  scores: Record<string, LiveScore[]> | undefined;
}): JSX.Element => {
  const { oddsFormat } = useDashboard();
  const Sport = sportIconFor(leg.sport ?? bet.sport, bet.bookmaker);
  // The pick's own price is already beside its name; only the builder's
  // combined price is missing from the open rows, and it belongs to the fixture.
  const odds = lead ? groupOdds : null;
  // A day is given room above and below it; inside one, every pick is spaced
  // alike, so a fixture bet three ways reads as three lines of one thing.
  const pad = cn(lead && showDay ? 'pt-2.5' : 'pt-0', last && endsDay ? 'pb-2.5' : 'pb-0');

  return (
    <TableRow
      className={cn(
        // Lifted off the table it sits in: what a slip opens into is one block
        // of detail, and a shade of its own is what says where it ends.
        'bg-muted/40 hover:bg-muted/50',
        // Ruled between days and nowhere else: a line under every match chopped
        // an evening into strips, and a transparent one still showed as a gap
        // in the shade, which is what drew those strips in the first place.
        last && ruled ? 'border-border' : 'border-b-0',
      )}
    >
      {showAccount ? <TableCell className={pad} /> : null}
      {/* The kickoff, under the slip's own placement date. The date is written
          once a day, over the times it covers, and every fixture carries the
          time alone - so a slip played out in one evening reads as times. */}
      <TableCell className={cn(pad, 'whitespace-nowrap text-right align-top leading-tight')}>
        {!lead || leg.eventDate == null ? null : (
          <>
            {showDay ? (
              <span className="-mt-1 block text-center text-[11px] text-muted-foreground">
                {formatDate(leg.eventDate)}
              </span>
            ) : null}
            <span className="block text-[10px] text-muted-foreground/70">
              {formatTime(leg.eventDate)}
            </span>
          </>
        )}
      </TableCell>
      {/* Across Bet and Type: held in the Bet column alone the legs sat half a
          table away from the date they are ordered by. */}
      <TableCell colSpan={2} className={cn(pad, 'overflow-hidden align-top')}>
        <div className="flex min-w-0 items-start gap-2">
          {lead ? (
            <Sport aria-hidden className={cn('mt-px h-3.5 w-3.5 shrink-0', legTone(status))} />
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
                {/* The builder's combined price, on the fixture it was struck
                    for. Under Odds it sat in a column of slip prices and read
                    as one of them; here it reads as what it is - the price of
                    this match bet several ways. */}
                {odds == null ? null : (
                  <span className="shrink-0 tabular-nums text-[11px] leading-tight text-muted-foreground">
                    {`@${formatOdds(odds, oddsFormat)}`}
                  </span>
                )}
                <Live leg={leg} scores={scores} />
              </span>
            ) : null}
            {/* Tinted by the pick's own result, which the fixture's icon cannot
                say for a builder whose picks did not all go the same way. */}
            <span className={cn('block truncate text-[11px] leading-tight', legTone(leg.status))}>
              {formatLegSelection(leg, oddsFormat)}
            </span>
          </div>
        </div>
      </TableCell>
      {/* Odds through Status: a pick has nothing to say in the slip's own
          money columns, and its price now sits beside the fixture. */}
      <TableCell colSpan={5} className={pad} />
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
        <TableCell className="whitespace-nowrap text-center text-xs text-muted-foreground">
          {formatDateTime(bet.placedAt)}
        </TableCell>
        {/* What the slip is on runs down the left edge of its column: read as a
            list of names, a centred column of them has no edge to run down. */}
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
        <TableCell className="text-center tabular-nums text-xs text-muted-foreground">
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
        ? legDays(bet).flatMap(({ legs, showDay, endsDay, ruled }, group) => {
            // One price for the group where the picks were priced as a builder,
            // and it belongs on the fixture, not on any one pick inside it.
            const groupOdds = legs.length > 1 ? (legs[0]?.groupOdds ?? null) : null;
            const status = groupStatus(legs);
            return legs.map((leg, index) => (
              <LegRow
                key={`${bet.betId}-leg-${group}-${index}`}
                bet={bet}
                leg={leg}
                lead={index === 0}
                last={index === legs.length - 1}
                status={status}
                groupOdds={groupOdds}
                showDay={showDay}
                endsDay={endsDay}
                ruled={ruled}
                showAccount={showAccount}
                scores={scores}
              />
            ));
          })
        : null}
    </>
  );
};
