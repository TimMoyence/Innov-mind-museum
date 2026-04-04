import {
  scoreImage,
  normalizeForScoring,
  type ImageCandidate,
} from '@src/modules/chat/useCase/image-scoring';

describe('image-scoring', () => {
  describe('normalizeForScoring', () => {
    it('lowercases and strips diacritics', () => {
      expect(normalizeForScoring('Café Résumé')).toBe('cafe resume');
    });

    it('trims whitespace', () => {
      expect(normalizeForScoring('  hello  ')).toBe('hello');
    });
  });

  describe('scoreImage', () => {
    const base: ImageCandidate = {
      caption: 'Mona Lisa painting',
      source: 'wikidata',
      width: 1920,
      height: 1080,
      apiPosition: 0,
    };

    it('returns a number between 0 and 1', () => {
      const score = scoreImage(base, 'Mona Lisa');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('scores wikidata higher than unsplash for same image', () => {
      const wiki = scoreImage(base, 'Mona Lisa');
      const unsplash = scoreImage({ ...base, source: 'unsplash' }, 'Mona Lisa');
      expect(wiki).toBeGreaterThan(unsplash);
    });

    it('scores high-res higher than low-res', () => {
      const hiRes = scoreImage(base, 'painting');
      const loRes = scoreImage({ ...base, width: 100, height: 100 }, 'painting');
      expect(hiRes).toBeGreaterThan(loRes);
    });

    it('scores first position higher than later positions', () => {
      const first = scoreImage({ ...base, apiPosition: 0 }, 'painting');
      const fifth = scoreImage({ ...base, apiPosition: 4 }, 'painting');
      expect(first).toBeGreaterThan(fifth);
    });

    it('handles missing dimensions with a middle score', () => {
      const noSize = scoreImage({ ...base, width: undefined, height: undefined }, 'painting');
      expect(noSize).toBeGreaterThan(0);
    });

    it('handles empty search term without crashing', () => {
      const score = scoreImage(base, '');
      expect(typeof score).toBe('number');
    });

    it('boosts exact title match', () => {
      const exact = scoreImage({ ...base, caption: 'Mona Lisa' }, 'Mona Lisa');
      const partial = scoreImage({ ...base, caption: 'A random painting' }, 'Mona Lisa');
      expect(exact).toBeGreaterThan(partial);
    });
  });
});
