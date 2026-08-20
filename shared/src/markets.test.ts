import { describe, expect, it } from 'vitest';
import { marketFamily, marketLine, OTHER_MARKETS } from './markets';

describe('marketFamily', () => {
  it('reads the subject before the shape of the bet', () => {
    expect(marketFamily('Corners Over/Under 9.5')).toBe('Corners');
    expect(marketFamily('Total Cards Over 3.5')).toBe('Bookings');
    expect(marketFamily('Over/Under 2.5')).toBe('Totals');
  });

  it('splits the sport-specific subjects out of the total lines', () => {
    expect(marketFamily('Sets Over/Under 3.5')).toBe('Halves');
    expect(marketFamily('Second Half Over/Under 1.5')).toBe('Halves');
    expect(marketFamily('Both Teams To Score')).toBe('Teams');
    expect(marketFamily('Ferran Torres Shots On Target Over/Under 0.5')).toBe('Players');
  });

  it('keeps a bet on two questions out of either family', () => {
    expect(marketFamily('Matchbet And Over/Under 1.5')).toBe('Combos');
    expect(marketFamily('Double Chance & Over/Under 4.5')).toBe('Combos');
  });

  it('puts every way of naming the winner in one family', () => {
    expect(marketFamily('1X2')).toBe('Match result');
    expect(marketFamily('1x2')).toBe('Match result');
    expect(marketFamily('Match bet')).toBe('Match result');
    expect(marketFamily('Draw No Bet')).toBe('Match result');
    expect(marketFamily('Double Chance')).toBe('Match result');
    expect(marketFamily('Head To Head: Domen Prevc - Timi Zajc')).toBe('Match result');
  });

  it('keeps the scoring markets together', () => {
    expect(marketFamily('Correct Score')).toBe('Scores');
    expect(marketFamily('Team To Score Goal 1')).toBe('Scores');
    expect(marketFamily('Goal In Both Halves')).toBe('Scores');
  });

  it('files what one side did under Teams, and the scoreline under Scores', () => {
    expect(marketFamily('Clean Sheet')).toBe('Teams');
    expect(marketFamily('Wolves To Score In Both Halves')).toBe('Teams');
    expect(marketFamily('Arsenal Win To Nil')).toBe('Teams');
    expect(marketFamily('First Team To Score')).toBe('Teams');
    expect(marketFamily('Minnesota Lynx (W) to score Over/Under 83.5')).toBe('Teams');
    expect(marketFamily('Team Total Over 1.5')).toBe('Teams');
  });

  it('falls back rather than inventing a family', () => {
    expect(marketFamily(null)).toBe(OTHER_MARKETS);
    expect(marketFamily('')).toBe(OTHER_MARKETS);
    expect(marketFamily('Winning margin')).toBe(OTHER_MARKETS);
  });
});

