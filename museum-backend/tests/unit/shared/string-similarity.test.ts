import {
  jaroWinklerSimilarity,
  museumNamesAreSimilar,
  normalizeMuseumName,
} from '@shared/utils/string-similarity';

describe('normalizeMuseumName', () => {
  it("strips diacritics and the 'musee' stop token", () => {
    expect(normalizeMuseumName("Musée d'Art Contemporain")).toBe('art contemporain');
  });

  it('leaves a short all-alphanum name intact (lowercased)', () => {
    expect(normalizeMuseumName('CAPC')).toBe('capc');
  });

  it('strips French articles', () => {
    expect(normalizeMuseumName('Le Louvre')).toBe('louvre');
  });

  it('falls back to the simple form when every token is a stop word', () => {
    // "Musée" alone → normalized tokens = [], stripped = "", length < 2
    // Fallback returns lowered form stripped of non-alphanum: "musee"
    expect(normalizeMuseumName('Musée')).toBe('musee');
  });

  it('falls back for a standalone French article', () => {
    // "Le" alone → every token is a stop word; fallback yields "le"
    expect(normalizeMuseumName('Le')).toBe('le');
  });

  it('collapses multiple whitespace / punctuation', () => {
    expect(normalizeMuseumName("  Musée   d'Orsay ")).toBe('orsay');
  });
});

describe('jaroWinklerSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(jaroWinklerSimilarity('louvre', 'louvre')).toBe(1);
  });

  it('returns 0 when either side is empty', () => {
    expect(jaroWinklerSimilarity('', 'louvre')).toBe(0);
    expect(jaroWinklerSimilarity('louvre', '')).toBe(0);
  });

  it('is bounded in [0, 1] for arbitrary inputs', () => {
    const v = jaroWinklerSimilarity('DWAYNE', 'DUANE');
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });

  it('matches the canonical Jaro-Winkler value for MARTHA/MARHTA (~0.96)', () => {
    const v = jaroWinklerSimilarity('MARTHA', 'MARHTA');
    expect(v).toBeGreaterThan(0.95);
    expect(v).toBeLessThan(0.97);
  });

  it('matches the canonical Jaro-Winkler value for DWAYNE/DUANE (~0.84)', () => {
    const v = jaroWinklerSimilarity('DWAYNE', 'DUANE');
    expect(v).toBeGreaterThan(0.83);
    expect(v).toBeLessThan(0.85);
  });
});

describe('museumNamesAreSimilar', () => {
  it('matches CAPC short form against its long form (substring fallback)', () => {
    expect(museumNamesAreSimilar('CAPC', "CAPC musée d'art contemporain")).toBe(true);
  });

  it("matches 'Louvre' vs 'Musée du Louvre' after stop-word stripping", () => {
    expect(museumNamesAreSimilar('Louvre', 'Musée du Louvre')).toBe(true);
  });

  it('matches minor diacritic / casing variants', () => {
    expect(museumNamesAreSimilar("Musée d'Orsay", "musee d'orsay")).toBe(true);
  });

  it('rejects clearly unrelated names', () => {
    expect(museumNamesAreSimilar('Louvre', 'Orsay')).toBe(false);
  });

  it('rejects when one side is blank', () => {
    expect(museumNamesAreSimilar('', 'Louvre')).toBe(false);
  });
});
