import { describe, expect, it } from 'vitest';
import { CAPTURE_RULES, bookmakerForHost, bookmakerForRequests } from './capture';

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
