import { describe, expect, it } from 'vitest';
import { needsAdapterUpdate, readList, ShapeChangedError } from './shape';
import { parseBetPage } from './stake/adapter';
import { parseSettled } from './bet-at-home/adapter';
import stakeFixture from './stake/__fixtures__/bets.json';
import bahFixture from './bet-at-home/__fixtures__/settled-bets.json';

/** A row `parseOne` can read, and one it cannot. */
const readable = (item: unknown): { id: string } | null =>
  typeof (item as { id?: unknown })?.id === 'string' ? { id: (item as { id: string }).id } : null;

describe('readList', () => {
  it('reads the rows it recognises and counts the ones it does not', () => {
    const { parsed, skipped } = readList(
      'stake',
      'bet list',
      [{ id: 'a' }, {}, { id: 'b' }],
      readable,
    );
    expect(parsed).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(skipped).toBe(1);
  });

  it('lets an empty list through, because that is the end of a history', () => {
    expect(readList('stake', 'bet list', [], readable)).toEqual({ parsed: [], skipped: 0 });
  });

  /**
   * The whole point. Each of these used to come back as a clean page of no bets,
   * which the paging loops read as "you have no older history" - so the walk
   * stopped, the run reported success, and the totals froze where they were.
   */
  it.each([
    ['nothing at all', undefined],
    ['null', null],
    ['a renamed envelope', { results: [{ id: 'a' }] }],
    ['a bare object', {}],
    ['a string', 'no bets for you'],
  ])('refuses to read %s as an empty history', (_name, answer) => {
    expect(() => readList('stake', 'bet list', answer, readable)).toThrow(ShapeChangedError);
  });

  it('refuses a full page it could not read one field out of', () => {
    expect(() => readList('stake', 'bet list', [{}, {}, {}], readable)).toThrow(ShapeChangedError);
  });

  it('says which bookmaker and which part of the answer moved', () => {
    const err = (() => {
      try {
        readList('bet-at-home', 'bet list', null, readable);
        return null;
      } catch (e) {
        return e as ShapeChangedError;
      }
    })();
    expect(err?.bookmaker).toBe('bet-at-home');
    expect(err?.what).toBe('bet list');
    expect(err?.message).toContain('bet-at-home');
    expect(needsAdapterUpdate(err?.message)).toBe(true);
  });

  it('does not mistake the other reasons an account fails for a stale adapter', () => {
    expect(needsAdapterUpdate('Session expired (HTTP 401)')).toBe(false);
    expect(needsAdapterUpdate('HTTP 429 for /_api/graphql: too many requests')).toBe(false);
    expect(needsAdapterUpdate(null)).toBe(false);
    expect(needsAdapterUpdate(undefined)).toBe(false);
  });
});

/**
 * The same two answers against the real adapters: the recording the folder was
 * written from still parses, and the site quietly renaming the list it lives in
 * is an error rather than a silent zero.
 */
describe('adapters refuse an answer they no longer recognise', () => {
  it('stake reads its fixture and rejects a moved bet list', () => {
    expect(parseBetPage(stakeFixture.data, 'acc-1').bets.length).toBeGreaterThan(0);

    expect(() => parseBetPage({ user: {} }, 'acc-1')).toThrow(ShapeChangedError);
    expect(() => parseBetPage({ user: { sportBetHistory: [] } }, 'acc-1')).toThrow(
      ShapeChangedError,
    );
    // Signed in, list intact, every row emptied out - still not zero bets.
    expect(() => parseBetPage({ user: { sportBetList: [{ bet: {} }] } }, 'acc-1')).toThrow(
      ShapeChangedError,
    );
    // An empty list is the end of the history and has to stay readable.
    expect(parseBetPage({ user: { sportBetList: [] } }, 'acc-1').bets).toEqual([]);
  });

  it('bet-at-home reads its fixture and rejects a moved bet list', () => {
    expect(parseSettled(bahFixture, 'acc-1').bets.length).toBeGreaterThan(0);

    expect(() => parseSettled({ results: [] }, 'acc-1')).toThrow(ShapeChangedError);
    expect(() => parseSettled(null, 'acc-1')).toThrow(ShapeChangedError);
    expect(() => parseSettled([{ wrong: true }], 'acc-1')).toThrow(ShapeChangedError);
    expect(parseSettled([], 'acc-1').bets).toEqual([]);
  });
});
