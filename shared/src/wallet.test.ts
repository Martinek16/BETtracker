import { describe, expect, it } from 'vitest';
import { makeBet } from './__fixtures__/make-bet';
import type { Bonus, Transaction } from './types';
import { walletLedger } from './wallet';

const move = (kind: Transaction['kind'], amount: number, id: string): Transaction => ({
  id,
  bookmaker: 'bet-at-home',
  accountId: 'acc-1',
  kind,
  amount,
  currency: 'EUR',
  occurredAt: '2026-01-01T00:00:00Z',
  note: null,
});

const bonus = (over: Partial<Bonus> = {}): Bonus => ({
  id: 'b1',
  bookmaker: 'bet-at-home',
  accountId: 'acc-1',
  name: 'Welcome',
  code: null,
  description: null,
  type: 'standard',
  trigger: 'deposit',
  status: 'released',
  grantedAmount: 100,
  currentAmount: 100,
  currency: 'EUR',
  grantedAt: '2026-01-01T00:00:00Z',
  expiresAt: null,
  wageringRequired: 0,
  wageringDone: 0,
  ...over,
});

describe('walletLedger', () => {
  it('adds up to the expected balance and leaves no gap when nothing is missing', () => {
    const bets = [
      makeBet({ status: 'won', stake: 10, actualReturn: 25 }),
      makeBet({ status: 'lost', stake: 20, actualReturn: 0 }),
      makeBet({ status: 'pending', stake: 15, actualReturn: 0 }),
    ];
    const ledger = walletLedger(
      bets,
      [move('deposit', 200, 't1'), move('withdrawal', 50, 't2')],
      [bonus()],
      null,
    );

    expect(ledger.deposits).toBe(200);
    expect(ledger.withdrawals).toBe(50);
    expect(ledger.bonusRealized).toBe(100);
    expect(ledger.betResult).toBe(-5);
    expect(ledger.heldInOpenBets).toBe(15);
    expect(ledger.expected).toBe(230);
    expect(ledger.unexplained).toBeNull();

    expect(
      ledger.deposits +
        ledger.bonusRealized +
        ledger.betResult -
        ledger.withdrawals -
        ledger.heldInOpenBets,
    ).toBe(ledger.expected);
  });

  it('treats a void slip as a refund that weighs nothing', () => {
    const ledger = walletLedger(
      [makeBet({ status: 'void', stake: 40, actualReturn: 40 })],
      [move('deposit', 100, 't1')],
      [],
      100,
    );
    expect(ledger.betResult).toBe(0);
    expect(ledger.expected).toBe(100);
    expect(ledger.unexplained).toBe(0);
  });

  it('ignores a bonus that never cleared its wagering', () => {
    const ledger = walletLedger([], [], [bonus({ status: 'expired', currentAmount: 100 })], null);
    expect(ledger.bonusRealized).toBe(0);
    expect(ledger.expected).toBe(0);
  });

  it('leaves a lost bonus stake out of the wallet, both ways', () => {
    const ledger = walletLedger(
      [makeBet({ status: 'lost', stake: 50, bonusStake: 50, actualReturn: 0 })],
      [move('deposit', 100, 't1')],
      [],
      100,
    );
    expect(ledger.betResult).toBe(0);
    expect(ledger.stakedFromBonus).toBe(50);
    expect(ledger.expected).toBe(100);
    expect(ledger.unexplained).toBe(0);
  });

  it('counts only the real half of a part-bonus slip', () => {
    const ledger = walletLedger(
      [makeBet({ status: 'won', stake: 100, bonusStake: 50, actualReturn: 300 })],
      [],
      [],
      null,
    );
    expect(ledger.betResult).toBe(100);
    expect(ledger.stakedFromBonus).toBe(50);
  });

  it('holds only real money against an open bonus slip', () => {
    const ledger = walletLedger(
      [makeBet({ status: 'pending', stake: 40, bonusStake: 40, actualReturn: 0 })],
      [move('deposit', 100, 't1')],
      [],
      null,
    );
    expect(ledger.heldInOpenBets).toBe(0);
    expect(ledger.expected).toBe(100);
  });

  it('reports what the casino took as the gap between balance and expected', () => {
    const ledger = walletLedger([], [move('deposit', 300, 't1')], [], 120);
    expect(ledger.expected).toBe(300);
    expect(ledger.unexplained).toBe(-180);
  });
});
