/**
 * bet-at-home.com adapter (EveryMatrix sportsbook backend).
 *
 * ── HOW SCRAPING WORKS ──────────────────────────────────────────────────────
 * The sportsbook runs on an EveryMatrix widget hosted under *.bah26.com and
 * talks to `sports-api.everymatrix.com/bets-api/v1/<operatorId>/...`.
 * Auth is header-based (x-session-token / x-user-id / x-operator-id), no cookies.
 *
 * We do NOT guess where the token is stored. Instead the MAIN-world inject
 * script observes the page's own API calls and captures those headers, which
 * the background service worker then reuses for paginated history fetches.
 *
 * ── IF THE SITE CHANGES ─────────────────────────────────────────────────────
 * Everything site-specific lives in this file: endpoints (CONFIG), the raw
 * payload shape (Raw* interfaces), status mapping, and the normalizer. Update
 * here when the API changes; the rest of the extension stays untouched.
 */

import type {
  AccountId,
  AccountRef,
  BalanceInfo,
  Bet,
  BetLeg,
  BetStatus,
  BetType,
  Bonus,
  BonusStatus,
  BonusTrigger,
  BonusType,
  Bookmaker,
  Transaction,
} from '@betanal/shared';
import {
  getBackfillState,
  log,
  putBonus,
  putTransaction,
  setBackfillState,
} from '@betanal/shared';
import {
  authedJson,
  nowCursor,
  runCursorSync,
  SessionExpiredError,
} from '../../sync/sync';
import { field } from '../types';
import type {
  BankingCredentials,
  BookmakerAdapter,
  Credentials,
  SettledPage,
} from '../types';

/** Stamped on every record this file produces, so the account is never in doubt. */
const BOOKMAKER: Bookmaker = 'bet-at-home';

export const CONFIG = {
  id: BOOKMAKER,
  name: 'bet-at-home',
  apiHostFragment: 'sports-api.everymatrix.com',
  paths: {
    settled: (operatorId: string) => `/bets-api/v1/${operatorId}/settled-bets`,
    openBets: (operatorId: string) => `/bets-api/v1/${operatorId}/open-bets`,
    openCounter: (operatorId: string) => `/bets-api/v1/${operatorId}/open-bets-counter`,
  },
  defaultApiBase: 'https://sports-api.everymatrix.com',
  pageLimit: 100,
};

/**
 * Deposits/withdrawals — a completely separate backend from the sportsbook.
 * Host `betathomecom.nwacdn.com`, auth is a single `x-sessionid` header, and the
 * player id is part of the path (both captured from the page's own calls).
 */
export const BANKING = {
  apiHostFragment: 'nwacdn.com',
  urlPattern: /\/v1\/player\/(\d+)\//,
  path: (playerId: string) => `/v1/player/${playerId}/transactions/banking`,
  /** `types` query values, as seen on the site's own transaction-history page. */
  kinds: [
    { type: 0, kind: 'deposit' as const },
    { type: 1, kind: 'withdrawal' as const },
  ],
  states: 'Success,Processing,Pending,ProcessingDebit,ProcessingCredit,PendingNotification,PendingApproval',
  pageLimit: 100,
};

// ── Raw EveryMatrix payload (only the fields we read; all optional/defensive) ──

interface RawSelection {
  status?: string;
  priceValue?: number | string | null;
  betBuilderOdds?: number | string | null;
  sportName?: string | null;
  tournamentName?: string | null;
  eventName?: string | null;
  marketName?: string | null;
  bettingTypeName?: string | null;
  betName?: string | null;
  shortBetName?: string | null;
  eventDate?: string | null;
  isLive?: boolean | null;
  eventId?: string | number | null;
}

interface RawBet {
  id?: string;
  type?: string;
  systemBetType?: string | null;
  selections?: RawSelection[];
  amount?: number | string | null;
  totalBetAmount?: number | string | null;
  /**
   * The slice of the stake that came out of the pocket. The complement is bonus
   * money whatever form it took — a bonus wallet, a free bet, a credit — which
   * the fields below only ever describe one kind of.
   */
  realStake?: number | string | null;
  bonusStake?: number | string | null;
  freeBetAmount?: number | string | null;
  totalPriceValue?: number | string | null;
  currency?: string | null;
  maxWinning?: number | string | null;
  possibleProfit?: number | string | null;
  status?: string;
  placedDate?: string;
  settledDate?: string | null;
  cashOutDate?: string | null;
  overallBetReturns?: number | string | null;
  numberOfSelections?: number;
  /** Only present while the bet is open and cashable. */
  overallCashoutAmount?: number | string | null;
  currentPossibleWinning?: number | string | null;
}

