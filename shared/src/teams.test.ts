import { describe, expect, it } from 'vitest';
import { teamPicked } from './teams';

describe('teamPicked', () => {
  it('reads the side straight off the event', () => {
    expect(teamPicked('Everton - Manchester City', 'Manchester City')).toBe('Manchester City');
    expect(teamPicked('Aston Villa - Southampton FC', 'Southampton FC')).toBe('Southampton');
  });

  it('still reads the side out of a compound or lined pick', () => {
    expect(teamPicked('Real Betis Seville - FC Barcelona', 'Draw or FC Barcelona')).toBe(
      'Barcelona',
    );
    expect(teamPicked('Everton - Arsenal', 'Arsenal +1.5')).toBe('Arsenal');
  });

  it('returns null for a pick that names no side', () => {
    expect(teamPicked('Everton - Manchester City', 'Under 2.5')).toBeNull();
    expect(teamPicked('Everton - Manchester City', 'Draw')).toBeNull();
    expect(teamPicked('Everton - Manchester City', 'Yes')).toBeNull();
    expect(teamPicked(null, 'Everton')).toBeNull();
    expect(teamPicked('Tour de France', 'Pogacar')).toBeNull();
  });
});
