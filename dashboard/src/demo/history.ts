/**
 * The made-up history the demo shows: two accounts, ten months of betting, and a
 * casino played on some of the evenings.
 *
 * Drawn rather than written down. A year of slips typed out by hand is a fixture
 * that has to be kept in step with every schema change, and the last one was
 * thrown away for exactly that. The rules below are short enough to keep honest,
 * and they produce records shaped the way the adapters produce them: the same
 * fields, the same id prefixes, prices that carry the bookmaker's margin, and a
 * result that comes out where a real punter's does - slightly under water.
 *
 * Deterministic on purpose, so the same demo is drawn on every reload and no
 * chart moves under the reader between two pages.
 *
 * Everything is in euros, including the crypto book: the demo never touches the
 * database, so there is no exchange-rate table behind it, and a record in a
 * currency the app cannot price is a record every total leaves out.
 */

import type {
  AccountPerks,
  AccountRef,
  BalanceInfo,
  Bet,
  BetLeg,
  BetStatus,
  Bonus,
  CasinoKind,
  CasinoRound,
  KnownAccount,
  SyncMeta,
  Transaction,
} from '@betanal/shared';

export const BAH: AccountRef = { bookmaker: 'bet-at-home', accountId: '10482913' };
export const STAKE: AccountRef = { bookmaker: 'stake', accountId: 'c7d41f0a' };

const DAY = 86_400_000;
const HOUR = 3_600_000;
/** How far back the demo history reaches. */
const DAYS = 300;
/** The second account was opened part-way through, as a second one usually is. */
const STAKE_FROM = 150;

const start = Date.now() - DAYS * DAY;
const at = (ms: number): string => new Date(ms).toISOString();

/** Linear congruential: a stable stream of numbers from one seed, in three lines. */
const stream = (seed: number) => (): number => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4_294_967_296;
};

let rnd = stream(20260829);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
const between = (lo: number, hi: number): number => lo + rnd() * (hi - lo);
const round2 = (value: number): number => Math.round(value * 100) / 100;
const hex = (length: number): string =>
  Array.from({ length }, () => Math.floor(rnd() * 16).toString(16)).join('');
/** bet-at-home keys its slips by UUID; Stake by its own running number. */
const uuid = (): string => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;

interface Market {
  type: string;
  /** What can be backed on this fixture. */
  picks: (home: string, away: string) => readonly string[];
  odds: readonly [number, number];
}

interface Competition {
  sport: string;
  league: string;
  country: string;
  teams: readonly string[];
  markets: readonly Market[];
}

const FOOTBALL: readonly Market[] = [
  { type: '1X2', picks: (h, a) => [h, 'Draw', a], odds: [1.35, 6] },
  { type: 'Over/Under 2.5', picks: () => ['Over 2.5', 'Under 2.5'], odds: [1.55, 2.4] },
  { type: 'Both teams to score', picks: () => ['Yes', 'No'], odds: [1.5, 2.15] },
  { type: 'Double chance', picks: (h, a) => [`${h} or Draw`, `${a} or Draw`], odds: [1.14, 1.8] },
  { type: 'Asian Handicap -1.0', picks: (h, a) => [`${h} -1.0`, `${a} +1.0`], odds: [1.6, 2.6] },
];

const TENNIS: readonly Market[] = [
  { type: 'Match bet', picks: (h, a) => [h, a], odds: [1.18, 4.5] },
  { type: 'Total games Over/Under 22.5', picks: () => ['Over 22.5', 'Under 22.5'], odds: [1.7, 2.1] },
  {
    type: 'Set betting',
    picks: (h, a) => [`${h} 2:0`, `${h} 2:1`, `${a} 2:0`, `${a} 2:1`],
    odds: [2.2, 7.5],
  },
];

