/**
 * One name per place, across books.
 *
 * Where a competition is played is a thing each book words its own way: the NBA
 * is "United States" at one and "USA" at the other, the Champions League is
 * "Europe" here and "International" there. Read as written, a competition the
 * books agree on ends up holding two places at once and is drawn with neither,
 * which is why so many rows carried no flag.
 */

/** A name reduced to its letters, so spelling and punctuation stop mattering.
 * "And" goes with them: the region table joins Bosnia to Herzegovina with an
 * ampersand and every bookmaker on earth spells the word out. */
const key = (name: string): string =>
  name
    .toLowerCase()
    .replace(/\band\b/g, '')
    .replace(/[^\p{L}]/gu, '');

/**
 * Names the region table does not answer to. The home nations have a flag but
 * no country code of their own; the rest are countries a book still calls by
 * the name they were renamed from, or by an abbreviation.
 */
const ALIASES: Readonly<Record<string, string>> = {
  europe: 'eu',
  europa: 'eu',
  england: 'gb-eng',
  scotland: 'gb-sct',
  wales: 'gb-wls',
  northernireland: 'gb-nir',
  greatbritain: 'gb',
  uk: 'gb',
  usa: 'us',
  unitedstatesofamerica: 'us',
  holland: 'nl',
  turkey: 'tr',
  czechrepublic: 'cz',
  ivorycoast: 'ci',
  capeverde: 'cv',
  swaziland: 'sz',
  macedonia: 'mk',
  southkorea: 'kr',
  northkorea: 'kp',
};

/** The name to write for a code the region table cannot name, or names in a way
 * no bookmaker would: "European Union" is not what a Champions League is in. */
const NAMES: Readonly<Record<string, string>> = {
  eu: 'Europe',
  'gb-eng': 'England',
  'gb-sct': 'Scotland',
  'gb-wls': 'Wales',
  'gb-nir': 'Northern Ireland',
};

let display: Intl.DisplayNames | null = null;
const regionNames = (): Intl.DisplayNames => {
  display ??= new Intl.DisplayNames('en', { type: 'region' });
  return display;
};

let byName: Map<string, string> | null = null;

/** Every region the browser can name, keyed by that name. Built once: the whole
 * two-letter space is 676 lookups, and most of it is not a country at all.
 *
 * A code a country was renamed from carries the same name as the one it became -
 * France answers to both FR and FX - and there is a flag drawn for only one of
 * them, so each is folded onto the code in use today. */
const regions = (): Map<string, string> => {
  if (byName !== null) return byName;
  byName = new Map();
  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const code = String.fromCharCode(first, second);
      const name = regionNames().of(code);
      // An unassigned code is handed back unchanged rather than refused.
      if (name === undefined || name === code) continue;
      byName.set(key(name), (new Intl.Locale(`und-${code}`).region ?? code).toLowerCase());
    }
  }
  return byName;
};

/**
 * The flag code for a place, or null where the name is not a place with a flag
 * of its own - "World", "International" and "Esports" are where a book files a
 * competition belonging to nobody.
 */
export const countryCodeOf = (country: string): string | null => {
  const name = key(country);
  return ALIASES[name] ?? regions().get(name) ?? null;
};

/**
 * Competitions that are Europe's whichever word a book files them under. The
 * name has to say so itself: one book calls the Champions League international,
 * and a Nations League is Europe's in football and the world's in volleyball,
 * so only the ones that name their continent are moved.
 */
const EUROPEAN =
  /\b(?:uefa|euro|euroleague|eurocup|europa league|conference league|european|champions league)\b/i;

/** Where a book files what belongs to nobody. */
const NOWHERE = 'International';

/**
 * Competitions played in the same country every year, for the books that file no
 * country at all. Only events whose ground is the event - a major is its city -
 * so nothing here can be moved by a rescheduling.
 */
const HOME: readonly (readonly [RegExp, string])[] = [
  [/\baustralian open\b/i, 'Australia'],
  [/\b(?:french open|roland[-\s]?garros)\b/i, 'France'],
  [/\bwimbledon\b/i, 'United Kingdom'],
  [/\bus open\b/i, 'United States'],
  [/\bsix kings slam\b/i, 'Saudi Arabia'],
  // An American tour: its stops are American towns and it is run from there.
  [/^utr\b/i, 'United States'],
  // National leagues both books file as international, though every club in
  // them plays in the one country the league is named after.
  [/^w?kbo\b/i, 'South Korea'],
  [/^w?kbl\b/i, 'South Korea'],
  [/\bsetka cup\b/i, 'Ukraine'],
  // Darts is a British circuit: the PDC stages its board in an English hall
  // whatever the event is called, and Modus plays every night in Portsmouth.
  [/^(?:pdc|modus)\b/i, 'United Kingdom'],
];

/**
 * The one name for where a competition is played, or null where nothing places
 * it. `league` is read to place a competition its book left homeless: a name
 * with Europe in it says where it is played whatever the book filed it under,
 * and one book files the Champions League as international.
 */
export const canonicalCountry = (
  country: string | null | undefined,
  league: string | null | undefined,
): string | null => {
  const said = country === null || country === undefined ? '' : country.trim();
  const code = said === '' ? null : countryCodeOf(said);
  if (code !== null) return NAMES[code] ?? regionNames().of(code.toUpperCase()) ?? said;
  if (EUROPEAN.test(league ?? '')) return 'Europe';
  const home = HOME.find(([named]) => named.test(league ?? ''));
  if (home !== undefined) return home[1];
  return said === '' ? null : NOWHERE;
};
