/**
 * Markets in families, in the words a bettor uses.
 *
 * Books name a market per line - "Over/Under 2.5", "Over/Under 1.5", "Corners
 * Over/Under 9.5" - so the market list runs to hundreds of rows that each hold
 * a handful of bets. The family is the question that was asked; the line is the
 * detail under it.
 */

import { sidePicked } from './teams';

/** First match wins, so the specific subject (corners, cards) beats the shape
 * of the bet (over/under), which both names carry. */
const FAMILIES: ReadonlyArray<{ label: string; match: readonly string[] }> = [
  { label: 'Combos', match: ['and', '&', 'with'] },
  { label: 'Corners', match: ['corner'] },
  { label: 'Bookings', match: ['card', 'booking'] },
  {
    label: 'Players',
    match: ['player', 'scorer', 'assist', 'shots', 'points', 'rebound'],
  },
  { label: 'Teams', match: ['both teams', 'btts', 'gg/ng', 'team total'] },
  {
    label: 'Scores',
    match: ['correct score', 'clean sheet', 'to score', 'scoring', 'both halves', 'score goal'],
  },
  { label: 'Halves', match: ['half', 'halve', 'period', 'quarter', 'set', 'map', 'inning'] },
  { label: 'Handicap', match: ['handicap', 'asian', 'spread'] },
  { label: 'Goals', match: ['over', 'under', 'total', 'goal'] },
  {
    label: 'Match result',
    match: [
      '1x2',
      'match bet',
      'matchbet',
      'who wins',
      'winner',
      'moneyline',
      'money line',
      'draw no bet',
      'dnb',
      'double chance',
      'to qualify',
      'qualification',
      'to win',
      'head to head',
    ],
  },
];

export const OTHER_MARKETS = 'Other markets';

/** A token starts a word - so "Corners" still matches `corner`, while "Winning
 * margin" is not an innings bet. */
const RULES = FAMILIES.map(({ label, match }) => ({
  label,
  test: new RegExp(`(?:^|\\W)(?:${match.join('|')})`, 'i'),
}));

export const marketFamily = (marketType: string | null): string => {
  if (marketType === null) return OTHER_MARKETS;
  const name = marketType.trim();
  if (name === '') return OTHER_MARKETS;
  return RULES.find((rule) => rule.test.test(name))?.label ?? OTHER_MARKETS;
};

/**
 * The market without whose name it was: books print the participant into it, so
 * "Ferran Torres Shots On Target Over/Under 0.5" and the same bet on anyone else
 * are two rows of one pick each. The bet is the same bet - the name is not part
 * of it.
 */

/** The stat a priced line is on. The name in front of it is a participant. */
const STATS: readonly string[] = [
  'shots on target',
  'shots',
  'hits',
  'assists',
  'rebounds',
  'points',
  'yellow cards',
  'red cards',
  'cards',
  'corner kicks',
  'corners',
  'corner',
  'to score',
  'score',
  'goals',
  'saves',
  'tackles',
  'passes',
  'blocks',
  'steals',
  'strikeouts',
  'runs',
  'sets',
  'games',
  'aces',
];

/** Only a priced line carries a name in front of it; "Correct Score" does not. */
const PRICED_LINE = /\b(over\/under|handicap)\b/i;

/** The score at which the market was opened. "Asian Handicap (0:0) -0.5" is the
 * same handicap as "Asian Handicap -0.5". */
const OPENING_SCORE = /\s*\(\d+\s*:\s*\d+\)/g;

/** One bet, several house styles. Only names that mean exactly the same thing. */
const ALIASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(?:match ?bet|1x2|money ?line)$/i, '1X2'],
  [/^head to head\b/i, 'Head to head'],
  [/^who wins the rest of the match\??$/i, 'Rest of the match'],
  [/^(?:to qualify|qualification)$/i, 'Qualification'],
  [/^(?:draw no bet|dnb)$/i, 'Draw no bet'],
  [/^double chance$/i, 'Double chance'],
  [/^(?:both teams to score|btts|gg\/ng)$/i, 'Both teams to score'],
];

const DRAW = /^(?:draw|tie|x|deuce)$/i;

