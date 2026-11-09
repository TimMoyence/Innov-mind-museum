import {
  DEFAULT_NAME_SIMILARITY_THRESHOLD,
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
    expect(normalizeMuseumName('Musée')).toBe('musee');
  });

  it('falls back for a standalone French article', () => {
    expect(normalizeMuseumName('Le')).toBe('le');
  });

  it('collapses multiple whitespace / punctuation', () => {
    expect(normalizeMuseumName("  Musée   d'Orsay ")).toBe('orsay');
  });

  describe('drops every individual French stop token', () => {
    it.each([
      ['musee', 'musee Louvre', 'louvre'],
      ['museum', 'museum Louvre', 'louvre'],
      ['le', 'Le Louvre', 'louvre'],
      ['la', 'La Louvre', 'louvre'],
      ['les', 'Les Louvre', 'louvre'],
      ['l', "l'Louvre", 'louvre'],
      ['du', 'du Louvre', 'louvre'],
      ['de', 'de Louvre', 'louvre'],
      ['des', 'des Louvre', 'louvre'],
      ['d', "d'Louvre", 'louvre'],
      ['a', 'a Louvre', 'louvre'],
      ['au', 'au Louvre', 'louvre'],
      ['aux', 'aux Louvre', 'louvre'],
    ])('strips %s combined with a meaningful word', (_token, raw, expected) => {
      expect(normalizeMuseumName(raw)).toBe(expected);
    });
  });

  describe('falls back to the lowered+stripped form when only stop tokens remain', () => {
    it.each([
      ['musee', 'musee'],
      ['museum', 'museum'],
      ['le', 'le'],
      ['la', 'la'],
      ['les', 'les'],
      ['l', 'l'],
      ['du', 'du'],
      ['de', 'de'],
      ['des', 'des'],
      ['d', 'd'],
      ['a', 'a'],
      ['au', 'au'],
      ['aux', 'aux'],
    ])('normalizes "%s" alone to %s via fallback', (raw, expected) => {
      expect(normalizeMuseumName(raw)).toBe(expected);
    });
  });

  it('fallback replaces non-alphanumeric runs with single SPACE (not empty)', () => {
    expect(normalizeMuseumName('L.A')).toBe('l a');
    expect(normalizeMuseumName('A B')).toBe('a b');
  });

  it('uses strict "< 2" threshold for fallback (not "<= 2")', () => {
    expect(normalizeMuseumName('Le AB')).toBe('ab');
    expect(normalizeMuseumName('AB de')).toBe('ab');
  });

  it('keeps multi-char alphanum sequences after tokenization (token-length filter must be > 0)', () => {
    expect(normalizeMuseumName(' Musée ')).toBe('musee');
    expect(normalizeMuseumName('!Musée!')).toBe('musee');
  });

  it('lowercases ASCII inputs (no diacritic) and strips stop words', () => {
    expect(normalizeMuseumName('MUSEUM OF MODERN ART')).toBe('of modern art');
  });

  it('preserves digits as part of tokens', () => {
    expect(normalizeMuseumName('Galerie 2025')).toBe('galerie 2025');
  });

  it('treats different diacritic forms equivalently after NFD normalization', () => {
    expect(normalizeMuseumName('Musée')).toBe(normalizeMuseumName('Musee'));
    expect(normalizeMuseumName("d'Orsay")).toBe(normalizeMuseumName('d Orsay'));
  });

  it('returns single-char fallback (length 1, not "" empty)', () => {
    expect(normalizeMuseumName('L.')).toBe('l');
    expect(normalizeMuseumName('L')).toBe('l');
  });
});

describe('DEFAULT_NAME_SIMILARITY_THRESHOLD', () => {
  it('is exactly 0.85', () => {
    expect(DEFAULT_NAME_SIMILARITY_THRESHOLD).toBe(0.85);
  });
});