// ── Defensive helpers ────────────────────────────────────────────────────────

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number.parseFloat(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
};

const toStringOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

/** For fields that are absent rather than zero on a settled bet — never returns 0 for null. */
const toNumberOrUndefined = (value: unknown): number | undefined => {
  if (value === null || value === undefined) return undefined;
  const n = toNumber(value, Number.NaN);
  return Number.isFinite(n) ? n : undefined;
};

/** Store timestamps as UTC ISO so sync cursors and filters compare correctly. */
const normalizeTimestamp = (value: string): string => {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? value : new Date(ms).toISOString();
};

const mapBetStatus = (raw: string | undefined, hasSettled: boolean): BetStatus => {
  switch ((raw ?? '').toUpperCase()) {
    case 'WON':
      return 'won';
    case 'LOST':
      return 'lost';
    case 'CASHED_OUT':
    case 'CASHEDOUT':
      return 'cashed_out';
    case 'VOID':
    case 'CANCELLED':
    case 'CANCELED':
    case 'REFUNDED':
    case 'RETURNED':
      return 'void';
    case 'OPEN':
    case 'PENDING':
    case 'RUNNING':
    case 'ACCEPTED':
      return 'pending';
    default:
      return hasSettled ? 'won' : 'pending';
  }
};

const mapLegStatus = (raw: string | undefined): BetStatus => {
  switch ((raw ?? '').toUpperCase()) {
    case 'WON':
      return 'won';
    case 'LOST':
      return 'lost';
    case 'CANCELLED':
    case 'CANCELED':
    case 'VOID':
    case 'DRAW':
    case 'REFUNDED':
      return 'void';
    default:
      return 'pending';
  }
};

const mapBetType = (type: string | undefined, systemBetType: string | null | undefined): BetType => {
  if (systemBetType) return 'system';
  if ((type ?? '').toUpperCase() === 'MULTIPLE') return 'accumulator';
  return 'single';
};

const normalizeLeg = (raw: RawSelection): BetLeg => {
  const eventId = raw.eventId == null ? null : String(raw.eventId);
  return {
    sport: toStringOrNull(raw.sportName),
    league: toStringOrNull(raw.tournamentName),
    event: toStringOrNull(raw.eventName),
    marketType: toStringOrNull(raw.marketName) ?? toStringOrNull(raw.bettingTypeName),
    selection: toStringOrNull(raw.betName) ?? toStringOrNull(raw.shortBetName),
    odds: raw.priceValue == null && raw.betBuilderOdds == null
      ? null
      : toNumber(raw.priceValue ?? raw.betBuilderOdds, 0) || null,
    status: mapLegStatus(raw.status),
    eventDate: toStringOrNull(raw.eventDate)
      ? normalizeTimestamp(toStringOrNull(raw.eventDate)!)
      : null,
    isLive: raw.isLive === true,
    ...(eventId !== null ? { eventId } : {}),
  };
};

const topLevelSport = (legs: BetLeg[]): string | null => {
  const sports = [...new Set(legs.map((l) => l.sport).filter((s): s is string => s !== null))];
  if (sports.length === 0) return null;
  if (sports.length === 1) return sports[0] ?? null;
  return 'Multiple';
};

/**
 * Normalize a single raw EveryMatrix bet. Returns null (and the caller logs &
 * skips) if the bet lacks the minimum fields needed to be meaningful.
 */
