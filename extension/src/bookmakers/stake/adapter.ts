/**
 * stake.com adapter.
 *
 * ── HOW SCRAPING WORKS ──────────────────────────────────────────────────────
 * Everything - bets, deposits, withdrawals, balances - goes through a single
 * `POST /_api/graphql`, authenticated by one `x-access-token` header and no
 * cookies. The MAIN-world inject script captures that header off the page's own
 * calls; we never guess where it is stored.
 *
 * ── WHY THIS FILE DOESN'T USE THE CURSOR ENGINE ─────────────────────────────
 * Stake pages by `offset`/`limit`, not by "placed before <timestamp>", so the
 * shared timestamp-cursor engine cannot drive it. The loop below is that
 * difference, and the only reason this adapter owns its own sync.
 *
 * ── IF THE SITE CHANGES ─────────────────────────────────────────────────────
 * Queries, raw payload shapes and the normalizers all live here. Nothing else
 * in the extension knows Stake exists beyond one capture rule and one registry
 * entry.
 */

import {
  getBackfillState,
  log,
  putBonus,
  putCasinoRounds,
  putTransaction,
  setBackfillState,
  setPerks,
} from '@betanal/shared';
import type {
  AccountId,
  AccountPerks,
  AccountRef,
  BalanceInfo,
  Bet,
  Bonus,
  BetLeg,
  BetStatus,
  BetType,
  Bookmaker,
  CasinoKind,
  CasinoRound,
  LiveScore,
  Transaction,
} from '@betanal/shared';
import {
  authedJson,
  RATE_LIMIT_BACKOFF_MS,
  RateLimitedError,
  RelayUnavailableError,
  SessionExpiredError,
} from '../../sync/sync';
import { field } from '../types';
import type { BookmakerAdapter, Credentials, SyncMode, SyncResult } from '../types';
import { readList } from '../shape';

const BOOKMAKER: Bookmaker = 'stake';
const GRAPHQL_PATH = '/_api/graphql';

/** The site itself asks for 20; 50 halves the round trips without straining it. */
const PAGE_LIMIT = 50;
/**
 * Deposits and withdrawals, ten at a time because that is the only size Stake
 * serves them in. Asking for fifty - which the bet list on the same endpoint is
 * happy to give - was answered with "you are not allowed to do that", the same
 * sentence it uses for a dead session, so the wallet read as an expired login
 * for months while bets kept importing on the very same token.
 */
const MONEY_PAGE_LIMIT = 10;
/** Pages per run. The walk resumes across runs, so this only bounds one of them. */
const MAX_PAGES = 200;
/**
 * Once history is in, a routine sync only has to cover what changed: freshly
 * placed bets and freshly settled ones, both of which sit at the top of a
 * newest-first list.
 */
const SHALLOW_PAGES = 5;

// ── GraphQL transport ────────────────────────────────────────────────────────

/**
 * Wording that can only mean the session itself was refused, not one field.
 *
 * "You are not allowed to do that" is deliberately absent: Stake says it to a
 * signed-out visitor and to a signed-in one asking for something in a shape it
 * will not serve, and reading it as an expiry threw away a live token on every
 * run - the account signed itself back in over and over, and the refusal came
 * again, because nothing about the session was wrong.
 */
const SESSION_REFUSED =
  /\b(unauthenti\w*|unauthori\w*|must be logged in|not logged in|invalid (access )?token|session (has )?expired)\b/i;

/**
 * Wording that means "stop asking for a while". Stake answers 200 with these in
 * the errors array rather than a 429, so a throttle is indistinguishable from a
 * broken query unless it is read out of the text.
 *
 * "This action is not available" is included deliberately: it is what Stake says
 * when it will not serve an operation right now, whatever the reason behind it.
 * Backing off is the right answer to every one of those reasons - retrying at
 * poll speed is the wrong answer to all of them.
 */
const THROTTLED =
  /try again in a few minutes|too many requests|rate limit|action is not available/i;

/**
 * A refusal that will read the same way tomorrow: the site does not serve this
 * operation to this region at all. Not an error to act on - nothing about the
 * session or the query is wrong - so it is noted once and then left alone.
 */
const PERMANENTLY_REFUSED =
  /unavailable in your country or region|not available in your (country|region)/i;

let saidTokenOnly = false;
/** Operations already reported as region-locked, so the log says it once. */
const saidRefused = new Set<string>();

const gql = async (
  creds: Credentials,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<Record<string, unknown> | null> => {
  const accessToken = creds.fields.accessToken;
  const operationName = /query\s+(\w+)/.exec(query)?.[1];
  // Which query was turned away. Every one of them goes to the same URL, so a
  // refusal that names only the endpoint names nothing: "the wallet is refused
  // while the bets import" and "the login is dead" read identically.
  const ask = async (viaPage: boolean): Promise<unknown> => {
    try {
      return await asked(viaPage);
    } catch (err) {
      if (err instanceof SessionExpiredError)
        throw new SessionExpiredError(err.status, `${operationName ?? 'GraphQL'}, ${err.detail}`);
      throw err;
    }
  };
  const asked = (viaPage: boolean): Promise<unknown> =>
    authedJson(
      field(creds, 'apiBase') + GRAPHQL_PATH,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // Present only when Stake's own client sent one; the browser page does not.
          ...(accessToken === undefined ? {} : { 'x-access-token': accessToken }),
          // Named in the headers as well as in the body, because that is what the
          // site's own page does on every one of these calls, and what stands in
          // front of the endpoint reads the request before the schema does.
          ...(operationName === undefined
            ? {}
            : { 'x-operation-name': operationName, 'x-operation-type': 'query' }),
          'x-language': 'en',
        },
        credentials: 'include',
        body: JSON.stringify(
          operationName === undefined ? { query, variables } : { operationName, query, variables },
        ),
      },
      viaPage,
    );

  // From the site's own tab whenever one is open, which is how the site asks in
  // the first place. Stake authenticates two ways at once - the captured token
  // and the session cookie - and a request from the service worker carries only
  // the token: the browser treats the worker as a stranger to stake.com and
  // leaves the cookie off. The bet list is content with the token alone, the
  // wallet is not, which is why bets kept importing while every deposit read
  // came back refused.
  //
  // With no tab open there is nowhere to ask from, and the token by itself is
  // better than nothing: it still answers for bets, so a background run is not
  // lost. Without a token it is not, and the run waits for the next visit.
  let json: unknown;
  try {
    json = await ask(true);
  } catch (err) {
    if (accessToken === undefined || !(err instanceof RelayUnavailableError)) throw err;
    // Once, not once per query: a run makes dozens and they all take this turn.
    if (!saidTokenOnly) {
      saidTokenOnly = true;
      log('info', BOOKMAKER, 'no stake.com tab open; asking with the token alone');
    }
    try {
      json = await ask(false);
    } catch (tokenErr) {
      // A cookie-authenticated endpoint refusing a request that carries no cookie
      // says nothing about the session - the wallet answers the page and 401s the
      // worker while the very same login keeps importing bets. Read as an expiry
      // it threw away a live session, paused the money walk for an hour, and left
      // deposits importing only when a tab happened to be open. It is the same
      // "nowhere to ask from" as having no tab at all: wait for the next visit.
      if (tokenErr instanceof SessionExpiredError) throw err;
      throw tokenErr;
    }
  }

  // GraphQL answers 200 even when it refuses, so a dead session has to be read
  // out of the error text. Only wording that can mean nothing else counts: a
  // loose match drops a live token the moment any single field is refused, and
  // the account then reads as signed out while the user is signed in.
  const root = (typeof json === 'object' && json !== null ? json : {}) as {
    data?: unknown;
    errors?: { message?: string }[];
  };
  if (Array.isArray(root.errors) && root.errors.length > 0) {
    // Deduplicated: GraphQL reports one error per field it could not resolve, so
    // a throttled page of fifty bets came back as the same sentence fifty times
    // over - a log line thousands of characters long saying one thing.
    const message = [...new Set(root.errors.map((e) => e?.message ?? ''))].join('; ');
    if (SESSION_REFUSED.test(message)) throw new SessionExpiredError(401, message);
    // Named, because one refused field in one query reads exactly like every
    // query failing once the message reaches the console.
    const named = `Stake ${operationName ?? 'GraphQL'}: ${message}`;
    // A list the region is not served is not a fault to report on every run. It
    // is still asked for each time - a region is a property of where the user is,
    // not of the account - but it is only ever said once.
    if (PERMANENTLY_REFUSED.test(message)) {
      const key = operationName ?? named;
      if (!saidRefused.has(key)) {
        saidRefused.add(key);
        log('info', BOOKMAKER, named);
      }
      return (root.data ?? null) as Record<string, unknown> | null;
    }
    if (THROTTLED.test(message)) throw new RateLimitedError(RATE_LIMIT_BACKOFF_MS, named);
    // Partial answers are the normal shape of a GraphQL failure: the fields that
    // resolved are in `data` and only the ones that did not are in `errors`.
    // Throwing on any error at all discarded a whole page of bets because one
    // slip on it was unreadable, and the account then read as failed.
    if (root.data !== null && root.data !== undefined) {
      log('warn', BOOKMAKER, `${named} (rest of the answer kept)`);
      return root.data as Record<string, unknown>;
    }
    throw new Error(named);
  }
  return (root.data as Record<string, unknown> | undefined) ?? null;
};

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * Fields shared by every bet type. `status` and `potentialMultiplier` are
 * aliased outside `SportBet` because those types declare them with different
 * enum types, and GraphQL rejects a selection set that asks for one name in two
 * incompatible shapes. Aliasing is free where the types happen to agree.
 */
