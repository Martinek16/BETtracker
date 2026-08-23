/**
 * One name per competition, across books, seasons and stages.
 *
 * bet-at-home files a league per season ("Premier League 2025/2026"), Stake
 * files it once ("Premier League"), and either will file the same competition
 * once per stage ("UEFA Champions League Group A", "… Play-offs"). Read as
 * written, one competition spreads over a row per season per stage per book, and
 * no row holds enough bets to say anything. Dropping the season and the stage
 * merges them - and merges the two books with them, since what is left is the
 * same string on both sides.
 */

/**
 * A trailing season, however the book writes it: 2025/2026, 2025/26, 25/26, 2025.
 * The season word has to start a word of its own, or "NBA Preseason 2026" loses
 * the tail of its own name and reads "NBA Pre".
 */
const SEASON = /[\s,]*[-–—]?\s*(?:\bseason\s*)?(?:\d{4}\/\d{2,4}|\d{2}\/\d{2}|\d{4})$/i;

/**
 * A season the book prints in the middle of the name rather than at the end:
 * "FIFA World Cup Qualification 2025 - CONMEBOL" is the same competition as the
 * one played in 2029, and the confederation behind it is not a season.
 */
const INNER_SEASON = /\s(?:\d{4}\/\d{2,4}|\d{4})(?=\s)/g;

/**
 * The clock a virtual match is played to: "Esoccer Battle (8 minutes play)" and
 * "(12 minutes play)" are one competition run at two lengths.
 */
const CLOCK = /\s*\([^)]*\b(?:min|mins|minutes)\b[^)]*\)$/i;

/**
 * A stage of a competition. A bet in the group phase and a bet in the final are
 * bets on the same competition, and splitting them leaves neither row readable.
 * Names are matched only at the end, so a competition that *is* a stage word
 * ("Champions League") is untouched.
 */
const STAGE = new RegExp(
  `[\\s,]*[-–—:]?\\s*\\b(?:${[
    '(?:group|grp)\\s+[a-l]',
    '(?:group|grp)\\s+\\d{1,2}',
    '(?:group|grp)\\s+[ivx]{1,4}',
    'event\\s+\\d{1,3}',
    '(?:group|league|knockout|final|main|preliminary)\\s+(?:stage|phase|round)',
    '(?:relegation|championship|placement|promotion)\\s+(?:round|group|play[-\\s]?offs?)',
    'regular\\s+season',
    'final\\s+four',
    'grand\\s+finals?',
    'round\\s+of\\s+\\d{1,3}',
    '(?:round|matchday|week|leg|night|day|session)\\s+\\d{1,2}',
    // The edition an esports circuit numbers its runs by: "ESL Pro League
    // Season 23" and "… Season 19" are the same competition a year apart.
    '(?:season|series|division|split|stage|cup)\\s+\\d{1,3}',
    '(?:main|qualifying|qualification)\\s+draw',
    '1/\\d\\s*finals?',
    '(?:quarter|semi)[-\\s]?finals?',
    'finals?',
    'play[-\\s]?(?:offs?|ins?)',
    'qualif(?:ication|ications|ier|iers|ying)',
    'preliminary',
    '3rd\\s+place(?:\\s+(?:match|game))?',
    // Left over once the year in front of it is gone: "LEC 2024 Season".
    'season',
  ].join('|')})$`,
  'i',
);

/** A word left hanging once the stage behind it is gone: "WNBA Including Playoffs". */
const DANGLING = /[\s,]*[-–—:]?\s*\b(?:incl\.?|including|and|with|&)$/i;

/**
 * The draw a tennis event was played in, which one book appends and the other
 * writes differently: "ATP Rome, Italy Men Singles" against "ATP Montreal, Main
 * Draw". The tournament is the same tournament either way. A draw word has to be
 * in the clause, so "NCAA, Women" - a competition of its own - is left whole.
 */
const DRAW = /[\s,]*[-–—:,][^,]*\b(?:singles|doubles|pairs|main\s+draw|qualifying)\b[^,]*$/i;

/**
 * One book writes "UEFA Champions League", the other "Champions League", and
 * they are the same competition; so with "FIFA World Cup Qualification - AFC"
 * against "World Cup Qualification - AFC". Only the two are dropped: the other
 * continents run a Champions League of their own and always write their own name
 * in front of it, so an unprefixed one is Europe's.
 */
const ORGANISER = /^(?:uefa|fifa)\s+/i;

