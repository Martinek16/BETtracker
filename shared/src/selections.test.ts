import { describe, expect, it } from 'vitest';
import { groupSelectionsBy, groupSelectionsWithin, selectionsOf } from './selections';
import { makeBet, makeLeg } from './__fixtures__/make-bet';

describe('selectionsOf', () => {
  it('expands each leg once and synthesises one for legless singles', () => {
    const bets = [makeBet({ legs: [makeLeg(), makeLeg(), makeLeg()] }), makeBet({ legs: [] })];
    expect(selectionsOf(bets)).toHaveLength(4);
  });

  it('falls back to slip odds for legs without their own price', () => {
    const [sel] = selectionsOf([makeBet({ odds: 3.5, legs: [makeLeg({ odds: undefined })] })]);
    expect(sel!.odds).toBe(3.5);
  });
});

describe('groupSelectionsBy', () => {
  const bets = [
    makeBet({
      legs: [
        makeLeg({ sport: 'Football', status: 'won', odds: 2 }),
        makeLeg({ sport: 'Football', status: 'lost', odds: 2 }),
        makeLeg({ sport: 'Football', status: 'void', odds: 2 }),
        makeLeg({ sport: 'Tennis', status: 'won', odds: 4 }),
      ],
    }),
  ];

  it('excludes void and pending from the hit rate denominator', () => {
    const football = groupSelectionsBy(bets, 'sport').find((g) => g.key === 'Football')!;
    expect(football.picks).toBe(3);
    expect(football.decided).toBe(2);
    expect(football.hitRate).toBe(50);
  });

  it('compares hit rate against the price the book set', () => {
    const football = groupSelectionsBy(bets, 'sport').find((g) => g.key === 'Football')!;
    expect(football.meanImplied).toBeCloseTo(50, 6);
    expect(football.edgePp).toBeCloseTo(0, 6);
  });

  it('computes the flat 1u counterfactual from leg results alone', () => {
    const groups = groupSelectionsBy(bets, 'sport');
    // Football: +1 (won at 2.0), −1 (lost), 0 (void) = 0
    expect(groups.find((g) => g.key === 'Football')!.flatUnitsPl).toBeCloseTo(0, 6);
    // Tennis: +3 (won at 4.0)
    expect(groups.find((g) => g.key === 'Tennis')!.flatUnitsPl).toBeCloseTo(3, 6);
  });

  it('never exposes money fields - a leg of a combo has no stake of its own', () => {
    const [group] = groupSelectionsBy(bets, 'sport');
    expect(group).not.toHaveProperty('stake');
    expect(group).not.toHaveProperty('staked');
    expect(group).not.toHaveProperty('profit');
  });

  it('brackets the hit rate with a Wilson interval', () => {
    const football = groupSelectionsBy(bets, 'sport').find((g) => g.key === 'Football')!;
    expect(football.wilsonLow).toBeLessThan(football.hitRate);
    expect(football.wilsonHigh).toBeGreaterThan(football.hitRate);
  });
});

describe('grouping by team', () => {
  it('drops picks that name no side of the event', () => {
    const bets = [
      makeBet({
        legs: [
          makeLeg({ event: 'Everton - Manchester City', selection: 'Manchester City' }),
          makeLeg({ event: 'Everton - Manchester City', selection: 'Under 2.5' }),
        ],
      }),
    ];
    const groups = groupSelectionsBy(bets, 'team');
    expect(groups.map((g) => g.label)).toEqual(['Manchester City']);
  });

  it('keeps a national side apart in each sport it plays', () => {
    const bets = [
      makeBet({
        legs: [
          makeLeg({ sport: 'Football', event: 'Slovenia - Norway', selection: 'Slovenia' }),
          makeLeg({ sport: 'Handball', event: 'Slovenia - Denmark', selection: 'Slovenia' }),
        ],
      }),
    ];
    const groups = groupSelectionsBy(bets, 'team');
    // Two groups, so each row knows which sport's icon it wears.
    expect(groups.map((g) => g.label)).toEqual(['Slovenia', 'Slovenia']);
    expect(groups.map((g) => g.sports)).toEqual([['Football'], ['Handball']]);
  });

  it('merges the same side written with and without its club word', () => {
    const bets = [
      makeBet({
        legs: [
          makeLeg({ event: 'Everton FC - Liverpool FC', selection: 'Everton FC' }),
          makeLeg({ event: 'Everton - Arsenal', selection: 'Everton' }),
        ],
      }),
    ];
    expect(groupSelectionsBy(bets, 'team').map((g) => g.label)).toEqual(['Everton']);
  });

  it('gives a combo leg its share of the slip it was part of', () => {
    const bets = [
      makeBet({ stake: 10, actualReturn: 30, legs: [makeLeg({ sport: 'Tennis' })] }),
      makeBet({ stake: 50, actualReturn: 0, status: 'lost', legs: [makeLeg({ sport: 'Tennis' })] }),
      // +300 over two legs: 150 to each sport, not 300 to one and nothing to the other.
      makeBet({
        stake: 100,
        actualReturn: 400,
        legs: [makeLeg({ sport: 'Tennis' }), makeLeg({ sport: 'Football' })],
      }),
    ];
    const groups = groupSelectionsBy(bets, 'sport');
    const tennis = groups.find((g) => g.key === 'Tennis')!;
    expect(tennis.picks).toBe(3);
    expect(tennis.singles).toBe(2);
    expect(tennis.moneyPl).toBeCloseTo(20 - 50 + 150, 6);
    expect(groups.find((g) => g.key === 'Football')!.moneyPl).toBeCloseTo(150, 6);
  });
});

