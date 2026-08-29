import { describe, expect, it } from 'vitest';
import type { Bet, BetLeg } from '@betanal/shared';
import { pickLabel, slipLabel } from './bet-display';

const leg = (event: string): BetLeg =>
  ({ event, eventId: event, odds: 1.5, status: 'won' }) as unknown as BetLeg;

const slip = (events: string[]): Bet => ({ betId: 'b1', legs: events.map(leg) }) as unknown as Bet;

describe('slipLabel', () => {
  it('names a short combo by its size', () => {
    expect(slipLabel(slip(['A - B', 'C - D']))).toBe('Double');
    expect(slipLabel(slip(['A - B', 'C - D', 'E - F']))).toBe('Triple');
  });

  it('leaves a long combo and a one-fixture slip as they were', () => {
    expect(slipLabel(slip(['A - B', 'C - D', 'E - F', 'G - H', 'I - J']))).toBe('Combo');
    expect(slipLabel(slip(['A - B']))).toBe('Single');
    // Every pick on one fixture is a builder however many there are.
    expect(slipLabel(slip(['A - B', 'A - B']))).toBe('Bet Builder');
  });
});

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