export const normalizeBet = (raw: RawBet, accountId: AccountId): Bet | null => {
  const betId = toStringOrNull(raw.id);
  const placedAt = toStringOrNull(raw.placedDate);
  if (betId === null || placedAt === null) return null;

  const legs = Array.isArray(raw.selections) ? raw.selections.map(normalizeLeg) : [];
  const settledAtRaw = toStringOrNull(raw.settledDate);
  const settledAt = settledAtRaw ? normalizeTimestamp(settledAtRaw) : null;
  const status = mapBetStatus(raw.status, settledAt !== null);
  const stake = toNumber(raw.totalBetAmount ?? raw.amount, 0);
  // `realStake` is the only field that covers every shape at once: a free bet
  // leaves `bonusStake` at zero and reports its face value elsewhere, and a slip
  // tied to a bonus wallet can still be paid for entirely in real money. The
  // named fields are the fallback for payloads that predate it.
  const realStake = toNumberOrUndefined(raw.realStake);
  const bonusStake =
    realStake === undefined
      ? Math.min(stake, Math.max(toNumber(raw.bonusStake, 0), toNumber(raw.freeBetAmount, 0)))
      : Math.min(stake, Math.max(0, stake - realStake));
  const odds = toNumber(raw.totalPriceValue, 0) || legs.reduce((p, l) => p * (l.odds ?? 1), 1);

  const actualReturn = status === 'void' ? stake : toNumber(raw.overallBetReturns, 0);
  const potentialReturn = toNumber(raw.maxWinning, 0) || stake + toNumber(raw.possibleProfit, 0);
  const cashedOutRaw = toStringOrNull(raw.cashOutDate);
  const cashOutValue = toNumberOrUndefined(raw.overallCashoutAmount);
  const currentPotentialReturn = toNumberOrUndefined(raw.currentPossibleWinning);

  const first = legs[0];
  return {
    betId,
    bookmaker: BOOKMAKER,
    accountId,
    placedAt: normalizeTimestamp(placedAt),
    settledAt,
    cashedOutAt: cashedOutRaw ? normalizeTimestamp(cashedOutRaw) : null,
    sport: topLevelSport(legs),
    league: first?.league ?? null,
    event: first?.event ?? null,
    marketType: first?.marketType ?? null,
    selection: first?.selection ?? null,
    odds,
    stake,
    ...(bonusStake > 0 ? { bonusStake } : {}),
    potentialReturn,
    actualReturn,
    status,
    betType: mapBetType(raw.type, raw.systemBetType),
    legs,
    currency: toStringOrNull(raw.currency) ?? 'EUR',
    ...(currentPotentialReturn !== undefined ? { currentPotentialReturn } : {}),
    ...(cashOutValue !== undefined ? { cashOutValue } : {}),
  };
};

const parseArray = (json: unknown, accountId: AccountId): { bets: Bet[]; skipped: number } => {
  // The settled-bets endpoint returns a bare array; tolerate an envelope too.
  const arr: unknown = Array.isArray(json)
    ? json
    : typeof json === 'object' && json !== null
      ? ((json as Record<string, unknown>).bets ??
        (json as Record<string, unknown>).items ??
        (json as Record<string, unknown>).data)
      : null;
  if (!Array.isArray(arr)) return { bets: [], skipped: 0 };

  const bets: Bet[] = [];
  let skipped = 0;
  for (const item of arr) {
    try {
      const bet = normalizeBet(item as RawBet, accountId);
      if (bet) bets.push(bet);
      else skipped += 1;
    } catch (err) {
      skipped += 1;
      log('warn', 'bet-at-home', `skipped unparseable bet: ${(err as Error).message}`);
    }
  }
  return { bets, skipped };
};

// ── Banking (deposits / withdrawals) ─────────────────────────────────────────

interface RawTransaction {
  /** Precision-safe id. `transId` is a number > 2^53 and is already corrupted. */
  transIdStr?: string;
  transId?: number;
  created?: string;
  completed?: string | null;
  status?: string;
  type?: number;
  currency?: string | null;
  realAmount?: number | string | null;
  creditName?: string | null;
  debitName?: string | null;
  /** Wallet the money landed in, e.g. `CasinoRealMoney`. */
  productType?: string | null;
}

/**
 * The account holds one wallet per product and the banking feed names it. Only
 * the casino one has to be recognised: everything else is the sportsbook, and
 * guessing wrong there would hide bets the tracker exists to count.
 */
const productOf = (raw: RawTransaction): 'casino' | 'sports' => {
  const names = [raw.productType, raw.creditName, raw.debitName].join(' ').toLowerCase();
  return names.includes('casino') ? 'casino' : 'sports';
};

export const buildBankingUrl = (
  creds: BankingCredentials,
  opts: { type: number; from: string; to: string; offset: number; limit: number },
): string => {
  const u = new URL(field(creds, 'apiBase') + BANKING.path(field(creds, 'playerId')));
  u.searchParams.set('startDate', new Date(opts.from).toISOString());
  u.searchParams.set('endDate', new Date(opts.to).toISOString());
  u.searchParams.set('offset', String(opts.offset));
  u.searchParams.set('limit', String(opts.limit));
  u.searchParams.set('states', BANKING.states);
  u.searchParams.set('types', String(opts.type));
  u.searchParams.set('language', 'en');
  return u.toString();
};

