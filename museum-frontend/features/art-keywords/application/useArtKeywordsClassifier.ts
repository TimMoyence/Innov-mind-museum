import { useCallback } from 'react';
import { useArtKeywordsStore } from '@/features/art-keywords/infrastructure/artKeywordsStore';

/**
 * Classifies user text as art-related or unknown using locally cached keywords.
 * Returns 'art' if any token matches a keyword for the given locale, 'unknown' otherwise.
 */
export function useArtKeywordsClassifier() {
  const getKeywords = useArtKeywordsStore((state) => state.getKeywords);

  const classifyText = useCallback(
    (text: string, locale: string): 'art' | 'unknown' => {
      const keywords = getKeywords(locale);
      if (!keywords.length) return 'unknown';

      const normalized = text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
      const tokens = normalized.split(/[\s,.;:!?'"()-]+/).filter(Boolean);

      const keywordSet = new Set(keywords.map((k) => k.keyword.toLowerCase()));
      const hasMatch = tokens.some((token) => keywordSet.has(token));
      return hasMatch ? 'art' : 'unknown';
    },
    [getKeywords],
  );

  return { classifyText };
}
