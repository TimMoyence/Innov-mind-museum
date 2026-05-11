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

  // --- Stop-token table: each stop literal must be stripped when combined with
  //     a real word, otherwise mutating that literal to "" would survive.
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

  // --- Fallback table: a string consisting of ONLY a single stop token yields
  //     stripped='', triggering the fallback. The fallback must preserve the
  //     lowercased+diacritic-stripped token verbatim, otherwise the empty-set
  //     ArrayDeclaration mutant (or the StringLiteral '' mutant on line 67)
  //     would survive.
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
    // Two single-char stop tokens separated by punctuation → stripped is empty,
    // fallback path is taken. Fallback uses ' ' as the replacement so output
    // must contain a space — kills the StringLiteral "" mutation on line 67.
    expect(normalizeMuseumName('L.A')).toBe('l a');
    expect(normalizeMuseumName('A B')).toBe('a b');
  });

  it('uses strict "< 2" threshold for fallback (not "<= 2")', () => {
    // "Le AB" → tokens = ['ab'], stripped = 'ab' of length EXACTLY 2.
    // Original (< 2): returns the stripped form 'ab'.
    // Mutant (<= 2): would take the fallback path → 'le ab'.
    expect(normalizeMuseumName('Le AB')).toBe('ab');
    expect(normalizeMuseumName('AB de')).toBe('ab');
  });

  it('keeps multi-char alphanum sequences after tokenization (token-length filter must be > 0)', () => {
    // ' Musée ' has leading/trailing spaces; split produces empty tokens at the
    // boundaries. The "> 0" filter drops those — if mutated to ">= 0" the join
    // would still trim to the same result here, but the deliberate non-empty
    // meaningful token must survive the filter regardless.
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
    // "L." → tokens = [], fallback = lowered 'l.' → 'l '.trim() = 'l'.
    // Confirms fallback is reached AND output is not empty.
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
    // The a === b guard runs BEFORE the length-0 guard, so two empty strings
    // return 1. Kills LogicalOperator || → && on line 156 (would still be 0 for
    // empties because a === b fires first, but the order itself matters for
    // the bounds of subsequent code).
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

  // --- Exact canonical values. Mutations on arithmetic / array allocation /
  //     window / prefix / equality / loop bounds change the score, so toBeCloseTo
  //     at high precision detects them.
  describe('canonical Jaro-Winkler values (table)', () => {
    const cases: ReadonlyArray<readonly [string, string, number]> = [
      // Wikipedia canonical
      ['MARTHA', 'MARHTA', 0.9611111111111111],
      ['DWAYNE', 'DUANE', 0.8400000000000001],
      ['TRATE', 'TRACE', 0.9066666666666667],
      // Length-1 vs length-1 identical / different
      ['a', 'a', 1],
      ['a', 'b', 0],
      // Length-2 transposition (window=0 → zero matches)
      ['ab', 'ba', 0],
      ['xy', 'yx', 0],
      // Length-2 vs length-1 prefix match (substring would also hit, but JW is also defined)
      ['a', 'ab', 0.8500000000000001],
      ['ab', 'a', 0.8500000000000001],
      ['x', 'xy', 0.8500000000000001],
      // No common chars at all
      ['abc', 'def', 0],
      ['ab', 'cd', 0],
      ['aaaa', 'bbbb', 0],
      ['abcd', 'wxyz', 0],
      ['abcdefgh', 'ijklmnop', 0],
      // Single substitution end
      ['abcd', 'abce', 0.8833333333333334],
      // Last-pair transposition
      ['abcdef', 'abcdfe', 0.9666666666666667],
      // Inner transposition, 8 chars
      ['abcdefgh', 'abcdfegh', 0.975],
      // First-pair transposition: prefix bonus zero, jaro stays
      ['abcdef', 'bacdef', 0.9444444444444445],
      // Length-mismatch with common prefix (long vs short)
      ['abcdef', 'abc', 0.8833333333333334],
      ['ab', 'abcdef', 0.8222222222222222],
      // Rotation that breaks all window matches
      ['xyzab', 'abxyz', 0],
      // Reversed
      ['abcde', 'edcba', 0.4666666666666666],
      // Triple with transposition
      ['aab', 'aba', 0.5999999999999999],
      // 1 vs all-same long
      ['a', 'aaaa', 0.775],
    ];

    it.each(cases)('JW(%j, %j) is approximately %f', (a, b, expected) => {
      expect(jaroWinklerSimilarity(a, b)).toBeCloseTo(expected, 10);
    });
  });

  // --- Specific mutation-targeting cases. These were chosen because the
  //     canonical orig value and the corresponding mutant value differ enough
  //     to be detected by toBeCloseTo at precision 10.

  it('Math.max(0, ...) start clamp affects matching when i > matchWindow', () => {
    // 'aaab' vs 'baaa': window=1. Orig start = max(0, i-1) keeps left bound
    // anchored. Mutating to Math.min(0, ...) would allow earlier b chars to
    // match, yielding J≈0.917 instead of 0.667.
    expect(jaroWinklerSimilarity('aaab', 'baaa')).toBeCloseTo(0.8333333333333334, 10);
  });

  it('Math.min(end, b.length) end clamp prevents over-reaching the matching window', () => {
    // 'xy' vs 'yx': window=0. Orig end = min(i+1, 2). Mutating to Math.max
    // would set end = max(i+1, 2) = 2 for both i=0 and i=1, expanding search.
    // Orig matches=0 → 0. Mutant matches=2 → 0.6666...
    expect(jaroWinklerSimilarity('xy', 'yx')).toBe(0);
    expect(jaroWinklerSimilarity('ab', 'ba')).toBe(0);
  });

  it('matchWindow = floor(max/2) - 1 (not + 1) affects 6+ char strings', () => {
    // 'xyzabc' vs 'abcxyz': window=2. Orig J=0 because no char of 'a' is
    // within 2 positions of its counterpart in 'b'. Mutating - 1 → + 1 makes
    // window=4, finds matches → J > 0.
    expect(jaroWinklerSimilarity('xyzabc', 'abcxyz')).toBe(0);
    expect(jaroWinklerSimilarity('abcdefgh', 'efghabcd')).toBe(0);
  });

  it('matchWindow uses Math.max(|a|,|b|) not Math.min', () => {
    // 14 chars vs 3 chars. max-based window=6, min-based window=0.
    // Orig (max): finds 3 matches → J ≈ 0.738. Mutant (min): finds 1 match → much lower.
    expect(jaroWinklerSimilarity('LongMuseumName', 'Lng')).toBeCloseTo(0.7642857142857143, 10);
  });

  it('prefixLen capped at exactly 4 (Math.min outer, not Math.max)', () => {
    // 7-char strings sharing 6-char prefix. Orig prefixLen=4 → commonPrefix=4.
    // Mutant outer Math.max(4, 7)=7 → commonPrefix=6. JW differs (0.9428 vs
    // 0.9523).
    expect(jaroWinklerSimilarity('abcdefg', 'abcdefz')).toBeCloseTo(0.9428571428571428, 10);
  });

  it('prefix loop iterates "i < prefixLen" (not "<= prefixLen")', () => {
    // 6-char strings sharing 5-char prefix. prefixLen capped at 4.
    // Orig i<4: commonPrefix=4 → JW≈0.9333.
    // Mutant i<=4: also evaluates i=4, where a[4]='e'==b[4]='e', so
    // commonPrefix=5 → JW≈0.9444.
    expect(jaroWinklerSimilarity('abcdef', 'abcdex')).toBeCloseTo(0.9333333333333333, 10);
  });

  it('transposition count is preserved (not zeroed) across window-based matches', () => {
    // 'aab' vs 'aba' produces matches=3 and transpositions=2. J = 5/9 ≈ 0.5555,
    // JW = 0.6. Confirms countJaroTranspositions correctness.
    expect(jaroWinklerSimilarity('aab', 'aba')).toBeCloseTo(0.5999999999999999, 10);
  });

  it('handles long rotation differently from full-reverse', () => {
    // 'abcdefghij' rotated by 1 char ('jabcdefghi'): window=4.
    // Almost-full match found at offset.
    expect(jaroWinklerSimilarity('abcdefghij', 'jabcdefghi')).toBeCloseTo(0.9333333333333332, 10);
  });

  it('handles asymmetric padding ("a" vs "aaaa")', () => {
    // length 1 vs 4. Window=1. Single 'a' in 'a' matches first 'a' in 'aaaa'.
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
    // Both normalize to '' (length 0). Length-0 guard returns false before
    // a === b check. Kills the conditional mutations on line 195.
    expect(museumNamesAreSimilar('', '')).toBe(false);
  });

  it('rejects when normalization reduces one side to empty even if raw was non-empty', () => {
    // "..." normalizes to '' via fallback. "Louvre" normalizes to 'louvre'.
    // Should return false (length 0 guard).
    expect(museumNamesAreSimilar('...', 'Louvre')).toBe(false);
  });

  it('uses default threshold 0.85 (DEFAULT_NAME_SIMILARITY_THRESHOLD)', () => {
    // 'abcd' vs 'abef' have JW=0.7333, below 0.85, and neither contains the
    // other. Should reject.
    expect(museumNamesAreSimilar('abcd', 'abef')).toBe(false);
  });

  it('honors a custom (lower) threshold', () => {
    // Same pair as above, but with a lower threshold should now match.
    expect(museumNamesAreSimilar('abcd', 'abef', 0.7)).toBe(true);
  });

  it('uses >= comparison (not >) at threshold boundary', () => {
    // JW('abcd', 'abce') = 0.8833333333333334 exactly.
    // Substring fallback does NOT fire (neither contains the other).
    // Pass threshold = the exact JW value.
    // Orig: JW >= threshold → true.
    // Mutant: JW >  threshold → false (equal, not strictly greater).
    const threshold = 0.8833333333333334;
    expect(jaroWinklerSimilarity('abcd', 'abce')).toBe(threshold);
    expect(museumNamesAreSimilar('abcd', 'abce', threshold)).toBe(true);
  });

  it('rejects when JW is strictly below a high threshold and no substring match', () => {
    // Force the JW branch (not substring). 'abcd' vs 'abef' JW≈0.733.
    expect(museumNamesAreSimilar('abcd', 'abef', 0.85)).toBe(false);
  });

  it('substring fallback fires before JW (short form contained in long form)', () => {
    // 'art' is a substring of 'art contemporain'. Even with a very high
    // threshold that JW could not meet, the substring branch returns true.
    expect(museumNamesAreSimilar('art', 'art contemporain', 0.99)).toBe(true);
    expect(museumNamesAreSimilar('art contemporain', 'art', 0.99)).toBe(true);
  });
});