export const bankingHeaders = (creds: BankingCredentials): Record<string, string> => ({
  'x-sessionid': field(creds, 'sessionId'),
  'content-type': 'application/json',
  accept: '*/*',
});

const normalizeTransaction = (raw: RawTransaction, accountId: AccountId): Transaction | null => {
  const id = toStringOrNull(raw.transIdStr) ?? (raw.transId ? String(raw.transId) : null);
  const occurred = toStringOrNull(raw.completed ?? null) ?? toStringOrNull(raw.created);
  const amount = toNumber(raw.realAmount, 0);
  if (id === null || occurred === null || amount <= 0) return null;

  const status = toStringOrNull(raw.status) ?? 'Success';
  const via = toStringOrNull(raw.type === 1 ? raw.creditName : raw.debitName);
  return {
    // Namespaced so an imported transaction can never collide with a manual one,
    // and so re-importing the same page upserts instead of duplicating.
    id: `bah-${id}`,
    bookmaker: BOOKMAKER,
    accountId,
    kind: raw.type === 1 ? 'withdrawal' : 'deposit',
    amount,
    currency: toStringOrNull(raw.currency) ?? 'EUR',
    occurredAt: normalizeTimestamp(occurred),
    note: [via, status === 'Success' ? null : status].filter((s) => s !== null).join(' · ') || null,
    product: productOf(raw),
  };
};

export interface BankingPage {
  transactions: Transaction[];
  /** Absolute URL of the next page, or null when exhausted. */
  next: string | null;
}

export const parseBanking = (json: unknown, accountId: AccountId): BankingPage => {
  const root = (typeof json === 'object' && json !== null ? json : {}) as {
    transactions?: unknown;
    pagination?: { next?: unknown };
  };
  const arr = Array.isArray(root.transactions) ? root.transactions : [];
  const transactions: Transaction[] = [];
  for (const item of arr) {
    const txn = normalizeTransaction(item as RawTransaction, accountId);
    if (txn) transactions.push(txn);
  }
  return { transactions, next: toStringOrNull(root.pagination?.next) };
};

// ── Balance ──────────────────────────────────────────────────────────────────

/**
 * The wallet, on the account backend rather than the sportsbook one. The page
 * header shows the same figure, but reading it off the rendered markup depends
 * on class names the site generates and renames, which is how a balance can
 * quietly go missing for good.
 */
export const BALANCE = {
  path: (playerId: string) => `/v1/player/${playerId}/balance`,
};

export const buildBalanceUrl = (creds: BankingCredentials): string => {
  const u = new URL(field(creds, 'apiBase') + BALANCE.path(field(creds, 'playerId')));
  u.searchParams.set('language', 'en');
  return u.toString();
};

/**
 * Only the real money counts as the balance. Bonus money is a claim with a
 * wagering requirement attached, and the site's own header leaves it out too.
 */
export const parseBalance = (json: unknown, account: AccountRef): BalanceInfo | null => {
  const root = (typeof json === 'object' && json !== null ? json : {}) as {
    items?: unknown;
    totalCashAmount?: Record<string, number> | null;
  };
  const items = Array.isArray(root.items) ? root.items : [];
  const real = items.find(
    (i) => (i as { type?: unknown }).type === 'Real',
  ) as { amount?: unknown; currency?: unknown } | undefined;

  const cash = firstAmount(root.totalCashAmount);
  if (real === undefined && cash === null) return null;

  return {
    bookmaker: BOOKMAKER,
    accountId: account.accountId,
    amount: real === undefined ? (cash?.[0] ?? 0) : toNumber(real.amount, 0),
    currency: toStringOrNull(real?.currency) ?? cash?.[1] ?? 'EUR',
    capturedAt: new Date().toISOString(),
  };
};

// ── Bonuses ──────────────────────────────────────────────────────────────────

/**
 * The bonus wallet sits on the same account API as banking — same host, same
 * `x-sessionid` — so the credentials captured for deposits already unlock it.
 * No date windowing here: the endpoint pages through all history at once.
 */
