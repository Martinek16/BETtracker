import { describe, expect, it } from 'vitest';
import { CAPTURE_RULES, bookmakerForHost, bookmakerForRequests, sitePatternFor } from './capture';

describe('sitePatternFor', () => {
  it('asks for the site, not the one address the user happens to be on', () => {
    // The regression this exists for: a grant for www. alone left the sportsbook
    // frames on the site's other subdomains unwatched, so a signed-in account
    // read as signed out.
    expect(sitePatternFor('www.bet-at-home.com')).toBe('https://*.bet-at-home.com/*');
    expect(sitePatternFor('sports.bet-at-home.com')).toBe('https://*.bet-at-home.com/*');
    expect(sitePatternFor('stake.com')).toBe('https://*.stake.com/*');
    expect(sitePatternFor('bah24.si')).toBe('https://*.bah24.si/*');
  });
});

describe('bookmakerForRequests', () => {
  it('names a mirror no rule lists, from the API the page calls', () => {
    // An address no pattern of ours anticipated, running the same EveryMatrix
    // sportsbook - which it says itself on every request it makes.
    expect(bookmakerForHost('www.spela-tukaj7.net')).toBeNull();
    expect(
      bookmakerForRequests([
        'https://www.spela-tukaj7.net/static/app.js',
        'https://sports-api.everymatrix.com/v1/bets-api/v1/12/open-bets',
      ]),
    ).toBe('bet-at-home');
  });

  it('names a Stake mirror from its one endpoint', () => {
    expect(bookmakerForRequests(['https://stake9999.com/_api/graphql'])).toBe('stake');
  });

  it('stays silent on a page that is neither', () => {
    expect(bookmakerForRequests(['https://example.com/index.js'])).toBeNull();
    expect(bookmakerForRequests([])).toBeNull();
  });
});

/**
 * Both lookups take the first rule that matches, so two rules answering to the
 * same pattern is not a tie - it is the older site silently claiming the newer
 * one's pages, its popup card and the session signed in there. The way it
 * happens is a folder scaffolded from another and shipped before its patterns
 * were rewritten.
 */
describe('one pattern, one bookmaker', () => {
  it.each(['host', 'fingerprint'])('never lets two sites share a %s', (key) => {
    const seen = new Map<string, string>();
    for (const rule of CAPTURE_RULES) {
      const pattern = rule[key as 'host' | 'fingerprint'].source;
      expect(
        seen.get(pattern),
        `${rule.bookmaker} and ${seen.get(pattern)} share a ${key}: ${pattern}`,
      ).toBeUndefined();
      seen.set(pattern, rule.bookmaker);
    }
  });
});

describe('stake activity', () => {
  const url = 'https://stake.com/_api/graphql';
  const stake = CAPTURE_RULES.find((r) => r.bookmaker === 'stake');
  const acted = (body: unknown): boolean => stake?.activity?.(url, JSON.stringify(body)) === true;

  it('reads a placed bet, a cashout and a withdrawal as the account changing', () => {
    expect(acted({ operationName: 'SportsBetPlace', query: 'mutation SportsBetPlace { x }' })).toBe(
      true,
    );
    expect(acted({ operationName: 'CashoutBet', query: 'mutation CashoutBet { x }' })).toBe(true);
    expect(
      acted({ operationName: 'CreateWithdrawal', query: 'mutation CreateWithdrawal { x }' }),
    ).toBe(true);
  });

  it('ignores browsing, which is every query and the mutations that touch no money', () => {
    // The one that mattered: the page asks for the user's own bet list constantly
    // while it is open, and treating that as a change would re-read on every beat.
    expect(acted({ operationName: 'UserBets', query: 'query UserBets { x }' })).toBe(false);
    expect(acted({ operationName: 'UpdateLanguage', query: 'mutation UpdateLanguage { x }' })).toBe(
      false,
    );
  });

  it('says no rather than throwing on a body that is not the site talking', () => {
    expect(stake?.activity?.(url, 'not json')).toBe(false);
    expect(stake?.activity?.('https://stake.com/casino', '{}')).toBe(false);
  });
});
