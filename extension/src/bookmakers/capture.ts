/**
 * Every bookmaker's capture rule, gathered in one list.
 *
 * ── Adding a bookmaker: one import and one array entry below. ──
 *
 * This file is loaded by the MAIN-world inject script, which runs inside the
 * site's own JS context, so it may only ever reach a rule — never an adapter.
 * That is why the rules live beside their adapter but in a file of their own.
 */

import type { Bookmaker } from '@betanal/shared';
import type { CaptureRule } from './capture-rule';
import { rule as betAtHome } from './bet-at-home/capture';
import { rule as stake } from './stake/capture';

export type { CapturedFields, CaptureRule } from './capture-rule';

export const CAPTURE_RULES: readonly CaptureRule[] = [betAtHome, stake];

/** Which account a page belongs to, read from its own hostname. */
export const bookmakerForHost = (host: string): Bookmaker | null =>
  CAPTURE_RULES.find((rule) => rule.host.test(host))?.bookmaker ?? null;

/**
 * The same question asked of a page whose address means nothing to us: which
 * bookmaker made these requests. A mirror is only ever a new address in front of
 * the same platform, so its own calls give it away.
 */
export const bookmakerForRequests = (urls: readonly string[]): Bookmaker | null =>
  CAPTURE_RULES.find((rule) => urls.some((url) => rule.fingerprint.test(url)))?.bookmaker ?? null;
