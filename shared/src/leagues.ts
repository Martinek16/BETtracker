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

/** A trailing season, however the book writes it: 2025/2026, 2025/26, 25/26, 2025. */
const SEASON = /[\s,]*[-–—]?\s*(?:season\s*)?(?:\d{4}\/\d{2,4}|\d{2}\/\d{2}|\d{4})$/i;

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
    '(?:group|league|knockout|final|main|preliminary)\\s+(?:stage|phase|round)',
    '(?:relegation|championship|placement|promotion)\\s+(?:round|group|play[-\\s]?offs?)',
    'regular\\s+season',
    'final\\s+four',
    'grand\\s+finals?',
    'round\\s+of\\s+\\d{1,3}',
    '(?:round|matchday|week|leg|night|day|session)\\s+\\d{1,2}',
    '(?:main|qualifying|qualification)\\s+draw',
    '1/\\d\\s*finals?',
    '(?:quarter|semi)[-\\s]?finals?',
    'finals?',
    'play[-\\s]?(?:offs?|ins?)',
    'qualif(?:ication|ications|ier|iers|ying)',
    'preliminary',
    '3rd\\s+place(?:\\s+(?:match|game))?',
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
const DRAW = /[\s,]*[-–—:,][^,]*\b(?:singles|doubles|main\s+draw|qualifying)\b[^,]*$/i;

/**
 * One book writes "UEFA Champions League", the other "Champions League", and
 * they are the same competition. Only UEFA is dropped: the other continents run
 * a Champions League of their own and always write their own name in front of
 * it, so an unprefixed one is Europe's.
 */
const ORGANISER = /^uefa\s+/i;

/**
 * Tennis is a circuit, not a league: every week is a new town, so read as written
 * one season is eighty rows of one bet. The tour and its tier are the thing that
 * was bet on - "ATP Challenger Bordeaux" and "ATP Challenger Tunis" are the same
 * class of event, "ITF M15 Koper" and "ITF M15 Maringa" the same rung of it.
 */
const CIRCUIT = /^(atp|wta|itf)(?:\s+(challenger|[mw]\d{2,3}))?\b/i;

const circuitOf = (name: string): string | null => {
  const hit = CIRCUIT.exec(name);
  if (hit === null) return null;
  const tour = hit[1]!.toUpperCase();
  const tier = hit[2];
  if (tier === undefined) return tour;
  const rung = /^\d/.test(tier.slice(1)) ? tier.toUpperCase() : 'Challenger';
  return `${tour} ${rung}`;
};

export const canonicalLeague = (league: string | null): string | null => {
  if (league === null) return null;
  const read = league.trim().replace(/\s+/g, ' ').replace(ORGANISER, '');
  if (read === '') return null;

  const circuit = circuitOf(read);
  if (circuit !== null) return circuit;

  // A book prints a season and a stage in either order, and sometimes both.
  let name = read;
  for (;;) {
    const shorter = name
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