describe('marketLine', () => {
  const event = 'Barcelona - Real Madrid';

  it('drops the player the book printed into the market', () => {
    expect(marketLine('Ferran Torres Shots On Target Over/Under 0.5', event, 'Over 0.5')).toBe(
      'Shots On Target Over',
    );
    expect(marketLine('Luka Doncic Score Over/Under', event, 'Under')).toBe('Score Under');
    expect(marketLine('Shohei Ohtani Hits Over/Under 0.5', event, 'Over 0.5')).toBe('Hits Over');
  });

  it('drops a side of this match from its own market', () => {
    expect(marketLine('Barcelona Corner Kicks Over/Under 3.5', event, 'Over 3.5')).toBe(
      'Corner Kicks Over',
    );
    expect(marketLine('Real Madrid Clean Sheet', event)).toBe('Clean Sheet');
  });

  it('leaves a market that was never priced at a number alone', () => {
    expect(marketLine('Correct Score', event)).toBe('Correct Score');
    expect(marketLine(null, event)).toBe('Unknown');
  });

  it('files every nth goal, corner and minute under the bet they all are', () => {
    expect(marketLine('Team To Score Goal 4', event, 'Goal 4: Barcelona')).toBe(
      'Team To Score Goal',
    );
    expect(marketLine('Team To Score Goal 1', event)).toBe('Team To Score Goal');
    expect(marketLine('First to 5 Corners', event)).toBe('First To Corners');
    expect(marketLine('Goal 4 Before Minute 70:00', event)).toBe('Goal Before Minute');
    // A market whose own name holds a number is not a count of anything.
    expect(marketLine('Corner 1x2', event)).toBe('Corner 1x2');
  });

  it('reads one market out of the house note on what it counts', () => {
    expect(marketLine('Total (Incl. Overtime)', event)).toBe('Total');
    expect(marketLine('Winner (Incl. Super Over)', event, 'Yes')).toBe('Winner');
  });

  it('cuts a player off at a whole word, never inside their name', () => {
    // 'runs' sits inside "Brunson", which used to file the bet under "runson".
    expect(marketLine('Jalen Brunson Score Over/Under 24.5', event, 'Over 24.5')).toBe(
      'Score Over',
    );
    expect(marketLine('Stephen Curry Turnovers Over/Under 2.5', event, 'Over 2.5')).toBe(
      'Turnovers Over',
    );
  });

  it('reads one market whichever club a book printed in front of it', () => {
    const derby = 'Everton FC - Liverpool FC';
    expect(marketLine('Everton Clean Sheet', derby)).toBe('Clean Sheet');
    expect(marketLine('Liverpool FC Clean Sheet', derby)).toBe('Clean Sheet');
    expect(marketLine('Everton to Score in Both Halves', derby)).toBe('To Score In Both Halves');
  });

  it('drops a club the fixture spells differently, or does not name at all', () => {
    const tie = 'Olimpija - Crvena Zvezda';
    expect(marketLine('NK Olimpija Ljubljana Clean Sheet', tie)).toBe('Clean Sheet');
    expect(marketLine('FK Crvena Zvezda To Score In Both Halves', null)).toBe(
      'To Score In Both Halves',
    );
    // A market that asks about nobody in particular keeps its own first word.
    expect(marketLine('Both Teams To Score', tie)).toBe('Both teams to score');
    expect(marketLine('Team To Score Goal 2', tie)).toBe('Team To Score Goal');
  });

  it('keeps the direction of a line and drops its number', () => {
    expect(marketLine('Over/Under 210.5', event, 'Over 210.5', 'Basketball')).toBe('Total Over');
    expect(marketLine('Cards Over/Under 2.5', event, 'Under 2.5', 'Football')).toBe('Cards Under');
    expect(marketLine('Sets Over/Under 3.5', event, 'Over 3.5', 'Volleyball')).toBe('Sets Over');
  });

  it('groups a team total by the total, not by the team', () => {
    const game = 'Minnesota Lynx (W) - Seattle Storm (W)';
    expect(
      marketLine(
        'Minnesota Lynx (W) to score Over/Under 83.5',
        game,
        'Minnesota Lynx (W) Over 83.5',
        'Basketball',
      ),
    ).toBe('To Score Over');
    expect(
      marketLine(
        'Seattle Storm (W) to score Over/Under 79.5',
        game,
        'Seattle Storm (W) Under 79.5',
        'Basketball',
      ),
    ).toBe('To Score Under');
  });

  it('keeps the football match total at its number, where the set is small', () => {
    expect(marketLine('Over/Under 2.5', event, 'Under 2.5', 'Football')).toBe('Total Under 2.5');
    expect(marketLine('Over/Under 3.5', event, 'Over 3.5', 'Football')).toBe('Total Over 3.5');
  });

  it('reads a handicap from the side that was backed, not the line quoted', () => {
    // Football offers the same handicap at nine half-goals; the way it was taken
    // is the bet, and the number is the fixture.
    expect(marketLine('Asian Handicap 0.5', event, 'Barcelona (+0.5)', 'Football')).toBe(
      'Asian Handicap +',
    );
    expect(marketLine('Set Handicap -1.5', event, 'Botic (+1.5)', 'Tennis')).toBe(
      'Set Handicap +',
    );
    expect(marketLine('Handicap -5.5', event, 'Lakers (-5.5)', 'Basketball')).toBe('Handicap −');
    expect(marketLine('Asian Handicap -0.5', event)).toBe('Asian Handicap −');
  });

  it('merges the names that mean exactly the same bet', () => {
    expect(marketLine('Match bet', event)).toBe('1X2');
    expect(marketLine('1x2', event)).toBe('1X2');
    expect(marketLine('Head To Head: Domen Prevc - Timi Zajc', event)).toBe('Head to head');
    expect(marketLine('Who wins the rest of the match?(0:1)', event)).toBe('Rest of the match');
    expect(marketLine('Draw No Bet', event)).toBe('Draw no bet');
  });

  it('splits a match result into the three bets it actually is', () => {
    expect(marketLine('1x2', event, 'Barcelona')).toBe('Home');
    expect(marketLine('Match bet', event, 'Draw')).toBe('Draw');
    expect(marketLine('Moneyline', event, 'Real Madrid')).toBe('Away');
    // A pick naming no side of this event still has to land somewhere.
    expect(marketLine('1x2', event, 'Yes')).toBe('1X2');
  });

  it('drops the score a handicap was opened at', () => {
    expect(marketLine('Asian Handicap (0:0) -0.5', event, 'Barcelona (-0.5)', 'Football')).toBe(
      'Asian Handicap −',
    );
  });
});