const BASKETBALL: readonly Market[] = [
  { type: 'Moneyline', picks: (h, a) => [h, a], odds: [1.3, 3.6] },
  { type: 'Point spread -4.5', picks: (h, a) => [`${h} -4.5`, `${a} +4.5`], odds: [1.75, 2.05] },
  {
    type: 'Total points Over/Under 214.5',
    picks: () => ['Over 214.5', 'Under 214.5'],
    odds: [1.8, 2.0],
  },
];

const HOCKEY: readonly Market[] = [
  { type: 'Moneyline', picks: (h, a) => [h, a], odds: [1.5, 3.2] },
  { type: 'Total goals Over/Under 5.5', picks: () => ['Over 5.5', 'Under 5.5'], odds: [1.75, 2.1] },
];

const COMPETITIONS: readonly Competition[] = [
  {
    sport: 'Football',
    league: 'Premier League 2025/2026',
    country: 'England',
    teams: [
      'Arsenal',
      'Chelsea',
      'Liverpool',
      'Manchester City',
      'Newcastle United',
      'Tottenham Hotspur',
      'Aston Villa',
      'Brighton & Hove Albion',
    ],
    markets: FOOTBALL,
  },
  {
    sport: 'Football',
    league: 'LaLiga 2025/2026',
    country: 'Spain',
    teams: [
      'Real Madrid',
      'Barcelona',
      'Atletico Madrid',
      'Sevilla',
      'Real Sociedad',
      'Villarreal',
    ],
    markets: FOOTBALL,
  },
  {
    sport: 'Football',
    league: 'Serie A 2025/2026',
    country: 'Italy',
    teams: ['Inter', 'AC Milan', 'Juventus', 'Napoli', 'Roma', 'Atalanta'],
    markets: FOOTBALL,
  },
  {
    sport: 'Football',
    league: 'Bundesliga 2025/2026',
    country: 'Germany',
    teams: ['Bayern Munich', 'Bayer Leverkusen', 'Borussia Dortmund', 'RB Leipzig', 'Stuttgart'],
    markets: FOOTBALL,
  },
  {
    sport: 'Football',
    league: 'UEFA Champions League 2025/2026',
    country: 'International',
    teams: [
      'Bayern Munich',
      'Paris Saint-Germain',
      'Real Madrid',
      'Manchester City',
      'Inter',
      'Arsenal',
    ],
    markets: FOOTBALL,
  },
  {
    sport: 'Tennis',
    league: 'ATP Vienna 2026',
    country: 'Austria',
    teams: [
      'Jannik Sinner',
      'Carlos Alcaraz',
      'Alexander Zverev',
      'Daniil Medvedev',
      'Holger Rune',
    ],
    markets: TENNIS,
  },
  {
    sport: 'Tennis',
    league: 'WTA Linz 2026',
    country: 'Austria',
    teams: [
      'Iga Swiatek',
      'Aryna Sabalenka',
      'Jelena Ostapenko',
      'Elena Rybakina',
      'Alexandra Eala',
    ],
    markets: TENNIS,
  },
  {
    sport: 'Basketball',
    league: 'NBA 2025/2026',
    country: 'USA',
    teams: [
      'Boston Celtics',
      'Denver Nuggets',
      'Los Angeles Lakers',
      'Milwaukee Bucks',
      'Golden State Warriors',
      'Phoenix Suns',
    ],
    markets: BASKETBALL,
  },
  {
    sport: 'Basketball',
    league: 'EuroLeague 2025/2026',
    country: 'International',
    teams: ['Real Madrid', 'Panathinaikos', 'Olympiacos', 'Fenerbahce', 'Partizan'],
    markets: BASKETBALL,
  },
  {
    sport: 'Ice Hockey',
    league: 'NHL 2025/2026',
    country: 'USA',
    teams: [
      'Colorado Avalanche',
      'Edmonton Oilers',
      'Boston Bruins',
      'Toronto Maple Leafs',
      'Florida Panthers',
      'Vegas Golden Knights',
    ],
    markets: HOCKEY,
  },
];