/**
 * A friendly is a friendly. The books word it four ways - "Friendly
 * International Matches", "International Friendlies", "Club Friendlies",
 * "Friendly Club Matches 2026 (Possible Format Change)" - so read as written one
 * thing is four rows of a season each. Clubs stay apart from countries, and the
 * women's from the men's: those are not the same bet.
 */
const FRIENDLY = /\bfriendl(?:y|ies)\b/i;
const CLUB = /\bclubs?\b/i;
const WOMEN = /\b(?:women|women's|ladies)\b/i;

/**
 * Tennis is a circuit, not a league: every week is a new town and every rung its
 * own tier, so read as written one season is eighty rows of one bet. The tour is
 * what was bet on - a Challenger in Bordeaux and an ITF W15 in Koper are both a
 * week on the same circuit, and the row only says something once they are one.
 */
const CIRCUIT = /^(atp|wta|itf|utr)\b/i;

/**
 * The tournaments a circuit does not swallow: a major is the event of the season
 * and worth a row of its own. Both draws are the same fortnight, so the men's and
 * the women's are one row - as are the words each book ends them with,
 * "Gentlemen" here and "Ladies" or "Women" there.
 */
const MAJORS: Readonly<Record<string, string>> = {
  'australian open': 'Australian Open',
  'french open': 'French Open',
  'roland garros': 'French Open',
  wimbledon: 'Wimbledon',
  'us open': 'US Open',
};

const MAJOR = new RegExp(`^(${Object.keys(MAJORS).join('|')})\\b`, 'i');

/**
 * A Major is the event of the season whoever runs it, and there are two a year:
 * read as its own name each is a row of a dozen bets against a different city,
 * where what the reader wants is how they do when the stakes are highest.
 * "Major League Soccer" is a league, not a major, and says so in the next word.
 */
const ESPORTS_MAJOR = /\bmajor\b(?!\s+league)/i;

/**
 * Esports is run as circuits too, and harder: an organiser stages a dozen events
 * a year, each in a new city under a new sponsor, and read as written a season is
 * sixty rows of one bet. What was bet on is the circuit - an IEM is an IEM
 * whether it was played in Dallas or in Rio.
 */
const SERIES: readonly (readonly [RegExp, string])[] = [
  [/^esl\s+pro\s+league\b/i, 'ESL Pro League'],
  [/^esl\s+challenger\s+league\b/i, 'ESL Challenger League'],
  [/^esl\s+challenger\b/i, 'ESL Challenger'],
  [/^(?:iem|intel\s+extreme\s+masters)\b/i, 'IEM'],
  [/^blast\b/i, 'BLAST'],
  [/^pgl\b/i, 'PGL'],
  [/^cct\b/i, 'CCT'],
  [/^res\b/i, 'RES'],
  [/^european\s+pro\s+league\b/i, 'European Pro League'],
  [/^skyesports\b/i, 'Skyesports'],
  [/^cbcs\b/i, 'CBCS'],
  [/^united21\b/i, 'United21'],
  [/^elisa\b/i, 'Elisa'],
  [/^(?:thunderpick|tp)\s+world\s+championship\b/i, 'Thunderpick World Championship'],
  [/^fissure\b/i, 'FISSURE'],
  // Skiing is a circuit too: a weekend on a named hill, thirty of them a winter.
  [/^fis(?:[-\s]ski)?\b/i, 'FIS World Cup'],
];

export const canonicalLeague = (league: string | null): string | null => {
  if (league === null) return null;
  const read = league.trim().replace(/\s+/g, ' ').replace(ORGANISER, '');
  if (read === '') return null;

  if (FRIENDLY.test(read)) {
    const side = CLUB.test(read) ? 'Club' : 'International';
    return `${side} Friendlies${WOMEN.test(read) ? ' Women' : ''}`;
  }

  const slam = MAJOR.exec(read);
  if (slam !== null) return MAJORS[slam[1]!.toLowerCase()]!;

  const circuit = CIRCUIT.exec(read);
  if (circuit !== null) return circuit[1]!.toUpperCase();

  if (ESPORTS_MAJOR.test(read)) return 'Major';

  const series = SERIES.find(([named]) => named.test(read));
  if (series !== undefined) return series[1];

  // A book prints a season and a stage in either order, and sometimes both.
  let name = read;
  for (;;) {
    const shorter = name
      .replace(CLOCK, '')
      .replace(INNER_SEASON, '')
      .replace(SEASON, '')
      .replace(STAGE, '')
      .replace(DRAW, '')
      .replace(DANGLING, '')
      .trim();
    // A league named only by its stage or its year ("Round of 16", "2026") keeps
    // that name - stripping it would leave nothing to read.
    if (shorter === '' || shorter === name) return name;
    name = shorter;
  }
};