describe('groupSelectionsWithin', () => {
  it('splits one market family back into the lines it was built from', () => {
    const bets = [
      makeBet({
        legs: [
          makeLeg({ sport: 'Football', marketType: 'Over/Under 2.5', selection: 'Over 2.5' }),
          makeLeg({ sport: 'Football', marketType: 'Over/Under 1.5', selection: 'Under 1.5' }),
          makeLeg({ sport: 'Football', marketType: '1X2', selection: 'Everton' }),
        ],
      }),
    ];
    const lines = groupSelectionsWithin(bets, 'marketFamily', 'Goals', 'marketLine');
    expect(lines.map((l) => l.key).sort()).toEqual(['Total Over 2.5', 'Total Under 1.5']);
  });

  it('merges the same line across the sports that price it in fifty places', () => {
    const bets = [
      makeBet({
        legs: [
          makeLeg({ sport: 'Basketball', marketType: 'Over/Under 210.5', selection: 'Over 210.5' }),
          makeLeg({ sport: 'Basketball', marketType: 'Over/Under 198.5', selection: 'Over 198.5' }),
        ],
      }),
    ];
    const lines = groupSelectionsWithin(bets, 'marketFamily', 'Goals', 'marketLine');
    expect(lines.map((l) => l.key)).toEqual(['Total Over']);
    expect(lines[0]?.picks).toBe(2);
  });
});

describe('cross-book merging', () => {
  it('lands the same competition from both books in one group', () => {
    const bets = [
      makeBet({
        bookmaker: 'bet-at-home',
        legs: [makeLeg({ sport: 'Football', league: 'Premier League 2025/2026' })],
      }),
      // The same sport, in the word this book uses for it.
      makeBet({
        bookmaker: 'stake',
        legs: [makeLeg({ sport: 'Soccer', league: 'Premier League' })],
      }),
    ];
    const [group] = groupSelectionsBy(bets, 'league');
    expect(group!.label).toBe('Premier League');
    expect(group!.picks).toBe(2);
  });

  it('lands one competition spelled two ways in one group', () => {
    const bets = [
      makeBet({ legs: [makeLeg({ sport: 'Football', league: 'LaLiga' })] }),
      makeBet({ legs: [makeLeg({ sport: 'Football', league: 'La Liga 2025/2026' })] }),
    ];
    const [group] = groupSelectionsBy(bets, 'league');
    expect(group!.picks).toBe(2);
    // The row is written the way a reader would space it.
    expect(group!.label).toBe('La Liga');
  });

  it('keeps one league name apart where two sports both use it', () => {
    const bets = [
      makeBet({ legs: [makeLeg({ sport: 'Football', league: 'Bundesliga' })] }),
      makeBet({ legs: [makeLeg({ sport: 'Handball', league: 'Bundesliga' })] }),
      makeBet({ legs: [makeLeg({ sport: 'Football', league: 'Serie A' })] }),
    ];
    const groups = groupSelectionsBy(bets, 'league');
    // Two groups, both reading "Bundesliga": the sport is drawn beside the row.
    expect(groups.map((g) => g.label).sort()).toEqual(['Bundesliga', 'Bundesliga', 'Serie A']);
    expect(new Set(groups.map((g) => g.key)).size).toBe(3);
  });
});
