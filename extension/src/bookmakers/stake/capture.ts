/**
 * One GraphQL endpoint for everything, authenticated by a single header. There
 * is no per-operation URL to match on, so the open-bets relay does not apply —
 * the background asks for them itself.
 */

import { baseOf, type CapturedFields, type CaptureRule } from '../capture-rule';

const GRAPHQL = '/_api/graphql';

/**
 * Operation names that mean the account just changed. Matched loosely on purpose:
 * Stake renames its operations without warning, and the cost of a false positive
 * is one re-read that the background debounces anyway, while the cost of a false
 * negative is a bet the user placed not appearing until the next alarm.
 */
const ACTIVITY_RE = /bet|wager|cashout|deposit|withdraw|claim|tip|vault|transfer/i;

export const rule: CaptureRule = {
  bookmaker: 'stake',
  // Stake serves the same site from named mirrors (stake.bet, stake.games…) and
  // from numbered ones (stake1001.com) that rotate.
  host: /(^|\.)(stake\d*\.com|stake\.(bet|games|ac|pet|mba|bz|krd|us|jp|ceo|tr))$/,
  // The whole site is this one endpoint, so any Stake mirror hits it at once.
  fingerprint: /\/_api\/graphql/,

  auth(url, header) {
    if (!url.includes(GRAPHQL)) return null;
    const apiBase = baseOf(url);
    if (apiBase === null) return null;
    // The site authenticates with its session cookie alone — only Stake's own API
    // clients send x-access-token. Demanding the header meant we waited forever
    // for something this page never sends, and the account read as signed out
    // while the user was signed in. The cookie rides along with our own requests
    // (host permission + credentials: 'include'), so the header is taken when it
    // happens to be there and never required.
    const accessToken = header('x-access-token');
    const fields: CapturedFields = { apiBase };
    if (accessToken !== null) fields.accessToken = accessToken;
    return fields;
  },

  // Stake shows the balance in a component we cannot scrape and answers only its
  // own GraphQL endpoint, so a bet placed on the site was invisible to us until
  // the ten-minute alarm came round. The page announces it itself: every such
  // action is a GraphQL *mutation*, and queries — the browsing — are not.
  activity(url, body) {
    if (!url.includes(GRAPHQL)) return false;
    try {
      const { operationName, query } = JSON.parse(body) as {
        operationName?: string;
        query?: string;
      };
      if (typeof query !== 'string' || !/^\s*mutation\b/.test(query)) return false;
      return ACTIVITY_RE.test(operationName ?? query);
    } catch {
      return false;
    }
  },

  observe(url, body) {
    if (!url.includes(GRAPHQL)) return null;
    try {
      const { operationName, query } = JSON.parse(body) as {
        operationName?: string;
        query?: string;
      };
      if (typeof query !== 'string') return null;
      return operationName ?? /query\s+(\w+)/.exec(query)?.[1] ?? 'anonymous';
    } catch {
      return null;
    }
  },
};
