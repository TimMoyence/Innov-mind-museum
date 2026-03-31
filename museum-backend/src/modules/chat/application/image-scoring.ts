// Pure scoring function for image enrichment candidates.

/** A candidate image to be scored for enrichment quality. */
export interface ImageCandidate {
  caption: string;
  source: 'wikidata' | 'unsplash';
  width?: number;
  height?: number;
  apiPosition: number;
}

const WEIGHTS = { titleMatch: 0.4, resolution: 0.25, source: 0.2, position: 0.15 } as const;

export const normalizeForScoring = (text: string): string =>
  text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const titleMatchScore = (caption: string, searchTerm: string): number => {
  const captionWords = new Set(normalizeForScoring(caption).split(/\s+/).filter(Boolean));
  const searchWords = normalizeForScoring(searchTerm).split(/\s+/).filter(Boolean);
  if (searchWords.length === 0) return 0;
  const matches = searchWords.filter((w) => captionWords.has(w)).length;
  return matches / searchWords.length;
};

const resolutionScore = (width?: number, height?: number): number => {
  if (width == null || height == null) return 0.5;
  const pixels = width * height;
  if (pixels >= 1920 * 1080) return 1;
  if (pixels >= 800 * 600) return 0.6;
  return 0.2;
};

const sourceScore = (source: 'wikidata' | 'unsplash'): number => (source === 'wikidata' ? 1 : 0.7);

const positionScore = (position: number): number => Math.max(0, 1 - position * 0.2);

export const scoreImage = (candidate: ImageCandidate, searchTerm: string): number =>
  WEIGHTS.titleMatch * titleMatchScore(candidate.caption, searchTerm) +
  WEIGHTS.resolution * resolutionScore(candidate.width, candidate.height) +
  WEIGHTS.source * sourceScore(candidate.source) +
  WEIGHTS.position * positionScore(candidate.apiPosition);