/**
 * Backing the home side, the draw and the away side are three different bets,
 * and one 1X2 row says nothing about which of them was worth taking. Read off
 * the event, so it holds whichever way round the book prints the fixture.
 */
const matchResult = (event: string | null, selection: string | null): string => {
  if (selection !== null && DRAW.test(selection.trim())) return 'Draw';
  const side = sidePicked(event, selection);
  if (side === 0) return 'Home';
  if (side === 1) return 'Away';
  return '1X2';
};

/** A market that was priced at a number, whatever the book called the number. */
const LINE_MARKET = /\b(over|under|handicap|spread)\b/i;

const HANDICAP = /\b(handicap|spread)\b/i;

/** The words that say which way the line was taken; the direction is read off
 * the selection instead, which is where the book actually records it. */
const LINE_WORDS = /\s*\b(?:over\s*\/\s*under|over|under)\b/gi;

const LINE_NUMBER = /\s*[+-]?\d+(?:\.\d+)?/g;
const SIGNED_LINE = /[+-]\d+(?:\.\d+)?/;
const ANY_LINE = /\d+(?:\.\d+)?/;

/**
 * The sport whose priced lines come from a set small enough to bet twice. A
 * football total runs 0.5–4.5 and the number is the bet; a basketball total runs
 * over fifty values, so keeping it makes fifty rows of one pick each.
 */
const LOW_LINE_SPORT = 'Football';

export const marketLine = (
  marketType: string | null,
  event: string | null,
  selection: string | null = null,
  sport: string | null = null,
): string => {
  if (marketType === null) return 'Unknown';
  let name = marketType.trim().replace(/\s+/g, ' ');
  if (name === '') return 'Unknown';

  // A side of this very match, printed in front of its own market.
  for (const side of (event ?? '').split(/\s+[-–—]\s+/)) {
    const team = side.trim();
    if (team !== '' && name.toLowerCase().startsWith(`${team.toLowerCase()} `)) {
      name = name.slice(team.length + 1);
      break;
    }
  }

  // Whatever is left in front of the stat is a player, who is not the bet.
  const kind = PRICED_LINE.exec(name);
  if (kind !== null && kind.index > 0) {
    const before = name.slice(0, kind.index).toLowerCase();
    let cut: { at: number; length: number } | null = null;
    for (const stat of STATS) {
      const at = before.indexOf(stat);
      if (at < 0) continue;
      if (cut === null || at < cut.at || (at === cut.at && stat.length > cut.length)) {
        cut = { at, length: stat.length };
      }
    }
    if (cut !== null) name = name.slice(cut.at);
  }

  name = name.replace(OPENING_SCORE, '').trim();
  const alias = ALIASES.find(([pattern]) => pattern.test(name));
  if (alias !== undefined) return alias[1] === '1X2' ? matchResult(event, selection) : alias[1];

  name = name.charAt(0).toUpperCase() + name.slice(1);
  if (!LINE_MARKET.test(name)) return name;

  // What was bet is the subject and the direction - "Points Over" - not the
  // number, which the book moves for every fixture.
  const stem = name
    .replace(LINE_WORDS, ' ')
    .replace(LINE_NUMBER, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[&·+-]+$/, '')
    .trim();
  const head = stem === '' ? 'Total' : stem;
  const pick = selection ?? '';

  if (HANDICAP.test(name)) {
    // The market names the line the book opened; the selection names the side
    // that was actually backed, which is the opposite sign half the time.
    const line = SIGNED_LINE.exec(pick)?.[0] ?? SIGNED_LINE.exec(name)?.[0] ?? null;
    if (line === null) return head;
    if (sport === LOW_LINE_SPORT) return `${head} ${line}`;
    return `${head} ${line.startsWith('-') ? '−' : '+'}`;
  }

  const under = /\bunder\b/i.test(pick);
  if (!under && !/\bover\b/i.test(pick)) return head;
  const direction = under ? 'Under' : 'Over';
  // Only the plain match total is kept at its number: a football corners or
  // cards line has as many values as a basketball one.
  if (sport !== LOW_LINE_SPORT || stem !== '') return `${head} ${direction}`;
  const line = ANY_LINE.exec(pick)?.[0] ?? ANY_LINE.exec(name)?.[0];
  return line === undefined ? `${head} ${direction}` : `${head} ${direction} ${line}`;
};