const MONEY_FIELDS = `
  id
  amount
  currency
  active
  payout
  payoutMultiplier
  createdAt
  updatedAt
`;

/**
 * The live counts, which the fixture carries alongside everything else. Asked
 * for only on the open bets: a settled slip has no in-play state, and the
 * import walks thousands of them.
 */
const LIVE_STATUS = `
    eventStatus {
      ... on SportFixtureEventStatusData {
        homeScore
        awayScore
        matchStatus
        clock { matchTime }
        statistic { corners { home away } }
      }
    }
`;

const fixtureFields = (extra = ''): string => `
  id
  name
  # A match and an outright are separate types that happen to share this one
  # field, so it has to be asked for on each of them by name.
  data {
    ... on SportFixtureDataMatch { startTime }
    ... on SportFixtureDataOutright { startTime }
  }
  tournament { name category { name sport { name } } }
  ${extra}
`;

const outcomeFields = (fixtureExtra = ''): string => `
  odds
  status
  outcome { name odds voidFactor }
  market { name }
  fixture { ${fixtureFields(fixtureExtra)} }
`;

/**
 * A player-prop leg. Its market is a stat on one competitor rather than a market
 * on the match, and the match itself hangs off the game. Nothing here reports a
 * result: the only thing the leg says about its own fate is whether it was
 * cancelled.
 */
const swishOutcomeFields = (fixtureExtra = ''): string => `
  odds
  cancel
  lineType
  outcome { name line }
  market {
    stat { name }
    competitor { name }
    game { fixture { ${fixtureFields(fixtureExtra)} } }
  }
`;

/**
 * A leg of a multi placed through the SportsbookX provider. It carries neither
 * odds nor a selection of its own - both live in its price history - and its
 * fixture is a union, because the same product also takes racing and player
 * props. Only the two that name a match are asked for; a racing leg has no
 * fixture we could read and arrives without one.
 */
const xOutcomeFields = (fixtureExtra = ''): string => `
  result { status }
  prices {
    marketName
    odds
    outcome {
      ... on SportMarketOutcome { name }
      ... on SwishMarketOutcome { name }
    }
  }
  fixture {
    ... on SportFixture { ${fixtureFields(fixtureExtra)} }
    ... on SwishGame { fixture { ${fixtureFields(fixtureExtra)} } }
  }
`;

const OUTCOME_FIELDS = outcomeFields();

/**
 * A slip staked from a promotion rather than from the balance. Declared by each
 * bet product separately, so it stays out of the shared money fields: asking for
 * it on a product that has no such field makes the server reject the whole query
 * and import nothing.
 */
// Only that it is there is read, so only the type name is asked for: what a
// promotion is called lives on fields that differ per promotion type, and asking
// for one the schema does not declare ("name") makes Stake refuse the whole
// query with a 400 and import nothing.
const PROMOTION_FIELD = 'promotionBet { __typename }';

const BET_UNION = `
  __typename
  ... on SportBet {
    ${MONEY_FIELDS}
    status
    potentialMultiplier
    ${PROMOTION_FIELD}
    outcomes { ${OUTCOME_FIELDS} }
  }
  ... on SportsbookXMultiBet {
    ${MONEY_FIELDS}
    xStatus: status
    xPotentialMultiplier: potentialMultiplier
    ${PROMOTION_FIELD}
    xOutcomes: outcomes { ${xOutcomeFields()} }
  }
  ... on SwishBet {
    ${MONEY_FIELDS}
    swishStatus: status
    swishPotentialMultiplier: potentialMultiplier
    ${PROMOTION_FIELD}
    swishOutcomes: outcomes { ${swishOutcomeFields()} }
  }
`;
// RacingBet is deliberately absent: it declares neither `payout` nor `status`,
// so asking for them would make GraphQL reject the whole query and import
// nothing. Without a payout its result is unknowable, and recording it would
// mean guessing. Such a slip arrives empty and is counted as skipped.

const BET_LIST = `query SportSportList($limit: Int!, $offset: Int!) {
  user { id sportBetList(limit: $limit, offset: $offset) { bet { ${BET_UNION} } } }
}`;

/**
 * The open slips. `sportBetList` answers about settled bets only - the schema
 * carries separate `active*` lists, one per bet product, and those are what the
 * site's own "Active" tab reads. Asking the settled list for an unsettled bet
 * returns nothing, which is why the panel had no Stake slips in it.
 *
 * All three products in one round trip: they are three fields of the same user.
 */
const ACTIVE_BETS = `query ActiveBets($limit: Int!) {
  user {
    id
    activeSportBets(limit: $limit, offset: 0) {
      __typename
      ${MONEY_FIELDS}
      status
      potentialMultiplier
      ${PROMOTION_FIELD}
      outcomes { ${outcomeFields(LIVE_STATUS)} }
    }
    activeSwishBetList(limit: $limit, offset: 0) {
      __typename
      ${MONEY_FIELDS}
      swishStatus: status
      swishPotentialMultiplier: potentialMultiplier
      ${PROMOTION_FIELD}
      swishOutcomes: outcomes { ${swishOutcomeFields(LIVE_STATUS)} }
    }
    activeSportsbookXMultiBetList(limit: $limit, offset: 0) {
      __typename
      ${MONEY_FIELDS}
      xStatus: status
      xPotentialMultiplier: potentialMultiplier
      ${PROMOTION_FIELD}
      xOutcomes: outcomes { ${xOutcomeFields(LIVE_STATUS)} }
    }
  }
}`;

/** The fields of `ACTIVE_BETS` that carry bets, in the order they are read. */
const ACTIVE_LISTS = [
  'activeSportBets',
  'activeSwishBetList',
  'activeSportsbookXMultiBetList',
] as const;

/**
 * Both of these are the site's own query, field for field, rather than the
 * smallest one that would answer. The wallet endpoints refuse a request that
 * does not look like the page's - asking for a subset of the same fields was
 * answered with a flat 401 while the bet list, asked our way, kept answering.
 */
const DEPOSIT_LIST = `query DepositList($offset: Int = 0, $limit: Int = 10) {
  user {
    id
    depositList(offset: $offset, limit: $limit) {
      ...DepositFragment
    }
  }
}

fragment DepositFragment on WalletDeposit {
  id
  createdAt
  amount
  currency
  status
  chain
  hash
  tokensReceived {
    currency
    amount
  }
  depositPaymentProvider
}`;

const WITHDRAWAL_LIST = `query WithdrawalList($showFees: Boolean = false, $name: String, $offset: Int = 0, $limit: Int = 10) {
  user(name: $name) {
    id
    withdrawalList(offset: $offset, limit: $limit) {
      id
      createdAt
      amount
      currency
      status
      hash
      id
      address
      chain
      refFee @include(if: $showFees)
      walletFee @include(if: $showFees)
      tokensSent {
        currency
        amount
      }
      withdrawalProvider
    }
  }
}`;

/**
 * Which login is signed in. Stake authenticates by cookie, so two accounts send
 * byte-identical credentials - asking the site who it thinks we are is the only
 * way to tell them apart, and it has to happen before anything is written.
 */
const USER_ID = `query UserId { user { id } }`;

const USER_BALANCES = `query UserBalances {
  user { id balances { available { amount currency } vault { amount currency } } }
}`;

