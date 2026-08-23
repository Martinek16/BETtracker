import { describe, expect, it } from 'vitest';
import { canonicalCountry, countryCodeOf } from './countries';

describe('countryCodeOf', () => {
  it('reads the browser region table, however the name is spelled', () => {
    expect(countryCodeOf('Italy')).toBe('it');
    expect(countryCodeOf('United States')).toBe('us');
    expect(countryCodeOf('Bosnia and Herzegovina')).toBe('ba');
  });

  it('flies a home nation its own flag, which has no country code', () => {
    expect(countryCodeOf('England')).toBe('gb-eng');
    expect(countryCodeOf('Scotland')).toBe('gb-sct');
  });

  it('answers to the name the bookmakers still use', () => {
    // The region table has moved on to Türkiye and Czechia.
    expect(countryCodeOf('Turkey')).toBe('tr');
    expect(countryCodeOf('Czech Republic')).toBe('cz');
  });

  it('gives the code a flag is drawn for, not the one a country was renamed from', () => {
    // The region table names FR and FX both "France", CS/YU and RS all "Serbia";
    // taking the last of them left rows asking for a flag that does not exist.
    expect(countryCodeOf('France')).toBe('fr');
    expect(countryCodeOf('United Kingdom')).toBe('gb');
    expect(countryCodeOf('Serbia')).toBe('rs');
    expect(countryCodeOf('Russia')).toBe('ru');
  });

  it('has no flag for a group that is no place', () => {
    expect(countryCodeOf('World')).toBeNull();
    expect(countryCodeOf('International')).toBeNull();
    expect(countryCodeOf('Esports')).toBeNull();
  });
});

describe('canonicalCountry', () => {
  it('settles the two books on one name, so a shared row holds one place', () => {
    // The NBA: "USA" at one book, "United States" at the other.
    expect(canonicalCountry('USA', 'NBA')).toBe('United States');
    expect(canonicalCountry('United States', 'NBA 2026')).toBe('United States');
  });

  it('places a European competition its book left homeless', () => {
    expect(canonicalCountry('International', 'UEFA Champions League 2025/2026')).toBe('Europe');
    expect(canonicalCountry('Europe', 'Champions League')).toBe('Europe');
    expect(canonicalCountry('World', 'EuroLeague')).toBe('Europe');
  });

  it('leaves a competition that is really the world where it is', () => {
    expect(canonicalCountry('World', 'FIVB Nations League Women 2026')).toBe('International');
    expect(canonicalCountry('International', 'BLAST Premier')).toBe('International');
  });

  it('places a European competition the book left with no country at all', () => {
    expect(canonicalCountry(null, 'Euro')).toBe('Europe');
    expect(canonicalCountry(null, 'UEFA Euro 2028 Qualification')).toBe('Europe');
  });

  it('places a competition that is played in the same place every year', () => {
    // Neither book files a country for these, and one files a major as belonging
    // to nobody - a fortnight in Melbourne is not nobody's.
    expect(canonicalCountry(null, 'Australian Open Women')).toBe('Australia');
    expect(canonicalCountry('International', 'Wimbledon - Gentlemen 2026')).toBe('United Kingdom');
    expect(canonicalCountry(null, 'Roland Garros 2026')).toBe('France');
    expect(canonicalCountry(null, 'US Open 2026')).toBe('United States');
    expect(canonicalCountry(null, 'Exhibition Six Kings Slam')).toBe('Saudi Arabia');
    expect(canonicalCountry(null, 'UTR Women Denver')).toBe('United States');
  });

  it('places a national league its book files as belonging to nobody', () => {
    expect(canonicalCountry('International', 'KBO')).toBe('South Korea');
    expect(canonicalCountry('International', 'WKBL')).toBe('South Korea');
    expect(canonicalCountry(null, 'Setka Cup')).toBe('Ukraine');
    expect(canonicalCountry('International', 'PDC World Championship')).toBe('United Kingdom');
    expect(canonicalCountry('International', 'Modus Super Series')).toBe('United Kingdom');
  });

  it('says nothing where nothing places it', () => {
    expect(canonicalCountry(null, 'NBA')).toBeNull();
    expect(canonicalCountry('  ', 'NBA')).toBeNull();
  });
});
