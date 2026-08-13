import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  formatOdds,
  isLiveLeg,
  type Bet,
  type BetLeg,
  type BetStatus,
  type LiveScore,
} from '@betanal/shared';
import {
  formatLegEvent,
  formatLegSelection,
  isComboBet,
  slipKind,
  SLIP_KIND_LABEL,
} from '@/lib/bet-display';
import { AccountIcon } from '@/components/dashboard/account-icon';
import {
  LegClock,
  Stat,
  liveOf,
  sportIconFor,
  statForLeg,
} from '@/components/dashboard/live-score';
import { Money } from '@/components/ui/money';
import { useDashboard } from '@/context/dashboard-context';
import { cn, formatDate, formatTime } from '@/lib/utils';

/** The sport's glyph carries how the fixture went, in the colour of its result. */
const LEG_TINT: Record<BetStatus, string> = {
  pending: 'text-muted-foreground',
  won: 'text-profit',
  lost: 'text-loss',
  void: 'text-muted-foreground/40',
  cashed_out: 'text-cashedOut',
};

/**
 * The slip itself lives at the bookmaker. There is no address for a single bet
 * in any payload, so this opens the book on the mirror the browser last reached
 * it on rather than inventing a deep link that would rot.
 */
const OpenAtBook = ({ url }: { url: string | null }): JSX.Element | null =>
  url === null ? null : (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
      aria-label="Open at the bookmaker"
      title="Open at the bookmaker"
      className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
    >
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );

type LegGroup = [BetLeg, ...BetLeg[]];

/** Sorts last, so a fixture with no kickoff never displaces one that has it. */
const kickoffMs = (leg: BetLeg): number => {
  const ms = leg.eventDate == null ? Number.NaN : Date.parse(leg.eventDate);
  return Number.isNaN(ms) ? Infinity : ms;
};

/**
 * Several picks on one fixture are one line with the picks under it, and the
 * fixtures run in kickoff order — the slip reads as the evening it will play out
 * rather than the order the picks happened to be added in.
 */
const groupByEvent = (legs: BetLeg[]): LegGroup[] => {
  const groups = new Map<string, LegGroup>();
  for (const leg of legs) {
    const key = leg.eventId ?? leg.event ?? '—';
    const seen = groups.get(key);
    groups.set(key, seen === undefined ? [leg] : [...seen, leg]);
  }
  return [...groups.values()].sort((a, b) => kickoffMs(a[0]) - kickoffMs(b[0]));
};

/**
 * The fixtures cut into the days they are played on. A combo that runs over a
 * weekend repeated the date on every line; written once above its own fixtures
 * it says the same thing and leaves the lines to the football.
 */
const byDay = (groups: LegGroup[]): [string | null, LegGroup[]][] => {
  const days = new Map<string | null, LegGroup[]>();
  for (const group of groups) {
    const start = group[0].eventDate;
    const day = start == null || Number.isNaN(Date.parse(start)) ? null : formatDate(start);
    const seen = days.get(day);
    if (seen === undefined) days.set(day, [group]);
    else seen.push(group);
  }
  return [...days.entries()];
};

/** A fixture is only settled once every pick on it is, and one loss decides it. */
const groupStatus = (group: LegGroup): BetStatus =>
  group.find((leg) => leg.status === 'lost')?.status ??
  group.find((leg) => leg.status === 'pending')?.status ??
  group[0].status;

/** A builder is a combo whose fixtures coincide — the punter reads both alike. */
const slipTitle = (bet: Bet): string => {
  const kind = slipKind(bet);
  return SLIP_KIND_LABEL[kind === 'betBuilder' ? 'combo' : kind];
};

interface ActiveSlipCardProps {
  bet: Bet;
  scores: Record<string, LiveScore[]>;
  /** Ticked by the panel so the estimated clock moves without a timer per card. */
  now: number;
  /** When the book last answered, or null before it has. */
  refreshedAt?: number | null;
  /** Where this bookmaker is reached; null when the book is not one we know. */
  siteUrl?: string | null;
}