/**
 * Lifetime turnover, as Stake counts it. The casino runs off the same wallet and
 * never writes a bet we could read, so this is the only figure that says what it
 * took. One row per coin per product; `betValue` is Stake's own USD pricing of
 * `betAmount`, which saves pricing 170 coins ourselves.
 */
const USER_WAGERED = `query BettrackerWagered {
  user { id statisticScoped { betAmount betValue currency scope } }
}`;

/**
 * Casino rounds, one row per spin. Stake is the rare site that records them, so
 * its casino is not only the gap in the wallet.
 *
 * `bet` is a union of seven types and every field has to be asked for on each of
 * them by name. `createdAt` rather than the `updatedAt` Stake's own page asks
 * for: the live-casino type is the one that does not declare `updatedAt`, and a
 * round with no clock cannot be put in a session.
 */
const CASINO_FIELDS = 'id active amount payout payoutMultiplier currency createdAt';

const CASINO_BET_LIST = `query BettrackerCasinoBets($offset: Int = 0, $limit: Int = 50) {
  user {
    id
    houseBetList(offset: $offset, limit: $limit) {
      id
      type
      game { name slug provider { name } }
      bet {
        ... on CasinoBet { ${CASINO_FIELDS} }
        ... on MultiplayerCrashBet { ${CASINO_FIELDS} }
        ... on MultiplayerSlideBet { ${CASINO_FIELDS} }
        ... on SoftswissBet { ${CASINO_FIELDS} }
        ... on ThirdPartyBet { ${CASINO_FIELDS} }
        ... on ZooBet { ${CASINO_FIELDS} }
        ... on EvolutionBet { ${CASINO_FIELDS} }
      }
    }
  }
}`;

const CURRENCY_CONFIG = `query CurrencyConfiguration($isAcp: Boolean!) {
  currencyConfiguration(isAcp: $isAcp) { baseRates { currency baseRate } }
}`;

// ── Raw payload (only what we read; all optional/defensive) ───────────────────

interface RawOutcome {
  odds?: number | null;
  status?: string | null;
  outcome?: { name?: string | null; odds?: number | null; voidFactor?: number | null } | null;
  market?: { name?: string | null } | null;
  fixture?: RawFixture | null;
}

interface RawFixture {
  id?: string | null;
  name?: string | null;
  data?: { startTime?: string | null } | null;
  tournament?: {
    name?: string | null;
    category?: { name?: string | null; sport?: { name?: string | null } | null } | null;
  } | null;
  /** Only asked for on the open bets, so absent on everything else. */
  eventStatus?: {
    homeScore?: number | null;
    awayScore?: number | null;
    /** The period being played, named - "1st half", "Halftime", "Ended". */
    matchStatus?: string | null;
    /** Null on every fixture that is not running, and on books that send none. */
    clock?: { matchTime?: string | number | null } | null;
    statistic?: { corners?: { home?: number | null; away?: number | null } | null } | null;
  } | null;
}

/** A player-prop leg, as `SwishBet` describes one. */
interface RawSwishOutcome {
  odds?: number | null;
  cancel?: boolean | null;
  /** Which side of the line was taken - "over", "under", "push". */
  lineType?: string | null;
  outcome?: { name?: string | null; line?: number | null } | null;
  market?: {
    stat?: { name?: string | null } | null;
    competitor?: { name?: string | null } | null;
    game?: { fixture?: RawFixture | null } | null;
  } | null;
}

/** A leg of a multi placed through the SportsbookX provider. */
interface RawXOutcome {
  result?: { status?: string | null } | null;
  prices?:
    | {
        marketName?: string | null;
        odds?: number | null;
        outcome?: { name?: string | null } | null;
      }[]
    | null;
  /** Either the match itself, or a player-prop game wrapped around one. */
  fixture?: (RawFixture & { fixture?: RawFixture | null }) | null;
}

interface RawBet {
  __typename?: string;
  id?: string;
  amount?: number | null;
  currency?: string | null;
  active?: boolean | null;
  payout?: number | null;
  payoutMultiplier?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  status?: string | null;
  potentialMultiplier?: number | null;
  xStatus?: string | null;
  xPotentialMultiplier?: number | null;
  swishStatus?: string | null;
  swishPotentialMultiplier?: number | null;
  /** Present and non-null only when the stake came from a promotion. */
  promotionBet?: { __typename?: string | null } | null;
  outcomes?: RawOutcome[] | null;
  swishOutcomes?: RawSwishOutcome[] | null;
  xOutcomes?: RawXOutcome[] | null;
}

interface RawMovement {
  id?: string;
  createdAt?: string | null;
  amount?: number | null;
  currency?: string | null;
  status?: string | null;
}

// ── Defensive helpers ────────────────────────────────────────────────────────

const toNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const toStringOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

/** Timestamps arrive as RFC-1123 GMT; store UTC ISO like every other source. */
const normalizeTimestamp = (value: string): string => {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? value : new Date(ms).toISOString();
};

/** Amounts are denominated in the coin, which the API reports lower-cased. */
const normalizeCurrency = (value: unknown): string =>
  (toStringOrNull(value) ?? 'usd').toUpperCase();

const statusOf = (raw: RawBet): string =>
  toStringOrNull(raw.status) ??
  toStringOrNull(raw.xStatus) ??
  toStringOrNull(raw.swishStatus) ??
  '';

const multiplierOf = (raw: RawBet): number =>
  toNumber(raw.potentialMultiplier ?? raw.xPotentialMultiplier ?? raw.swishPotentialMultiplier, 0);

/**
 * Stake reports what happened to the bet, not whether it won - for that, the
 * payout is the only honest signal. A settled bet that paid nothing lost; one
 * that paid anything won, whatever the multiplier says.
 */
const mapBetStatus = (raw: RawBet): BetStatus => {
  const status = statusOf(raw).toLowerCase();
  if (status.startsWith('cashout')) return 'cashed_out';
  if (status.startsWith('cancel')) return 'void';
  if (raw.active === true || status === '') return 'pending';
  return toNumber(raw.payout, 0) > 0 ? 'won' : 'lost';
};

/** Prefix-matched because the site spells the same outcome both ways ("void", "voided"). */
const mapLegStatus = (raw: string | null | undefined): BetStatus => {
  const status = (raw ?? '').toLowerCase();
  if (status.startsWith('won')) return 'won';
  if (status.startsWith('lost') || status === 'eliminated') return 'lost';
  if (/^(void|cancel|refund)/.test(status)) return 'void';
  return 'pending';
};

/**
 * Every bet product describes a leg its own way, and the three shapes cannot
 * share a field name in one query, so each arrives under its own alias. They are
 * folded into the one shape the leg mapper and the score reader both read, so
 * neither has to know which product a slip came from.
 */
const outcomesOf = (raw: RawBet): RawOutcome[] => {
  if (Array.isArray(raw.outcomes)) return raw.outcomes;
  if (Array.isArray(raw.swishOutcomes)) return raw.swishOutcomes.map(fromSwishOutcome);
  if (Array.isArray(raw.xOutcomes)) return raw.xOutcomes.map(fromXOutcome);
  return [];
};

/**
 * A prop is a stat on one competitor against a line, so the selection has to be
 * put together from the three of them - "L. Doncic over 27.5" - rather than read
 * off a field. Nothing on the leg reports a result: `cancel` is all it says.
 */
const fromSwishOutcome = (raw: RawSwishOutcome): RawOutcome => {
  const market = raw.market ?? null;
  const line = raw.outcome?.line;
  const name = [
    toStringOrNull(raw.outcome?.name) ?? toStringOrNull(market?.competitor?.name),
    toStringOrNull(raw.lineType),
    typeof line === 'number' ? String(line) : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' ');
  return {
    odds: raw.odds ?? null,
    status: raw.cancel === true ? 'cancelled' : null,
    outcome: { name: name === '' ? null : name },
    market: { name: toStringOrNull(market?.stat?.name) },
    fixture: market?.game?.fixture ?? null,
  };
};

/**
 * The price history is the leg's own record of what it was struck at: the last
 * entry is the price that stood when the slip was accepted, and the ones before
 * it are the moves it went through. A racing leg names no fixture, and arrives
 * with none rather than with a guessed one.
 */