export const BONUS = {
  path: (playerId: string) => `/v1/player/${playerId}/bonusWallet`,
  pageLimit: 100,
};

interface RawBonus {
  walletId?: number | string;
  bonusCode?: string | null;
  name?: string | null;
  type?: string;
  triggerType?: string;
  status?: string;
  grantedAmount?: number | string | null;
  grantedBonusAmountInCurrency?: number | string | null;
  currentAmount?: number | string | null;
  currency?: string | null;
  granted?: string;
  expiryTime?: string | null;
  originalWageringRequirement?: number | string | null;
  fulfilledWR?: number | string | null;
  extension?: { bonus?: { presentation?: { description?: string | null } } };
}

export const buildBonusWalletUrl = (
  creds: BankingCredentials,
  opts: { offset: number; limit: number },
): string => {
  const u = new URL(field(creds, 'apiBase') + BONUS.path(field(creds, 'playerId')));
  u.searchParams.set('pagination', `offset=${opts.offset},limit=${opts.limit}`);
  u.searchParams.set('language', 'en');
  return u.toString();
};

const normalizeBonus = (raw: RawBonus, accountId: AccountId): Bonus | null => {
  const id = raw.walletId === undefined || raw.walletId === null ? null : String(raw.walletId);
  const granted = toStringOrNull(raw.granted);
  if (id === null || granted === null) return null;

  return {
    id: `bah-${id}`,
    bookmaker: BOOKMAKER,
    accountId,
    name: toStringOrNull(raw.name) ?? toStringOrNull(raw.bonusCode) ?? 'Bonus',
    code: toStringOrNull(raw.bonusCode),
    description: toStringOrNull(raw.extension?.bonus?.presentation?.description ?? null),
    // Cast rather than validate: an unseen enum value is still worth keeping,
    // and dropping the grant would silently lose history.
    type: (toStringOrNull(raw.type) ?? 'standard') as BonusType,
    trigger: (toStringOrNull(raw.triggerType) ?? 'manual') as BonusTrigger,
    status: (toStringOrNull(raw.status) ?? 'closed') as BonusStatus,
    grantedAmount: toNumber(raw.grantedBonusAmountInCurrency ?? raw.grantedAmount, 0),
    currentAmount: toNumber(raw.currentAmount, 0),
    currency: toStringOrNull(raw.currency) ?? 'EUR',
    grantedAt: normalizeTimestamp(granted),
    expiresAt: toStringOrNull(raw.expiryTime ?? null),
    wageringRequired: toNumber(raw.originalWageringRequirement, 0),
    wageringDone: toNumber(raw.fulfilledWR, 0),
  };
};

export interface BonusPage {
  bonuses: Bonus[];
  /** Total across all pages, as reported by the API. */
  total: number;
}

export const parseBonusWallet = (json: unknown, accountId: AccountId): BonusPage => {
  const root = (typeof json === 'object' && json !== null ? json : {}) as {
    items?: unknown;
    total?: unknown;
  };
  const arr = Array.isArray(root.items) ? root.items : [];
  const bonuses: Bonus[] = [];
  for (const item of arr) {
    const bonus = normalizeBonus(item as RawBonus, accountId);
    if (bonus) bonuses.push(bonus);
  }
  return { bonuses, total: toNumber(root.total, 0) };
};

/** Amounts arrive keyed by currency; the account only ever has one. */
const firstAmount = (map: Record<string, number> | null | undefined): [number, string] | null => {
  if (typeof map !== 'object' || map === null) return null;
  for (const [currency, value] of Object.entries(map)) {
    if (typeof value === 'number') return [value, currency];
  }
  return null;
};

// ── Fetching ─────────────────────────────────────────────────────────────────

const authHeaders = (creds: Credentials): Record<string, string> => ({
  'x-session-token': field(creds, 'sessionToken'),
  'x-user-id': field(creds, 'userId'),
  'x-operator-id': field(creds, 'operatorId'),
  'x-language': 'en',
  accept: '*/*',
});

const betsUrl = (creds: Credentials, path: string, placedBefore: string): URL => {
  const u = new URL(field(creds, 'apiBase') + path);
  u.searchParams.set('limit', String(CONFIG.pageLimit));
  u.searchParams.set('placedBefore', placedBefore);
  return u;
};

const parseOpenBets = (json: unknown, account: AccountRef): Bet[] =>
  parseArray(json, account.accountId).bets.map((b) => ({ ...b, status: 'pending' as BetStatus }));

