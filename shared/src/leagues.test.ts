import { describe, expect, it } from 'vitest';
import { canonicalLeague } from './leagues';

describe('canonicalLeague', () => {
  it('strips the season however the book writes it', () => {
    expect(canonicalLeague('Premier League 2025/2026')).toBe('Premier League');
    expect(canonicalLeague('Premier League 2025/26')).toBe('Premier League');
    expect(canonicalLeague('Premier League 25/26')).toBe('Premier League');
    expect(canonicalLeague('Serie A - 2025/2026')).toBe('Serie A');
  });

  it('lands the two books on the same name', () => {
    expect(canonicalLeague('Premier League 2025/2026')).toBe(canonicalLeague('Premier League'));
  });

  it('leaves a league that is only a year alone', () => {
    expect(canonicalLeague('2026')).toBe('2026');
  });

  it('keeps a year that is part of the name', () => {
    expect(canonicalLeague('Serie A')).toBe('Serie A');
    expect(canonicalLeague('  Ligue  1 ')).toBe('Ligue 1');
    expect(canonicalLeague(null)).toBeNull();
    expect(canonicalLeague('  ')).toBeNull();
  });

  it('lands the European competitions on the name both books share', () => {
    expect(canonicalLeague('UEFA Champions League')).toBe('Champions League');
    expect(canonicalLeague('UEFA Europa League Qualification 2026')).toBe('Europa League');
    // Another continent's is its own competition and says so.
    expect(canonicalLeague('AFC Champions League')).toBe('AFC Champions League');
  });

  it('folds the stages of a competition back into the competition', () => {
    const cl = 'Champions League';
    expect(canonicalLeague('UEFA Champions League Group A')).toBe(cl);
    expect(canonicalLeague('UEFA Champions League, Group C')).toBe(cl);
    expect(canonicalLeague('UEFA Champions League - League Phase 2025/2026')).toBe(cl);
    expect(canonicalLeague('UEFA Champions League Round of 16')).toBe(cl);
    expect(canonicalLeague('UEFA Champions League Semi-finals')).toBe(cl);
    expect(canonicalLeague('UEFA Champions League Final')).toBe(cl);
    expect(canonicalLeague('UEFA Champions League Qualification 2025/26')).toBe(cl);
    expect(canonicalLeague('Eredivisie Play-offs')).toBe('Eredivisie');
    expect(canonicalLeague('WNBA Including Playoffs 2026')).toBe('WNBA');
    expect(canonicalLeague('French Open Qualifying 2026')).toBe('French Open');
  });

  it('folds a nightly or daily session back into its competition', () => {
    expect(canonicalLeague('Premier League Darts - Night 5')).toBe('Premier League Darts');
    expect(canonicalLeague('PDC World Championship, Session 3')).toBe('PDC World Championship');
    expect(canonicalLeague('World Matchplay Day 2 2026')).toBe('World Matchplay');
  });

  it('folds a tennis town back into the tour that played it', () => {
    expect(canonicalLeague('ATP Montreal, Main Draw 2026')).toBe('ATP');
    expect(canonicalLeague('ATP Rome, Italy Men Singles')).toBe('ATP');
    expect(canonicalLeague('WTA Toronto, Main Draw 2026')).toBe('WTA');
    expect(canonicalLeague('WTA Linz 2026')).toBe('WTA');
    // The tier is the level the match was played at, so it stays.
    expect(canonicalLeague('ATP Challenger Bordeaux 2026')).toBe('ATP Challenger');
    expect(canonicalLeague('ATP Challenger Oeiras 4 2026')).toBe('ATP Challenger');
    expect(canonicalLeague('ITF M15 Brazil Maringa 2026')).toBe('ITF M15');
    expect(canonicalLeague('ITF W50 Koper')).toBe('ITF W50');
  });

  it('leaves a name that only starts with a tour word alone', () => {
    expect(canonicalLeague('Atalanta Cup')).toBe('Atalanta Cup');
  });

  it('keeps a competition whose own name follows a comma', () => {
    expect(canonicalLeague('NCAA, Women')).toBe('NCAA, Women');
    expect(canonicalLeague('First Division, Women')).toBe('First Division, Women');
  });

  it('leaves a name that is only a stage, or merely contains a stage word', () => {
    expect(canonicalLeague('Round of 16')).toBe('Round of 16');
    expect(canonicalLeague('Champions League')).toBe('Champions League');
    expect(canonicalLeague('Premier League 2')).toBe('Premier League 2');
    expect(canonicalLeague('FIVB Nations League Women')).toBe('FIVB Nations League Women');
    expect(canonicalLeague('NBL1 North')).toBe('NBL1 North');
  });
});