const fromXOutcome = (raw: RawXOutcome): RawOutcome => {
  const prices = Array.isArray(raw.prices) ? raw.prices : [];
  const price = prices[prices.length - 1] ?? null;
  const fixture = raw.fixture ?? null;
  return {
    odds: price?.odds ?? null,
    status: raw.result?.status ?? null,
    outcome: { name: toStringOrNull(price?.outcome?.name) },
    market: { name: toStringOrNull(price?.marketName) },
    fixture: fixture?.fixture ?? fixture,
  };
};

/**
 * What the slip is, read off the legs it carries. A product that served none -
 * racing, or a leg the query asks nothing about - is typed by what its name
 * means instead: an X-multi is a multi, anything else is one slip.
 */
const mapBetType = (raw: RawBet): BetType => {
  const outcomes = outcomesOf(raw).length;
  if (outcomes > 1) return 'accumulator';
  if (outcomes === 1) return 'single';
  return raw.__typename === 'SportsbookXMultiBet' ? 'accumulator' : 'single';
};

const normalizeLeg = (raw: RawOutcome): BetLeg => {
  const fixture = raw.fixture ?? null;
  const tournament = fixture?.tournament ?? null;
  const startTime = toStringOrNull(fixture?.data?.startTime ?? null);
  const eventId = toStringOrNull(fixture?.id ?? null);
  // The category a tournament sits under is where it is played: the Premier
  // League under England, a major under International.
  const country = toStringOrNull(tournament?.category?.name ?? null);
  return {
    sport: toStringOrNull(tournament?.category?.sport?.name ?? null),
    league: toStringOrNull(tournament?.name ?? null),
    ...(country === null ? {} : { country }),
    event: toStringOrNull(fixture?.name ?? null),
    marketType: toStringOrNull(raw.market?.name ?? null),
    selection: toStringOrNull(raw.outcome?.name ?? null),
    odds: toNumber(raw.odds ?? raw.outcome?.odds, 0) || null,
    status: mapLegStatus(raw.status),
    eventDate: startTime === null ? null : normalizeTimestamp(startTime),
    // Stake serves no in-play flag on a settled slip, and guessing one would be
    // a made-up number in a field the dashboard segments by.
    isLive: false,
    ...(eventId === null ? {} : { eventId }),
  };
};

/**
 * The in-play counts of one leg's fixture, if it carries any.
 *
 * Only what the payload states outright: the match score, and corners where the
 * statistic block has them. Cards are left out - they arrive split across
 * yellow, red and yellow-red, and adding those up would put a number on screen
 * the bookmaker never gave.
 */
const scoresOf = (raw: RawOutcome): [string, LiveScore[]] | null => {
  const eventId = toStringOrNull(raw.fixture?.id ?? null);
  const status = raw.fixture?.eventStatus ?? null;
  if (eventId === null || status === null) return null;

  const pair = (
    home: number | null | undefined,
    away: number | null | undefined,
    kind?: string,
  ): LiveScore[] =>
    typeof home === 'number' && typeof away === 'number'
      ? [{ home: String(home), away: String(away), ...(kind === undefined ? {} : { kind }) }]
      : [];

  // Both are passed on as they came, including "Not started": which of a minute
  // and a period belongs on screen depends on the sport, and whether a word means
  // the match is being played is not this adapter's question either.
  const time = status.clock?.matchTime ?? null;
  const part = status.matchStatus ?? null;
  const live = {
    ...(typeof time === 'number'
      ? { clock: `${String(time)}'` }
      : typeof time === 'string' && time !== ''
        ? { clock: time }
        : {}),
    ...(part === null ? {} : { period: part }),
  };

  // A fixture put back carries its state and no scoreline at all, and that state
  // is the whole reason the slip is not in play: it is passed on without one.
  const match = pair(status.homeScore, status.awayScore);
  const played =
    match.length > 0
      ? match.map((score) => ({ ...score, ...live }))
      : 'period' in live || 'clock' in live
        ? [{ home: '', away: '', ...live }]
        : [];
  const scores = [
    ...played,
    ...pair(status.statistic?.corners?.home, status.statistic?.corners?.away, 'Corners'),
  ];
  return scores.length > 0 ? [eventId, scores] : null;
};

const topLevelSport = (legs: BetLeg[]): string | null => {
  const sports = [...new Set(legs.map((l) => l.sport).filter((s): s is string => s !== null))];
  if (sports.length === 0) return null;
  if (sports.length === 1) return sports[0] ?? null;
  return 'Multiple';
};

export const normalizeBet = (raw: RawBet, accountId: AccountId): Bet | null => {
  const id = toStringOrNull(raw.id);
  const createdAt = toStringOrNull(raw.createdAt);
  if (id === null || createdAt === null) return null;

  const legs = outcomesOf(raw).map(normalizeLeg);
  const status = mapBetStatus(raw);
  const stake = toNumber(raw.amount, 0);
  const odds = multiplierOf(raw);
  const updatedAt = toStringOrNull(raw.updatedAt);
  const settled = status !== 'pending' && updatedAt !== null ? normalizeTimestamp(updatedAt) : null;

  const first = legs[0];
  return {
    // Namespaced so an imported bet can never collide with another book's ids.
    betId: `stake-${id}`,
    bookmaker: BOOKMAKER,
    accountId,
    placedAt: normalizeTimestamp(createdAt),
    settledAt: settled,
    cashedOutAt: status === 'cashed_out' ? settled : null,
    sport: topLevelSport(legs),
    league: first?.league ?? null,
    event: first?.event ?? null,
    marketType: first?.marketType ?? null,
    selection: first?.selection ?? null,
    odds,
    stake,
    // The whole stake, or none of it: a promotion slip is funded entirely by the
    // promotion here, there is no part-bonus stake on this site.
    ...(raw.promotionBet ? { bonusStake: stake } : {}),
    potentialReturn: stake * odds,
    actualReturn: status === 'void' ? stake : toNumber(raw.payout, 0),
    status,
    betType: mapBetType(raw),
    legs,
    currency: normalizeCurrency(raw.currency),
  };
};

/**
 * An empty `sportBetList` is the end of the history and the walk above reads it
 * as one. A *missing* one used to read the same way - which is why this goes
 * through `readList`: the two answers mean opposite things, and telling them
 * apart is the difference between "you have no older bets" and a total that
 * quietly stopped growing.
 */
export const parseBetPage = (
  data: Record<string, unknown> | null,
  accountId: AccountId,
): { bets: Bet[]; skipped: number } => {
  const { parsed, skipped } = readList(
    BOOKMAKER,
    'bet list',
    (data?.user as { sportBetList?: unknown } | undefined)?.sportBetList,
    (item) => {
      const raw = (item as { bet?: unknown } | null)?.bet;
      return raw === null || raw === undefined ? null : normalizeBet(raw as RawBet, accountId);
    },
  );
  return { bets: parsed, skipped };
};

// ── Deposits / withdrawals ───────────────────────────────────────────────────

/**
 * Statuses that mean the money never moved. A deny-list on purpose: an unseen
 * success-like status still counts, where an allow-list would silently drop it
 * and quietly understate the account.
 */
const NOT_MOVED = /^(pending|failed|cancell?ed|rejected|expired|declined|processing)$/i;

const normalizeMovement = (
  raw: RawMovement,
  kind: Transaction['kind'],
  accountId: AccountId,
): Transaction | null => {
  const id = toStringOrNull(raw.id);
  const createdAt = toStringOrNull(raw.createdAt);
  const amount = toNumber(raw.amount, 0);
  const status = toStringOrNull(raw.status) ?? 'confirmed';
  if (id === null || createdAt === null || amount <= 0) return null;
  if (NOT_MOVED.test(status)) return null;

  return {
    id: `stake-${kind === 'deposit' ? 'dep' : 'wd'}-${id}`,
    bookmaker: BOOKMAKER,
    accountId,
    kind,
    amount,
    currency: normalizeCurrency(raw.currency),
    occurredAt: normalizeTimestamp(createdAt),
    note: status.toLowerCase() === 'confirmed' ? null : status,
    // One wallet funds both the sportsbook and the casino here, so labelling a
    // deposit either way would be a guess. Left unset, it counts as money in.
  };
};

/**
 * The lists are newest-first and every row carries the bookmaker's own id, so a
 * page in which nothing was new is a page whose whole tail we already hold. A
 * shallow run stops there instead of walking the full history again on every
 * sync - which is what wrote the same forty transactions to the log all evening.
 * The first page is always read and upserted, so a changed recent row still
 * lands.
 */
