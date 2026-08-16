/**
 * Whether a reward the bookmaker was holding has since been collected.
 *
 * The perks snapshot says what was waiting when it was taken, and nothing
 * refreshes it until the site is opened again. So claiming on the site and then
 * not going back leaves the figure standing - the app goes on offering money
 * that is already in the account, which is worse than saying nothing.
 *
 * The claim itself is recorded, though: collected rakeback is stored as a
 * released bonus dated when it landed. A claim newer than the reading is proof
 * the reading is spent, and that is the one thing that can be known for certain
 * without opening the site.
 */

import { sameAccount, type AccountRef, type Bonus } from '@betanal/shared';

export const collectedSince = (
  bonuses: readonly Bonus[],
  account: AccountRef,
  readAt: string,
): boolean => {
  const read = Date.parse(readAt);
  if (Number.isNaN(read)) return false;
  return bonuses.some(
    (bonus) =>
      bonus.type === 'rakeback' &&
      sameAccount(bonus, account) &&
      Date.parse(bonus.grantedAt) > read,
  );
};
