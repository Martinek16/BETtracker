/**
 * What each bookmaker is called and how it is drawn - the part the dashboard
 * needs and the background worker does not.
 *
 * ── Adding a bookmaker: one import and one array entry below. ──
 *
 * Kept apart from `registry.ts` on purpose: the dashboard shows a bookmaker's
 * name and colour long before anything syncs, and importing the registry to get
 * them would pull every adapter into the dashboard bundle.
 */

import type { Bookmaker } from '@betanal/shared';
import betAtHome from './bet-at-home/bookmaker.json';
import stake from './stake/bookmaker.json';

/** One bookmaker's `bookmaker.json`, as the app reads it. */
export interface BookmakerMeta {
  id: Bookmaker;
  name: string;
  /** The bookmaker's own address, as it would name itself. */
  site: string;
  /** The plate the logo is drawn on, taken from the bookmaker's own icon. */
  brand: string;
  /**
   * The bookmaker's ink, for anything that has to be drawn in its colour - chart
   * lines above all. Deliberately not `brand`: those are a near-white and a
   * near-black plate, which vanish against one theme or the other.
   */
  color: string;
  /**
   * The other addresses the same bookmaker is served from. A numbered mirror is
   * renumbered over time, so it is described rather than listed as a link that
   * would rot.
   */
  mirrors: readonly string[];
  /**
   * The site funds its casino from the same wallet as the sportsbook, so a
   * deposit cannot be told apart and money lost at the tables never appears as
   * a bet. What it swallowed can only be read off what is left over.
   */
  hasCasino?: boolean;
  /**
   * Where the bookmaker keeps the punter's own slips, appended to whichever
   * mirror was reached. Absent when the site has no address for that page worth
   * relying on, which lands the reader on the front page instead.
   */
  betsPath?: string;
  /**
   * Backends the adapter calls that are not the site's own address. Asked for in
   * the same breath as the site itself: the browser grants an origin at a time,
   * and a site whose bets are read from somewhere else answers nothing without
   * both.
   */
  apiHosts?: readonly string[];
}

export const CATALOG: readonly BookmakerMeta[] = [betAtHome, stake];

/** Every bookmaker the build knows about, in the order the app lists them. */
export const BOOKMAKER_IDS: readonly Bookmaker[] = CATALOG.map((meta) => meta.id);

export const metaFor = (bookmaker: Bookmaker): BookmakerMeta | null =>
  CATALOG.find((meta) => meta.id === bookmaker) ?? null;
