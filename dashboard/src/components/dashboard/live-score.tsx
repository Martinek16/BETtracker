import { Bike, Car, Gamepad2, Medal, Snowflake, Trophy } from 'lucide-react';
import {
  canonicalSport,
  isEsport,
  statKindForMarket,
  type BetLeg,
  type BetStatus,
  type Bookmaker,
  type LiveScore,
} from '@betanal/shared';
import {
  BaseballIcon,
  BasketballIcon,
  BowlingIcon,
  CricketIcon,
  DartsIcon,
  FightingIcon,
  FootballIcon,
  GolfIcon,
  HandballIcon,
  HockeyIcon,
  RugbyIcon,
  TableTennisIcon,
  TennisBallIcon,
  VolleyballIcon,
  type SportIcon,
} from '@/components/dashboard/sport-icons';
import { cn } from '@/lib/utils';

/**
 * What a fixture in play looks like, wherever it is read: the count that matches
 * the pick and how far the match is. Shared by the slip cards and the bet table
 * so both say the same thing about the same match.
 */

/**
 * The sport's own ball — or bat, wheel or controller. Matched on a word inside
 * the book's own name for the sport, so "Table Tennis" and "Football (women)"
 * both land. Order counts: the narrower name has to be tried before the word it
 * contains, or table tennis reads as tennis. A sport nobody mapped takes the
 * trophy rather than a wrong glyph.
 */
const SPORT_ICON: Record<string, SportIcon> = {
  'table tennis': TableTennisIcon,
  'american football': RugbyIcon,
  rugby: RugbyIcon,
  football: FootballIcon,
  soccer: FootballIcon,
  futsal: FootballIcon,
  basketball: BasketballIcon,
  tennis: TennisBallIcon,
  baseball: BaseballIcon,
  volleyball: VolleyballIcon,
  handball: HandballIcon,
  hockey: HockeyIcon,
  cricket: CricketIcon,
  darts: DartsIcon,
  snooker: BowlingIcon,
  billiard: BowlingIcon,
  pool: BowlingIcon,
  bowling: BowlingIcon,
  esport: Gamepad2,
  'e-sport': Gamepad2,
  gaming: Gamepad2,
  boxing: FightingIcon,
  mma: FightingIcon,
  ufc: FightingIcon,
  fighting: FightingIcon,
  martial: FightingIcon,
  cycling: Bike,
  motorsport: Car,
  formula: Car,
  racing: Car,
  golf: GolfIcon,
  athletics: Medal,
  ski: Snowflake,
  biathlon: Snowflake,
};


/**
 * The glyph a fixture in this sport is read by; a trophy when it is unknown.
 * Matched on the sport's one name rather than the book's own, so a slip from a
 * book that says "Soccer" is drawn with the same ball as one that says
 * "Football" — and that book's "Football" gets the American one it means.
 */
export const sportIconFor = (sport: string | null, bookmaker?: Bookmaker): SportIcon => {
  const canonical = canonicalSport(sport, bookmaker);
  if (isEsport(canonical)) return Gamepad2;
  const name = (canonical ?? '').toLowerCase();
  const hit = Object.entries(SPORT_ICON).find(([key]) => name.includes(key));
  return hit?.[1] ?? Trophy;
};

/**
 * The count that matches the pick: corners for a corner bet, cards for a card
 * bet, otherwise whatever the sport calls its score. Falls back to the score
 * when the feed carries no such count.
 */
export const statForLeg = (leg: BetLeg, stats: LiveScore[] | undefined): LiveScore | undefined => {
  if (stats === undefined) return undefined;
  const kind = statKindForMarket(leg.marketType);
  const wanted = kind === null ? undefined : stats.find((s) => s.kind === kind);
  return wanted ?? stats.find((s) => s.kind === undefined) ?? stats[0];
};

/** The result of what a pick backed — always on the right of the pick's own row. */
export const Stat = ({ score }: { score: LiveScore | undefined }): JSX.Element | null => {
  if (score === undefined) return null;
  return (
    <span className="shrink-0 text-right font-medium tabular-nums text-foreground">
      {score.away === '' ? score.home : `${score.home} : ${score.away}`}
    </span>
  );
};

/** Kickoff on the 24-hour clock, as it is written here. */
const kickoffTime = (leg: BetLeg): string | null => {
  if (leg.eventDate == null) return null;
  const at = new Date(leg.eventDate);
  if (Number.isNaN(at.getTime())) return null;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
};

/** Only football is read by the minute; every other sport is read by its part. */
const BY_THE_MINUTE = new Set(['Football']);

/** Whatever the fixture carries about how far it is; the book's own words. */
export const liveOf = (stats: LiveScore[] | undefined): LiveScore | undefined =>
  stats?.find((s) => s.clock !== undefined || s.period !== undefined);

/**
 * How far the match is, in the figure that sport is followed by: a minute for
 * football, the set for tennis, the quarter or period for the rest. Never
 * counted from kickoff — only what the book itself said.
 */
const clockOf = (live: LiveScore | undefined, sport: string | null): string | undefined => {
  // A fixture the book still calls not started says nothing a kickoff does not.
  const period = live?.period === 'Not started' ? undefined : live?.period;
  return BY_THE_MINUTE.has(canonicalSport(sport) ?? '') ? (live?.clock ?? period) : period;
};

/**
 * Once a match is running, when it started stops being the useful number, and
 * once it has been played out neither is: the row falls silent and the pick's
 * own dot says how it went. A fixture called off keeps its kickoff, struck
 * through — that time is the reason the rest of the slip now hangs where it does.
 */
export const LegClock = ({
  leg,
  live,
  status,
  className,
}: {
  leg: BetLeg;
  live?: LiveScore;
  /** Whole-fixture state, since a fixture's picks can differ from one another. */
  status: BetStatus;
  className?: string;
}): JSX.Element | null => {
  if (status !== 'pending' && status !== 'void') return null;
  // A pick can still be open minutes after the whistle, while the book settles it.
  if (live?.period === 'Ended') return null;
  const at = status === 'void' ? kickoffTime(leg) : (clockOf(live, leg.sport) ?? kickoffTime(leg));
  if (at === null) return null;
  return (
    <span
      className={cn(
        'shrink-0 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground',
        status === 'void' && 'line-through',
        className,
      )}
    >
      {at}
    </span>
  );
};
