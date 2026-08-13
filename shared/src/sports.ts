import type { Bookmaker } from './types';

/**
 * One name per sport, in the words a European book uses.
 *
 * Every bookmaker spells its sport list its own way, so the same game arrives as
 * "Soccer" from one and "Football" from another and splits into two groups that
 * should have been one. The names below are the European English ones, which is
 * how the rest of the app reads.
 *
 * One word is genuinely ambiguous. A book that calls the world game "Soccer"
 * means the American game by "Football"; a book that calls the world game
 * "Football" has no other use for the word. So the book's own vocabulary decides
 * it, and `AMERICAN_NAMING` records which books use the American sense. A book
 * missing from that set — or a name read without knowing the book — takes the
 * European sense, which is what an unlabelled "Football" means nearly everywhere.
 */

/** Books whose sport list says "Soccer", so their "Football" is the gridiron game. */
const AMERICAN_NAMING: ReadonlySet<Bookmaker> = new Set<Bookmaker>(['stake']);

/**
 * Spellings that mean the same sport. Only names our books actually disagree on
 * are listed; anything unlisted is kept exactly as the book wrote it.
 */
const CANONICAL: Readonly<Record<string, string>> = {
  soccer: 'Football',
  football: 'Football',
  'association football': 'Football',
  basket: 'Basketball',
  basketball: 'Basketball',
  'american football': 'American Football',
  americanfootball: 'American Football',
  'us football': 'American Football',
  nfl: 'American Football',
  hockey: 'Ice Hockey',
  'ice hockey': 'Ice Hockey',
  icehockey: 'Ice Hockey',
  'field hockey': 'Field Hockey',
  'table tennis': 'Table Tennis',
  tabletennis: 'Table Tennis',
  'ping pong': 'Table Tennis',
  esport: 'Esports',
  esports: 'Esports',
  'e-sport': 'Esports',
  'e-sports': 'Esports',
  mma: 'MMA',
  ufc: 'MMA',
  'mixed martial arts': 'MMA',
  'motor racing': 'Motorsport',
  motorsport: 'Motorsport',
  motorsports: 'Motorsport',
};

/**
 * The mark a book pins to a video-game league. bet-at-home writes "e: CS2" and
 * "e-Soccer"; Stake files the same leagues under the bare game title. A separator
 * is required, so "Equestrian" is not read as an esport.
 */
const ESPORT_MARK = /^e[\s:._-]+/i;

/**
 * Game titles the two books abbreviate differently. Kept apart rather than
 * merged into one "Esports" row: a CS2 record says nothing about a LoL one.
 */
const TITLES: Readonly<Record<string, string>> = {
  cs2: 'CS2',
  csgo: 'CS2',
  'cs:go': 'CS2',
  'counter-strike': 'CS2',
  'counter strike': 'CS2',
  lol: 'League of Legends',
  'league of legends': 'League of Legends',
  dota: 'Dota 2',
  'dota 2': 'Dota 2',
  valorant: 'Valorant',
  r6: 'Rainbow Six',
  'rainbow six': 'Rainbow Six',
  'mobile legends': 'Mobile Legends',
  'king of glory': 'King of Glory',
  cod: 'Call of Duty',
  'call of duty': 'Call of Duty',
  overwatch: 'Overwatch',
  'rocket league': 'Rocket League',
  crossfire: 'Crossfire',
  starcraft: 'StarCraft',
  'starcraft 2': 'StarCraft',
};

/** True for a video-game league, whichever way the book wrote it. */
export const isEsport = (sport: string | null): boolean => {
  if (sport === null) return false;
  const name = sport.trim().toLowerCase();
  return ESPORT_MARK.test(name) || name in TITLES;
};

/** The sport under its one name; null stays null, an unknown name stays as read. */
export const canonicalSport = (sport: string | null, bookmaker?: Bookmaker): string | null => {
  if (sport === null) return null;
  const read = sport.trim();
  if (read === '') return null;
  const name = read.toLowerCase();

  // A simulated match is not the real sport, so "e-Soccer" keeps its mark and
  // only has it written one way; a game title needs no mark to be itself.
  const marked = ESPORT_MARK.test(name);
  const bare = marked ? name.replace(ESPORT_MARK, '').trim() : name;
  const title = TITLES[bare];
  if (title !== undefined) return title;
  if (marked) {
    const imitated = CANONICAL[bare];
    return imitated === undefined ? read : `e-${imitated}`;
  }

  if (name === 'football' && bookmaker !== undefined && AMERICAN_NAMING.has(bookmaker)) {
    return 'American Football';
  }
  return CANONICAL[name] ?? read;
};