const importMovements = async (
  creds: Credentials,
  account: AccountRef,
  query: string,
  listKey: 'depositList' | 'withdrawalList',
  kind: Transaction['kind'],
  deep: boolean,
): Promise<{ imported: number; complete: boolean }> => {
  let imported = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await gql(creds, query, {
      offset: page * MONEY_PAGE_LIMIT,
      limit: MONEY_PAGE_LIMIT,
    });
    const list = (data?.user as Record<string, unknown> | undefined)?.[listKey];
    if (!Array.isArray(list) || list.length === 0) return { imported, complete: true };
    let fresh = 0;
    for (const item of list) {
      const txn = normalizeMovement(item as RawMovement, kind, account.accountId);
      if (txn && (await putTransaction(txn))) fresh += 1;
    }
    imported += fresh;
    if (list.length < MONEY_PAGE_LIMIT) return { imported, complete: true };
    // Not `complete`: the rest of the history was skipped, not confirmed read.
    if (!deep && fresh === 0) return { imported, complete: false };
  }
  // Ran out of pages before the list did: history is longer than we walked.
  return { imported, complete: false };
};

// ── Casino rounds ────────────────────────────────────────────────────────────

/**
 * Stake's own word for the round, mapped onto the kinds the app knows. `stake`
 * runs its Originals, `softswiss` is the slot shelf it integrates itself and
 * `evolution` the live tables. A third-party studio's game is left as that: the
 * site never says which of its games are slots and which are live, and calling
 * them either would be a guess printed as a fact.
 */
const CASINO_KINDS: Record<string, CasinoKind> = {
  casino: 'originals',
  crash: 'originals',
  slide: 'originals',
  swish: 'originals',
  zoo: 'originals',
  softswiss: 'slots',
  evolution: 'live',
  thirdparty: 'provider',
};

interface RawRound {
  id?: string | null;
  type?: string | null;
  game?: {
    name?: string | null;
    slug?: string | null;
    provider?: { name?: string | null } | null;
  } | null;
  bet?: {
    id?: string | null;
    active?: boolean | null;
    amount?: number | null;
    payout?: number | null;
    payoutMultiplier?: number | null;
    currency?: string | null;
    createdAt?: string | null;
  } | null;
}

/**
 * One round, or null where it is not one we can state honestly: a round still
 * running has no result yet, and one whose kind or clock the site withheld would
 * land in a session it cannot be shown to belong to.
 */
export const normalizeRound = (raw: RawRound, accountId: AccountId): CasinoRound | null => {
  const id = toStringOrNull(raw?.id);
  const bet = raw?.bet;
  const createdAt = toStringOrNull(bet?.createdAt);
  const kind = CASINO_KINDS[toStringOrNull(raw?.type) ?? ''];
  if (id === null || bet === null || bet === undefined || createdAt === null) return null;
  if (kind === undefined || bet.active === true) return null;

  const stake = toNumber(bet.amount, 0);
  const payout = toNumber(bet.payout, 0);
  return {
    id: `stake-round-${id}`,
    bookmaker: BOOKMAKER,
    accountId,
    playedAt: normalizeTimestamp(createdAt),
    game: toStringOrNull(raw.game?.name) ?? 'Unnamed game',
    gameSlug: toStringOrNull(raw.game?.slug) ?? 'unknown',
    kind,
    provider: toStringOrNull(raw.game?.provider?.name),
    stake,
    payout,
    // Stake's own figure where it gives one, so a round it prices differently
    // from the plain ratio stays its number rather than ours.
    multiplier: toNumber(bet.payoutMultiplier, stake === 0 ? 0 : payout / stake),
    currency: normalizeCurrency(bet.currency),
  };
};

/**
 * The rounds, newest first, walked the way the deposits are: a page in which
 * nothing was new is a page whose whole tail is already stored, so a routine sync
 * stops there rather than re-reading a casino history that runs to thousands of
 * spins.
 */
const importRounds = async (
  creds: Credentials,
  account: AccountRef,
  deep: boolean,
): Promise<number> => {
  let imported = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await gql(creds, CASINO_BET_LIST, {
      offset: page * PAGE_LIMIT,
      limit: PAGE_LIMIT,
    });
    const list = (data?.user as Record<string, unknown> | undefined)?.houseBetList;
    if (!Array.isArray(list) || list.length === 0) return imported;
    const rounds = list.flatMap((item) => normalizeRound(item as RawRound, account.accountId) ?? []);
    const fresh = await putCasinoRounds(rounds);
    imported += fresh;
    if (list.length < PAGE_LIMIT) return imported;
    if (!deep && fresh === 0) return imported;
  }
  return imported;
};

// ── Rewards ledger ───────────────────────────────────────────────────────────

/**
 * Rakeback is paid back out of the house edge on every bet and sits waiting to
 * be claimed, so the balance it reports is worth nothing as history - it is a
 * different number every day and would read as a new bonus each time it is
 * looked at. The claims themselves are a paged ledger with the bookmaker's own
 * row id on every entry, exactly like deposits and withdrawals, and that is what
 * gets written down.
 */
const RAKEBACK_LEDGER = `query BettrackerRakebackLedger($limit: Int!, $offset: Int!) {
  user {
    rakeback {
      transactions(limit: $limit, offset: $offset) {
        id
        amount
        currency
        createdAt
      }
    }
  }
}`;

/** Bonuses credited to the account by hand or by a campaign, newest first. */
const BONUS_LEDGER = `query BettrackerBonusLedger($limit: Int!, $offset: Int!) {
  user {
    bonusList(limit: $limit, offset: $offset) {
      id
      name
      amount
      currency
      credit
      createdAt
    }
  }
}`;

/** Bonus codes the account redeemed; the site calls these coupons. */
const BONUS_CLAIM_LEDGER = `query BettrackerBonusClaims($limit: Int!, $offset: Int!) {
  user {
    bonusClaimList(limit: $limit, offset: $offset) {
      amount
      currency
      claimedAt
      redeemed
      bonusCode {
        id
        code
        expiresAt
      }
    }
  }
}`;

/**
 * Deposit bonuses in every end state, with the rollover that decides whether one
 * became real money. `activeRollovers` is the only place the turnover progress
 * is published, and it names no bonus, so it is matched on currency - the
 * account cannot have two deposit bonuses running in one coin at once.
 */
const DEPOSIT_BONUS_LEDGER = `query BettrackerDepositBonuses($limit: Int!, $offset: Int!) {
  user {
    depositBonusList(limit: $limit, offset: $offset) {
      id
      status
      currency
      bonusMultiplier
      maxBetMultiplier
      minDepositValue
      maxDepositValue
      createdAt
      updatedAt
      transactions {
        id
        amount
        currency
        createdAt
      }
    }
    activeRollovers {
      id
      amount
      currency
      progress
      expectedAmount
      expectedAmountMin
      type
      expireAt
      maxBet
    }
  }
}`;

/** Everything that only ever has a value right now, in one round trip. */
const PERKS = `query BettrackerPerks {
  user {
    rakeback {
      enabled
      rate
      balances {
        currency
        availableAmount
        receivedAmount
        totalAmount
      }
    }
    faucet {
      value
      active
      claimInterval
      lastClaim
      expireAt
    }
    flags {
      flag
      rank
    }
    flagProgress {
      flag
      progress
    }
  }
}`;

interface RawRakebackTransaction {
  id?: string | null;
  amount?: number | null;
  currency?: string | null;
  createdAt?: string | null;
}

interface RawUserBonus {
  id?: string | null;
  name?: string | null;
  amount?: number | null;
  currency?: string | null;
  credit?: string | null;
  createdAt?: string | null;
}

interface RawBonusClaim {
  amount?: number | null;
  currency?: string | null;
  claimedAt?: string | null;
  redeemed?: boolean | null;
  bonusCode?: { id?: string | null; code?: string | null; expiresAt?: string | null } | null;
}

interface RawRollover {
  id?: string | null;
  amount?: number | null;
  currency?: string | null;
  progress?: number | null;
  expectedAmount?: number | null;
  expectedAmountMin?: number | null;
  type?: string | null;
  expireAt?: string | null;
  maxBet?: number | null;
}

interface RawDepositBonusRow {
  id?: string | null;
  status?: string | null;
  currency?: string | null;
  bonusMultiplier?: number | null;
  maxBetMultiplier?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  transactions?: RawRakebackTransaction[] | null;
}

/**
 * Claimed rakeback is real money the moment it lands - there is no wagering
 * behind it and no way to lose it - so it is written as already released rather
 * than as a grant waiting to convert.
 */
