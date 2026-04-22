/**
 * String similarity helpers for museum name deduplication.
 *
 * Used by the museum search use case to merge local + OSM results and to
 * collapse duplicate OSM nodes that represent the same physical museum but
 * sit a few hundred meters apart in OpenStreetMap.
 */

/**
 * French museum-name noise tokens to strip before comparison.
 *
 * Applied after lowercase + NFD diacritic stripping so that "Musée", "musee",
 * and "Musee" all reduce to "musee" and can be removed consistently.
 *
 * Kept deliberately small — adding too many words (e.g. "art", "histoire")
 * would merge unrelated museums.
 */
const FRENCH_STOP_TOKENS = new Set<string>([
  'musee',
  'museum',
  'le',
  'la',
  'les',
  'l',
  'du',
  'de',
  'des',
  'd',
  'a',
  'au',
  'aux',
]);

/** Default Jaro-Winkler similarity threshold for museum name matching. */
export const DEFAULT_NAME_SIMILARITY_THRESHOLD = 0.85;

/**
 * Normalize a museum name for similarity comparison.
 *
 * Steps:
 *  1. Lowercase.
 *  2. Strip diacritics via NFD normalization + combining-mark removal.
 *  3. Tokenize on non-alphanumeric characters.
 *  4. Drop French stop tokens (articles, "musee", "museum", ...).
 *  5. Re-join with single spaces.
 *
 * Empty-safe fallback: if the normalized form has fewer than 2 chars after
 * stripping (e.g. "Musée" → "" or "Le" → "" or "l" → ""), returns the
 * simple lowercase+diacritic-stripped form instead. This prevents two
 * unrelated names that both reduce to "" from being treated as equal.
 *
 * @param name - Raw museum name.
 * @returns Normalized form suitable for similarity comparison.
 */
export const normalizeMuseumName = (name: string): string => {
  const lowered = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const tokens = lowered
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !FRENCH_STOP_TOKENS.has(t));

  const stripped = tokens.join(' ').trim();

  if (stripped.length < 2) {
    // Fallback: return the simple form (no stop-word stripping) to avoid
    // collapsing unrelated short names to the same empty bucket.
    return lowered.replace(/[^a-z0-9]+/g, ' ').trim();
  }

  return stripped;
};

/**
 * Scans `a` vs `b` within the matching window, marking matched positions
 * in `aMatches` / `bMatches`.
 *
 * @returns Total number of matches found.
 */
const markJaroMatches = (
  a: string,
  b: string,
  matchWindow: number,
  aMatches: boolean[],
  bMatches: boolean[],
): number => {
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, b.length);
    for (let j = start; j < end; j++) {
      if (!bMatches[j] && a[i] === b[j]) {
        aMatches[i] = true;
        bMatches[j] = true;
        matches++;
        break;
      }
    }
  }
  return matches;
};

/**
 * Counts transpositions on matched characters: pairs of matched positions
 * in `a` and `b` that disagree character-wise when traversed in order.
 */
const countJaroTranspositions = (
  a: string,
  b: string,
  aMatches: readonly boolean[],
  bMatches: readonly boolean[],
): number => {
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  return transpositions;
};

/**
 * Jaro similarity in [0, 1] between two strings.
 *
 * Standard algorithm:
 *  - Matching window: floor(max(|a|, |b|) / 2) - 1, clamped to >= 0.
 *  - Two chars match if equal and within the matching window.
 *  - Transpositions counted on matched chars preserving order.
 */
const jaroSimilarity = (a: string, b: string): number => {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matchWindow = Math.max(Math.floor(Math.max(a.length, b.length) / 2) - 1, 0);
  const aMatches: boolean[] = new Array<boolean>(a.length).fill(false);
  const bMatches: boolean[] = new Array<boolean>(b.length).fill(false);

  const matches = markJaroMatches(a, b, matchWindow, aMatches, bMatches);
  if (matches === 0) return 0;

  const transpositions = countJaroTranspositions(a, b, aMatches, bMatches);
  return (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
};

/**
 * Jaro-Winkler similarity in [0, 1] between two strings.
 *
 * Adds a prefix boost (p = 0.1, max 4 chars) on top of the Jaro score,
 * favoring pairs that share a common prefix.
 *
 * Pure function, no dependencies.
 */
export const jaroWinklerSimilarity = (a: string, b: string): number => {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const jaro = jaroSimilarity(a, b);
  const prefixLen = Math.min(4, Math.min(a.length, b.length));
  let commonPrefix = 0;
  for (let i = 0; i < prefixLen; i++) {
    if (a[i] === b[i]) commonPrefix++;
    else break;
  }

  return jaro + commonPrefix * 0.1 * (1 - jaro);
};

/**
 * Museum name similarity check with substring fallback.
 *
 * Returns true if either:
 *  - Jaro-Winkler similarity of the normalized forms is >= `threshold`, OR
 *  - one normalized form contains the other as a substring (catches cases
 *    like "CAPC" vs "CAPC musée d'art contemporain" where JW drops below
 *    threshold because of the large length difference).
 *
 * The substring check is run on the normalized forms (diacritics stripped,
 * stop words removed) so it also catches "Louvre" vs "Musée du Louvre"
 * after normalization.
 *
 * @param rawA - First raw name.
 * @param rawB - Second raw name.
 * @param threshold - Jaro-Winkler minimum similarity (default 0.85).
 * @returns true if the names likely refer to the same museum.
 */
export const museumNamesAreSimilar = (
  rawA: string,
  rawB: string,
  threshold = DEFAULT_NAME_SIMILARITY_THRESHOLD,
): boolean => {
  const a = normalizeMuseumName(rawA);
  const b = normalizeMuseumName(rawB);

  if (a.length === 0 || b.length === 0) return false;
  if (a === b) return true;

  // Substring match catches short-form/long-form name pairs.
  if (a.includes(b) || b.includes(a)) return true;

  return jaroWinklerSimilarity(a, b) >= threshold;
};
