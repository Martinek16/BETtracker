/**
 * One suite every bookmaker is held to, so a second site cannot be "supported"
 * while quietly producing records the rest of the app has to special-case.
 *
 * Every case is parsed from a payload recorded off the live site, not from
 * something written to make the parser pass. The invariants are the ones the
 * dashboard, the totals and the database all assume: an id no other site can
 * claim, money that is a number, a status that agrees with the payout, and legs
 * that match the bet type.
 *
 * Nothing here names a bookmaker. The folders are found on disk and each hands
 * over its own parsed output through `samples.ts`, so adding a site never means
 * editing this file — which is just as well, because contributors are not
 * allowed to. An invariant weakened here would be weakened for every site.
 */

import { describe, expect, it } from 'vitest';
import type { Bet } from '@betanal/shared';
import { SAMPLE_ACCOUNT_ID, type Samples } from './samples';
import { CAPTURE_RULES } from './capture';
import { adapters } from './registry';

/** Every `<bookmaker>/samples.ts` that exists, keyed by the folder it is in. */
const modules = import.meta.glob<{ samples: Samples }>('./*/samples.ts', { eager: true });

const CASES = Object.entries(modules).map(([path, module]) => ({
  name: path.split('/')[1] as string,
  ...module.samples,
}));

it('found the bookmakers at all, so an empty tree cannot pass silently', () => {
  expect(CASES.length).toBeGreaterThan(0);
});

const SETTLED_STATUSES = ['won', 'lost', 'void', 'cashed_out'];

describe.each(CASES)('$name records', ({ name, settled, open }) => {
  const all = [...settled, ...open];

  it('parses bets out of the recorded payload at all', () => {
    expect(settled.length).toBeGreaterThan(0);
  });

  it('stamps every bet with its own site and account', () => {
    for (const bet of all) {
      expect(bet.bookmaker).toBe(name);
      expect(bet.accountId).toBe(SAMPLE_ACCOUNT_ID);
      expect(bet.betId.length).toBeGreaterThan(0);
    }
  });

  it('never repeats an id, which would make one bet overwrite another', () => {
    expect(new Set(all.map((b) => b.betId)).size).toBe(all.length);
  });

  it('dates every bet, and settles only what has a result', () => {
    for (const bet of all) {
      expect(Number.isNaN(Date.parse(bet.placedAt))).toBe(false);
      if (bet.status === 'pending') expect(bet.settledAt).toBeNull();
      else if (bet.settledAt !== null) {
        expect(Number.isNaN(Date.parse(bet.settledAt))).toBe(false);
        expect(bet.settledAt >= bet.placedAt).toBe(true);
      }
    }
  });

  it('keeps every figure a real number in a named currency', () => {
    for (const bet of all) {
      for (const value of [bet.stake, bet.odds, bet.potentialReturn, bet.actualReturn]) {
        expect(Number.isFinite(value)).toBe(true);
      }
      expect(bet.stake).toBeGreaterThan(0);
      // A slip whose every leg voided prices at 1.0, so this is not `> 1`.
      expect(bet.odds).toBeGreaterThanOrEqual(1);
      expect(bet.actualReturn).toBeGreaterThanOrEqual(0);
      expect(bet.currency).toMatch(/^[A-Z]{3,5}$/);
    }
  });

  it('matches the leg count to the bet type', () => {
    for (const bet of all) {
      expect(bet.legs.length).toBeGreaterThan(0);
      if (bet.betType === 'single') expect(bet.legs.length).toBe(1);
      else expect(bet.legs.length).toBeGreaterThan(1);
    }
  });

  it('agrees with itself about how the bet went', () => {
    for (const bet of all) {
      if (bet.status === 'won') expect(bet.actualReturn).toBeGreaterThan(0);
      if (bet.status === 'lost') expect(bet.actualReturn).toBe(0);
      if (bet.status === 'pending') expect(bet.actualReturn).toBe(0);
    }
  });

  it('reads an open slip as open, whatever the site calls it', () => {
    for (const bet of open) {
      expect(bet.status).toBe('pending');
      expect(bet.settledAt).toBeNull();
    }
    for (const bet of settled) {
      expect(SETTLED_STATUSES).toContain(bet.status);
    }
  });

  /**
   * The failure this catches is the quiet one: everything parses, the sync
   * reports success, the totals are right — and every breakdown card is a list
   * of blanks, because the fields the dashboard groups by came through null.
   *
   * `sport`, `league`, `event`, `marketType` and `selection` are all nullable on
   * `Bet`, since a site is allowed not to report one. A site that reports none
   * of them has not really been read, it has only been counted.
   */
  it('fills the fields the dashboard groups by, or the views come out blank', () => {
    const named = (field: keyof Bet): number =>
      all.filter((bet) => typeof bet[field] === 'string' && bet[field] !== '').length;

    for (const field of ['sport', 'event', 'selection'] as const) {
      expect(
        named(field),
        `no bet carries a ${field}; the dashboard would show an empty breakdown`,
      ).toBeGreaterThan(0);
    }
    // League and market are genuinely absent at some sites, so they are only
    // required to be present somewhere rather than on every bet.
    expect(named('league') + named('marketType')).toBeGreaterThan(0);
  });

  it('describes each leg, so an accumulator is more than a row of blanks', () => {
    for (const bet of all) {
      for (const leg of bet.legs) {
        expect(typeof leg.selection === 'string' && leg.selection !== '').toBe(true);
        expect(typeof leg.event === 'string' && leg.event !== '').toBe(true);
      }
    }
  });
});

/**
 * The database keys bets on `betId` alone, with no bookmaker in the key, so an
 * id one site happens to share with another would silently overwrite a bet.
 */
it('never lets two sites claim the same id', () => {
  const ids = CASES.flatMap((c) => [...c.settled, ...c.open]).map((b) => b.betId);
  expect(new Set(ids).size).toBe(ids.length);
});

/**
 * The surface every adapter has to answer for, whether or not the site happens
 * to expose the data behind it. These are the calls the background worker makes
 * without knowing which bookmaker it is talking to.
 */
describe.each(adapters())('$name adapter surface', (adapter) => {
  it('is reachable from a capture rule, or nothing would ever authenticate it', () => {
    expect(CAPTURE_RULES.some((rule) => rule.bookmaker === adapter.id)).toBe(true);
  });

  it('answers a junk open-bets body with nothing rather than throwing', () => {
    const account = { bookmaker: adapter.id, accountId: SAMPLE_ACCOUNT_ID };
    expect(adapter.parseOpen(null, account)).toEqual([]);
    expect(adapter.parseOpen({}, account)).toEqual([]);
    expect(adapter.parseOpen([{ nonsense: true }], account)).toEqual([]);
  });

  it('names itself for the popup and the account pages', () => {
    expect(adapter.name.length).toBeGreaterThan(0);
    expect(adapter.id.length).toBeGreaterThan(0);
  });

  it('has a folder handing over parsed samples to be checked against', () => {
    expect(CASES.map((c) => c.name)).toContain(adapter.id);
  });
});