export const rakebackBonus = (raw: RawRakebackTransaction, accountId: AccountId): Bonus | null => {
  const id = toStringOrNull(raw.id);
  const createdAt = toStringOrNull(raw.createdAt);
  const amount = toNumber(raw.amount, 0);
  if (id === null || createdAt === null || amount <= 0) return null;
  return {
    id: `stake-rakeback-${id}`,
    bookmaker: BOOKMAKER,
    accountId,
    name: 'Rakeback',
    code: null,
    description: 'Cashback on bets',
    type: 'rakeback',
    trigger: 'wager',
    status: 'released',
    grantedAmount: amount,
    currentAmount: amount,
    currency: normalizeCurrency(raw.currency),
    grantedAt: normalizeTimestamp(createdAt),
    expiresAt: null,
    wageringRequired: 0,
    wageringDone: 0,
  };
};

/**
 * A bonus credited straight to a wallet. `credit` says which one: money put in
 * the vault is out of betting reach until it is taken back out, but it is the
 * player's either way, so both count as released.
 */
export const creditedBonus = (raw: RawUserBonus, accountId: AccountId): Bonus | null => {
  const id = toStringOrNull(raw.id);
  const createdAt = toStringOrNull(raw.createdAt);
  const amount = toNumber(raw.amount, 0);
  if (id === null || createdAt === null || amount <= 0) return null;
  const credit = toStringOrNull(raw.credit);
  return {
    id: `stake-credit-${id}`,
    bookmaker: BOOKMAKER,
    accountId,
    name: toStringOrNull(raw.name) ?? 'Bonus',
    code: null,
    description: credit === 'vault' ? 'Credited to the vault' : 'Credited to the balance',
    type: 'standard',
    trigger: 'manual',
    status: 'released',
    grantedAmount: amount,
    currentAmount: amount,
    currency: normalizeCurrency(raw.currency),
    grantedAt: normalizeTimestamp(createdAt),
    expiresAt: null,
    wageringRequired: 0,
    wageringDone: 0,
  };
};

/**
 * A redeemed bonus code. The claim carries no id of its own, so the code's does
 * the keying: an account can only claim a given code once.
 */
export const couponBonus = (raw: RawBonusClaim, accountId: AccountId): Bonus | null => {
  const id = toStringOrNull(raw.bonusCode?.id ?? null);
  const claimedAt = toStringOrNull(raw.claimedAt ?? null);
  const amount = toNumber(raw.amount, 0);
  if (id === null || claimedAt === null || amount <= 0) return null;
  const code = toStringOrNull(raw.bonusCode?.code ?? null);
  return {
    id: `stake-coupon-${id}`,
    bookmaker: BOOKMAKER,
    accountId,
    name: code ?? 'Coupon',
    code,
    description: 'Bonus code redeemed',
    type: 'standard',
    trigger: 'manual',
    // `redeemed` is the site saying the money left the code and reached the
    // wallet; until then the claim is a promise like any other grant.
    status: raw.redeemed === true ? 'released' : 'active',
    grantedAmount: amount,
    currentAmount: amount,
    currency: normalizeCurrency(raw.currency),
    grantedAt: normalizeTimestamp(claimedAt),
    expiresAt: toStringOrNull(raw.bonusCode?.expiresAt ?? null),
    wageringRequired: 0,
    wageringDone: 0,
  };
};

/**
 * The bookmaker's own end states. `claimed` is the one still in play: the money
 * has been granted and the turnover behind it is not finished, which is what
 * `active` means everywhere else in this app.
 */
const DEPOSIT_BONUS_STATUS: Record<string, Bonus['status']> = {
  pending: 'active',
  accepted: 'active',
  claimed: 'active',
  rejected: 'forfeited',
};

export const depositBonusGrant = (
  raw: RawDepositBonusRow,
  rollovers: readonly RawRollover[],
  accountId: AccountId,
): Bonus | null => {
  const id = toStringOrNull(raw.id);
  const createdAt = toStringOrNull(raw.createdAt);
  if (id === null || createdAt === null) return null;

  const currency = normalizeCurrency(raw.currency);
  // What the bonus actually paid, not what the multiplier promised: the grant is
  // the sum of the credits the bookmaker made against it.
  const granted = (raw.transactions ?? []).reduce((sum, t) => sum + toNumber(t?.amount, 0), 0);
  const rollover = rollovers.find((r) => normalizeCurrency(r.currency) === currency) ?? null;
  const required = rollover === null ? 0 : toNumber(rollover.expectedAmount, 0);
  // `progress` is the share already turned over, so the turnover itself has to
  // be counted back out of it - the payload never states it outright.
  const done =
    rollover === null ? 0 : required * Math.min(1, Math.max(0, toNumber(rollover.progress, 0)));
  const status = DEPOSIT_BONUS_STATUS[toStringOrNull(raw.status) ?? ''] ?? 'closed';
  const expireAt = rollover === null ? null : toStringOrNull(rollover.expireAt);

  return {
    id: `stake-deposit-bonus-${id}`,
    bookmaker: BOOKMAKER,
    accountId,
    name: 'Deposit bonus',
    code: null,
    description:
      raw.bonusMultiplier === null || raw.bonusMultiplier === undefined
        ? null
        : `Matched at ×${String(raw.bonusMultiplier)}`,
    type: 'standard',
    trigger: 'deposit',
    // A finished rollover is money that cleared; anything else is still owed.
    status: status === 'active' && required > 0 && done >= required ? 'released' : status,
    grantedAmount: granted,
    currentAmount: granted,
    currency,
    grantedAt: normalizeTimestamp(createdAt),
    expiresAt: expireAt === null ? null : normalizeTimestamp(expireAt),
    wageringRequired: required,
    wageringDone: done,
  };
};

interface RawRakebackBalance {
  currency?: string | null;
  availableAmount?: number | null;
  receivedAmount?: number | null;
  totalAmount?: number | null;
}

export const parsePerks = (
  data: Record<string, unknown> | null,
  rates: Map<string, number>,
  account: AccountRef,
): AccountPerks => {
  const user = (data?.user ?? {}) as {
    rakeback?: { enabled?: boolean; balances?: RawRakebackBalance[] } | null;
    faucet?: {
      value?: number | null;
      active?: boolean | null;
      claimInterval?: number | null;
      lastClaim?: string | null;
      expireAt?: string | null;
    } | null;
    flags?: { flag?: string | null; rank?: number | null }[] | null;
    flagProgress?: { flag?: string | null; progress?: number | null } | null;
  };

  const rakeback = user.rakeback ?? null;
  const balances = (rakeback?.balances ?? []).flatMap((b) => {
    const amount = toNumber(b?.availableAmount, 0);
    if (amount <= 0) return [];
    const currency = normalizeCurrency(b?.currency);
    const rate = rates.get(currency);
    return [{ currency, amount, worth: rate === undefined ? null : amount * rate }];
  });
  balances.sort((a, b) => (b.worth ?? 0) - (a.worth ?? 0));

  const faucet = user.faucet ?? null;
  const lastClaim = faucet === null ? null : toStringOrNull(faucet.lastClaim);
  const expireAt = faucet === null ? null : toStringOrNull(faucet.expireAt);
  // The tier is the highest-ranked flag; the rest are permissions, not levels.
  const level = (user.flags ?? []).reduce<{ flag: string; rank: number } | null>((best, f) => {
    const flag = toStringOrNull(f?.flag);
    if (flag === null) return best;
    const rank = toNumber(f?.rank, 0);
    return best === null || rank > best.rank ? { flag, rank } : best;
  }, null);

  return {
    bookmaker: BOOKMAKER,
    accountId: account.accountId,
    readAt: new Date().toISOString(),
    rakeback: rakeback === null ? null : { enabled: rakeback.enabled === true, balances },
    vip:
      level === null && user.flagProgress == null
        ? null
        : {
            level: level?.flag ?? toStringOrNull(user.flagProgress?.flag),
            progress:
              user.flagProgress?.progress === null || user.flagProgress?.progress === undefined
                ? null
                : toNumber(user.flagProgress.progress, 0),
          },
    reload:
      faucet === null
        ? null
        : {
            active: faucet.active === true,
            value: toNumber(faucet.value, 0),
            claimIntervalMs: toNumber(faucet.claimInterval, 0) || null,
            lastClaimAt: lastClaim === null ? null : normalizeTimestamp(lastClaim),
            expiresAt: expireAt === null ? null : normalizeTimestamp(expireAt),
          },
  };
};