const fixture = (kickoff: number): BetLeg => {
  const comp = pick(COMPETITIONS);
  const home = pick(comp.teams);
  let away = pick(comp.teams);
  while (away === home) away = pick(comp.teams);
  const market = pick(comp.markets);
  return {
    sport: comp.sport,
    league: comp.league,
    country: comp.country,
    event: `${home} - ${away}`,
    marketType: market.type,
    selection: pick(market.picks(home, away)),
    odds: round2(between(market.odds[0], market.odds[1])),
    status: 'pending',
    eventDate: at(kickoff),
    isLive: rnd() < 0.18,
    eventId: `ev-${Math.floor(rnd() * 9_000_000) + 1_000_000}`,
  };
};

/** A pick off the same fixture as the one before it, which is what a builder is. */
const sameEvent = (from: BetLeg): BetLeg => {
  const comp = COMPETITIONS.find((c) => c.league === from.league) ?? COMPETITIONS[0];
  const [home = '', away = ''] = (from.event ?? ' - ').split(' - ');
  const market = pick(comp?.markets ?? FOOTBALL);
  return {
    ...from,
    marketType: market.type,
    selection: pick(market.picks(home, away)),
    odds: round2(between(market.odds[0], market.odds[1])),
  };
};

const STAKES = [2, 5, 5, 10, 10, 10, 15, 20, 20, 25, 50, 100] as const;

/**
 * The bookmaker's margin, as a share of the fair price. A slip priced at 3.00
 * comes in a little less often than one time in three, which is the whole reason
 * a betting history ends up where it does.
 */
const MARGIN = 0.93;

const betAt = (account: AccountRef, placedAt: number): Bet => {
  const legCount = rnd() < 0.62 ? 1 : 2 + Math.floor(rnd() * 4);
  const kickoff = placedAt + between(0.4, 60) * HOUR;
  const legs: BetLeg[] = [fixture(kickoff)];
  const builder = legCount > 1 && rnd() < 0.22;
  for (let i = 1; i < legCount; i++) {
    legs.push(builder ? sameEvent(legs[0] as BetLeg) : fixture(kickoff + i * between(1, 40) * HOUR));
  }

  const product = legs.reduce((total, leg) => total * (leg.odds ?? 1), 1);
  // Correlated picks are priced under their product, which is why a builder's
  // price cannot be recomputed from its legs and has to be carried on each.
  const odds = round2(builder ? product * 0.72 : product);
  if (builder) for (const leg of legs) leg.groupOdds = odds;

  const roll = rnd();
  let status: BetStatus = rnd() < Math.min(0.95, MARGIN / odds) ? 'won' : 'lost';
  if (roll < 0.02) status = 'void';
  else if (roll < 0.06 && odds > 2) status = 'cashed_out';

  const stake = pick(STAKES);
  const lastKickoff = Math.max(...legs.map((leg) => Date.parse(leg.eventDate ?? '')));
  const settledAt = lastKickoff + between(1.6, 3) * HOUR;
  const decided = status === 'cashed_out' ? placedAt + (settledAt - placedAt) * 0.6 : settledAt;

  const loser = Math.floor(rnd() * legs.length);
  for (const [index, leg] of legs.entries()) {
    leg.status = status === 'void' ? 'void' : status === 'lost' && index === loser ? 'lost' : 'won';
  }

  const first = legs[0] as BetLeg;
  const sports = new Set(legs.map((leg) => leg.sport));
  return {
    betId: account.bookmaker === 'stake' ? `stake-${Math.floor(rnd() * 900_000_000)}` : uuid(),
    ...account,
    placedAt: at(placedAt),
    settledAt: at(decided),
    cashedOutAt: status === 'cashed_out' ? at(decided) : null,
    sport: sports.size === 1 ? first.sport : 'Multiple',
    league: first.league,
    event: first.event,
    marketType: first.marketType,
    selection: first.selection,
    odds,
    stake,
    ...(rnd() < 0.05 ? { bonusStake: stake } : {}),
    potentialReturn: round2(stake * odds),
    actualReturn:
      status === 'won'
        ? round2(stake * odds)
        : status === 'void'
          ? stake
          : status === 'cashed_out'
            ? round2(stake * between(0.35, 1.7))
            : 0,
    status,
    betType: legCount === 1 ? 'single' : rnd() < 0.08 ? 'system' : 'accumulator',
    legs,
    currency: 'EUR',
  };
};

