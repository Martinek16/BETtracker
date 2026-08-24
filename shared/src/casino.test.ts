import { describe, expect, it } from 'vitest';
import {
  casinoByGame,
  casinoCurve,
  casinoNet,
  casinoRoundCurve,
  casinoRoundTotals,
  casinoSessions,
  casinoTotals,
  type CasinoAccountInput,
} from './casino';
import { makeBet } from './__fixtures__/make-bet';
import type { CasinoRound, Transaction } from './types';

const deposit = (amount: number, id: string): Transaction => ({
  id,
  bookmaker: 'stake',
  accountId: 'acc-1',
  kind: 'deposit',
  amount,
  currency: 'EUR',
  occurredAt: '2026-01-01T00:00:00Z',
  note: null,
});

const account = (over: Partial<CasinoAccountInput> = {}): CasinoAccountInput => ({
  bookmaker: 'stake',
  key: 'stake:acc-1',
  hasCasino: true,
  bets: [],
  transactions: [deposit(1000, 't1')],
  bonuses: [],
  balance: 400,
  vault: null,
  wagered: 5000,
  ...over,
});

describe('casinoNet', () => {
  it('has no answer until a balance has been read', () => {
    expect(casinoNet(1000, null, null)).toBeNull();
  });

  it('counts the vault as money the account still holds', () => {
    expect(casinoNet(1000, 400, 200)).toBe(-400);
    expect(casinoNet(1000, 400, null)).toBe(-600);
  });
});

describe('casinoTotals', () => {
  it('reads the wallet gap as what the casino took, and prices it against turnover', () => {
    const totals = casinoTotals([account()]);
    expect(totals.net).toBe(-600);
    expect(totals.wagered).toBe(5000);
    expect(totals.rtp).toBeCloseTo(0.88);
  });

  it('leaves a sportsbook-only account out of the casino, gap and all', () => {
    const totals = casinoTotals([account({ hasCasino: false })]);
    expect(totals.accounts).toEqual([]);
    expect(totals.net).toBeNull();
    expect(totals.shareOfLoss).toBeNull();
  });

  it('says nothing about the return when the site publishes no turnover', () => {
    const totals = casinoTotals([account({ wagered: null })]);
    expect(totals.net).toBe(-600);
    expect(totals.wagered).toBeNull();
    expect(totals.rtp).toBeNull();
  });

  it('splits the loss between the casino and the bets', () => {
    const totals = casinoTotals([
      account({
        bets: [makeBet({ status: 'lost', stake: 200, actualReturn: 0 })],
        balance: 600,
      }),
    ]);
    // 1000 in, 200 lost on slips, 600 left: the casino took the other 200.
    expect(totals.betResult).toBe(-200);
    expect(totals.net).toBe(-200);
    expect(totals.shareOfLoss).toBe(0.5);
  });

  it('counts the bets of every account but the casino of only some', () => {
    const totals = casinoTotals([
      account(),
      account({
        bookmaker: 'bet-at-home',
        key: 'bet-at-home:acc-2',
        hasCasino: false,
        transactions: [],
        bets: [makeBet({ status: 'lost', stake: 50, actualReturn: 0 })],
        balance: null,
        wagered: null,
      }),
    ]);
    expect(totals.accounts).toHaveLength(1);
    expect(totals.betResult).toBe(-50);
    expect(totals.net).toBe(-600);
  });

  it('has no share to report when nothing was lost', () => {
    const totals = casinoTotals([account({ balance: 1200, wagered: 100 })]);
    expect(totals.net).toBe(200);
    expect(totals.shareOfLoss).toBeNull();
  });
});

describe('casinoCurve', () => {
  const txs = [deposit(1000, 't1')];

  it('reads each balance reading as the casino result up to that moment', () => {
    const curve = casinoCurve(
      [
        { at: '2026-02-01T00:00:00Z', held: 900, wagered: 500 },
        { at: '2026-03-01T00:00:00Z', held: 700, wagered: 1200 },
      ],
      [],
      txs,
      [],
    );
    expect(curve.map((p) => p.cumulative)).toEqual([-100, -300]);
    expect(curve.map((p) => p.profit)).toEqual([-100, -200]);
    // The first reading has nothing to be a step from, so its turnover is unknown.
    expect(curve.map((p) => p.wagered)).toEqual([null, 700]);
  });

  it('reads a slip that settled later as open then, not as money already won', () => {
    const bet = makeBet({
      placedAt: '2026-01-15T00:00:00Z',
      settledAt: '2026-02-15T00:00:00Z',
      status: 'won',
      stake: 100,
      actualReturn: 300,
    });
    const curve = casinoCurve(
      [{ at: '2026-02-01T00:00:00Z', held: 900, wagered: null }],
      [bet],
      txs,
      [],
    );
    expect(curve[0]?.cumulative).toBe(0);
  });

  it('puts the readings in order whatever order they were stored in', () => {
    const curve = casinoCurve(
      [
        { at: '2026-03-01T00:00:00Z', held: 700, wagered: null },
        { at: '2026-02-01T00:00:00Z', held: 900, wagered: null },
      ],
      [],
      txs,
      [],
    );
    expect(curve.map((p) => p.date)).toEqual(['2026-02-01T00:00:00Z', '2026-03-01T00:00:00Z']);
  });
});