export const parseSettled = (json: unknown, accountId: AccountId): SettledPage => {
  const { bets, skipped } = parseArray(json, accountId);
  const oldest = bets.reduce<string | null>(
    (min, b) => (min === null || b.placedAt < min ? b.placedAt : min),
    null,
  );
  return { bets, skipped, nextCursor: oldest };
};

// ── Banking / bonus imports ──────────────────────────────────────────────────

/** Nothing predates the bookmaker itself; a hard floor beats walking back forever. */
const BANKING_EPOCH = Date.UTC(2005, 0, 1);
const BANKING_MAX_PAGES = 200;
/**
 * Months per request. The site's own account page asks for a nine-month window
 * and pages through it with `pagination.next`, so a wide window is honoured —
 * walking a month at a time instead turned a first import into hundreds of
 * sequential requests, which the worker or the session outlived.
 */
const BANKING_WINDOW_MONTHS = 12;
/** Stop after a year of nothing rather than grinding back to 2005. */
const BANKING_EMPTY_MONTHS_STOP = 12;

/**
 * Import deposits and withdrawals from bet-at-home's account API.
 *
 * Ids are namespaced (`bah-<transIdStr>`) and written with `putTransaction`, so
 * re-running this upserts rather than duplicating — overlapping windows and
 * repeat runs are both free, which is why no cursor state is kept.
 */
export const syncTransactions = async (
  creds: BankingCredentials,
  account: AccountRef,
  /** Months to walk back. Deep on the first run, shallow on every one after. */
  maxMonths = 3,
  /**
   * Keep walking past empty months until this date. The account was funded before
   * its first bet, so the oldest bet we hold proves how far back money has to go —
   * without it a year-long quiet stretch ends the walk mid-history.
   */
  floorMs = 0,
): Promise<{ imported: number; complete: boolean }> => {
  const headers = bankingHeaders(creds);
  let imported = 0;

  const fetchWindow = async (type: number, from: Date, to: Date): Promise<number> => {
    let url: string | null = buildBankingUrl(creds, {
      type,
      from: from.toISOString(),
      to: to.toISOString(),
      offset: 0,
      limit: BANKING.pageLimit,
    });
    let count = 0;
    for (let page = 0; url !== null && page < BANKING_MAX_PAGES; page += 1) {
      const parsed = parseBanking(
        await authedJson(url, { headers, method: 'GET' }),
        account.accountId,
      );
      for (const txn of parsed.transactions) {
        await putTransaction(txn);
        count += 1;
      }
      url = parsed.transactions.length === 0 ? null : parsed.next;
    }
    return count;
  };

  const now = new Date();
  let complete = true;
  for (const { type } of BANKING.kinds) {
    let emptyMonths = 0;
    let months = 0;
    // Start on the first of next month so the current, partial month is covered.
    let end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
    for (;;) {
      if (end <= BANKING_EPOCH) break;
      // A floor of 0 is no floor at all — there is no oldest bet to protect, so a
      // run of empty months means the account simply has no older money history.
      // Reading it as "walk back to 1970" is what made a first import grind
      // through every one of the 240 months twice.
      if (emptyMonths >= BANKING_EMPTY_MONTHS_STOP && (floorMs === 0 || end <= floorMs)) break;
      // The only exit that leaves history unfinished, so it is the only one that
      // must not be reported as a walk that reached the end.
      if (months >= maxMonths) {
        complete = false;
        break;
      }
      months += BANKING_WINDOW_MONTHS;
      const endDate = new Date(end);
      const start = Date.UTC(
        endDate.getUTCFullYear(),
        endDate.getUTCMonth() - BANKING_WINDOW_MONTHS,
        1,
      );
      const found = await fetchWindow(type, new Date(start), new Date(end - 1));
      imported += found;
      emptyMonths = found === 0 ? emptyMonths + BANKING_WINDOW_MONTHS : 0;
      end = start;
    }
  }
  return { imported, complete };
};

const BONUS_MAX_PAGES = 50;

/**
 * Import granted bonuses from the same account API the banking history uses.
 *
 * Ids are namespaced (`bah-<walletId>`), so re-running upserts. Bonuses are not
 * transactions — a grant moves no money — so they land in their own store and
 * are linked to the deposit that triggered them at read time.
 */
