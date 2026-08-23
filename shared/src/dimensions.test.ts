import { describe, expect, it } from 'vitest';
import normalized from './__fixtures__/bets.normalized.json';
import {
  comboSizeBands,
  compareGroupKeys,
  groupBy,
  hasKeyOrder,
  keyForSlip,
  oddsBand,
  oddsBracket,
  slipType,
  stakeBand,
  type DimensionKey,
  type SlipDimension,
} from './dimensions';
import { profitOf } from './calculations';
import { makeBet, makeLeg } from './__fixtures__/make-bet';
import type { Bet } from './types';

const bets = normalized as Bet[];

const ALL: SlipDimension[] = [
  'betType',
  'legCount',
  'slipOdds',
  'stakeBand',
  'dayOfWeek',
  'hourOfDay',
  'month',
  'sport',
  'league',
  'selectionType',
  'isLive',
  'bookmaker',
  'exit',
];

describe('groupBy partitions slips', () => {
  it.each(ALL)('group profits sum to period profit for %s', (dimension) => {
    const total = bets.reduce((sum, b) => sum + profitOf(b), 0);
    const grouped = groupBy(bets, dimension);
    expect(grouped.reduce((sum, g) => sum + g.profit, 0)).toBeCloseTo(total, 6);
    expect(grouped.reduce((sum, g) => sum + g.bets, 0)).toBe(bets.length);
  });
});

describe('pure-or-Mixed collapse', () => {
  it('labels a cross-sport combo Mixed rather than counting it twice', () => {
    const combo = makeBet({
      betType: 'accumulator',
      legs: [makeLeg({ sport: 'Football' }), makeLeg({ sport: 'Tennis' })],
    });
    expect(keyForSlip(combo, 'sport')).toBe('Mixed');
  });

  it('keeps a single-sport combo under that sport', () => {
    const combo = makeBet({
      betType: 'accumulator',
      legs: [makeLeg({ sport: 'Football' }), makeLeg({ sport: 'Football' })],
    });
    expect(keyForSlip(combo, 'sport')).toBe('Football');
  });

  it('ignores unlabelled legs instead of calling the slip Mixed', () => {
    const combo = makeBet({
      betType: 'accumulator',
      legs: [makeLeg({ sport: 'Football' }), makeLeg({ sport: null })],
    });
    expect(keyForSlip(combo, 'sport')).toBe('Football');
  });

  it('falls back to the slip field when there are no legs', () => {
    expect(keyForSlip(makeBet({ legs: [], sport: 'Tennis' }), 'sport')).toBe('Tennis');
  });
});

describe('legCount buckets', () => {
  it('treats a legless single as one leg and caps at 5+', () => {
    expect(keyForSlip(makeBet({ legs: [] }), 'legCount')).toBe('1');
    expect(keyForSlip(makeBet({ legs: [makeLeg(), makeLeg(), makeLeg()] }), 'legCount')).toBe('3');
    expect(
      keyForSlip(makeBet({ legs: Array.from({ length: 7 }, () => makeLeg()) }), 'legCount'),
    ).toBe('5+');
  });
});

describe('slipType', () => {
  const legs = (n: number): Bet['legs'] => Array.from({ length: n }, () => makeLeg());

  it('names small slips and bands the big ones', () => {
    expect(slipType(makeBet({ legs: [] }))).toBe('Single');
    expect(slipType(makeBet({ betType: 'accumulator', legs: legs(3) }))).toBe('Treble');
    expect(slipType(makeBet({ betType: 'accumulator', legs: legs(5) }))).toBe('5-fold');
    expect(slipType(makeBet({ betType: 'accumulator', legs: legs(9) }))).toBe('6–10 folds');
    expect(slipType(makeBet({ betType: 'accumulator', legs: legs(20) }))).toBe('11–20 folds');
    expect(slipType(makeBet({ betType: 'accumulator', legs: legs(21) }))).toBe('21+ folds');
  });

  it('keeps a system bet under its own name', () => {
    expect(slipType(makeBet({ betType: 'system', legs: legs(6) }))).toBe('System');
  });
});

