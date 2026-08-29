import { describe, expect, it } from 'vitest';
import { smallMoney } from './utils';

describe('money too small to print', () => {
  it('says a reward is there rather than rounding it away', () => {
    // Rakeback arrives as coin dust: a real amount worth a tenth of a cent.
    expect(smallMoney(0.0008, 'EUR')).toBe('< 0,01 €');
  });

  it('prints anything that reaches a cent as itself', () => {
    expect(smallMoney(0.01, 'EUR')).toBe('0,01 €');
    expect(smallMoney(4.12, 'EUR')).toBe('4,12 €');
  });

  it('leaves nothing as nothing', () => {
    expect(smallMoney(0, 'EUR')).toBe('0,00 €');
  });
});
