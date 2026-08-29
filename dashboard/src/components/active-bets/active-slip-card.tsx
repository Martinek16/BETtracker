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
import { formatLegEvent, formatLegSelection, slipKind, SLIP_KIND_LABEL } from '@/lib/bet-display';
import { AccountIcon } from '@/components/dashboard/account-icon';
import {
  LegClock,
  Stat,
  StatOrKickoff,
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
const OpenAtBook = ({
  url,
  onHover,
}: {
  url: string | null;
  /** Out of the way on a wall of cards until the pointer picks one out. */
  onHover?: boolean;
}): JSX.Element | null =>
  url === null ? null : (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
      aria-label="Open at the bookmaker"
      title="Open at the bookmaker"
      className={cn(
        'shrink-0 text-muted-foreground transition-colors hover:text-foreground',
        onHover === true &&
          'opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100',
      )}
    >
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );

/**
 * The heading is read once and the figure under it on every glance, so the
 * heading gives up the room - which is the room a crypto amount needs, where
 * the figure runs to eight decimals and a ticker instead of two and a symbol.
 */
const LABEL = 'text-[9px] text-muted-foreground';

type LegGroup = [BetLeg, ...BetLeg[]];

/** Sorts last, so a fixture with no kickoff never displaces one that has it. */
const kickoffMs = (leg: BetLeg): number => {
  const ms = leg.eventDate == null ? Number.NaN : Date.parse(leg.eventDate);
  return Number.isNaN(ms) ? Infinity : ms;
};

/**
 * Several picks on one fixture are one line with the picks under it, and the
 * fixtures run in kickoff order - the slip reads as the evening it will play out
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

/** A builder is a combo whose fixtures coincide - the punter reads both alike. */
const slipTitle = (bet: Bet): string => {
  const kind = slipKind(bet);
  return SLIP_KIND_LABEL[kind === 'betBuilder' ? 'combo' : kind];
};

/**
 * Which slips stand open, kept above the cards: whoever lays them out has to
 * know how tall each card is before it places it, and a card holding that
 * itself only tells the layout after it has already put the column together.
 *
 * A slip not in here has never been clicked and takes whatever the page opens
 * it as; `reset` hands them all back to that.
 */
export const useOpenSlips = (): {
  isOpen: (betId: string, fallback: boolean) => boolean;
  toggle: (betId: string, fallback: boolean) => void;
  reset: () => void;
} => {
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  return {
    isOpen: (betId, fallback) => picked[betId] ?? fallback,
    toggle: (betId, fallback) => {
      setPicked((current) => ({ ...current, [betId]: !(current[betId] ?? fallback) }));
    },
    reset: () => {
      setPicked({});
    },
  };
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
  /**
   * A column narrow enough that a wall of them can be read at once: the shut
   * card keeps the title and the two figures that matter, and a click asks for
   * the rest. The drawer has room for the full card and does not set this.
   */
  compact?: boolean;
  /**
   * Held by whoever lays the cards out rather than by the card: the page packs
   * its columns by how tall each card stands, so it cannot learn that from the
   * card after the fact - by then the column is already the wrong length.
   */
  expanded: boolean;
  onToggle: () => void;
}

export const ActiveSlipCard = ({
  bet,
  scores,
  now,
  refreshedAt = null,
  siteUrl = null,
  compact = false,
  expanded,
  onToggle,
}: ActiveSlipCardProps): JSX.Element => {
  const { oddsFormat } = useDashboard();
  // Every slip is read the same way: the fixtures it rides on, and a click for
  // the picks under them. A single is a slip with one fixture, not a different
  // shape - laid out apart it broke the line the eye runs down a column on.
  const showPicks = expanded;
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
  const fixtures = groupByEvent(legs);

  return (
    <article
      onClick={onToggle}
      className={cn(
        'cursor-pointer rounded-md border border-border bg-card',
        compact ? 'p-2' : 'p-3',
      )}
    >
      <header className={cn('border-b border-border', compact ? 'mb-1.5 pb-1.5' : 'mb-2 pb-2')}>
        <div className="group flex items-baseline gap-2">
          <AccountIcon
            bookmaker={bet.bookmaker}
            className={cn('shrink-0', compact ? 'h-3 w-3 text-[8px]' : 'h-4 w-4 text-[9px]')}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            aria-expanded={expanded}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            {/* The kind of slip, not the fixture: the fixtures are the lines
                under it, and a name up here read as one of them. */}
            <span className={cn('truncate font-medium', compact ? 'text-xs' : 'text-sm')}>
              {slipTitle(bet)}
            </span>
            {bet.legs.length > 1 && (
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {bet.legs.length}
              </span>
            )}
          </button>
          <OpenAtBook url={siteUrl} onHover={compact} />
        </div>
      </header>

      {/* When the figures above were read, and the day the slip was placed -
          neither is worth a line until the card is asked to open, and neither
          belongs to the title, so both sit under the rule with the picks. */}
      {expanded && (
        <p className="mb-2 flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
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

      <ul className="space-y-1">
        {byDay(fixtures).map(([day, sameDay]) => (
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
                    className={cn(
                      '-mx-1 flex items-start gap-2 rounded px-1 py-0.5',
                      compact ? 'text-[11px]' : 'text-xs',
                    )}
                  >
                    <SportIcon
                      aria-label={head.sport ?? 'Sport'}
                      className={cn(
                        'mt-0.5 h-3.5 w-3.5 shrink-0',
                        inPlay ? 'animate-pulse text-foreground' : LEG_TINT[status],
                      )}
                    />
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span
                          className={cn(
                            'min-w-0 flex-1',
                            // Shut, every fixture is one line whatever it is
                            // called, so the card's height is its count of
                            // fixtures and a column of them reads down evenly.
                            // Opened, the name is wanted in full.
                            showPicks ? 'break-words' : 'truncate',
                            // A called-off fixture still has to be shown: it
                            // is what the rest of the slip now hangs on.
                            status === 'void' && 'text-muted-foreground line-through',
                          )}
                        >
                          {formatLegEvent(head)}
                        </span>
                        {/* Shut, the fixture answers for itself in one figure;
                            opened, each pick under it carries its own. */}
                        {!showPicks && (
                          <StatOrKickoff
                            leg={head}
                            score={statForLeg(head, stats)}
                            status={status}
                          />
                        )}
                      </span>
                      {showPicks &&
                        group.map((leg, i) => (
                          <span
                            key={`${leg.selection ?? ''}${String(i)}`}
                            className="flex min-w-0 items-start gap-2 text-muted-foreground"
                          >
                            <span
                              className={cn(
                                'min-w-0 flex-1 break-words',
                                leg.status === 'void' && 'line-through',
                              )}
                            >
                              {formatLegSelection(leg, oddsFormat)}
                            </span>
                            {/* One clock per fixture, on the first of its
                                  picks and left of the count, as in the table. */}
                            {i === 0 && <LegClock leg={leg} live={live} status={leg.status} />}
                            <Stat score={statForLeg(leg, stats)} />
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

      {compact && !expanded ? (
        // Stake, price and what it pays, in that reading order and without the
        // headings: at this width the headings cost more room than they explain.
        <div className="mt-2 flex items-baseline justify-between gap-2 whitespace-nowrap border-t border-border pt-1.5 text-[10px]">
          <span className="text-muted-foreground">
            <Money value={bet.stake} currency={bet.currency} source={bet} tight />
          </span>
          <span className="text-muted-foreground">{formatOdds(bet.odds, oddsFormat)}</span>
          <span className="font-medium">
            <Money
              value={bet.currentPotentialReturn ?? bet.potentialReturn}
              currency={bet.currency}
              source={bet}
              secondFirst
              tight
            />
          </span>
          {/* An offer that is only there while it is there: a shut card has to
              say so on its own, or the card is opened to find it has gone. */}
          {bet.cashOutValue !== undefined && (
            <span className="font-medium text-cashedOut">
              <Money value={bet.cashOutValue} currency={bet.currency} source={bet} tight />
            </span>
          )}
        </div>
      ) : (
        <dl
          className={cn(
            // Four figures in a fixed width: nothing here may wrap, so the amounts
            // give up their cents before the row gives up its line.
            'grid whitespace-nowrap border-t border-border',
            compact ? 'mt-2 pt-1.5 text-[11px]' : 'mt-3 pt-2 text-xs',
            bet.cashOutValue === undefined ? 'grid-cols-3' : 'grid-cols-4',
          )}
        >
          <div>
            <dt className={LABEL}>Stake</dt>
            <dd className="font-medium">
              <Money value={bet.stake} currency={bet.currency} source={bet} tight />
            </dd>
          </div>
          <div className="text-center">
            <dt className={LABEL}>Odds</dt>
            <dd className="font-medium">{formatOdds(bet.odds, oddsFormat)}</dd>
          </div>
          <div className={bet.cashOutValue === undefined ? 'text-right' : 'text-center'}>
            <dt className={LABEL}>To win</dt>
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
              <dt className={LABEL}>Cash out</dt>
              <dd className="font-medium text-cashedOut">
                <Money value={bet.cashOutValue} currency={bet.currency} source={bet} tight />
              </dd>
            </div>
          )}
        </dl>
      )}
    </article>
  );
};