const buildBets = (): Bet[] => {
  const bets: Bet[] = [];
  for (let day = 0; day < DAYS; day++) {
    const when = start + day * DAY;
    const weekend = [0, 6].includes(new Date(when).getDay());
    if (rnd() > (weekend ? 0.8 : 0.45)) continue;
    const count = 1 + Math.floor(rnd() * (weekend ? 3 : 2));
    for (let i = 0; i < count; i++) {
      const account = day >= STAKE_FROM && rnd() < 0.35 ? STAKE : BAH;
      bets.push(betAt(account, when + between(9, 23) * HOUR));
    }
  }
  return bets;
};

interface Game {
  game: string;
  gameSlug: string;
  kind: CasinoKind;
  provider: string | null;
}

const GAMES: readonly Game[] = [
  { game: 'Sweet Bonanza', gameSlug: 'sweet-bonanza', kind: 'slots', provider: 'Pragmatic Play' },
  {
    game: 'Gates of Olympus',
    gameSlug: 'gates-of-olympus',
    kind: 'slots',
    provider: 'Pragmatic Play',
  },
  { game: 'Book of Dead', gameSlug: 'book-of-dead', kind: 'slots', provider: "Play'n GO" },
  { game: 'Money Train 4', gameSlug: 'money-train-4', kind: 'provider', provider: 'Relax Gaming' },
  { game: 'Crash', gameSlug: 'crash', kind: 'originals', provider: null },
  { game: 'Plinko', gameSlug: 'plinko', kind: 'originals', provider: null },
  { game: 'Mines', gameSlug: 'mines', kind: 'originals', provider: null },
  { game: 'Lightning Roulette', gameSlug: 'lightning-roulette', kind: 'live', provider: 'Evolution' },
  { game: 'Crazy Time', gameSlug: 'crazy-time', kind: 'live', provider: 'Evolution' },
];

/**
 * What a round pays per unit staked. Weighted so that every kind returns a few
 * percent less than it takes - the house edge is the point of the page, and a
 * demo casino that ran at a profit would say the opposite of what it is for.
 */
const multiplierOf = (kind: CasinoKind): number => {
  if (kind === 'live') return rnd() < 0.62 ? 0 : rnd() < 0.9 ? 2 : round2(between(3, 12));
  if (kind === 'originals') return rnd() < 0.57 ? 0 : rnd() < 0.96 ? round2(between(1.05, 2.4)) : round2(between(5, 25));
  return rnd() < 0.58 ? 0 : rnd() < 0.95 ? round2(between(0.2, 2.2)) : round2(between(4, 40));
};

const buildRounds = (): CasinoRound[] => {
  // Reseeded rather than carried on from the bets: how often those draw depends
  // on which weekday the 300 days happen to begin on, so a shared stream handed
  // the casino a different year - and a different return - every midnight.
  rnd = stream(864_209);
  const rounds: CasinoRound[] = [];
  let n = 1;
  for (let day = STAKE_FROM; day < DAYS; day++) {
    // Roughly one evening a week, and the whole evening on one or two games. The
    // last two are pinned to this week, or a demo opened on the default period
    // would show a casino page with nothing on it.
    const thisWeek = day === DAYS - 2 || day === DAYS - 5;
    if (!thisWeek && rnd() > 0.14) continue;
    let played = start + day * DAY + 20 * HOUR + rnd() * 2 * HOUR;
    const games = [pick(GAMES), ...(rnd() < 0.5 ? [pick(GAMES)] : [])];
    const spins = 20 + Math.floor(rnd() * 70);
    const size = pick([0.2, 0.4, 0.5, 1, 1, 2, 5]);
    for (let i = 0; i < spins; i++) {
      played += 8_000 + rnd() * 90_000;
      const game = pick(games);
      const stake = rnd() < 0.9 ? size : round2(size * 2);
      const multiplier = multiplierOf(game.kind);
      rounds.push({
        id: `stake-round-${n++}`,
        ...STAKE,
        playedAt: at(played),
        ...game,
        stake,
        payout: round2(stake * multiplier),
        multiplier,
        currency: 'EUR',
      });
    }
  }
  return rounds;
};