export const ActiveSlipCard = ({
  bet,
  scores,
  now,
  refreshedAt = null,
  siteUrl = null,
}: ActiveSlipCardProps): JSX.Element => {
  const [expanded, setExpanded] = useState(false);
  const { oddsFormat } = useDashboard();
  // Anything with more than one pick reads as a combo — a builder is just a
  // combo whose fixtures happen to coincide, so it collapses the same way and
  // the picks are what a click reveals. A single shows its pick either way, so
  // a click there only asks for when the figures were last read.
  const multi = isComboBet(bet);
  const showPicks = expanded || !multi;
  const legs: BetLeg[] =
    bet.legs.length > 0
      ? bet.legs
      : [
          {
            sport: bet.sport,
            league: bet.league,
            event: bet.event,
            marketType: bet.marketType,
            selection: bet.selection,
            odds: bet.odds,
            status: bet.status,
            eventDate: null,
            isLive: false,
          },
        ];

  return (
    <article
      onClick={() => setExpanded((v) => !v)}
      className="cursor-pointer rounded-lg border border-border bg-background p-3"
    >
      {/* The rule closes whatever the header is showing: the title alone while
          the card is shut, the stamps below it once it is open. */}
      <header className="mb-2 border-b border-border pb-2">
      <div className="flex items-baseline gap-2">
        <AccountIcon bookmaker={bet.bookmaker} className="h-4 w-4 shrink-0 text-[9px]" />
        {multi ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            aria-expanded={expanded}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className="truncate text-sm font-medium">{slipTitle(bet)}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {bet.legs.length}
            </span>
          </button>
        ) : (
          <h3 className="min-w-0 flex-1 truncate text-sm font-medium">
            {bet.event ?? bet.selection ?? bet.betId}
          </h3>
        )}
        <OpenAtBook url={siteUrl} />
      </div>
      {/* When the figures above were read, and the day the slip was placed —
          neither is worth a line until the card is asked to open. */}
      {expanded && (
      <p className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
        {/* Says only how fresh the figures are, so it sits a size under them. */}
        <span className="text-[9px]">
          {refreshedAt !== null && (
            <>
              last update{' '}
              <span className="tabular-nums">
                {formatTime(new Date(refreshedAt).toISOString())}
              </span>
            </>
          )}
        </span>
        <span className="tabular-nums">{formatDate(bet.placedAt)}</span>
      </p>
      )}
      </header>

      {(multi || showPicks) && (
        <ul className="space-y-1">
          {byDay(groupByEvent(legs)).map(([day, sameDay]) => (
            <li key={day ?? 'undated'} className="space-y-1">
              <ul className="space-y-1">
                {sameDay.map((group) => {
                  const head = group[0];
                  const stats = head.eventId === undefined ? undefined : scores[head.eventId];
                  const live = liveOf(stats);
                  const status = groupStatus(group);
                  const inPlay = group.some(
                    (leg) => isLiveLeg(leg, now, scores) && leg.status === 'pending',
                  );
                  const SportIcon = sportIconFor(head.sport, bet.bookmaker);
                  return (
                    <li
                      key={formatLegEvent(head)}
                      className="-mx-1 flex items-start gap-2 rounded px-1 py-0.5 text-xs"
                    >
                      <SportIcon
                        aria-label={head.sport ?? 'Sport'}
                        className={cn(
                          'mt-0.5 h-3.5 w-3.5 shrink-0',
                          inPlay ? 'animate-pulse text-foreground' : LEG_TINT[status],
                        )}
                      />
                      <span className="min-w-0 flex-1 space-y-0.5">
                        {multi && (
                          <span className="flex min-w-0 items-baseline gap-2">
                            <span
                              className={cn(
                                'min-w-0 flex-1 break-words',
                                // A called-off fixture still has to be shown: it
                                // is what the rest of the slip now hangs on.
                                status === 'void' && 'text-muted-foreground line-through',
                              )}
                            >
                              {formatLegEvent(head)}
                            </span>
                            <LegClock leg={head} live={live} status={status} />
                          </span>
                        )}
                        {showPicks &&
                          group.map((leg, i) => (
                            <span
                              key={`${leg.selection ?? ''}${String(i)}`}
                              className="flex min-w-0 items-start gap-2 text-muted-foreground"
                            >
                              <span className="min-w-0 flex-1 break-words">
                                {formatLegSelection(leg, oddsFormat)}
                              </span>
                              <Stat score={statForLeg(leg, stats)} />
                              {/* A single has no fixture row above to carry the
                                  clock, so it runs at the end of the pick's own. */}
                              {!multi && <LegClock leg={leg} live={live} status={leg.status} />}
                            </span>
                          ))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <dl
        className={cn(
          // Four figures in a fixed width: nothing here may wrap, so the amounts
          // give up their cents before the row gives up its line.
          'mt-3 grid whitespace-nowrap border-t border-border pt-2 text-xs',
          bet.cashOutValue === undefined ? 'grid-cols-3' : 'grid-cols-4',
        )}
      >
        <div>
          <dt className="text-muted-foreground">Stake</dt>
          <dd className="font-medium">
            <Money value={bet.stake} currency={bet.currency} source={bet} tight />
          </dd>
        </div>
        <div className="text-center">
          <dt className="text-muted-foreground">Odds</dt>
          <dd className="font-medium">{formatOdds(bet.odds, oddsFormat)}</dd>
        </div>
        <div className={bet.cashOutValue === undefined ? 'text-right' : 'text-center'}>
          <dt className="text-muted-foreground">To win</dt>
          <dd className="font-medium">
            <Money
              value={bet.currentPotentialReturn ?? bet.potentialReturn}
              currency={bet.currency}
              source={bet}
              secondFirst
              tight
            />
          </dd>
        </div>
        {bet.cashOutValue !== undefined && (
          <div className="text-right">
            <dt className="text-muted-foreground">Cash out</dt>
            <dd className="font-medium text-cashedOut">
              <Money value={bet.cashOutValue} currency={bet.currency} source={bet} tight />
            </dd>
          </div>
        )}
      </dl>
    </article>
  );
};