describe('jaroWinklerSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(jaroWinklerSimilarity('louvre', 'louvre')).toBe(1);
  });

  it('returns 1 for identical EMPTY strings (a === b short-circuit)', () => {
    expect(jaroWinklerSimilarity('', '')).toBe(1);
  });

  it('returns 0 when either side is empty (line 133/156 length guard)', () => {
    expect(jaroWinklerSimilarity('', 'louvre')).toBe(0);
    expect(jaroWinklerSimilarity('louvre', '')).toBe(0);
    expect(jaroWinklerSimilarity('', 'x')).toBe(0);
    expect(jaroWinklerSimilarity('x', '')).toBe(0);
  });

  it('is bounded in [0, 1] for arbitrary inputs', () => {
    const v = jaroWinklerSimilarity('DWAYNE', 'DUANE');
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });

  describe('canonical Jaro-Winkler values (table)', () => {
    const cases: ReadonlyArray<readonly [string, string, number]> = [
      ['MARTHA', 'MARHTA', 0.9611111111111111],
      ['DWAYNE', 'DUANE', 0.8400000000000001],
      ['TRATE', 'TRACE', 0.9066666666666667],
      ['a', 'a', 1],
      ['a', 'b', 0],
      ['ab', 'ba', 0],
      ['xy', 'yx', 0],
      ['a', 'ab', 0.8500000000000001],
      ['ab', 'a', 0.8500000000000001],
      ['x', 'xy', 0.8500000000000001],
      ['abc', 'def', 0],
      ['ab', 'cd', 0],
      ['aaaa', 'bbbb', 0],
      ['abcd', 'wxyz', 0],
      ['abcdefgh', 'ijklmnop', 0],
      ['abcd', 'abce', 0.8833333333333334],
      ['abcdef', 'abcdfe', 0.9666666666666667],
      ['abcdefgh', 'abcdfegh', 0.975],
      ['abcdef', 'bacdef', 0.9444444444444445],
      ['abcdef', 'abc', 0.8833333333333334],
      ['ab', 'abcdef', 0.8222222222222222],
      ['xyzab', 'abxyz', 0],
      ['abcde', 'edcba', 0.4666666666666666],
      ['aab', 'aba', 0.5999999999999999],
      ['a', 'aaaa', 0.775],
    ];

    it.each(cases)('JW(%j, %j) is approximately %f', (a, b, expected) => {
      expect(jaroWinklerSimilarity(a, b)).toBeCloseTo(expected, 10);
    });
  });

  it('Math.max(0, ...) start clamp affects matching when i > matchWindow', () => {
    expect(jaroWinklerSimilarity('aaab', 'baaa')).toBeCloseTo(0.8333333333333334, 10);
  });

  it('Math.min(end, b.length) end clamp prevents over-reaching the matching window', () => {
    expect(jaroWinklerSimilarity('xy', 'yx')).toBe(0);
    expect(jaroWinklerSimilarity('ab', 'ba')).toBe(0);
  });

  it('matchWindow = floor(max/2) - 1 (not + 1) affects 6+ char strings', () => {
    expect(jaroWinklerSimilarity('xyzabc', 'abcxyz')).toBe(0);
    expect(jaroWinklerSimilarity('abcdefgh', 'efghabcd')).toBe(0);
  });

  it('matchWindow uses Math.max(|a|,|b|) not Math.min', () => {
    expect(jaroWinklerSimilarity('LongMuseumName', 'Lng')).toBeCloseTo(0.7642857142857143, 10);
  });

  it('prefixLen capped at exactly 4 (Math.min outer, not Math.max)', () => {
    expect(jaroWinklerSimilarity('abcdefg', 'abcdefz')).toBeCloseTo(0.9428571428571428, 10);
  });

  it('prefix loop iterates "i < prefixLen" (not "<= prefixLen")', () => {
    expect(jaroWinklerSimilarity('abcdef', 'abcdex')).toBeCloseTo(0.9333333333333333, 10);
  });

  it('transposition count is preserved (not zeroed) across window-based matches', () => {
    expect(jaroWinklerSimilarity('aab', 'aba')).toBeCloseTo(0.5999999999999999, 10);
  });

  it('handles long rotation differently from full-reverse', () => {
    expect(jaroWinklerSimilarity('abcdefghij', 'jabcdefghi')).toBeCloseTo(0.9333333333333332, 10);
  });

  it('handles asymmetric padding ("a" vs "aaaa")', () => {
    expect(jaroWinklerSimilarity('a', 'aaaa')).toBeCloseTo(0.775, 10);
  });

  it('asymmetric: long prefix in long string vs short string', () => {
    expect(jaroWinklerSimilarity('abxxxxxxab', 'ab')).toBeCloseTo(0.7866666666666666, 10);
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

  it('matches identical raw names (a === b after normalization)', () => {
    expect(museumNamesAreSimilar('Louvre', 'Louvre')).toBe(true);
  });

  it('rejects clearly unrelated names', () => {
    expect(museumNamesAreSimilar('Louvre', 'Orsay')).toBe(false);
  });

  it('rejects when one side is blank', () => {
    expect(museumNamesAreSimilar('', 'Louvre')).toBe(false);
    expect(museumNamesAreSimilar('Louvre', '')).toBe(false);
  });

  it('rejects when both sides are blank (normalized length 0 check fires)', () => {
    expect(museumNamesAreSimilar('', '')).toBe(false);
  });

  it('rejects when normalization reduces one side to empty even if raw was non-empty', () => {
    expect(museumNamesAreSimilar('...', 'Louvre')).toBe(false);
  });

  it('uses default threshold 0.85 (DEFAULT_NAME_SIMILARITY_THRESHOLD)', () => {
    expect(museumNamesAreSimilar('abcd', 'abef')).toBe(false);
  });

  it('honors a custom (lower) threshold', () => {
    expect(museumNamesAreSimilar('abcd', 'abef', 0.7)).toBe(true);
  });

  it('uses >= comparison (not >) at threshold boundary', () => {
    const threshold = 0.8833333333333334;
    expect(jaroWinklerSimilarity('abcd', 'abce')).toBe(threshold);
    expect(museumNamesAreSimilar('abcd', 'abce', threshold)).toBe(true);
  });

  it('rejects when JW is strictly below a high threshold and no substring match', () => {
    expect(museumNamesAreSimilar('abcd', 'abef', 0.85)).toBe(false);
  });

  it('substring fallback fires before JW (short form contained in long form)', () => {
    expect(museumNamesAreSimilar('art', 'art contemporain', 0.99)).toBe(true);
    expect(museumNamesAreSimilar('art contemporain', 'art', 0.99)).toBe(true);
  });
});