const round = (over: Partial<CasinoRound> = {}): CasinoRound => ({
  id: 'r1',
  bookmaker: 'stake',
  accountId: 'acc-1',
  playedAt: '2026-02-01T20:00:00Z',
  game: 'Crash',
  gameSlug: 'crash',
  kind: 'originals',
  provider: null,
  stake: 10,
  payout: 12,
  multiplier: 1.2,
  currency: 'EUR',
  ...over,
});

describe('casinoRoundTotals', () => {
  it('adds the rounds up and prices what came back against what went in', () => {
    const totals = casinoRoundTotals([
      round(),
      round({ id: 'r2', stake: 10, payout: 0 }),
      round({ id: 'r3', stake: 30, payout: 60 }),
    ]);
    expect(totals.rounds).toBe(3);
    expect(totals.staked).toBe(50);
    expect(totals.returned).toBe(72);
    expect(totals.net).toBe(22);
    expect(totals.rtp).toBeCloseTo(1.44);
    expect(totals.bestRound?.id).toBe('r3');
    expect(totals.worstRound?.id).toBe('r2');
  });

  it('has no return to report before a single round was played', () => {
    expect(casinoRoundTotals([]).rtp).toBeNull();
    expect(casinoRoundTotals([]).bestRound).toBeNull();
  });
});

describe('casinoByGame', () => {
  it('puts the game the most money went through first', () => {
    const rows = casinoByGame([
      round({ id: 'a', game: 'Crash', stake: 10, payout: 0 }),
      round({ id: 'b', game: 'Sweet Bonanza', kind: 'slots', stake: 40, payout: 30 }),
      round({ id: 'c', game: 'Sweet Bonanza', kind: 'slots', stake: 10, payout: 0 }),
    ]);
    expect(rows.map((r) => r.label)).toEqual(['Sweet Bonanza', 'Crash']);
    expect(rows[0]?.rounds).toBe(2);
    expect(rows[0]?.net).toBe(-20);
    expect(rows[0]?.share).toBeCloseTo(50 / 60);
    expect(rows[0]?.kind).toBe('slots');
  });
});

describe('casinoSessions', () => {
  it('cuts a sitting where the player walked away for long enough', () => {
    const sessions = casinoSessions([
      round({ id: 'a', playedAt: '2026-02-01T20:00:00Z' }),
      round({ id: 'b', playedAt: '2026-02-01T20:10:00Z' }),
      round({ id: 'c', playedAt: '2026-02-01T23:00:00Z' }),
    ]);
    // Newest sitting first, like every other list in the app.
    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.totals.rounds).toBe(1);
    expect(sessions[1]?.startedAt).toBe('2026-02-01T20:00:00Z');
    expect(sessions[1]?.endedAt).toBe('2026-02-01T20:10:00Z');
  });

  it('keeps one long sitting together whatever order the rounds arrived in', () => {
    const sessions = casinoSessions([
      round({ id: 'b', playedAt: '2026-02-01T20:20:00Z' }),
      round({ id: 'a', playedAt: '2026-02-01T20:00:00Z' }),
    ]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.games).toEqual(['Crash']);
  });
});

describe('casinoRoundCurve', () => {
  it('runs the result up round by round, oldest first', () => {
    const curve = casinoRoundCurve([
      round({ id: 'b', playedAt: '2026-02-02T20:00:00Z', stake: 10, payout: 0 }),
      round({ id: 'a', playedAt: '2026-02-01T20:00:00Z', stake: 10, payout: 30 }),
    ]);
    expect(curve.map((p) => p.betId)).toEqual(['a', 'b']);
    expect(curve.map((p) => p.cumulative)).toEqual([20, 10]);
    expect(curve.map((p) => p.profit)).toEqual([20, -10]);
  });
});
