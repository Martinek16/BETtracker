/**
 * Normalized, bookmaker-agnostic data model.
 *
 * Every bookmaker adapter is responsible for mapping its raw API payload onto
 * these types. Every record carries the account it came from — a bookmaker and
 * the site's own id for one login — so two logins at the same bookmaker stay
 * two accounts rather than one merged pile.
 */

/**
 * One bookmaker's id, matching the folder it is implemented in — see
 * `extension/src/bookmakers/<id>/bookmaker.json`.
 *
 * Deliberately an open string rather than a union of the sites that happen to
 * ship today. The set of bookmakers is a plugin surface anyone may add to, so a
 * closed union would route every contributor's change through this file, and the
 * shared model has no reason to know which sites exist. The extension's
 * catalogue is the list.
 */
export type Bookmaker = string;

/**
 * The site's own id for one login, stored exactly as it was read. Opaque on
 * purpose: only the adapter that captured it knows what shape it has, which is
 * what keeps the rest of the app ignorant of any particular bookmaker.
 */
export type AccountId = string;

/**
 * Records stored before the extension read account identities. They can only
 * have come from the single account connected at the time, so the first
 * identity seen for that bookmaker claims them.
 */
export const UNCLAIMED: AccountId = 'unclaimed';

/** One login at one bookmaker — the unit every record and cursor is scoped by. */
export interface AccountRef {
  bookmaker: Bookmaker;
  accountId: AccountId;
}

/** Stable string form for map keys, meta rows and URLs. */
export const accountKey = (account: AccountRef): string =>
  `${account.bookmaker}:${account.accountId}`;

/**
 * Only the first separator splits: a bookmaker id never contains a colon, while
 * a site is free to put one in its own account id.
 */
export const parseAccountKey = (key: string): AccountRef | null => {
  const cut = key.indexOf(':');
  if (cut <= 0) return null;
  const bookmaker = key.slice(0, cut);
  const accountId = key.slice(cut + 1);
  if (accountId === '') return null;
  return { bookmaker, accountId };
};

export const sameAccount = (a: AccountRef, b: AccountRef): boolean =>
  a.bookmaker === b.bookmaker && a.accountId === b.accountId;

export type BetStatus = 'won' | 'lost' | 'void' | 'pending' | 'cashed_out';

export type BetType = 'single' | 'accumulator' | 'system';

/** A single selection (leg) within a bet. Singles have exactly one leg. */
export interface BetLeg {
  sport: string | null;
  league: string | null;
  /** "Home vs Away" or a standalone event name. */
  event: string | null;
  /** Market type, e.g. "1X2", "Over/Under", "Match bet". */
  marketType: string | null;
  /** What the user backed, e.g. "Czech Republic (W)". */
  selection: string | null;
  /** Decimal odds for this leg. */
  odds: number | null;
  status: BetStatus;
  /** ISO timestamp of the event start, if known. */
  eventDate: string | null;
  isLive: boolean;
  /** Bookmaker event id. Join key for a live-score feed; absent on older records. */
  eventId?: string;
}

/**
 * One counted pair from an in-play event, keyed by the event it belongs to.
 * Read off a push feed at one bookmaker and off the open-bets payload at
 * another, so it is shared rather than owned by either.
 */
export interface LiveScore {
  home: string;
  /** Empty when a sport counts one side at a time, as cricket does. */
  away: string;
  /** Set when the pair is not the match score — "Corners", "Sets", "Overs". */
  kind?: string;
  /**
   * The running clock, in the book's own words. Never derived from the kickoff:
   * stoppage time and delays make a counted clock wrong exactly when it is being
   * watched. Only ever set on the match score itself.
   */
  clock?: string;
  /**
   * The part being played — "1st half", "3rd set", "Ended". What a sport without
   * a running clock has instead of a minute, and what tells us a match is over.
   */
  period?: string;
}

/**
 * What a record was denominated in before the dashboard converted it, and how
 * many units of the display currency one of those bought on its day. Written
 * only by the conversion and never stored, so it is absent on a record read
 * back from the database and on one that already was in the display currency.
 *
 * The rate rather than a second copy of every field: any converted figure
 * divided by it is that figure in the currency the money actually moved in.
 */
export interface ConvertedFrom {
  sourceCurrency?: string;
  fxRate?: number;
}

