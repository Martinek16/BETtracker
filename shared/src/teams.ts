/**
 * Which side a pick backed, read off the event name.
 *
 * Books write the pick as free text: "Aston Villa", "Southampton FC",
 * "Draw or Real Madrid", "Arsenal +1.5", but also "Under 2.5", "Yes", "Draw".
 * Only the ones naming a participant of the event say anything about a team,
 * so the rest return null and drop out of the team view.
 */

/** Club words that one book prints and the other does not. */
const SUFFIXES: ReadonlySet<string> = new Set([
  'fc',
  'afc',
  'cf',
  'cfc',
  'sc',
  'ac',
  'as',
  'sk',
  'bk',
  'fk',
  'if',
  'cd',
  'club',
  'esports',
]);

const SPLIT = /\s+[-–—]\s+|\s+vs\.?\s+/i;

const words = (name: string): string[] =>
  name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w !== '');

/** The name without the club words books disagree on, for display and for matching. */
const trimClubWords = (parts: readonly string[]): string[] => {
  let start = 0;
  let end = parts.length;
  while (start < end && SUFFIXES.has(parts[start]!)) start += 1;
  while (end > start && SUFFIXES.has(parts[end - 1]!)) end -= 1;
  return parts.slice(start, end);
};

const normalize = (name: string): string => trimClubWords(words(name)).join(' ');

/** Same trimming, on the book's own casing, so the row reads as a name. */
const display = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  const trimmed = trimClubWords(parts.map((p) => p.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()));
  if (trimmed.length === 0) return name.trim();
  const first = parts.findIndex(
    (p) => p.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase() === trimmed[0],
  );
  return parts.slice(first, first + trimmed.length).join(' ');
};

/** Whole words only, so "PSV" is found in "PSV and Over 1.5" but never inside
 * another word. */
const holds = (haystack: readonly string[], needle: readonly string[]): boolean =>
  needle.length > 0 &&
  haystack.some((_, at) => needle.every((word, i) => haystack[at + i] === word));

/** Where in the event the backed side stands: 0 is the home side, 1 the away one. */
export const sidePicked = (event: string | null, selection: string | null): number | null => {
  if (event === null || selection === null) return null;
  const sides = event.split(SPLIT).filter((s) => s.trim() !== '');
  if (sides.length < 2) return null;
  const pick = normalize(selection);
  if (pick === '') return null;

  const sideNames = sides
    .map((side, index) => ({ side, index, name: normalize(side) }))
    .filter((s) => s.name !== '');
  const exact = sideNames.find((s) => s.name === pick);
  if (exact !== undefined) return exact.index;
  // "Draw or Real Madrid", "Arsenal +1.5", "PSV and Over 1.5" and "Barcelona"
  // against "FC Barcelona Barcelona" all still name a side.
  const pickWords = pick.split(' ');
  const partial = sideNames.find((s) => {
    const sideWords = s.name.split(' ');
    return holds(pickWords, sideWords) || holds(sideWords, pickWords);
  });
  return partial?.index ?? null;
};

/** The participant this pick backed, or null when the pick names no side. */
export const teamPicked = (event: string | null, selection: string | null): string | null => {
  const at = sidePicked(event, selection);
  if (at === null || event === null) return null;
  const side = event.split(SPLIT).filter((s) => s.trim() !== '')[at];
  return side === undefined ? null : display(side);
};
