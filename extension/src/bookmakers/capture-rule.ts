/**
 * The shape every bookmaker's capture rule is written to.
 *
 * Deliberately free of runtime imports: the MAIN-world inject script runs inside
 * the site's own JS context, so anything the rules pull in would reach the
 * *page's* globals rather than ours. Only this file and the rules themselves
 * cross over - the adapters, which are the bulk of a bookmaker, stay out of
 * reach on the background side.
 */

import type { Bookmaker } from '@betanal/shared';

/** Auth values read verbatim off a request the page already made. */
export type CapturedFields = Record<string, string>;

export interface CaptureRule {
  bookmaker: Bookmaker;
  /** Page hostnames served by this bookmaker. */
  host: RegExp;
  /**
   * A request only this bookmaker's site makes. Matched against the URLs a page
   * has already loaded, which is how a mirror nobody has listed is recognised:
   * from what the page does rather than from the address it does it at.
   */
  fingerprint: RegExp;
  /** Auth for the main API, or null when this request isn't it. */
  auth(url: string, header: (name: string) => string | null): CapturedFields | null;
  /** A second, separately-authenticated API, where the site has one. */
  banking?(url: string, header: (name: string) => string | null): CapturedFields | null;
  /** Requests whose response body is worth relaying as the page receives it. */
  openBets?(url: string): boolean;
  /**
   * Whether this request is the user doing something to their money - placing a
   * bet, cashing out, depositing, withdrawing. Only that it happened: the body is
   * read for the name of the operation and nothing else, and no answer is kept.
   *
   * This is for sites that give no other sign. Where the balance is on the page
   * the balance already says it, but a site that draws its balance in a canvas or
   * a web component tells us nothing until we ask, and asking on a timer is both
   * slower and more requests than watching what the user already set off.
   */
  activity?(url: string, body: string): boolean;
  /**
   * Names the operation the page asked for. Only for sites that put it in the
   * body instead of the URL, where the log would otherwise say the same address
   * for every call and never which of the site's queries went unread.
   */
  observe?(url: string, body: string): string | null;
}

/** `https://api.site.com/v1/bets?x=1` as `https://api.site.com`. */
export const baseOf = (url: string): string | null => {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
};
