/**
 * The one failure this project cannot otherwise see.
 *
 * Bookmakers change their API without telling anyone, and every honest shape of
 * that change is quiet. The list of bets moves under a different name, so the
 * adapter looks where it always looked, finds nothing, and reports a clean page
 * of no bets - which is exactly what the end of a history looks like. Or the
 * rows are still there and no longer carry an id, so every one of them is
 * skipped one at a time, each with its own reasonable-looking line in the log.
 * Either way the run succeeds, the account is marked read, and the totals on
 * screen stay frozen at whatever they last were.
 *
 * That is a wrong number nobody has a reason to doubt, and it is the only
 * failure here that matters. The fixtures cannot catch it: they are a copy of
 * how the site answered on the day the folder was written, so they go on
 * passing long after the site has moved on. Only the live answer knows.
 *
 * So the shape is checked where the answer arrives, before anything is parsed
 * out of it, and a mismatch is thrown rather than absorbed. The background run
 * has a branch for an unrecognised error already: it marks the account failed
 * and leaves `lastSyncAt` where it was, so the app says the figures are old
 * rather than presenting stale ones as current. Not updated beats wrongly
 * updated.
 */

import { log } from '@betanal/shared';
import type { Bookmaker } from '@betanal/shared';

/**
 * Carried in every message so the dashboard can tell this apart from the other
 * reasons an account fails - a dead session, a throttle, a site that is down -
 * none of which mean the folder is out of date. A marker in the text and not a
 * status of its own: `SyncMeta` is shared with the popup and the badge, and a
 * new state there would have to be understood by both to say anything here.
 */
export const NEEDS_UPDATE = 'needs an adapter update';

/** What arrived, in the fewest words that still say how it differs. */
const describe = (value: unknown): string => {
  if (value === null) return 'null';
  if (value === undefined) return 'nothing at all';
  if (Array.isArray(value)) return 'a list';
  if (typeof value === 'object') {
    const keys = Object.keys(value as object);
    if (keys.length === 0) return 'an empty object';
    return `an object holding ${keys.slice(0, 6).join(', ')}`;
  }
  return typeof value;
};

export class ShapeChangedError extends Error {
  constructor(
    readonly bookmaker: Bookmaker,
    /** The part of the answer that moved, named as a person would name it. */
    readonly what: string,
    reason: string,
  ) {
    super(
      `${bookmaker} answered with ${reason}, so its ${what} could not be read. The site has changed its API and ${bookmaker} ${NEEDS_UPDATE}.`,
    );
    this.name = 'ShapeChangedError';
  }
}

/** Whether an account's stored `lastError` is one of these, and not something else. */
export const needsAdapterUpdate = (lastError: string | null | undefined): boolean =>
  lastError != null && lastError.includes(NEEDS_UPDATE);

/**
 * Read a list of records out of an API answer, refusing to report success on an
 * answer it did not recognise.
 *
 * `parseOne` returns null for a row it cannot make sense of. One of those is one
 * bet lost and worth a line in the log; a whole page of them is not a run of bad
 * rows, it is the site having moved, and the two have to end differently. An
 * empty list is neither - it is what the end of a history looks like, and every
 * caller here already reads it that way.
 */
export const readList = <T>(
  bookmaker: Bookmaker,
  what: string,
  list: unknown,
  parseOne: (item: unknown) => T | null,
): { parsed: T[]; skipped: number } => {
  if (!Array.isArray(list)) throw new ShapeChangedError(bookmaker, what, describe(list));

  const parsed: T[] = [];
  let skipped = 0;
  for (const item of list) {
    try {
      const one = parseOne(item);
      if (one === null) skipped += 1;
      else parsed.push(one);
    } catch (err) {
      skipped += 1;
      log('warn', bookmaker, `skipped an unreadable row in the ${what}: ${(err as Error).message}`);
    }
  }

  if (parsed.length === 0 && skipped > 0)
    throw new ShapeChangedError(
      bookmaker,
      what,
      `${skipped} ${skipped === 1 ? 'row' : 'rows'} it could not read a single field out of`,
    );

  return { parsed, skipped };
};
