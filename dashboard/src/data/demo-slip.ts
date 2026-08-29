import type { Bet, BetLeg, LiveScore } from '@betanal/shared';

/**
 * Synthetic slips for eyeballing the panel and the bet table when nothing real
 * is in play.
 *
 * Enabled by `demo=live` in the query or the hash. Each slip is here for one
 * shape no other slip has: singles, bet builders, cross-fixture combos, settled
 * and void legs, market-specific counts, names long enough to wrap - and, on the
 * scores, every state a bookmaker's clock is read in, from a running minute to a
 * set, a quarter, an interval and a match already over.
 */
export const isDemoSlipEnabled = (): boolean => /[?&#]demo=(live|1)/.test(window.location.href);

/**
 * Stands in for the moment a real poll answered, so the header's "last update"
 * can be seen where it sits. Read once, or it would move on every render.
 */
export const DEMO_REFRESHED_AT = Date.now();

const minutesFromNow = (minutes: number): string =>
  new Date(Date.now() + minutes * 60_000).toISOString();

const leg = (over: Partial<BetLeg>): BetLeg => ({
  sport: 'Football',
  league: 'Premier League',
  event: 'Arsenal - Chelsea',
  marketType: '1X2',
  selection: 'Arsenal',
  odds: 1.85,
  status: 'pending',
  eventDate: minutesFromNow(-50),
  isLive: true,
  ...over,
});

const slip = (over: Partial<Bet>): Bet => ({
  betId: 'demo',
  bookmaker: 'bet-at-home',
  accountId: 'demo',
  placedAt: minutesFromNow(-260),
  settledAt: null,
  cashedOutAt: null,
  sport: 'Football',
  league: 'Premier League',
  event: 'Arsenal - Chelsea',
  marketType: '1X2',
  selection: 'Arsenal',
  odds: 1.85,
  stake: 10,
  potentialReturn: 18.5,
  actualReturn: 0,
  status: 'pending',
  betType: 'single',
  legs: [],
  currency: 'EUR',
  ...over,
});

/**
 * A single: the slip header carries the fixture, the leg only the pick. The
 * slip is built first so the leg inherits the resolved sport and league - an
 * `undefined` passed straight through would erase them, and with the sport
 * gone the leg is no longer football, so it loses its clock.
 */
const single = (over: Partial<Bet>, legOver: Partial<BetLeg>): Bet => {
  const bet = slip(over);
  return {
    ...bet,
    legs: [leg({ ...legOver, sport: bet.sport, league: bet.league, event: bet.event })],
  };
};

export const DEMO_BETS: Bet[] = [
  single(
    {
      betId: 'demo-football-single',
      event: 'Arsenal - Chelsea',
      selection: 'Arsenal',
      odds: 1.85,
      stake: 10,
      potentialReturn: 18.5,
      cashOutValue: 13.2,
    },
    { eventId: 'demo-1' },
  ),

  single(
    {
      betId: 'demo-corners',
      league: 'La Liga',
      event: 'Real Madrid - Sevilla',
      marketType: 'Total Corners',
      selection: 'Over 9.5',
      odds: 1.7,
      stake: 20,
      potentialReturn: 34,
      cashOutValue: 26.8,
    },
    {
      eventId: 'demo-2',
      marketType: 'Total Corners',
      selection: 'Over 9.5',
      odds: 1.7,
      eventDate: minutesFromNow(-84),
    },
  ),

  // A sport read by its period rather than by a minute.
  single(
    {
      betId: 'demo-hockey',
      sport: 'Ice Hockey',
      league: 'NHL',
      event: 'Colorado Avalanche - Vegas Golden Knights',
      marketType: 'Moneyline',
      selection: 'Colorado Avalanche',
      odds: 2.25,
      stake: 8,
      potentialReturn: 18,
      cashOutValue: 9.7,
    },
    {
      eventId: 'demo-3',
      marketType: 'Moneyline',
      selection: 'Colorado Avalanche',
      odds: 2.25,
      eventDate: minutesFromNow(-46),
    },
  ),

  // Every leg on one fixture - the card should read "Bet Builder".
  slip({
    betId: 'demo-builder',
    league: 'Premier League',
    event: 'Man City - Liverpool',
    betType: 'accumulator',
    odds: 6.39,
    stake: 5,
    potentialReturn: 31.97,
    cashOutValue: 11.9,
    legs: [
      leg({
        eventId: 'demo-7',
        event: 'Man City - Liverpool',
        selection: 'Man City',
        status: 'won',
        odds: 1.9,
        eventDate: minutesFromNow(-74),
      }),
      leg({
        eventId: 'demo-7',
        event: 'Man City - Liverpool',
        marketType: 'Total Corners',
        selection: 'Over 8.5',
        odds: 1.8,
        eventDate: minutesFromNow(-74),
      }),
      leg({
        eventId: 'demo-7',
        event: 'Man City - Liverpool',
        marketType: 'Yellow Cards Over/Under',
        selection: 'Over 3.5',
        odds: 1.87,
        eventDate: minutesFromNow(-74),
      }),
    ],
  }),

  // Legs across fixtures, mixed outcomes - the card should read "Combo".
  // A void leg drops out of the price, so what it pays now is below what it
  // was placed at - the only slip where the two returns differ.
  slip({
    betId: 'demo-combo-mixed',
    bookmaker: 'stake',
    betType: 'accumulator',
    odds: 10.62,
    stake: 8,
    potentialReturn: 84.96,
    currentPotentialReturn: 48.56,
    cashOutValue: 18.35,
    legs: [
      leg({
        eventId: 'demo-8',
        league: 'Bundesliga',
        event: 'Leipzig - Freiburg',
        selection: 'Leipzig',
        status: 'won',
        odds: 1.6,
        eventDate: minutesFromNow(-140),
      }),
      leg({
        eventId: 'demo-9',
        league: 'Ligue 1',
        event: 'Lyon - Monaco',
        marketType: 'Draw No Bet',
        selection: 'Monaco',
        status: 'void',
        odds: 1.75,
        eventDate: minutesFromNow(-130),
      }),
      leg({ eventId: 'demo-1', odds: 1.85 }),
      leg({
        eventId: 'demo-10',
        league: 'Eredivisie',
        event: 'Ajax - Feyenoord',
        selection: 'Ajax',
        odds: 2.05,
        eventDate: minutesFromNow(240),
        isLive: false,
      }),
    ],
  }),

  // Every state a slip can hold at once: one fixture played out, one running,
  // one called off and one still to come - across four sports.
  slip({
    betId: 'demo-combo-states',
    betType: 'accumulator',
    odds: 15.24,
    stake: 4,
    potentialReturn: 60.96,
    currentPotentialReturn: 34.85,
    cashOutValue: 9.4,
    legs: [
      leg({
        eventId: 'demo-19',
        sport: 'Basketball',
        league: 'EuroLeague',
        event: 'Panathinaikos - Real Madrid',
        marketType: 'Handicap',
        selection: 'Panathinaikos +3.5',
        status: 'won',
        odds: 1.8,
        eventDate: minutesFromNow(-160),
      }),
      leg({
        eventId: 'demo-20',
        sport: 'Tennis',
        league: 'ATP Cincinnati',
        event: 'Djokovic - Zverev',
        marketType: 'Match Winner',
        selection: 'Djokovic',
        odds: 1.65,
        eventDate: minutesFromNow(-96),
      }),
      leg({
        eventId: 'demo-21',
        sport: 'Ice Hockey',
        league: 'NHL',
        event: 'Oilers - Flames',
        marketType: 'Moneyline',
        selection: 'Oilers',
        status: 'void',
        odds: 1.95,
        eventDate: minutesFromNow(-15),
      }),
      leg({
        eventId: 'demo-22',
        league: 'Serie A',
        event: 'Inter - Napoli',
        selection: 'Over 2.5',
        marketType: 'Over/Under',
        odds: 2.15,
        eventDate: minutesFromNow(310),
        isLive: false,
      }),
    ],
  }),

  single(
    {
      betId: 'demo-tennis',
      bookmaker: 'stake',
      sport: 'Tennis',
      league: 'ATP Toronto',
      event: 'Alcaraz - Sinner',
      marketType: 'Match Winner',
      selection: 'Alcaraz',
      odds: 1.95,
      stake: 15,
      potentialReturn: 29.25,
      cashOutValue: 12.4,
    },
    {
      eventId: 'demo-5',
      marketType: 'Match Winner',
      selection: 'Alcaraz',
      odds: 1.95,
      eventDate: minutesFromNow(-84),
    },
  ),

  single(
    {
      betId: 'demo-cricket',
      sport: 'Cricket',
      league: 'The Hundred',
      event: 'Oval Invincibles - Trent Rockets',
      marketType: 'Match Winner',
      selection: 'Oval Invincibles',
      odds: 1.72,
      stake: 20,
      potentialReturn: 34.4,
    },
    {
      eventId: 'demo-6',
      marketType: 'Match Winner',
      selection: 'Oval Invincibles',
      odds: 1.72,
      eventDate: minutesFromNow(-75),
    },
  ),

  single(
    {
      betId: 'demo-basketball',
      bookmaker: 'stake',
      sport: 'Basketball',
      league: 'NBA',
      event: 'Boston Celtics - Denver Nuggets',
      marketType: 'Handicap',
      selection: 'Boston Celtics -4.5',
      odds: 1.9,
      stake: 12,
      potentialReturn: 22.8,
      cashOutValue: 15.6,
    },
    {
      eventId: 'demo-11',
      marketType: 'Handicap',
      selection: 'Boston Celtics -4.5',
      odds: 1.9,
      eventDate: minutesFromNow(-71),
    },
  ),

  // Played out but not yet settled, and a match deep into stoppage time.
  single(
    {
      betId: 'demo-ended',
      league: 'Championship',
      event: 'Leeds - Norwich',
      marketType: 'Over/Under',
      selection: 'Over 1.5',
      odds: 1.55,
      stake: 30,
      potentialReturn: 46.5,
    },
    {
      eventId: 'demo-12',
      marketType: 'Over/Under',
      selection: 'Over 1.5',
      odds: 1.55,
      eventDate: minutesFromNow(-125),
    },
  ),

  single(
    {
      betId: 'demo-stoppage',
      league: 'Primeira Liga',
      event: 'Benfica - Porto',
      selection: 'Draw',
      odds: 3.4,
      stake: 6,
      potentialReturn: 20.4,
      cashOutValue: 17.1,
    },
    { eventId: 'demo-13', selection: 'Draw', odds: 3.4, eventDate: minutesFromNow(-110) },
  ),

  // Names long enough to force wrapping next to a live count.
  single(
    {
      betId: 'demo-long',
      league: 'Copa CONMEBOL Sudamericana',
      event: 'Deportivo Independiente Medellín - Club Atlético Boca Juniors',
      marketType: 'Corners Asian Handicap Second Half',
      selection: 'Deportivo Independiente Medellín -1.5',
      odds: 2.4,
      stake: 3,
      potentialReturn: 7.2,
    },
    {
      eventId: 'demo-14',
      marketType: 'Corners Asian Handicap Second Half',
      selection: 'Deportivo Independiente Medellín -1.5',
      odds: 2.4,
      eventDate: minutesFromNow(-79),
    },
  ),

  // ── Not started yet: these land under Open ──

  single(
    {
      betId: 'demo-open-single',
      league: 'Bundesliga',
      event: 'Bayern - Dortmund',
      selection: 'Bayern',
      odds: 1.6,
      stake: 25,
      potentialReturn: 40,
    },
    {
      eventId: 'demo-4',
      selection: 'Bayern',
      odds: 1.6,
      eventDate: minutesFromNow(180),
      isLive: false,
    },
  ),

  // A second login at the same site: the account is the unit, not the site.
  slip({
    betId: 'demo-open-combo',
    bookmaker: 'stake',
    accountId: 'demo-2',
    betType: 'accumulator',
    odds: 12.17,
    stake: 2,
    potentialReturn: 24.35,
    legs: [
      leg({
        eventId: 'demo-15',
        league: 'La Liga',
        event: 'Atlético Madrid - Valencia',
        selection: 'Atlético Madrid',
        odds: 1.55,
        eventDate: minutesFromNow(200),
        isLive: false,
      }),
      leg({
        eventId: 'demo-16',
        sport: 'Ice Hockey',
        league: 'NHL',
        event: 'Rangers - Bruins',
        marketType: 'Moneyline',
        selection: 'Rangers',
        odds: 2.1,
        eventDate: minutesFromNow(420),
        isLive: false,
      }),
      leg({
        eventId: 'demo-17',
        sport: 'Tennis',
        league: 'WTA Montreal',
        event: 'Swiatek - Gauff',
        marketType: 'Match Winner',
        selection: 'Swiatek',
        odds: 1.7,
        eventDate: minutesFromNow(1_440),
        isLive: false,
      }),
      leg({
        eventId: 'demo-18',
        sport: 'Darts',
        league: 'World Matchplay',
        event: 'Humphries - Littler',
        marketType: 'Total 180s',
        selection: 'Over 8.5',
        odds: 2.2,
        eventDate: minutesFromNow(2_880),
        isLive: false,
      }),
    ],
  }),
];

/**
 * The clock is written the way a book writes it - a minute for football, the
 * part being played for everything else - and only ever on the match score, so
 * a fixture reads the same here as it would off a live feed.
 *
 * Only a fixture that has kicked off is in here, and its kickoff is set far
 * enough back for the minute shown to be reachable: 68' of football is 83-odd
 * minutes ago once the interval is counted, and a match cannot be over 50
 * minutes after it started.
 */
export const DEMO_SCORES: Record<string, LiveScore[]> = {
  // The interval: a part with no minute running inside it.
  'demo-1': [{ home: '1', away: '0', period: 'Half time' }],
  'demo-2': [
    { home: '2', away: '2', clock: "68'", period: '2nd half' },
    { home: '7', away: '4', kind: 'Corners' },
  ],
  'demo-3': [{ home: '2', away: '3', period: '2nd period' }],
  'demo-5': [{ home: '1', away: '1', kind: 'Sets', period: '3rd set' }],
  'demo-6': [{ home: '148/3', away: '176/6', kind: 'Innings', period: '2nd innings' }],
  // One fixture, three different counts - the builder reads a different number
  // on every pick line.
  'demo-7': [
    { home: '2', away: '1', clock: "58'", period: '2nd half' },
    { home: '9', away: '3', kind: 'Corners' },
    { home: '3', away: '1', kind: 'Cards' },
  ],
  'demo-8': [{ home: '2', away: '0', period: 'Ended' }],
  'demo-11': [{ home: '88', away: '81', period: '3rd quarter' }],
  // Over, and still open while the book settles it: the time drops off the row
  // and only the score is left.
  'demo-12': [{ home: '2', away: '1', period: 'Ended' }],
  // Stoppage time - the reason the minute is read off the book and never counted.
  'demo-13': [{ home: '1', away: '1', clock: "90+4'", period: '2nd half' }],
  // The mixed combo: a game already over next to one still being played. The
  // called-off fixture carries no score at all, and the one yet to start none.
  'demo-19': [{ home: '84', away: '79', period: 'Ended' }],
  'demo-20': [{ home: '1', away: '1', kind: 'Sets', period: '3rd set' }],
  'demo-14': [
    { home: '0', away: '2', clock: "63'", period: '2nd half' },
    { home: '3', away: '6', kind: 'Corners' },
  ],
};
