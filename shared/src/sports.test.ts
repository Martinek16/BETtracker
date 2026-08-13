import { describe, expect, it } from 'vitest';
import { canonicalSport, isEsport } from './sports';

describe('canonicalSport', () => {
  it('folds soccer and football into one European name', () => {
    expect(canonicalSport('Soccer', 'stake')).toBe('Football');
    expect(canonicalSport('Football', 'bet-at-home')).toBe('Football');
  });

  it('reads football as the American game only at a book that says soccer', () => {
    expect(canonicalSport('Football', 'stake')).toBe('American Football');
    expect(canonicalSport('Football')).toBe('Football');
  });

  it('keeps a name it was never told about', () => {
    expect(canonicalSport('Padel')).toBe('Padel');
    expect(canonicalSport(null)).toBeNull();
    expect(canonicalSport('  ')).toBeNull();
  });

  it('lands a game title on one name whether or not the book marks it', () => {
    expect(canonicalSport('e: CS2', 'bet-at-home')).toBe('CS2');
    expect(canonicalSport('CS2', 'stake')).toBe('CS2');
    expect(canonicalSport('e: LoL')).toBe('League of Legends');
    expect(canonicalSport('League of Legends')).toBe('League of Legends');
    expect(canonicalSport('e: Valorant')).toBe('Valorant');
  });

  it('keeps a simulated match apart from the sport it imitates', () => {
    expect(canonicalSport('e-Soccer')).toBe('e-Football');
    expect(canonicalSport('e-Basket')).toBe('e-Basketball');
    expect(canonicalSport('e-Hockey')).toBe('e-Ice Hockey');
    expect(canonicalSport('Soccer', 'stake')).toBe('Football');
  });

  it('does not read a sport that merely starts with an e as an esport', () => {
    expect(canonicalSport('Equestrian')).toBe('Equestrian');
    expect(isEsport('Equestrian')).toBe(false);
    expect(isEsport('e-Soccer')).toBe(true);
    expect(isEsport('CS2')).toBe(true);
  });
});