/** The page size Stake's own reward lists use. */
const LEDGER_PAGE_LIMIT = 25;

/**
 * Walks one reward ledger, writing every row it can read. Stops on the first
 * short page like the deposit walk does, and gives up after `MAX_PAGES` so a
 * list that keeps answering can never spin forever.
 *
 * Shallow runs stop at the first page that held nothing new: these ledgers are
 * newest-first and keyed by the bookmaker's own row ids, so everything past such
 * a page is already stored. The first page is still read and upserted every
 * time, which is what keeps a running deposit bonus's rollover current.
 */
const importLedger = async (
  creds: Credentials,
  query: string,
  read: (data: Record<string, unknown> | null) => Bonus[],
  deep: boolean,
): Promise<number> => {
  let imported = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await gql(creds, query, {
      offset: page * LEDGER_PAGE_LIMIT,
      limit: LEDGER_PAGE_LIMIT,
    });
    const rows = read(data);
    let fresh = 0;
    for (const bonus of rows) if (await putBonus(bonus)) fresh += 1;
    imported += fresh;
    if (rows.length < LEDGER_PAGE_LIMIT) return imported;
    if (!deep && fresh === 0) return imported;
  }
  return imported;
};

/**
 * Everything the bookmaker gave this account, and what it is standing on right
 * now. Each ledger is walked on its own so one refused list - a permission the
 * account does not have, a field the site retires - costs only itself.
 */
const importRewards = async (
  creds: Credentials,
  account: AccountRef,
  rates: Map<string, number>,
  deep: boolean,
): Promise<number> => {
  const id = account.accountId;
  let imported = 0;

  const ledgers: [string, string, (data: Record<string, unknown> | null) => Bonus[]][] = [
    [
      'rakeback',
      RAKEBACK_LEDGER,
      (data) => {
        const list = (data?.user as { rakeback?: { transactions?: unknown } } | undefined)?.rakeback
          ?.transactions;
        return Array.isArray(list)
          ? list.flatMap((raw) => rakebackBonus(raw as RawRakebackTransaction, id) ?? [])
          : [];
      },
    ],
    [
      'credited bonuses',
      BONUS_LEDGER,
      (data) => {
        const list = (data?.user as { bonusList?: unknown } | undefined)?.bonusList;
        return Array.isArray(list)
          ? list.flatMap((raw) => creditedBonus(raw as RawUserBonus, id) ?? [])
          : [];
      },
    ],
    [
      'coupons',
      BONUS_CLAIM_LEDGER,
      (data) => {
        const list = (data?.user as { bonusClaimList?: unknown } | undefined)?.bonusClaimList;
        return Array.isArray(list)
          ? list.flatMap((raw) => couponBonus(raw as RawBonusClaim, id) ?? [])
          : [];
      },
    ],
    [
      'deposit bonuses',
      DEPOSIT_BONUS_LEDGER,
      (data) => {
        const user = (data?.user ?? {}) as {
          depositBonusList?: unknown;
          activeRollovers?: unknown;
        };
        const rollovers = Array.isArray(user.activeRollovers)
          ? (user.activeRollovers as RawRollover[])
          : [];
        const list = user.depositBonusList;
        return Array.isArray(list)
          ? list.flatMap((raw) => depositBonusGrant(raw as RawDepositBonusRow, rollovers, id) ?? [])
          : [];
      },
    ],
  ];

  for (const [label, query, read] of ledgers) {
    try {
      imported += await importLedger(creds, query, read, deep);
    } catch (err) {
      if (err instanceof SessionExpiredError || err instanceof RelayUnavailableError) throw err;
      log('warn', 'stake', `${label} ledger failed: ${(err as Error).message}`);
    }
  }

  try {
    await setPerks(account, parsePerks(await gql(creds, PERKS), rates, account));
  } catch (err) {
    if (err instanceof SessionExpiredError || err instanceof RelayUnavailableError) throw err;
    log('warn', 'stake', `rewards snapshot failed: ${(err as Error).message}`);
  }

  return imported;
};

// ── Balance ──────────────────────────────────────────────────────────────────

interface RawBalance {
  available?: { amount?: number | null; currency?: string | null } | null;
  vault?: { amount?: number | null; currency?: string | null } | null;
}

/**
 * How long a price list and a turnover figure stay good. Both are re-read on
 * every balance reading, and the balance is re-read on every poll of the open
 * bets panel - every eight seconds while a match is in play. Coin prices move
 * by fractions of a percent in that time and turnover by nothing at all, so
 * asking each time bought no accuracy and spent two thirds of the request
 * budget Stake throttles on.
 */
const SLOW_FIELD_TTL_MS = 10 * 60_000;

let cachedRates: { at: number; rates: Map<string, number> } | null = null;

/** USD per one unit of each currency Stake deals in, as Stake prices them. */
export const fetchBaseRates = async (creds: Credentials): Promise<Map<string, number>> => {
  const held = cachedRates;
  if (held !== null && Date.now() - held.at < SLOW_FIELD_TTL_MS) return held.rates;
  const rates = new Map<string, number>();
  try {
    const data = await gql(creds, CURRENCY_CONFIG, { isAcp: false });
    const raw = (data?.currencyConfiguration as { baseRates?: unknown } | undefined)?.baseRates;
    for (const entry of Array.isArray(raw) ? raw : []) {
      const { currency, baseRate } = (entry ?? {}) as { currency?: unknown; baseRate?: unknown };
      const code = toStringOrNull(currency);
      const rate = toNumber(baseRate, 0);
      if (code !== null && rate > 0) rates.set(code.toUpperCase(), rate);
    }
  } catch (err) {
    // A dead session and a throttle are the caller's to act on. Anything else is
    // this one list being unreadable, and the wallet beside it still is.
    if (
      err instanceof SessionExpiredError ||
      err instanceof RelayUnavailableError ||
      err instanceof RateLimitedError
    )
      throw err;
    log('warn', BOOKMAKER, `price list unreadable: ${(err as Error).message}`);
  }
  // An empty list prices nothing, so it is not worth remembering for ten minutes.
  if (rates.size > 0) {
    cachedRates = { at: Date.now(), rates };
    return rates;
  }
  // Prices an hour old value a wallet to within a fraction of a percent; no
  // prices value it not at all. One refused price list used to blank the balance
  // outright - and a blank balance then told the money walk nothing had moved,
  // which is how a refused list also stopped the deposits importing.
  return held?.rates ?? rates;
};

/**
 * Keyed by login, unlike the price list above: turnover is this account's own
 * figure, and one cache for the site handed a second account signed in elsewhere
 * the first one's lifetime total for the next ten minutes.
 */
const cachedWagered = new Map<AccountId, { at: number; wagered: BalanceInfo['wagered'] }>();

/** Lifetime turnover, on the same slow clock as the price list and for the same reason. */
const readWagered = async (
  creds: Credentials,
  account: AccountRef,
): Promise<BalanceInfo['wagered']> => {
  const held = cachedWagered.get(account.accountId);
  if (held !== undefined && Date.now() - held.at < SLOW_FIELD_TTL_MS) return held.wagered;
  const stats = await gql(creds, USER_WAGERED);
  const wagered = parseWagered(
    (stats?.user as { statisticScoped?: unknown } | undefined)?.statisticScoped,
  );
  if (wagered !== undefined) cachedWagered.set(account.accountId, { at: Date.now(), wagered });
  return wagered;
};

/**
 * One figure for an account that holds around 170 coins, priced by Stake itself
 * so it matches what the site shows. The vault is left out: it is out of betting
 * reach and the site's own header leaves it out too.
 *
 * The coins that figure is made of are kept beside it - a combined worth says
 * how much is there and never what it is held in, which here is half the answer.
 * Only the coins actually held; the empty ones are the rest of the list and
 * would bury the two or three that matter.
 */