describe('odds and stake bands cover the whole range', () => {
  it('places short, long and huge prices', () => {
    expect(oddsBracket(1.02)).toBe('1.00–1.25');
    expect(oddsBracket(1.8)).toBe('1.75–2.00');
    expect(oddsBracket(7)).toBe('5.00–7.50');
    expect(oddsBracket(15)).toBe('10.0–20.0');
    expect(oddsBracket(500)).toBe('20.0+');
  });

  it('places every price in one coarse band, in reading order', () => {
    expect(oddsBand(1.02)).toBe('Under 1.50');
    expect(oddsBand(1.5)).toBe('1.50–2.00');
    expect(oddsBand(2)).toBe('2.00–3.00');
    expect(oddsBand(4.99)).toBe('3.00–5.00');
    expect(oddsBand(500)).toBe('5.00+');
    expect(compareGroupKeys('oddsBand', 'Under 1.50', '5.00+')).toBeLessThan(0);
  });

  it('places small and large stakes', () => {
    expect(stakeBand(2)).toBe('≤ 5');
    expect(stakeBand(8)).toBe('5–10');
    expect(stakeBand(300)).toBe('250–500');
    expect(stakeBand(50_000)).toBe('10000+');
  });
});

describe('the price a group took', () => {
  it('is not moved by one long punt', () => {
    const priced = [1.8, 1.9, 2.0, 2.1, 50].map((odds) => makeBet({ odds, status: 'won' }));
    expect(groupBy(priced, 'bookmaker')[0]!.medianOdds).toBe(2.0);
  });

  it('reads the promise off every price, not off the middle one', () => {
    // Four evens shots and one 10.00: the prices promise (4 × 50% + 10%) / 5 = 42%,
    // while the middle price on its own would claim 50%.
    const priced = [2, 2, 2, 2, 10].map((odds) => makeBet({ odds, status: 'won' }));
    expect(groupBy(priced, 'bookmaker')[0]!.meanImplied).toBeCloseTo(42, 6);
  });
});

describe('bands cut to the slips they hold', () => {
  const staked = (amounts: number[]): Bet[] => amounts.map((stake) => makeBet({ stake }));

  it('splits a band the whole period sits in', () => {
    // Thirty slips between 100 and 250, which the fixed ladder calls one band.
    const keys = groupBy(
      staked(Array.from({ length: 30 }, (_, i) => 110 + i * 4)),
      'stakeBand',
    ).map((g) => g.key);
    expect(keys.length).toBeGreaterThan(1);
    expect(keys).not.toContain('100–250');
  });

  it('cuts where the slips sit, not at the roundest number in the band', () => {
    // Twenty slips between 110 and 129: 200 is the roundest cut in the 100–250
    // band and would leave all twenty on one side of it.
    const keys = groupBy(
      staked(Array.from({ length: 20 }, (_, i) => 110 + i)),
      'stakeBand',
    ).map((g) => g.key);
    expect(keys).toContain('100–120');
  });

  it('splits a band that dwarfs the rest without holding a third of them', () => {
    // Fifteen slips in one band against one slip in each of six others: under a
    // third of the period, and still the only row worth cutting.
    const amounts = [...Array.from({ length: 15 }, (_, i) => 110 + i), 2, 7, 30, 60, 300, 700];
    const keys = groupBy(staked(amounts), 'stakeBand').map((g) => g.key);
    expect(keys).not.toContain('100–250');
  });

  it('leaves the ladder alone when no band is crowded', () => {
    const keys = groupBy(staked([2, 7, 30, 60, 120, 300]), 'stakeBand').map((g) => g.key);
    expect(keys).toContain('100–250');
  });

  it('reads cut bands in order, not alphabetically', () => {
    expect(compareGroupKeys('stakeBand', '100–150', '150–250')).toBeLessThan(0);
    expect(compareGroupKeys('stakeBand', '≤ 5', '100–150')).toBeLessThan(0);
    expect(compareGroupKeys('slipOdds', '1.50–1.75', '20.00+')).toBeLessThan(0);
  });

  it('still places every slip exactly once after a split', () => {
    const amounts = Array.from({ length: 40 }, (_, i) => 100 + i);
    const grouped = groupBy(staked(amounts), 'stakeBand');
    expect(grouped.reduce((sum, g) => sum + g.bets, 0)).toBe(amounts.length);
  });
});

