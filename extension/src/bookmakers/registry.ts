/**
 * Every implemented adapter, in one place.
 *
 * ── Adding a bookmaker: one import and one entry below. ──
 *
 * Nothing outside this file may import a specific adapter: sync and the
 * background worker take whichever adapter the captured credentials name, which
 * is what keeps the rest of the extension ignorant of any particular site.
 */

import type { Bookmaker } from '@betanal/shared';
import { betAtHome } from './bet-at-home/adapter';
import { stake } from './stake/adapter';
import type { BookmakerAdapter } from './types';

const ADAPTERS: Record<Bookmaker, BookmakerAdapter> = {
  'bet-at-home': betAtHome,
  stake,
};

export const adapters = (): BookmakerAdapter[] => Object.values(ADAPTERS);

/** Null for a bookmaker named in stored data whose adapter is no longer built. */
export const adapterFor = (bookmaker: Bookmaker): BookmakerAdapter | null =>
  ADAPTERS[bookmaker] ?? null;
