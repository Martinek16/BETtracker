import type { Bet, Bonus, Bookmaker, CasinoKind, CasinoRound, Transaction } from './types';
import { walletLedger } from './wallet';

/**
 * A casino round is never written down the way a slip is: the site records the
 * money and not the spin. So the casino is read from the two figures a site does
 * publish - the turnover it counts itself, and the money its wallet cannot
 * otherwise account for - and never from a list of plays.
 */
export interface CasinoAccountInput {
  bookmaker: Bookmaker;
  /** Account key, so two logins at one site stay two rows. */
  key: string;
  /** True only where the site runs a casino off the same wallet. */
  hasCasino: boolean;
  /** The account's whole history. A window would cut the wallet in half. */
  bets: readonly Bet[];
  transactions: readonly Transaction[];
  bonuses: readonly Bonus[];
  balance: number | null;
  vault: number | null;
  /** Lifetime casino turnover the site reports itself, already converted. */
  wagered: number | null;
  /**
   * Lifetime casino result the site states itself, already converted. Where it
   * exists it is the answer; the wallet gap below is only what is left when a
   * site states nothing, and that gap also swallows every payment never read.
   */
  reported: number | null;
}

export interface CasinoAccount {
  bookmaker: Bookmaker;
  key: string;
  /** `null` where the site publishes no turnover of its own. */
  wagered: number | null;
  /** What the casino took, negative when it took money. `null` without a balance. */
  net: number | null;
  /** Where `net` came from: the site's own statement, or the gap in the wallet. */
  source: 'site' | 'wallet';
  /** What came back per unit staked. `null` unless both figures above are known. */
  rtp: number | null;
}

export interface CasinoTotals {
  accounts: CasinoAccount[];
  /**
   * Sums over the accounts that published a figure. An account that publishes
   * none is left out rather than counted as zero, which is why a total can be
   * smaller than the play behind it.
   */
  wagered: number | null;
  net: number | null;
  rtp: number | null;
  /** The sportsbook result over every account, casino or not. */
  betResult: number;
  /** The casino's share of the money lost, 0..1. `null` unless something was lost. */
  shareOfLoss: number | null;
}

/**
 * What the casino took: the money the wallet holds less the money the bets and
 * payments explain. The vault counts as held - the site keeps it out of betting
 * reach, not out of the account, and leaving it out would read money put aside
 * as money the casino ate.
 */
export const casinoNet = (
  expected: number,
  balance: number | null,
  vault: number | null,
): number | null => (balance === null ? null : balance + (vault ?? 0) - expected);

/**
 * Return per unit staked, as it actually landed. Below 1 is the house edge as
 * this account lived it; it says nothing about the next spin.
 */
const rtpOf = (net: number | null, wagered: number | null): number | null =>
  net === null || wagered === null || wagered <= 0 ? null : 1 + net / wagered;

/** Sum of the figures that exist, or `null` when none of them do. */
const sumKnown = (values: readonly (number | null)[]): number | null => {
  const known = values.filter((value): value is number => value !== null);
  return known.length === 0 ? null : known.reduce((sum, value) => sum + value, 0);
};

/**
 * The casino at one round. Shaped like an equity point so the running-total
 * chart can draw it without a second chart being written for it.
 */
export interface CasinoPoint {
  date: string;
  betId: string;
  /** What that round paid back, its stake taken off. */
  profit: number;
  /** The casino result as it stood after that round. */
  cumulative: number;
  /** What that round staked. */
  wagered: number | null;
}

export const casinoTotals = (inputs: readonly CasinoAccountInput[]): CasinoTotals => {
  let betResult = 0;
  const accounts: CasinoAccount[] = [];

  for (const input of inputs) {
    const ledger = walletLedger(input.bets, input.transactions, input.bonuses, input.balance);
    betResult += ledger.betResult;
    // A gap at a sportsbook-only account is history nobody read, not a casino.
    if (!input.hasCasino) continue;
    const net = input.reported ?? casinoNet(ledger.expected, input.balance, input.vault);
    accounts.push({
      bookmaker: input.bookmaker,
      key: input.key,
      wagered: input.wagered,
      net,
      source: input.reported === null ? 'wallet' : 'site',
      rtp: rtpOf(net, input.wagered),
    });
  }

  const wagered = sumKnown(accounts.map((account) => account.wagered));
  const net = sumKnown(accounts.map((account) => account.net));
  const casinoLoss = net === null ? null : Math.max(0, -net);
  const betLoss = Math.max(0, -betResult);

  return {
    accounts,
    wagered,
    net,
    rtp: rtpOf(net, wagered),
    betResult,
    shareOfLoss:
      casinoLoss === null || casinoLoss + betLoss === 0
        ? null
        : casinoLoss / (casinoLoss + betLoss),
  };
};

// ── Rounds ───────────────────────────────────────────────────────────────────
//
// Where a site does record its casino round by round, the wallet gap above stops
// being the only thing that can be said. The two never contradict each other on
// purpose: the gap is every round ever played, the rounds are the ones the site
// still hands out, and a site that pages out its old history will show fewer.