describe('comboSizeBands', () => {
  it('partitions every slip into exactly one band', () => {
    const banded = comboSizeBands(bets);
    expect(banded.map((g) => g.key)).toEqual([
      'Singles',
      'Doubles',
      'Trebles',
      '4–5 legs',
      '6–10 legs',
      '11+ legs',
    ]);
    expect(banded.reduce((sum, g) => sum + g.bets, 0)).toBe(bets.length);
    expect(banded.reduce((sum, g) => sum + g.profit, 0)).toBeCloseTo(
      bets.reduce((sum, b) => sum + profitOf(b), 0),
      6,
    );
  });

  it('puts a legless slip in Singles and reaches past 5 legs', () => {
    const legs = (n: number): Bet['legs'] => Array.from({ length: n }, () => makeLeg());
    const sized = comboSizeBands([
      makeBet({ legs: [] }),
      makeBet({ legs: legs(2) }),
      makeBet({ legs: legs(3) }),
      makeBet({ legs: legs(4) }),
      makeBet({ legs: legs(8) }),
      makeBet({ legs: legs(12) }),
    ]);
    expect(sized.map((g) => g.bets)).toEqual([1, 1, 1, 1, 1, 1]);
  });
});

describe('compareGroupKeys', () => {
  const sorted = (dimension: DimensionKey, keys: string[]): string[] =>
    [...keys].sort((a, b) => compareGroupKeys(dimension, a, b));

  it('reads slip types from single upwards', () => {
    expect(sorted('betType', ['System', 'Treble', 'Single', '6–10 folds', 'Double'])).toEqual([
      'Single',
      'Double',
      'Treble',
      '6–10 folds',
      'System',
    ]);
  });

  it('reads odds and stake bands from low to high', () => {
    expect(sorted('slipOdds', ['20.0+', '1.75–2.00', '1.00–1.25'])).toEqual([
      '1.00–1.25',
      '1.75–2.00',
      '20.0+',
    ]);
    expect(sorted('stakeBand', ['100–250', '≤ 5', '10–25'])).toEqual(['≤ 5', '10–25', '100–250']);
  });

  it('starts the week on Monday', () => {
    expect(sorted('dayOfWeek', ['Sunday', 'Wednesday', 'Monday'])).toEqual([
      'Monday',
      'Wednesday',
      'Sunday',
    ]);
  });

  it('sorts months as dates, not as words', () => {
    expect(sorted('month', ['Jan 2026', 'Feb 2025', 'Dec 2025'])).toEqual([
      'Feb 2025',
      'Dec 2025',
      'Jan 2026',
    ]);
  });

  it('falls back to alphabetical where the keys are names', () => {
    expect(hasKeyOrder('league')).toBe(false);
    expect(sorted('league', ['Serie A', 'Bundesliga'])).toEqual(['Bundesliga', 'Serie A']);
  });
});

describe('GroupStats.unitsPl', () => {
  const single = (over: Partial<Bet>): Bet =>
    makeBet({ odds: 2, legs: [makeLeg()], ...over });

  it('counts a win at its price and a loss at one stake, whatever the money was', () => {
    const groups = groupBy(
      [
        single({ betId: 'a', status: 'won', stake: 5, actualReturn: 10 }),
        single({ betId: 'b', status: 'lost', stake: 500, actualReturn: 0 }),
      ],
      'betType',
    );
    expect(groups[0]!.unitsPl).toBeCloseTo(0);
  });

  it('leaves pending slips at zero', () => {
    const groups = groupBy(
      [single({ betId: 'c', status: 'pending', stake: 20, actualReturn: 0 })],
      'betType',
    );
    expect(groups[0]!.unitsPl).toBe(0);
  });
});