/** Every ten days or so, which is how often money moves in and out. */
const strideDays = (): number[] => {
  const days: number[] = [];
  for (let day = 3; day < DAYS - 8; day += 9 + Math.floor(rnd() * 14)) days.push(day);
  return days;
};

const buildTransactions = (): Transaction[] => {
  const rows: Transaction[] = [];
  let n = 1;
  // The last two land inside this week for the same reason the last casino
  // evenings do: the page opens on a period they have to be inside of.
  for (const day of [...strideDays(), DAYS - 6, DAYS - 2]) {
    const account = day >= STAKE_FROM && rnd() < 0.4 ? STAKE : BAH;
    const prefix = account.bookmaker === 'stake' ? 'stake' : 'bah';
    const out = rnd() < 0.25;
    rows.push({
      id: `${prefix}-${out ? 'wd' : 'dep'}-${n++}`,
      ...account,
      kind: out ? 'withdrawal' : 'deposit',
      amount: out ? round2(between(60, 320)) : pick([20, 30, 50, 50, 100, 150, 200]),
      currency: 'EUR',
      occurredAt: at(start + day * DAY + between(8, 22) * HOUR),
      note: null,
      // One wallet funds both products at Stake, so it says nothing about either.
      ...(account.bookmaker === 'bet-at-home' ? { product: 'sports' as const } : {}),
    });
  }
  return rows;
};

const bonus = (over: Partial<Bonus> & Pick<Bonus, 'id' | 'name' | 'type' | 'trigger'>): Bonus => ({
  ...BAH,
  code: null,
  description: null,
  status: 'completed',
  grantedAmount: 20,
  currentAmount: 0,
  currency: 'EUR',
  grantedAt: at(start + 20 * DAY),
  expiresAt: null,
  wageringRequired: 0,
  wageringDone: 0,
  ...over,
});

/**
 * Rakeback comes back a little at a time and is collected when the player
 * remembers to, so one claim says nothing: what the reader is after is how much
 * a year of it added up to. A claim every week or so, and a couple of gaps where
 * it went uncollected for a fortnight.
 */
const rakebackClaims = (): Bonus[] => {
  const rnd = stream(97_531);
  const claims: Bonus[] = [];
  for (let day = 12; day < DAYS - 3; day += rnd() < 0.2 ? 14 : 7) {
    // Claimed rakeback is money on landing: nothing to play through, so what was
    // granted is also what it was worth.
    const paid = round2(0.8 + rnd() * 3.4);
    claims.push(
      bonus({
        ...STAKE,
        id: `stake-rakeback-${day}`,
        name: 'Rakeback',
        description: 'Cashback on bets',
        type: 'rakeback',
        trigger: 'wager',
        status: 'released',
        grantedAmount: paid,
        currentAmount: paid,
        grantedAt: at(start + day * DAY + 19 * HOUR),
      }),
    );
  }
  return claims;
};