export const syncBonuses = async (
  creds: BankingCredentials,
  account: AccountRef,
  /**
   * Walk the whole wallet. Off on routine syncs, which stop at the first page
   * that held nothing new — the list is newest-first and every grant keys on the
   * bookmaker's own wallet id, so the pages behind it are already stored. Page
   * one is still re-read every time, so a grant that changed state still lands.
   */
  deep = true,
): Promise<number> => {
  const headers = bankingHeaders(creds);
  let read = 0;
  let fresh = 0;
  for (let page = 0; page < BONUS_MAX_PAGES; page += 1) {
    const url = buildBonusWalletUrl(creds, {
      offset: page * BONUS.pageLimit,
      limit: BONUS.pageLimit,
    });
    const parsed = parseBonusWallet(
      await authedJson(url, { headers, method: 'GET' }),
      account.accountId,
    );
    let added = 0;
    for (const bonus of parsed.bonuses) {
      if (await putBonus(bonus)) added += 1;
      read += 1;
    }
    fresh += added;
    if (parsed.bonuses.length < BONUS.pageLimit || read >= parsed.total) break;
    if (!deep && added === 0) break;
  }
  return fresh;
};

/**
 * Bonuses ride the same session as banking but are their own failure domain: a
 * broken bonus endpoint must not abort the deposit import that already
 * succeeded.
 */
const importBonuses = async (
  creds: BankingCredentials,
  account: AccountRef,
  deep: boolean,
): Promise<void> => {
  try {
    const grants = await syncBonuses(creds, account, deep);
    // Only what changed: a routine sync finds the top of the wallet unchanged,
    // and a line saying so on every run buried everything worth reading.
    if (grants > 0) log('info', 'bet-at-home', `bonuses imported: ${grants} grants`);
  } catch (err) {
    if (err instanceof SessionExpiredError) throw err;
    log('warn', 'bet-at-home', `bonus import failed: ${(err as Error).message}`);
  }
};

export const betAtHome: BookmakerAdapter = {
  id: CONFIG.id,
  name: CONFIG.name,
  // Deposits live on another backend with its own session, only seen once the
  // user opens the account pages.
  needsBankingSession: true,

  async accountId(creds) {
    // Captured off the site's own authenticated request, so it costs no extra
    // call and is known before the first write.
    return field(creds, 'userId');
  },

  syncBets(creds, account, mode, onProgress) {
    return runCursorSync(
      {
        account,
        fetchPage: async (placedBefore) => {
          const u = betsUrl(creds, CONFIG.paths.settled(field(creds, 'operatorId')), placedBefore);
          u.searchParams.set('betStatus', '');
          u.searchParams.set('sportIds', '');
          return parseSettled(
            await authedJson(u.toString(), { headers: authHeaders(creds), method: 'GET' }),
            account.accountId,
          );
        },
      },
      mode,
      onProgress,
    );
  },

  async openBets(creds, account) {
    // The page sends limit + placedBefore; without them the endpoint returns no
    // bets, which is why open/live slips never appeared (confirmed via HAR).
    const u = betsUrl(creds, CONFIG.paths.openBets(field(creds, 'operatorId')), nowCursor());
    const json = await authedJson(u.toString(), { headers: authHeaders(creds), method: 'GET' });
    return { bets: parseOpenBets(json, account) };
  },

  parseOpen: parseOpenBets,

  async balance(_creds, account, banking) {
    if (banking === null) return null;
    return parseBalance(
      await authedJson(buildBalanceUrl(banking), {
        headers: bankingHeaders(banking),
        method: 'GET',
      }),
      account,
    );
  },

  async syncMoney(_creds, banking, account, depth) {
    if (banking === null) return 0;
    // Bonuses first: the banking walk below is the longer of the two, and
    // anything queued behind a session that expires mid-walk never runs.
    const deep = depth === 'full';
    await importBonuses(banking, account, deep);
    if (depth === 'bonuses') return 0;
    // Full history is a walk back through year-wide windows. Worth it once;
    // after that only the recent months can still change, and re-imports upsert.
    const { oldestFetchedAt } = await getBackfillState(account);
    const floor = deep && oldestFetchedAt !== null ? Date.parse(oldestFetchedAt) : 0;
    const { imported, complete } = await syncTransactions(banking, account, deep ? 240 : 3, floor);
    if (deep && complete) await setBackfillState(account, { moneyComplete: true });
    return imported;
  },
};
