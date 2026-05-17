// C2 v2 (2026-05): adds Wikimedia Commons + Musaium catalogue sources, and
// alias-aware title matching (FR/EN alt-labels from Wikidata SPARQL).

import type { EnrichedImageSource } from '@modules/chat/domain/chat.types';

export interface ImageCandidate {
  caption: string;
  source: EnrichedImageSource;
  width?: number;
  height?: number;
  apiPosition: number;
  /**
   * Optional alias labels (FR/EN alt-names from Wikidata `schema:alternateName`
   * / `skos:altLabel`). Folded into the captionWords set so e.g. searching
   * "La Joconde" matches a caption "Mona Lisa" when the alias is present.
   */
  aliases?: string[];
}

const WEIGHTS = { titleMatch: 0.4, resolution: 0.25, source: 0.2, position: 0.15 } as const;

export const normalizeForScoring = (text: string): string =>
  text.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');

const titleMatchScore = (
  caption: string,
  searchTerm: string,
  aliases?: readonly string[],
): number => {
  const captionWords = new Set(normalizeForScoring(caption).split(/\s+/).filter(Boolean));
  if (aliases && aliases.length > 0) {
    for (const alias of aliases) {
      for (const word of normalizeForScoring(alias).split(/\s+/).filter(Boolean)) {
        captionWords.add(word);
      }
    }
  }
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

/**
 * Per-source quality weight (0..1.2). Decision D4 (design.md):
 * `musaium=1.0` is intentionally NOT bumped to `1.2` — the museum-priority
 * pin (R13) handles "always preferred" at the sort level, so the score range
 * stays in 0..1 to keep FE rendering consistent.
 */
const sourceScore = (source: EnrichedImageSource): number => {
  switch (source) {
    case 'musaium':
      return 1;
    case 'wikidata':
      return 1;
    case 'commons':
      return 0.8;
    case 'unsplash':
      return 0.7;
  }
};

const positionScore = (position: number): number => Math.max(0, 1 - position * 0.2);

export const scoreImage = (candidate: ImageCandidate, searchTerm: string): number =>
  WEIGHTS.titleMatch * titleMatchScore(candidate.caption, searchTerm, candidate.aliases) +
  WEIGHTS.resolution * resolutionScore(candidate.width, candidate.height) +
  WEIGHTS.source * sourceScore(candidate.source) +
  WEIGHTS.position * positionScore(candidate.apiPosition);
