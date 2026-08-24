import { describe, expect, it } from 'vitest';
import { habitLeaks, marginEdges, selectionLeaks } from './habits';
import { makeBet, makeLeg } from './__fixtures__/make-bet';
import type { Bet } from './types';

const won = (over: Partial<Bet> = {}): Bet =>
  makeBet({ status: 'won', stake: 10, actualReturn: 25, ...over });

const lost = (over: Partial<Bet> = {}): Bet =>
  makeBet({ status: 'lost', stake: 10, actualReturn: 0, ...over });

const times = (n: number, make: () => Bet): Bet[] => Array.from({ length: n }, make);

describe('habitLeaks', () => {
  it('returns nothing for no bets', () => {
    expect(habitLeaks([])).toEqual({ worst: [], best: [] });
  });

  it('ignores groups below the minimum bet count', () => {
    // Three losing tennis bets: a real loss, but far too few to name as a habit.
    const leaks = habitLeaks(
      times(3, () => lost({ sport: 'Tennis' })),
      5,
    );
    expect(leaks.worst).toEqual([]);
  });

  it('names a losing habit in plain language', () => {
    const bets = [
      ...times(8, () => lost({ sport: 'Tennis', legs: [makeLeg({ sport: 'Tennis' })] })),
      ...times(8, () => won({ sport: 'Football', legs: [makeLeg({ sport: 'Football' })] })),
    ];
    const { worst, best } = habitLeaks(bets);

    expect(worst.some((h) => h.label === 'Tennis')).toBe(true);
    expect(best.some((h) => h.label === 'Football')).toBe(true);
  });

  it('labels leg counts and live play as habits, not keys', () => {
    const bets = [
      ...times(6, () =>
        lost({
          betType: 'accumulator',
          legs: [makeLeg(), makeLeg(), makeLeg(), makeLeg(), makeLeg()],
        }),
      ),
      ...times(6, () => won({ legs: [makeLeg({ isLive: true })] })),
    ];
    const labels = [...habitLeaks(bets).worst, ...habitLeaks(bets).best].map((h) => h.label);

    expect(labels).toContain('Combos with 5+ legs');
    expect(labels).toContain('Live betting');
  });

  it('ranks by what came back per 1 staked, so stake size cannot decide the list', () => {
    // Darts loses €200 of €800 staked, tennis €40 of €40. Darts took five times
    // the money out, tennis gave nothing back at all - the rate leads the list.
    const bets = [
      ...times(8, () => lost({ sport: 'Tennis', stake: 5, legs: [makeLeg({ sport: 'Tennis' })] })),
      ...times(7, () => lost({ sport: 'Darts', stake: 100, legs: [makeLeg({ sport: 'Darts' })] })),
      won({ sport: 'Darts', stake: 100, actualReturn: 600, legs: [makeLeg({ sport: 'Darts' })] }),
    ];
    const sports = habitLeaks(bets).worst.filter((h) => ['Tennis', 'Darts'].includes(h.label));

    expect(sports[0]?.label).toBe('Tennis');
    expect(sports[0]?.unitsPerBet).toBeCloseTo(-1, 6);
  });

  it('reads the figure off the money, so a big slip is not averaged away', () => {
    // Nine €1 slips win €1 each, one €500 slip loses: the average slip is up, the
    // money is down €491, and the card quotes this figure as "back per 1 staked".
    const tennisLeg = { legs: [makeLeg({ sport: 'Tennis' })] };
    const bets = [
      ...times(9, () => won({ sport: 'Tennis', stake: 1, actualReturn: 2, ...tennisLeg })),
      lost({ sport: 'Tennis', stake: 500, ...tennisLeg }),
      // Tennis has to stay under the share that makes a group the period itself.
      ...times(4, () => won({ sport: 'Football', legs: [makeLeg({ sport: 'Football' })] })),
    ];
    const tennis = [...habitLeaks(bets, 5).worst, ...habitLeaks(bets, 5).best].find(
      (h) => h.label === 'Tennis',
    );

    expect(tennis?.unitsPerBet).toBeCloseTo(-491 / 509, 6);
    // One slip holds the whole swing: the figure is real, the pattern is not.
    expect(tennis?.driven).toBe(true);
  });

  it('puts a group carried by one slip behind a steady one', () => {
    // Golf drops 5 units over 6 bets, tennis drops 6 over 6 - but golf's whole
    // figure is one slip, so it is a result to explain, not a habit to change.
    const bets = [
      ...times(6, () => lost({ sport: 'Tennis', legs: [makeLeg({ sport: 'Tennis' })] })),
      ...times(5, () =>
        makeBet({
          sport: 'Golf',
          status: 'won',
          stake: 10,
          actualReturn: 10,
          legs: [makeLeg({ sport: 'Golf' })],
        }),
      ),
      makeBet({
        sport: 'Golf',
        status: 'lost',
        stake: 50,
        actualReturn: 0,
        legs: [makeLeg({ sport: 'Golf' })],
      }),
      ...times(6, () => won({ sport: 'Football', legs: [makeLeg({ sport: 'Football' })] })),
    ];
    const sports = habitLeaks(bets).worst.filter((h) => ['Tennis', 'Golf'].includes(h.label));

    expect(sports[0]?.label).toBe('Tennis');
  });

  it('sorts worst most-negative first and best most-positive first', () => {
    const bets = [
      ...times(6, () => lost({ sport: 'Tennis', legs: [makeLeg({ sport: 'Tennis' })] })),
      ...times(6, () => lost({ sport: 'Darts', stake: 40, legs: [makeLeg({ sport: 'Darts' })] })),
      ...times(6, () => won({ sport: 'Football', legs: [makeLeg({ sport: 'Football' })] })),
    ];
    const { worst, best } = habitLeaks(bets);

    expect(worst.every((h) => h.profit < 0)).toBe(true);
    expect(best.every((h) => h.profit > 0)).toBe(true);
    for (let i = 1; i < worst.length; i += 1) {
      expect(worst[i]!.unitsPerBet).toBeGreaterThanOrEqual(worst[i - 1]!.unitsPerBet);
    }
    for (let i = 1; i < best.length; i += 1) {
      expect(best[i]!.unitsPerBet).toBeLessThanOrEqual(best[i - 1]!.unitsPerBet);
    }
  });

  it('skips a group that holds nearly every bet', () => {
    // Every bet is pre-match, so "Pre-match betting" is the period total, not a habit.
    const bets = times(10, () => lost({ legs: [makeLeg({ isLive: false })] }));
    expect(habitLeaks(bets).worst.some((h) => h.label === 'Pre-match betting')).toBe(false);
  });

  it('gives every dimension a turn before repeating one', () => {
    // Three losing sports would otherwise take all three slots and read as three
    // problems when the leg count is a separate one.
    const bets = [
      ...times(6, () => lost({ sport: 'Tennis', legs: [makeLeg({ sport: 'Tennis' })] })),
      ...times(6, () => lost({ sport: 'Darts', legs: [makeLeg({ sport: 'Darts' })] })),
      ...times(6, () =>
        lost({
          sport: 'Golf',
          betType: 'accumulator',
          legs: [makeLeg({ sport: 'Golf' }), makeLeg(), makeLeg(), makeLeg(), makeLeg()],
        }),
      ),
    ];
    const labels = habitLeaks(bets).worst.map((h) => h.label);

    expect(labels).toContain('Combos with 5+ legs');
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('fills the last slots from a dimension already used rather than cutting short', () => {
    // Every slip is a pre-match single, so the sport is the only dimension left
    // to name: three rows of it beat one row and two empty slots.
    const bets = [
      ...times(6, () => lost({ sport: 'Tennis', legs: [makeLeg({ sport: 'Tennis' })] })),
      ...times(6, () => lost({ sport: 'Darts', legs: [makeLeg({ sport: 'Darts' })] })),
      ...times(6, () => lost({ sport: 'Golf', legs: [makeLeg({ sport: 'Golf' })] })),
    ];
    const labels = habitLeaks(bets).worst.map((h) => h.label);

    expect(labels).toEqual(expect.arrayContaining(['Tennis', 'Darts', 'Golf']));
  });

  it('caps each side at the limit', () => {
    const bets = [
      ...times(6, () => lost({ sport: 'Tennis', legs: [makeLeg({ sport: 'Tennis' })] })),
      ...times(6, () => lost({ stake: 30, legs: [makeLeg()] })),
      ...times(6, () => lost({ odds: 8, legs: [makeLeg({ odds: 8 })] })),
      ...times(6, () => lost({ betType: 'accumulator', legs: [makeLeg(), makeLeg()] })),
    ];
    expect(habitLeaks(bets).worst.length).toBeLessThanOrEqual(3);
  });
});

describe('selectionLeaks', () => {
  it('returns nothing for no bets', () => {
    expect(selectionLeaks([])).toEqual({ worst: [], best: [] });
  });

  it('ranks selection groups by flat-unit P/L, not currency', () => {
    const bets = [
      ...times(10, () => lost({ sport: 'Tennis' })),
      ...times(10, () => won({ sport: 'Football', stake: 500, actualReturn: 1000 })),
    ];
    const { worst, best } = selectionLeaks(bets);

    // Ten 1-unit singles lost, ten won at odds 2: −10u and +10u, whatever was staked.
    expect(worst).toEqual([
      { label: 'Tennis', profit: -10, bets: 10, winRate: 0, unitsPerBet: -1, driven: false },
    ]);
    expect(best).toEqual([
      { label: 'Football', profit: 10, bets: 10, winRate: 100, unitsPerBet: 1, driven: false },
    ]);
  });

  it('counts each leg of a combo separately', () => {
    const bets = times(10, () =>
      lost({
        betType: 'accumulator',
        legs: [
          makeLeg({ sport: 'Tennis', status: 'lost' }),
          makeLeg({ sport: 'Darts', status: 'won' }),
        ],
      }),
    );
    const { worst, best } = selectionLeaks(bets);

    expect(worst[0]).toEqual({
      label: 'Tennis',
      profit: -10,
      bets: 10,
      winRate: 0,
      unitsPerBet: -1,
      driven: false,
    });
    expect(best[0]).toEqual({
      label: 'Darts',
      profit: 10,
      bets: 10,
      winRate: 100,
      unitsPerBet: 1,
      driven: false,
    });
  });
});

/** Singles at even money, so every pick is priced at 50% and par is 47.6%. */
const evenPicks = (sport: string, count: number, wins: number): Bet[] =>
  Array.from({ length: count }, (_, i) =>
    makeBet({
      sport,
      odds: 2,
      status: i < wins ? 'won' : 'lost',
      stake: 10,
      actualReturn: i < wins ? 20 : 0,
    }),
  );

describe('marginEdges', () => {
  it('names nothing below the minimum pick count', () => {
    expect(marginEdges([...evenPicks('Football', 10, 4), ...evenPicks('Tennis', 10, 4)])).toEqual({
      worst: null,
      best: null,
    });
  });

  it('ranks a small gap over many picks above a large gap over few', () => {
    const bets = [
      // −5pp on the price, so −2.6pp past the cut, but over 700 picks.
      ...evenPicks('Football', 700, 315),
      // −10pp on the price, the uglier percentage, over 200 picks.
      ...evenPicks('Tennis', 200, 80),
      ...evenPicks('Basketball', 100, 40),
    ];
    const { worst, best } = marginEdges(bets);
    expect(worst?.label).toBe('Football');
    expect(worst?.picksPastMargin).toBeLessThan(-18);
    // Nothing here clears the cut, so nothing is offered as an edge.
    expect(best).toBeNull();
  });

  it('reads a group that only loses to the house cut as an edge, not a leak', () => {
    const bets = [
      // Level with the price: under no one, so it is 2.4pp clear of the cut.
      ...evenPicks('Football', 700, 350),
      ...evenPicks('Tennis', 200, 80),
      ...evenPicks('Basketball', 100, 40),
    ];
    const { worst, best } = marginEdges(bets);
    expect(best?.label).toBe('Football');
    expect(best?.picksPastMargin).toBeGreaterThan(0);
    expect(worst?.label).toBe('Tennis');
  });
});
