import { describe, expect, it } from 'vitest';
import { pickLabel } from './bet-display';

describe('pickLabel', () => {
  it('names what a priced line is counted in', () => {
    expect(pickLabel('Napoli to score Over/Under 0.5', 'Napoli Over 0.5')).toBe(
      'Napoli score Over 0.5',
    );
    expect(pickLabel('Total Corners Over/Under 9.5', 'Over 9.5')).toBe('Corners Over 9.5');
    expect(pickLabel('Player Shots On Target Over/Under 2.5', 'Ferran Torres Over 2.5')).toBe(
      'Ferran Torres Shots On Target Over 2.5',
    );
  });

  it('adds nothing the selection already says', () => {
    expect(pickLabel('Matchbet And Over/Under 1.5', 'Bayern Munich and Over 1.5')).toBe(
      'Bayern Munich and Over 1.5',
    );
    expect(pickLabel('Over/Under 2.5', 'Over 2.5')).toBe('Over 2.5');
  });

  it('leaves markets that are not a line alone', () => {
    expect(pickLabel('Both Teams To Score', 'Yes')).toBe('Yes');
    expect(pickLabel('1X2', 'Genoa')).toBe('Genoa');
    expect(pickLabel('Correct Score', null)).toBe('Correct Score');
  });
});