/** What one round left behind. Negative when it lost. */
export const roundNet = (round: CasinoRound): number => round.payout - round.stake;

export interface CasinoRoundTotals {
  rounds: number;
  /** Rounds that paid back more than they cost. A push is not a win. */
  won: number;
  staked: number;
  returned: number;
  net: number;
  /** Returned per unit staked. `null` when nothing was staked. */
  rtp: number | null;
  /** The best single round by what it paid over its stake, `null` without rounds. */
  bestRound: CasinoRound | null;
  /** The worst single round, which is a losing stake unless every round won. */
  worstRound: CasinoRound | null;
}

export const casinoRoundTotals = (rounds: readonly CasinoRound[]): CasinoRoundTotals => {
  let staked = 0;
  let returned = 0;
  let won = 0;
  let best: CasinoRound | null = null;
  let worst: CasinoRound | null = null;
  for (const round of rounds) {
    staked += round.stake;
    returned += round.payout;
    if (roundNet(round) > 0) won += 1;
    if (best === null || roundNet(round) > roundNet(best)) best = round;
    if (worst === null || roundNet(round) < roundNet(worst)) worst = round;
  }
  return {
    rounds: rounds.length,
    won,
    staked,
    returned,
    net: returned - staked,
    rtp: staked <= 0 ? null : returned / staked,
    bestRound: best,
    worstRound: worst,
  };
};

export interface CasinoGroup extends CasinoRoundTotals {
  /** What the group is: a game's name, or the kind of casino it is played in. */
  label: string;
  kind: CasinoKind;
  /** The studio behind it, where the site names one and the group has just one. */
  provider: string | null;
  /** Share of the group's stake in the whole turnover, 0..1. */
  share: number;
  lastPlayedAt: string;
}

const groupBy = (
  rounds: readonly CasinoRound[],
  labelOf: (round: CasinoRound) => string,
): CasinoGroup[] => {
  const buckets = new Map<string, CasinoRound[]>();
  for (const round of rounds) {
    const label = labelOf(round);
    buckets.set(label, [...(buckets.get(label) ?? []), round]);
  }
  const staked = rounds.reduce((sum, round) => sum + round.stake, 0);

  return [...buckets]
    .map(([label, group]) => {
      const providers = new Set(group.map((round) => round.provider));
      return {
        ...casinoRoundTotals(group),
        label,
        kind: group[0]?.kind ?? 'provider',
        provider: providers.size === 1 ? (group[0]?.provider ?? null) : null,
        share: staked <= 0 ? 0 : group.reduce((sum, r) => sum + r.stake, 0) / staked,
        lastPlayedAt: group.reduce((latest, r) => (r.playedAt > latest ? r.playedAt : latest), ''),
      };
    })
    .sort((a, b) => b.staked - a.staked);
};

/** One row per game, biggest turnover first - which is where the money went. */
export const casinoByGame = (rounds: readonly CasinoRound[]): CasinoGroup[] =>
  groupBy(rounds, (round) => round.game);

export interface CasinoSession {
  startedAt: string;
  endedAt: string;
  totals: CasinoRoundTotals;
  /** The sitting's own rounds, newest first like every list in the app. */
  rounds: CasinoRound[];
}

/** Half an hour without a round ends the sitting. Long enough for a break. */
export const SESSION_GAP_MS = 30 * 60 * 1000;

/**
 * The rounds cut into sittings, newest first. A site records no sitting of its
 * own, so the only honest mark is the gap between rounds: play that stopped for
 * half an hour was play that stopped.
 */
export const casinoSessions = (
  rounds: readonly CasinoRound[],
  gapMs: number = SESSION_GAP_MS,
): CasinoSession[] => {
  const sorted = [...rounds].sort((a, b) => a.playedAt.localeCompare(b.playedAt));
  const groups: CasinoRound[][] = [];
  for (const round of sorted) {
    const current = groups[groups.length - 1];
    const previous = current?.[current.length - 1];
    if (
      current &&
      previous &&
      Date.parse(round.playedAt) - Date.parse(previous.playedAt) <= gapMs
    ) {
      current.push(round);
    } else {
      groups.push([round]);
    }
  }

  return groups
    .map((group) => ({
      startedAt: group[0]?.playedAt ?? '',
      endedAt: group[group.length - 1]?.playedAt ?? '',
      totals: casinoRoundTotals(group),
      rounds: [...group].reverse(),
    }))
    .reverse();
};

/**
 * The casino round by round, oldest first. Unlike the balance curve above this
 * one owes nothing to the wallet: every step is a round the site wrote down.
 */
export const casinoRoundCurve = (rounds: readonly CasinoRound[]): CasinoPoint[] => {
  const sorted = [...rounds].sort((a, b) => a.playedAt.localeCompare(b.playedAt));
  let cumulative = 0;
  return sorted.map((round) => {
    cumulative += roundNet(round);
    return {
      date: round.playedAt,
      betId: round.id,
      profit: roundNet(round),
      cumulative,
      wagered: round.stake,
    };
  });
};
