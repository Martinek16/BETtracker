import { describe, expect, it } from 'vitest';
import { canonicalLeague } from './leagues';

describe('canonicalLeague', () => {
  it('strips the season however the book writes it', () => {
    expect(canonicalLeague('Premier League 2025/2026')).toBe('Premier League');
    expect(canonicalLeague('Premier League 2025/26')).toBe('Premier League');
    expect(canonicalLeague('Premier League 25/26')).toBe('Premier League');
    expect(canonicalLeague('Serie A - 2025/2026')).toBe('Serie A');
    expect(canonicalLeague('Premier League Season 2025')).toBe('Premier League');
  });

  it('keeps a season word that is the tail of the name itself', () => {
    // "NBA Preseason 2026" read as a season word left "NBA Pre", a row of its
    // own that no reader ever bet on.
    expect(canonicalLeague('NBA Preseason 2026')).toBe('NBA Preseason');
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
  });

  it('folds a nightly or daily session back into its competition', () => {
    expect(canonicalLeague('Premier League Darts - Night 5')).toBe('Premier League Darts');
    expect(canonicalLeague('PDC World Championship, Session 3')).toBe('PDC World Championship');
    expect(canonicalLeague('World Matchplay Day 2 2026')).toBe('World Matchplay');
  });

  it('folds a tennis town and its tier back into the tour that played it', () => {
    expect(canonicalLeague('ATP Montreal, Main Draw 2026')).toBe('ATP');
    expect(canonicalLeague('ATP Rome, Italy Men Singles')).toBe('ATP');
    expect(canonicalLeague('WTA Toronto, Main Draw 2026')).toBe('WTA');
    expect(canonicalLeague('WTA Linz 2026')).toBe('WTA');
    // A tier of its own is a row of two bets that says nothing either.
    expect(canonicalLeague('ATP Challenger Bordeaux 2026')).toBe('ATP');
    expect(canonicalLeague('ATP Challenger Oeiras 4 2026')).toBe('ATP');
    expect(canonicalLeague('ITF M15 Brazil Maringa 2026')).toBe('ITF');
    expect(canonicalLeague('ITF W50 Koper')).toBe('ITF');
    expect(canonicalLeague('UTR Women Newport Beach 2026')).toBe('UTR');
  });

  it('leaves a major standing, one row for the fortnight it is', () => {
    expect(canonicalLeague('Wimbledon - Gentlemen 2026')).toBe('Wimbledon');
    expect(canonicalLeague('Wimbledon - Ladies, Doubles')).toBe('Wimbledon');
    expect(canonicalLeague('Wimbledon Women, Qualifications 2026')).toBe('Wimbledon');
    expect(canonicalLeague('US Open Women 2026')).toBe('US Open');
    expect(canonicalLeague('Australian Open Women')).toBe('Australian Open');
    expect(canonicalLeague('French Open Qualifying 2026')).toBe('French Open');
    // The books do not agree on what to call Paris.
    expect(canonicalLeague('Roland Garros 2026')).toBe('French Open');
  });

  it('folds an esports circuit back into the circuit it is', () => {
    expect(canonicalLeague('ESL Pro League Season 23')).toBe('ESL Pro League');
    expect(canonicalLeague('ESL Pro League Season 22: European')).toBe('ESL Pro League');
    expect(canonicalLeague('ESL Challenger League Season 51: North America - Cup 4')).toBe(
      'ESL Challenger League',
    );
    expect(canonicalLeague('IEM Dallas')).toBe('IEM');
    expect(canonicalLeague('Intel Extreme Masters Kraków')).toBe('IEM');
    expect(canonicalLeague('BLAST Premier: Fall Showdown')).toBe('BLAST');
    expect(canonicalLeague('CCT Season 2 European Series 9')).toBe('CCT');
    // No circuit of its own, so only the run it was is dropped.
    expect(canonicalLeague('BBDacha Belgrade Season 2')).toBe('BBDacha Belgrade');
  });

  it('gathers every major into the one thing a major is', () => {
    expect(canonicalLeague('Perfect World Shanghai Major: European RMR B')).toBe('Major');
    expect(canonicalLeague('BLAST.tv Austin Major Stage 3')).toBe('Major');
    expect(canonicalLeague('IEM Cologne Major: Stage 3')).toBe('Major');
    expect(canonicalLeague('StarLadder Budapest Major')).toBe('Major');
    // A league that merely carries the word is a league.
    expect(canonicalLeague('Major League Soccer 2026')).toBe('Major League Soccer');
  });

  it('reads a friendly as one competition however the book words it', () => {
    expect(canonicalLeague('Friendly International Matches')).toBe('International Friendlies');
    expect(canonicalLeague('International Friendlies')).toBe('International Friendlies');
    expect(canonicalLeague('Friendly Club Matches')).toBe('Club Friendlies');
    expect(canonicalLeague('Club Friendlies')).toBe('Club Friendlies');
    expect(canonicalLeague('Friendly Club Matches 2026 (Possible Format Change)')).toBe(
      'Club Friendlies',
    );
    // The women's is not the men's bet.
    expect(canonicalLeague('Club Friendlies Women')).toBe('Club Friendlies Women');
  });

  it('drops the organiser both books do not print', () => {
    expect(canonicalLeague('FIFA World Cup Qualification - AFC')).toBe(
      'World Cup Qualification - AFC',
    );
    expect(canonicalLeague('World Cup Qualification - AFC')).toBe('World Cup Qualification - AFC');
    // A season the book printed mid-name, in front of the confederation.
    expect(canonicalLeague('FIFA World Cup Qualification 2025 - CONMEBOL')).toBe(
      'World Cup Qualification - CONMEBOL',
    );
  });

  it('folds the clock a virtual match is played to back into its competition', () => {
    expect(canonicalLeague('Esoccer Battle (12 minutes play)')).toBe('Esoccer Battle');
    expect(canonicalLeague('ESoccer Battle (8 minutes play)')).toBe('ESoccer Battle');
    expect(canonicalLeague('ESPORT PRO CLUB (2x5 min)')).toBe('ESPORT PRO CLUB');
  });

  it('folds the numbered leg of a circuit back into the circuit', () => {
    expect(canonicalLeague('PDC Players Championship Event 12')).toBe('PDC Players Championship');
    expect(canonicalLeague('World Championship, Main Round Group IV')).toBe('World Championship');
    expect(canonicalLeague('LEC 2024 Season')).toBe('LEC');
    expect(canonicalLeague('Modus Super Series, Pairs')).toBe('Modus Super Series');
  });

  it('folds a winter weekend back into the circuit it was skied on', () => {
    expect(canonicalLeague('FIS-SKI World Cup Lillehammer HS140 Men Event 1 2024')).toBe(
      'FIS World Cup',
    );
    expect(canonicalLeague('FIS World Cup Women 2024/2025')).toBe('FIS World Cup');
    expect(canonicalLeague('FISSURE Playground')).toBe('FISSURE');
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
