/**
 * One suite every bookmaker is held to, so a second site cannot be "supported"
 * while quietly producing records the rest of the app has to special-case.
 *
 * Every case below is parsed from a payload recorded off the live site (the HARs
 * in `doc/`), not from something written to make the parser pass. The invariants
 * are the ones the dashboard, the totals and the database all assume: an id no
 * other site can claim, money that is a number, a status that agrees with the
 * payout, and legs that match the bet type.
 *
 * Adding a bookmaker: add a case. Nothing else here changes.
 */

import { describe, expect, it } from 'vitest';
import type { AccountRef, Bet, Bookmaker } from '@betanal/shared';
import bahSettledFixture from './bet-at-home/__fixtures__/settled-bets.json';
import bahOpenFixture from './bet-at-home/__fixtures__/open-bets.json';
import stakeBetsFixture from './stake/__fixtures__/bets.json';
import stakeWalletFixture from './stake/__fixtures__/wallet.json';
import { betAtHome, parseSettled } from './bet-at-home/adapter';
import { normalizeBet as normalizeStakeBet, parseBalance } from './stake/adapter';
import { CAPTURE_RULES } from './capture';
import { adapters } from './registry';

const ref = (bookmaker: Bookmaker): AccountRef => ({ bookmaker, accountId: 'acc-1' });

interface Case {
  name: Bookmaker;
  settled: Bet[];
  open: Bet[];
}

const CASES: Case[] = [
  {
    name: 'bet-at-home',
    settled: parseSettled(bahSettledFixture, 'acc-1').bets,
    open: betAtHome.parseOpen(bahOpenFixture, ref('bet-at-home')),
  },
  {
    name: 'stake',
    settled: stakeBetsFixture.data.user.sportBetList.flatMap(
      (entry) => normalizeStakeBet(entry.bet, 'acc-1') ?? [],
    ),
    // Stake answers its open bets over GraphQL, which the page-side bridge cannot
    // recognise by URL, so there is no recorded payload to parse. The normalizer
    // is the same one the settled bets above go through.
    open: [],
  },
];

const SETTLED_STATUSES = ['won', 'lost', 'void', 'cashed_out'];

describe.each(CASES)('$name records', ({ name, settled, open }) => {
  const all = [...settled, ...open];

  it('parses bets out of the recorded payload at all', () => {
    expect(settled.length).toBeGreaterThan(0);
  });

  it('stamps every bet with its own site and account', () => {
    for (const bet of all) {
      expect(bet.bookmaker).toBe(name);
      expect(bet.accountId).toBe('acc-1');
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
    const account = ref(adapter.id);
    expect(adapter.parseOpen(null, account)).toEqual([]);
    expect(adapter.parseOpen({}, account)).toEqual([]);
    expect(adapter.parseOpen([{ nonsense: true }], account)).toEqual([]);
  });

  it('names itself for the popup and the account pages', () => {
    expect(adapter.name.length).toBeGreaterThan(0);
    expect(adapter.id.length).toBeGreaterThan(0);
  });
});

/**
 * Stake keeps a wallet per coin, so its balance is the one place a bookmaker's
 * own figures are combined by us rather than by the site. The fixture is the
 * real 174-coin answer, of which four were actually held.
 */
describe('stake balance', () => {
  // USD per unit, as Stake's own price list states them.
  const rates = new Map([
    ['BTC', 113_000],
    ['LTC', 110],
    ['SOL', 160],
    ['DOGE', 0.2],
  ]);
  const balance = parseBalance(stakeWalletFixture, rates, ref('stake'));

  it('reports only the coins actually held, richest first', () => {
    expect(balance?.holdings?.map((h) => h.currency)).toEqual(['LTC', 'SOL', 'BTC', 'DOGE']);
  });

  it('leaves the vault out, as the site does in its own header', () => {
    // The fixture's LTC row holds 0.000498… in the vault on top of this.
    expect(balance?.holdings?.[0]?.amount).toBeCloseTo(0.005562004523654822, 18);
  });

  it('adds the holdings up into one figure in one currency', () => {
    const worth =
      0.005562004523654822 * 110 +
      0.0000863500000000128 * 160 +
      2.9233026167339488e-8 * 113_000 +
      7.278615044015169e-9 * 0.2;
    expect(balance?.amount).toBeCloseTo(worth, 4);
    expect(balance?.currency).toBe('USD');
  });

  it('says nothing rather than zero when it cannot price anything', () => {
    expect(parseBalance(stakeWalletFixture, new Map(), ref('stake'))).toBeNull();
    expect(parseBalance(null, rates, ref('stake'))).toBeNull();
  });
});