export const parseBalance = (
  list: unknown,
  rates: Map<string, number>,
  account: AccountRef,
): BalanceInfo | null => {
  if (!Array.isArray(list)) return null;

  const held: { currency: string; amount: number }[] = [];
  const vaulted: { currency: string; amount: number }[] = [];
  for (const entry of list as RawBalance[]) {
    const pot = entry?.available;
    const amount = toNumber(pot?.amount, 0);
    const put = toNumber(entry?.vault?.amount, 0);
    if (amount === 0 && put === 0) continue;
    const currency = normalizeCurrency(pot?.currency ?? entry?.vault?.currency);
    if (amount > 0) held.push({ currency, amount });
    if (put > 0) vaulted.push({ currency, amount: put });
  }

  // No price list at all: nothing can be added up, and inventing a rate would be
  // worse than saying nothing. A wallet holding one coin has nothing to add up
  // though - it is reported as it stands and the app's own rate table prices it,
  // which is the difference between a balance and a blank one.
  if (rates.size === 0) {
    const only = held.length === 1 ? held[0] : undefined;
    if (only === undefined) return null;
    return {
      bookmaker: BOOKMAKER,
      accountId: account.accountId,
      amount: only.amount,
      currency: only.currency,
      capturedAt: new Date().toISOString(),
      holdings: [only],
    } satisfies BalanceInfo;
  }

  let total = 0;
  let vault = 0;
  const priced: { currency: string; amount: number; worth: number }[] = [];
  // Every coin the account can hold is in the price list, so an unpriced one
  // would blank the whole balance over dust. Counted when priced, skipped when
  // not - the balance stays a number instead of disappearing.
  for (const { currency, amount } of held) {
    const rate = rates.get(currency);
    if (rate === undefined) continue;
    total += amount * rate;
    priced.push({ currency, amount, worth: amount * rate });
  }
  for (const { currency, amount } of vaulted) {
    const rate = rates.get(currency);
    if (rate !== undefined) vault += amount * rate;
  }
  priced.sort((a, b) => b.worth - a.worth);
  return {
    bookmaker: BOOKMAKER,
    accountId: account.accountId,
    amount: total,
    currency: 'USD',
    capturedAt: new Date().toISOString(),
    holdings: priced.map(({ currency, amount }) => ({ currency, amount })),
    ...(vault > 0 ? { vault } : {}),
  } satisfies BalanceInfo;
};

/**
 * Turnover per product, in USD. `scope` is Stake's own word: `house` is the
 * casino, `sport` the sportsbook. An unseen scope is left out rather than
 * guessed at - a third product counted as either would misstate both.
 */
export const parseWagered = (list: unknown): BalanceInfo['wagered'] | undefined => {
  if (!Array.isArray(list)) return undefined;
  let sports = 0;
  let casino = 0;
  let seen = false;
  for (const entry of list) {
    const { scope, betValue } = (entry ?? {}) as { scope?: unknown; betValue?: unknown };
    const worth = toNumber(betValue, 0);
    if (scope === 'sport') sports += worth;
    else if (scope === 'house') casino += worth;
    else continue;
    seen = true;
  }
  return seen ? { sports, casino } : undefined;
};

// ── Adapter ──────────────────────────────────────────────────────────────────

export const stake: BookmakerAdapter = {
  id: BOOKMAKER,

  async accountId(creds) {
    const data = await gql(creds, USER_ID);
    const id = toStringOrNull((data?.user as { id?: unknown } | undefined)?.id);
    if (id === null) throw new SessionExpiredError(401);
    return id;
  },

  async syncBets(
    creds: Credentials,
    account: AccountRef,
    mode: SyncMode,
    onProgress,
  ): Promise<SyncResult> {
    const { putBets } = await import('@betanal/shared');
    if (mode === 'full')
      await setBackfillState(account, {
        oldestFetchedAt: null,
        historyComplete: false,
        betOffset: 0,
      });
    const { historyComplete, betOffset } = await getBackfillState(account);
    const deep = mode === 'full' || !historyComplete;
    const limit = deep ? MAX_PAGES : SHALLOW_PAGES;
    // A deep walk picks up where the last one stopped. Chromium stops this worker
    // after a few minutes, and starting over at the first page each time meant a
    // long history was re-read from the top forever and never reached its end.
    // A shallow run always starts at the top, which is where new bets appear.
    let offset = deep ? betOffset : 0;

    let added = 0;
    let skipped = 0;
    let pages = 0;
    let oldest: string | null = null;
    let reachedEnd = false;

    for (; pages < limit; ) {
      const data = await gql(creds, BET_LIST, { offset, limit: PAGE_LIMIT });
      const page = parseBetPage(data, account.accountId);
      pages += 1;
      added += await putBets(page.bets);
      skipped += page.skipped;
      for (const bet of page.bets) {
        if (oldest === null || bet.placedAt < oldest) oldest = bet.placedAt;
      }
      if (page.bets.length + page.skipped < PAGE_LIMIT) {
        reachedEnd = true;
        break;
      }
      offset += PAGE_LIMIT;
      // Written before the next request, so whatever the worker managed to read
      // is still worth something if it is stopped on the very next line.
      if (deep) await setBackfillState(account, { betOffset: offset });
      onProgress({
        page: pages,
        totalNew: added,
        done: false,
        kind: 'bets',
        message: deep
          ? `Backfilling Stake history (page ${pages}, ${added} new)`
          : `Caught up new Stake bets (page ${pages}, ${added} new)`,
      });
    }

    if (deep && reachedEnd) {
      await setBackfillState(account, {
        oldestFetchedAt: oldest,
        historyComplete: true,
        betOffset: 0,
      });
    }

    return { added, pages, skipped };
  },

  async openBets(creds, account) {
    const data = await gql(creds, ACTIVE_BETS, { limit: PAGE_LIMIT });
    const user = (data?.user ?? {}) as Record<string, unknown>;
    // Unlike the settled list these fields hold the bets themselves, with no
    // wrapper row around them.
    const raws = ACTIVE_LISTS.flatMap((key) => {
      const list = user[key];
      return Array.isArray(list) ? (list as RawBet[]) : [];
    });
    const scores = Object.fromEntries(
      raws.flatMap((raw) =>
        outcomesOf(raw).flatMap((out) => {
          const found = scoresOf(out);
          return found === null ? [] : [found];
        }),
      ),
    );
    return {
      bets: raws.flatMap((raw) => normalizeBet(raw, account.accountId) ?? []),
      scores,
    };
  },

  // Stake fetches bets over GraphQL with the operation in the body, so there is
  // no request URL the page-side bridge could recognise to relay a response.
  parseOpen: () => [],

  async syncMoney(creds, _banking, account, depth) {
    const deep = depth === 'full';
    // Its own failure domain: a rewards query that breaks must not cost the
    // deposits and withdrawals, which are the records the totals are built on.
    let grants = 0;
    try {
      // Rakeback and bonuses are denominated in coins, so pricing them needs the
      // same table the balance is read with.
      grants = await importRewards(creds, account, await fetchBaseRates(creds), deep);
    } catch (err) {
      if (err instanceof SessionExpiredError || err instanceof RelayUnavailableError) throw err;
      log('warn', 'stake', `rewards import failed: ${(err as Error).message}`);
    }
    // Only what changed. A routine sync re-reads the top of every ledger and
    // finds it unchanged, and saying so each time buried the lines that mattered.
    if (grants > 0) log('info', BOOKMAKER, `bonuses imported: ${grants} grants`);
    if (depth === 'bonuses') return 0;
    const deposits = await importMovements(
      creds,
      account,
      DEPOSIT_LIST,
      'depositList',
      'deposit',
      deep,
    );
    const withdrawals = await importMovements(
      creds,
      account,
      WITHDRAWAL_LIST,
      'withdrawalList',
      'withdrawal',
      deep,
    );
    if (deposits.complete && withdrawals.complete)
      await setBackfillState(account, { moneyComplete: true });
    return deposits.imported + withdrawals.imported;
  },

  async syncCasino(creds, account, deep) {
    return importRounds(creds, account, deep);
  },

  async balance(creds, account) {
    const [data, rates] = await Promise.all([gql(creds, USER_BALANCES), fetchBaseRates(creds)]);
    const wallets = (data?.user as { balances?: unknown } | undefined)?.balances;
    const balance = parseBalance(wallets, rates, account);
    if (balance !== null) {
      // Its own failure domain: turnover is a nice-to-have, the balance is not.
      try {
        const wagered = await readWagered(creds, account);
        if (wagered !== undefined) balance.wagered = wagered;
      } catch (err) {
        if (
          err instanceof SessionExpiredError ||
          err instanceof RelayUnavailableError ||
          err instanceof RateLimitedError
        )
          throw err;
        log('warn', BOOKMAKER, `wagered unreadable: ${(err as Error).message}`);
      }
    }
    if (balance === null) {
      log(
        'warn',
        BOOKMAKER,
        `balance unreadable: ${Array.isArray(wallets) ? wallets.length : 'no'} wallets, ${rates.size} prices`,
      );
    }
    return balance;
  },
};