/** A normalized bet, idempotently keyed by `betId`. */
export interface Bet extends ConvertedFrom {
  betId: string;
  bookmaker: Bookmaker;
  /** Which login at that bookmaker placed it. */
  accountId: AccountId;
  /** ISO timestamp the bet was placed. */
  placedAt: string;
  /** ISO timestamp the bet settled; null while pending. */
  settledAt: string | null;
  /** ISO timestamp of cash-out; null unless cashed out. */
  cashedOutAt: string | null;
  /** Top-level summary fields (taken from the first leg for singles). */
  sport: string | null;
  league: string | null;
  event: string | null;
  marketType: string | null;
  selection: string | null;
  /** Total decimal odds of the bet. */
  odds: number;
  stake: number;
  /**
   * The part of `stake` that came out of the bonus wallet rather than the
   * pocket — a free bet, a bonus credit, a promotion. It never passed through a
   * deposit, so a wallet that counts it as real money spent goes short by
   * exactly this much on every bonus slip. Absent on records imported before
   * the bookmaker's split was read, which count as fully real.
   */
  bonusStake?: number;
  potentialReturn: number;
  /** 0 on loss, payout on win, stake on void. */
  actualReturn: number;
  status: BetStatus;
  betType: BetType;
  legs: BetLeg[];
  currency: string;
  /**
   * Return still achievable right now, with void/lost legs already applied.
   * Only meaningful while the bet is open; absent otherwise.
   */
  currentPotentialReturn?: number;
  /** The bookmaker's current cash-out offer. Absent when the bet is not cashable. */
  cashOutValue?: number;
}

/** Money in/out of the bookmaker account, imported from its own account API. */
export type TransactionKind = 'deposit' | 'withdrawal';

export interface Transaction extends ConvertedFrom {
  id: string;
  bookmaker: Bookmaker;
  accountId: AccountId;
  kind: TransactionKind;
  /** Always positive; the sign is implied by `kind`. */
  amount: number;
  currency: string;
  /** ISO timestamp the transaction occurred. */
  occurredAt: string;
  note: string | null;
  /**
   * Wallet the money moved through. Absent on records imported before the
   * bookmaker's product was read, which are counted as sportsbook.
   */
  product?: 'casino' | 'sports';
}

/**
 * Bonuses granted by the bookmaker. Deliberately NOT a `Transaction`: bonus
 * money is neither paid in nor taken out, and whatever part of it became real is
 * already inside the account balance — recording it as a movement would count it
 * twice and corrupt the all-time result.
 *
 * The unions below are the bookmaker's own enum, read off the filter parameters
 * its account page sends. An unseen value is kept as-is rather than dropped.
 */
export type BonusType =
  | 'standard'
  | 'freeBet'
  | 'freeRound'
  | 'cashback'
  | 'wagering'
  | 'oddsBoost'
  | 'rakeback';

/**
 * `claim` is taken by hand off a promotions page; `freeBet` marks the payout of
 * a free bet that already settled, which the book grants as a bonus of its own
 * rather than as a return on the slip.
 */
export type BonusTrigger = 'deposit' | 'manual' | 'wager' | 'auto' | 'claim' | 'freeBet';

export type BonusStatus = 'active' | 'released' | 'completed' | 'expired' | 'forfeited' | 'closed';

export interface Bonus {
  /** The grant, not the offer: one offer is granted many times, each with its own id. */
  id: string;
  bookmaker: Bookmaker;
  accountId: AccountId;
  name: string;
  code: string | null;
  description: string | null;
  type: BonusType;
  trigger: BonusTrigger;
  status: BonusStatus;
  /** Face value of the grant — a promise, not income. See `realizedBonusValue`. */
  grantedAmount: number;
  /** What is sitting in the bonus wallet right now. */
  currentAmount: number;
  currency: string;
  /** ISO timestamp the bonus was granted. */
  grantedAt: string;
  expiresAt: string | null;
  /** Turnover needed before the bonus converts into withdrawable money. */
  wageringRequired: number;
  wageringDone: number;
}

/** One coin's worth of rakeback waiting to be claimed. */
export interface RakebackBalance {
  currency: string;
  amount: number;
  /** The same amount in USD at the bookmaker's own price, when it prices the coin. */
  worth: number | null;
}

/**
 * Standing rewards an account carries: not a grant it was given, not an offer it
 * may take. Rakeback accrues on every bet and is claimed at will, a reload
 * faucet refills on a timer, a VIP level only ever has a value right now. The
 * bookmaker publishes no history for any of them, so this is a snapshot that is
 * overwritten on every sync rather than a series that accumulates.
 *
 * What is *earned* out of these is recorded separately as a `Bonus`, because
 * that part is history and has to survive the next snapshot.
 */
export interface AccountPerks {
  bookmaker: Bookmaker;
  accountId: AccountId;
  /** When the snapshot was taken. Nothing in it is dated by the bookmaker. */
  readAt: string;
  rakeback: { enabled: boolean; balances: RakebackBalance[] } | null;
  /** The loyalty tier and how far into it the account is, 0–1. */
  vip: { level: string | null; progress: number | null } | null;
  /** A claim that refills on a timer — worth showing only while it is armed. */
  reload: {
    active: boolean;
    value: number;
    claimIntervalMs: number | null;
    lastClaimAt: string | null;
    expiresAt: string | null;
  } | null;
}
