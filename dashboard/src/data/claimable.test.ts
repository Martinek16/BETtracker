import { describe, expect, it } from 'vitest';
import type { Bonus } from '@betanal/shared';
import { collectedSince } from './claimable';

const account = { bookmaker: 'stake', accountId: 'a1' };

const bonus = (over: Partial<Bonus> = {}): Bonus => ({
  id: 'b1',
  bookmaker: 'stake',
  accountId: 'a1',
  name: 'Rakeback',
  code: null,
  description: null,
  type: 'rakeback',
  trigger: 'claim',
  status: 'released',
  grantedAmount: 5,
  currentAmount: 5,
  currency: 'USD',
  grantedAt: '2026-08-10T00:00:00.000Z',
  expiresAt: null,
  wageringRequired: 0,
  wageringDone: 0,
  ...over,
});

describe('collectedSince', () => {
  it('treats a claim after the reading as proof the reading is spent', () => {
    expect(collectedSince([bonus()], account, '2026-08-09T00:00:00.000Z')).toBe(true);
  });

  it('keeps a reading taken after the last claim', () => {
    expect(collectedSince([bonus()], account, '2026-08-11T00:00:00.000Z')).toBe(false);
  });

  it('ignores a claim on another account at the same site', () => {
    expect(
      collectedSince([bonus({ accountId: 'a2' })], account, '2026-08-09T00:00:00.000Z'),
    ).toBe(false);
  });

  it('ignores bonuses that are not rakeback', () => {
    expect(collectedSince([bonus({ type: 'cashback' })], account, '2026-08-09T00:00:00.000Z')).toBe(
      false,
    );
  });

  it('shows the reward rather than hides it when the reading has no usable date', () => {
    expect(collectedSince([bonus()], account, 'not a date')).toBe(false);
  });
});
