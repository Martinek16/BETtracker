import { describe, expect, it } from 'vitest';
import { marketFamily, marketLine, OTHER_MARKETS } from './markets';

describe('marketFamily', () => {
  it('reads the subject before the shape of the bet', () => {
    expect(marketFamily('Corners Over/Under 9.5')).toBe('Corners');
    expect(marketFamily('Total Cards Over 3.5')).toBe('Bookings');
    expect(marketFamily('Over/Under 2.5')).toBe('Goals');
  });

  it('splits the sport-specific subjects out of the goal lines', () => {
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
    expect(marketFamily('Clean Sheet')).toBe('Scores');
    expect(marketFamily('Wolves To Score In Both Halves')).toBe('Scores');
    expect(marketFamily('Team To Score Goal 1')).toBe('Scores');
    expect(marketFamily('Goal In Both Halves')).toBe('Scores');
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
    expect(marketLine('Team To Score Goal 4', event, 'Goal 4: Barcelona')).toBe(
      'Team To Score Goal 4',
    );
    expect(marketLine(null, event)).toBe('Unknown');
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
    ).toBe('To score Over');
    expect(
      marketLine(
        'Seattle Storm (W) to score Over/Under 79.5',
        game,
        'Seattle Storm (W) Under 79.5',
        'Basketball',
      ),
    ).toBe('To score Under');
  });

  it('keeps the football match total at its number, where the set is small', () => {
    expect(marketLine('Over/Under 2.5', event, 'Under 2.5', 'Football')).toBe('Total Under 2.5');
    expect(marketLine('Over/Under 3.5', event, 'Over 3.5', 'Football')).toBe('Total Over 3.5');
  });

  it('reads a handicap from the side that was backed, not the line quoted', () => {
    expect(marketLine('Asian Handicap 0.5', event, 'Barcelona (+0.5)', 'Football')).toBe(
      'Asian Handicap +0.5',
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
      'Asian Handicap -0.5',
    );
  });
});
