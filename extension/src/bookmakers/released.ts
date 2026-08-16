/**
 * The bookmakers the published extension ships with.
 *
 * A site added to a copy of the project is in `CATALOG` but not here, and the
 * app says as much rather than letting it pass for one that has been through
 * review. The difference is real: a released site has been read by somebody
 * other than its author, and an added one has been read by nobody.
 *
 * A pull request that adds a bookmaker leaves this file alone - and cannot do
 * otherwise, since it is outside the paths a contribution may touch. Only a
 * release adds a line here, when the site actually goes out to everyone.
 */

import type { Bookmaker } from '@betanal/shared';

export const RELEASED: readonly Bookmaker[] = ['bet-at-home', 'stake'];

/** Whether this build got the bookmaker from a release or from its own source. */
export const isReleased = (bookmaker: Bookmaker): boolean => RELEASED.includes(bookmaker);
