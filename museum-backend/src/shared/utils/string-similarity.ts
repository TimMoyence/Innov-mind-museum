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

export const DEFAULT_NAME_SIMILARITY_THRESHOLD = 0.85;

export const normalizeMuseumName = (name: string): string => {
  const lowered = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const tokens = lowered
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !FRENCH_STOP_TOKENS.has(t));

  const stripped = tokens.join(' ').trim();

  if (stripped.length < 2) {
    return lowered.replace(/[^a-z0-9]+/g, ' ').trim();
  }

  return stripped;
};

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

export const museumNamesAreSimilar = (
  rawA: string,
  rawB: string,
  threshold = DEFAULT_NAME_SIMILARITY_THRESHOLD,
): boolean => {
  const a = normalizeMuseumName(rawA);
  const b = normalizeMuseumName(rawB);

  if (a.length === 0 || b.length === 0) return false;
  if (a === b) return true;

  if (a.includes(b) || b.includes(a)) return true;

  return jaroWinklerSimilarity(a, b) >= threshold;
};
