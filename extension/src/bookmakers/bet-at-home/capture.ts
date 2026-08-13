/**
 * Sportsbook is EveryMatrix (header auth, no cookies); deposits and withdrawals
 * sit on a different host with a different session entirely. The site is blocked
 * in several countries and served from numbered mirrors running the same
 * platform, so the hostname alone is never enough to recognise it.
 */

import { baseOf, type CaptureRule } from '../capture-rule';

const EM_API = 'sports-api.everymatrix.com';
const BANKING_HOST = 'nwacdn.com';
const PLAYER_RE = /\/v1\/player\/(\d+)\//;
const OPEN_BETS_RE = /\/bets-api\/v1\/\d+\/open-bets(?!-counter)/;

export const rule: CaptureRule = {
  bookmaker: 'bet-at-home',
  // The numbered mirrors are renumbered over time and appear under country TLDs
  // too (bah24.si), so the number and the suffix are both matched loosely rather
  // than listed. `bookmaker.json` cannot express this and spells out a range.
  host: /(^|\.)(bet-at-home\.[a-z]{2,3}|bah\d+\.[a-z]{2,3})$/,
  // Every mirror runs the same EveryMatrix sportsbook and calls it by name.
  fingerprint: /sports-api\.everymatrix\.com/,

  auth(url, header) {
    if (!url.includes(EM_API)) return null;
    const sessionToken = header('x-session-token');
    const userId = header('x-user-id');
    const operatorId = header('x-operator-id');
    const apiBase = baseOf(url);
    if (!sessionToken || !userId || !operatorId || apiBase === null) return null;
    return { sessionToken, userId, operatorId, apiBase };
  },

  banking(url, header) {
    if (!url.includes(BANKING_HOST)) return null;
    const sessionId = header('x-sessionid');
    const playerId = PLAYER_RE.exec(url)?.[1];
    const apiBase = baseOf(url);
    if (!sessionId || !playerId || apiBase === null) return null;
    return { sessionId, playerId, apiBase };
  },

  openBets: (url) => url.includes(EM_API) && OPEN_BETS_RE.test(url),
};
