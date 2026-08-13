import { describe, expect, it } from 'vitest';
import { bonusesByTransaction, realizedBonusValue, summarizeBonuses } from './bonus';
import type { Bonus, Transaction } from './types';

const deposit = (id: string, occurredAt: string, amount = 200): Transaction => ({
  id,
  bookmaker: 'bet-at-home',
  accountId: 'acc-1',
  kind: 'deposit',
  amount,
  currency: 'EUR',
  occurredAt,
  note: null,
});

const bonus = (over: Partial<Bonus> = {}): Bonus => ({
  id: 'w1',
  bookmaker: 'bet-at-home',
  accountId: 'acc-1',
  name: 'WM200',
  code: 'WM200',
  description: '200€ WC-BONUS',
  type: 'standard',
  trigger: 'deposit',
  status: 'completed',
  grantedAmount: 100,
  currentAmount: 0,
  currency: 'EUR',
  grantedAt: '2026-06-11T01:38:53.000Z',
  expiresAt: null,
  wageringRequired: 1800,
  wageringDone: 678,
  ...over,
});

describe('realizedBonusValue', () => {
  it('counts only released bonuses, whatever was granted', () => {
    expect(realizedBonusValue(bonus({ grantedAmount: 100 }))).toBe(0);
    expect(realizedBonusValue(bonus({ status: 'expired', grantedAmount: 50 }))).toBe(0);
    expect(realizedBonusValue(bonus({ status: 'released', currentAmount: 199 }))).toBe(199);
  });
});

describe('summarizeBonuses', () => {
  it('keeps free bets out of realized, since their outcome is unknowable', () => {
    const s = summarizeBonuses([
      bonus({ id: 'w1', status: 'released', grantedAmount: 50, currentAmount: 199 }),
      bonus({ id: 'w2', status: 'completed', grantedAmount: 100 }),
      bonus({ id: 'w3', type: 'freeBet', status: 'completed', grantedAmount: 25 }),
    ]);
    expect(s).toEqual({
      granted: 175,
      realized: 199,
      untrackedCount: 1,
      untrackedGranted: 25,
    });
  });
});

describe('bonusesByTransaction', () => {
  it('pairs a grant with the deposit it completed alongside', () => {
    // The real pair from the account API: deposit completes at .995, grant lands
    // at .000 of the next second.
    const d = deposit('bah-1', '2026-06-11T01:38:53.995Z');
    const map = bonusesByTransaction([d], [bonus()]);
    expect(map.get('bah-1')?.code).toBe('WM200');
  });

  it('ignores bonuses that no deposit triggered', () => {
    const d = deposit('bah-1', '2026-06-11T01:38:53.995Z');
    expect(bonusesByTransaction([d], [bonus({ trigger: 'manual' })]).size).toBe(0);
  });

  it('ignores a deposit that is nowhere near the grant', () => {
    const d = deposit('bah-1', '2026-06-10T01:38:53.995Z');
    expect(bonusesByTransaction([d], [bonus()]).size).toBe(0);
  });

  it('gives the grant to the deposit that preceded it, not the later one', () => {
    const before = deposit('bah-before', '2026-06-11T01:38:48.000Z');
    const after = deposit('bah-after', '2026-06-11T01:38:56.000Z');
    const map = bonusesByTransaction([after, before], [bonus()]);
    expect([...map.keys()]).toEqual(['bah-before']);
  });

  it('never hands two grants to the same deposit', () => {
    const d = deposit('bah-1', '2026-06-11T01:38:53.995Z');
    const map = bonusesByTransaction([d], [bonus({ id: 'w1' }), bonus({ id: 'w2' })]);
    expect(map.size).toBe(1);
    expect(map.get('bah-1')?.id).toBe('w1');
  });
});
