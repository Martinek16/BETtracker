import { DEFAULT_SETTINGS } from '@betanal/shared';
import { useSettings } from '@/data/use-settings';

/**
 * A table this short is read whole, so nothing is held back in it.
 *
 * The threshold answers one question: which of these many rows is worth reading?
 * A dimension with a handful of groups - singles against doubles, Monday against
 * Sunday - is not that question. Every one of its rows is part of the answer, and
 * sinking the quiet one below a line says the reader should skip a row they came
 * to compare.
 */
const CROWD = 15;

/**
 * How big a group must be before it is ranked with the rest, or 0 while the
 * threshold does not apply here. From Settings, where 1 means no threshold.
 *
 * @param rows how many groups the table is about to draw
 * @param exempt true while the reader asked for an order the threshold must not
 * disturb - by size, where the small rows are the point, or by name, where the
 * alphabet is
 */
export const useRankFloor = (rows: number, exempt: boolean): number => {
  const { settings } = useSettings();
  const floor = settings?.minPicks ?? DEFAULT_SETTINGS.minPicks;
  return exempt || floor <= 1 || rows <= CROWD ? 0 : floor;
};

/**
 * How many settled picks a group needs before its figure is read as a pattern
 * rather than a run of luck. One threshold from Settings for every card, so the
 * reader is not told a row is thin on one card and solid on the next.
 */
export const useMinPicks = (): number => {
  const { settings } = useSettings();
  return Math.max(1, settings?.minPicks ?? DEFAULT_SETTINGS.minPicks);
};

export interface HeldBackRow<T> {
  row: T;
  /** Null on a held-back row, which carries no number to be read as a rank. */
  rank: number | null;
  small: boolean;
  /** The first held-back row, which is where the line is drawn. */
  opens: boolean;
}

/**
 * The sorted rows, marked with where the ranked table ends. Held back rather
 * than hidden: a hidden row would lose picks the totals above still count.
 */
export const heldBack = <T>(
  groups: readonly T[],
  sizeOf: (row: T) => number,
  floor: number,
): HeldBackRow<T>[] =>
  groups.map((row, i) => {
    const small = floor !== 0 && sizeOf(row) < floor;
    const previous = groups[i - 1];
    return {
      row,
      rank: small ? null : i + 1,
      small,
      opens: small && (i === 0 || previous === undefined || sizeOf(previous) >= floor),
    };
  });
