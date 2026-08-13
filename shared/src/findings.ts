import type { Bet, Transaction } from './types';
import { decisiveBets, profitOf, resolutionDate } from './calculations';
import { tiltCheck } from './discipline';

export interface Finding {
  id: string;
  /** A problem is something the data says is costing money; good is worth keeping. */
  kind: 'problem' | 'good';
  /** What was found, in as few words as it can be said. */
  title: string;
  /** The numbers behind it, and nothing else. */
  detail: string;
}

/** Below this the card says the read is early: the checks still run. */
const MIN_BETS = 20;
/** A single outlier needs far fewer slips than a habit — it is one fact, not a rate. */
const SPIKE_MIN_BETS = 5;
/** Share of the period's damage one slip or one day has to carry to be its story. */
const DOMINANT_SHARE = 30;
const DOMINANT_DAY_SHARE = 40;
const LONG_ODDS = 5;
const MANY_LEGS = 4;
/** Share of stake at which a habit stops being an occasional flutter. */
const BIG_SHARE = 15;
const SMALL_SHARE = 10;
/** A stake this many times the usual one is no longer the same betting plan. */
const SPIKE = 3;
/** Stake difference after a loss that is too small to read as chasing. */
const MEANINGFUL_LIFT = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

const median = (xs: readonly number[]): number => {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

const share = (part: number, whole: number): number => (whole === 0 ? 0 : (part / whole) * 100);

const pct = (n: number): string => `${n.toFixed(0)}%`;

/** Slice of the book that shares one habit, with what it staked and made. */
const sliceOf = (bets: readonly Bet[], keep: (bet: Bet) => boolean) => {
  const inside = bets.filter(keep);
  return {
    bets: inside.length,
    staked: inside.reduce((sum, b) => sum + b.stake, 0),
    profit: inside.reduce((sum, b) => sum + profitOf(b), 0),
  };
};

/** Picks backed on more than one slip: those slips then win or lose together. */
const repeatedPicks = (bets: readonly Bet[]): { picks: number; slips: number } => {
  const slipsPerPick = new Map<string, Set<string>>();
  for (const bet of bets) {
    for (const leg of bet.legs) {
      if (leg.event === null || leg.selection === null) continue;
      const key = `${leg.event}|${leg.selection}`.toLowerCase();
      const slips = slipsPerPick.get(key) ?? new Set<string>();
      slips.add(bet.betId);
      slipsPerPick.set(key, slips);
    }
  }
  const repeats = [...slipsPerPick.values()].filter((slips) => slips.size > 1);
  return {
    picks: repeats.length,
    slips: new Set(repeats.flatMap((slips) => [...slips])).size,
  };
};

/** Deposits made within a day of losing money — the classic top-up after a bad run. */
const depositsAfterLoss = (bets: readonly Bet[], transactions: readonly Transaction[]): number => {
  const settled = decisiveBets(bets).map((b) => ({
    at: Date.parse(resolutionDate(b)),
    profit: profitOf(b),
  }));
  return transactions.filter((t) => {
    if (t.kind !== 'deposit') return false;
    const at = Date.parse(t.occurredAt);
    const before = settled.filter((s) => s.at <= at && at - s.at <= DAY_MS);
    return before.length > 0 && before.reduce((sum, s) => sum + s.profit, 0) < 0;
  }).length;
};

/**
 * The outliers of a period, which a rate would bury. A single slip or a single
 * day can be most of what happened, and averaging it away reads as a habit when
 * it was one event — the opposite of what the reader needs to know.
 */
const spikes = (bets: readonly Bet[], money: (amount: number) => string): Finding[] => {
  const decisive = decisiveBets(bets);
  if (decisive.length < SPIKE_MIN_BETS) return [];

  const out: Finding[] = [];
  const profits = decisive.map(profitOf);
  const total = profits.reduce((sum, p) => sum + p, 0);
  const lost = profits.filter((p) => p < 0).reduce((sum, p) => sum - p, 0);
  const worst = Math.min(...profits);
  const best = Math.max(...profits);

  if (lost > 0 && share(-worst, lost) >= DOMINANT_SHARE) {
    out.push({
      id: 'one-slip-loss',
      kind: 'problem',
      title: 'One slip carried the damage',
      detail: `${money(-worst)} on a single slip — ${pct(share(-worst, lost))} of everything you lost here.`,
    });
  }

  if (total > 0 && best >= total) {
    out.push({
      id: 'one-slip-win',
      kind: 'problem',
      title: 'One win holds the period up',
      detail: `Take out that ${money(best)} slip and the period is ${money(total - best)}.`,
    });
  }

  const perDay = new Map<string, number>();
  for (const bet of decisive) {
    const day = resolutionDate(bet).slice(0, 10);
    perDay.set(day, (perDay.get(day) ?? 0) + profitOf(bet));
  }
  const worstDay = [...perDay.entries()].sort((a, b) => a[1] - b[1])[0];
  if (worstDay !== undefined && lost > 0 && share(-worstDay[1], lost) >= DOMINANT_DAY_SHARE) {
    out.push({
      id: 'worst-day',
      kind: 'problem',
      title: 'One day did most of it',
      detail: `${worstDay[0]} lost ${money(-worstDay[1])}, ${pct(share(-worstDay[1], lost))} of the period's losses.`,
    });
  }

  return out;
};

/**
 * What a period cost and what it was worth keeping, read from that period only.
 *
 * Every check runs on whatever settled, down to a single slip: a reader with two
 * weeks of bets has the same questions as one with two years, and an empty card
 * answers none of them. A short period says so in its first line instead, so the
 * figures below it are read as a first look rather than a verdict.
 */
export const findings = (
  bets: readonly Bet[],
  transactions: readonly Transaction[],
  money: (amount: number) => string,
): Finding[] => {
  const out = spikes(bets, money);
  const decisive = decisiveBets(bets);
  if (decisive.length === 0) return out;
  if (decisive.length < MIN_BETS) {
    out.unshift({
      id: 'early',
      kind: 'good',
      title: 'Early read',
      detail: `${String(decisive.length)} settled slips so far — every figure below still moves a lot.`,
    });
  }

  const staked = decisive.reduce((sum, b) => sum + b.stake, 0);

  const long = sliceOf(decisive, (b) => b.odds >= LONG_ODDS);
  const longShare = share(long.staked, staked);
  if (longShare >= BIG_SHARE && long.profit < 0) {
    out.push({
      id: 'long-odds',
      kind: 'problem',
      title: 'Too much on long prices',
      detail: `${pct(longShare)} of your stake at ${LONG_ODDS.toFixed(2)}+, down ${money(Math.abs(long.profit))}.`,
    });
  } else if (longShare < SMALL_SHARE) {
    out.push({
      id: 'long-odds',
      kind: 'good',
      title: 'Money stays on short prices',
      detail: `Only ${pct(longShare)} of your stake at ${LONG_ODDS.toFixed(2)}+.`,
    });
  }

  const combos = sliceOf(decisive, (b) => b.legs.length >= MANY_LEGS);
  const comboShare = share(combos.staked, staked);
  if (comboShare >= BIG_SHARE && combos.profit < 0) {
    out.push({
      id: 'long-slips',
      kind: 'problem',
      title: 'Big combos eat your stake',
      detail: `${pct(comboShare)} of your stake on ${String(MANY_LEGS)}+ pick slips, down ${money(Math.abs(combos.profit))}.`,
    });
  }

  const repeats = repeatedPicks(decisive);
  if (repeats.picks > 0) {
    out.push({
      id: 'repeats',
      kind: 'problem',
      title: 'Same pick on several slips',
      detail: `${String(repeats.picks)} picks on ${String(repeats.slips)} slips that win and lose together.`,
    });
  } else {
    out.push({
      id: 'repeats',
      kind: 'good',
      title: 'No pick is doubled up',
      detail: 'Every slip stands on its own.',
    });
  }

  const stakes = decisive.map((b) => b.stake);
  const usual = median(stakes);
  const biggest = Math.max(...stakes);
  if (usual > 0 && biggest >= usual * SPIKE) {
    out.push({
      id: 'stake-spikes',
      kind: 'problem',
      title: 'Your stake jumps',
      detail: `Usual ${money(usual)}, biggest ${money(biggest)} — ${(biggest / usual).toFixed(1)}× that.`,
    });
  } else if (usual > 0) {
    out.push({
      id: 'stake-spikes',
      kind: 'good',
      title: 'Your stake stays level',
      detail: `Biggest is ${(biggest / usual).toFixed(1)}× the usual ${money(usual)}.`,
    });
  }

  const tilt = tiltCheck(bets);
  if (tilt.sample >= SPIKE_MIN_BETS && tilt.stakeLift >= MEANINGFUL_LIFT) {
    out.push({
      id: 'tilt',
      kind: 'problem',
      title: 'You bet bigger after a loss',
      detail: `${pct(tilt.stakeLift)} more stake after a loss than after a win.`,
    });
  } else if (tilt.sample >= SPIKE_MIN_BETS) {
    out.push({
      id: 'tilt',
      kind: 'good',
      title: 'Losses do not move your stake',
      detail: `Within ${pct(Math.abs(tilt.stakeLift))} of your stake after a win.`,
    });
  }

  const deposits = transactions.filter((t) => t.kind === 'deposit').length;
  const chased = depositsAfterLoss(bets, transactions);
  if (deposits > 0 && chased >= 2) {
    out.push({
      id: 'deposit-chase',
      kind: 'problem',
      title: 'You top up after losing',
      detail: `${String(chased)} of ${String(deposits)} deposits within a day of a loss.`,
    });
  } else if (deposits > 0) {
    out.push({
      id: 'deposit-chase',
      kind: 'good',
      title: 'Deposits are not tied to losses',
      detail: `${String(chased)} of ${String(deposits)} deposits after a losing day.`,
    });
  }

  return out;
};