const BONUSES: readonly Bonus[] = [
  bonus({
    id: 'bah-bonus-1',
    name: 'Welcome free bet',
    type: 'freeBet',
    trigger: 'deposit',
    description: 'A free bet of 20 EUR on your first deposit.',
    grantedAt: at(start + 2 * DAY),
  }),
  bonus({
    id: 'bah-bonus-2',
    name: 'Acca boost',
    type: 'oddsBoost',
    trigger: 'auto',
    status: 'released',
    grantedAmount: 7.4,
    grantedAt: at(start + 96 * DAY),
  }),
  bonus({
    id: 'bah-bonus-3',
    name: 'Weekly cashback',
    type: 'cashback',
    trigger: 'wager',
    status: 'active',
    grantedAmount: 15,
    currentAmount: 15,
    wageringRequired: 75,
    wageringDone: 41.5,
    grantedAt: at(Date.now() - 5 * DAY),
    expiresAt: at(Date.now() + 9 * DAY),
  }),
  ...rakebackClaims(),
  bonus({
    ...STAKE,
    id: 'stake-bonus-2',
    name: 'Weekly reload',
    type: 'standard',
    trigger: 'claim',
    status: 'active',
    grantedAmount: 10,
    currentAmount: 10,
    wageringRequired: 300,
    wageringDone: 112,
    grantedAt: at(Date.now() - 2 * DAY),
    expiresAt: at(Date.now() + 5 * DAY),
  }),
  bonus({
    ...STAKE,
    id: 'stake-bonus-3',
    name: 'Free spins: Sweet Bonanza',
    type: 'freeRound',
    trigger: 'auto',
    status: 'expired',
    grantedAmount: 5,
    grantedAt: at(start + 230 * DAY),
    expiresAt: at(start + 237 * DAY),
  }),
];

const BALANCES: readonly BalanceInfo[] = [
  { ...BAH, amount: 184.6, currency: 'EUR', capturedAt: at(Date.now() - 4 * 60_000) },
  {
    ...STAKE,
    amount: 342.15,
    currency: 'EUR',
    capturedAt: at(Date.now() - 4 * 60_000),
    vault: 150,
    wagered: { sports: 4820.5, casino: 6140.25 },
    result: { sports: -212.4, casino: -286.9 },
  },
];

const PERKS: readonly AccountPerks[] = [
  {
    ...STAKE,
    readAt: at(Date.now() - 4 * 60_000),
    rakeback: { enabled: true, balances: [{ currency: 'EUR', amount: 4.12, worth: 4.12 }] },
    vip: { level: 'Bronze', progress: 0.42 },
    reload: {
      active: true,
      value: 1.5,
      claimIntervalMs: 7 * DAY,
      lastClaimAt: at(Date.now() - 3 * DAY),
      expiresAt: at(Date.now() + 4 * DAY),
    },
  },
];

const ACCOUNTS: readonly KnownAccount[] = [
  { ...BAH, firstSeenAt: at(start), lastSeenAt: at(Date.now() - 4 * 60_000) },
  {
    ...STAKE,
    firstSeenAt: at(start + STAKE_FROM * DAY),
    lastSeenAt: at(Date.now() - 4 * 60_000),
  },
];

const SYNCED: SyncMeta = {
  lastSyncAt: at(Date.now() - 4 * 60_000),
  lastStatus: 'synced',
  lastError: null,
};

export interface DemoHistory {
  bets: readonly Bet[];
  rounds: readonly CasinoRound[];
  transactions: readonly Transaction[];
  bonuses: readonly Bonus[];
  balances: readonly BalanceInfo[];
  perks: readonly AccountPerks[];
  accounts: readonly KnownAccount[];
  sync: readonly { account: AccountRef; meta: SyncMeta }[];
}

let drawn: DemoHistory | null = null;

/** Drawn once per page load; the pages read it many times over. */
export const demoHistory = (): DemoHistory =>
  (drawn ??= {
    bets: buildBets(),
    rounds: buildRounds(),
    transactions: buildTransactions(),
    bonuses: BONUSES,
    balances: BALANCES,
    perks: PERKS,
    accounts: ACCOUNTS,
    sync: [
      { account: BAH, meta: SYNCED },
      { account: STAKE, meta: SYNCED },
    ],
  });
