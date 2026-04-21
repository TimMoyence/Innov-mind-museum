jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { ImageEnrichmentService } from '@modules/chat/useCase/image-enrichment.service';

import type { ImageEnrichmentConfig } from '@modules/chat/useCase/image-enrichment.service';
import {
  makeUnsplashClientMock,
  makeUnsplashPhoto,
} from '../../helpers/search-clients/unsplash.fixture';

const makeConfig = (overrides: Partial<ImageEnrichmentConfig> = {}): ImageEnrichmentConfig => ({
  cacheTtlMs: 60_000,
  cacheMaxEntries: 100,
  fetchTimeoutMs: 5_000,
  maxImagesPerResponse: 3,
  ...overrides,
});

const makeMockUnsplash = () => makeUnsplashClientMock();

describe('ImageEnrichmentService', () => {
  describe('cache hit', () => {
    it('returns cached images on second call for the same search term', async () => {
      const unsplash = makeMockUnsplash();
      unsplash.searchPhotos.mockResolvedValue([makeUnsplashPhoto()]);

      const service = new ImageEnrichmentService(unsplash, makeConfig());

      const first = await service.enrich('Mona Lisa');
      const second = await service.enrich('Mona Lisa');

      expect(first).toEqual(second);
      // Unsplash should only be called once
      expect(unsplash.searchPhotos).toHaveBeenCalledTimes(1);
    });

    it('normalizes search term for cache key (case insensitive, trimmed)', async () => {
      const unsplash = makeMockUnsplash();
      unsplash.searchPhotos.mockResolvedValue([makeUnsplashPhoto()]);

      const service = new ImageEnrichmentService(unsplash, makeConfig());

      await service.enrich('  Mona Lisa  ');
      await service.enrich('mona lisa');

      expect(unsplash.searchPhotos).toHaveBeenCalledTimes(1);
    });
  });

  describe('cache miss', () => {
    it('fetches from Unsplash when not cached', async () => {
      const unsplash = makeMockUnsplash();
      unsplash.searchPhotos.mockResolvedValue([
        makeUnsplashPhoto({ url: 'https://unsplash.com/a.jpg', caption: 'artwork' }),
      ]);

      const service = new ImageEnrichmentService(unsplash, makeConfig());

      const result = await service.enrich('Starry Night');

      expect(unsplash.searchPhotos).toHaveBeenCalledWith('Starry Night');
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].source).toBe('unsplash');
    });
  });

  describe('empty search term', () => {
    it('returns empty array for empty search term', async () => {
      const service = new ImageEnrichmentService(undefined, makeConfig());
      const result = await service.enrich('');
      expect(result).toEqual([]);
    });

    it('returns empty array for whitespace-only search term', async () => {
      const service = new ImageEnrichmentService(undefined, makeConfig());
      const result = await service.enrich('   ');
      expect(result).toEqual([]);
    });
  });

  describe('wikidata image', () => {
    it('includes wikidata image when provided', async () => {
      const service = new ImageEnrichmentService(undefined, makeConfig());
      const result = await service.enrich('The Scream', 'https://wikidata.org/scream.jpg');

      expect(result.length).toBe(1);
      expect(result[0].source).toBe('wikidata');
      expect(result[0].url).toBe('https://wikidata.org/scream.jpg');
    });
  });

  describe('timeout handling', () => {
    it('returns results without Unsplash images on timeout', async () => {
      jest.useFakeTimers();
      try {
        const unsplash = makeMockUnsplash();
        unsplash.searchPhotos.mockImplementation(
          () => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 100_000)),
        );

        const service = new ImageEnrichmentService(unsplash, makeConfig({ fetchTimeoutMs: 10 }));

        const promise = service.enrich('Test', 'https://wiki.org/img.jpg');
        jest.advanceTimersByTime(11);
        const result = await promise;

        // Should still return wikidata image even though Unsplash timed out
        expect(result.length).toBe(1);
        expect(result[0].source).toBe('wikidata');
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('dedup logic', () => {
    it('deduplicates images by URL', async () => {
      const unsplash = makeMockUnsplash();
      unsplash.searchPhotos.mockResolvedValue([
        makeUnsplashPhoto({ url: 'https://example.com/same.jpg' }),
        makeUnsplashPhoto({ url: 'https://example.com/same.jpg' }),
      ]);

      const service = new ImageEnrichmentService(unsplash, makeConfig());

      const result = await service.enrich('Art');
      const urls = result.map((img) => img.url);
      const uniqueUrls = new Set(urls);
      expect(urls.length).toBe(uniqueUrls.size);
    });
  });

  describe('max images per response', () => {
    it('limits results to maxImagesPerResponse', async () => {
      const unsplash = makeMockUnsplash();
      unsplash.searchPhotos.mockResolvedValue([
        makeUnsplashPhoto({ url: 'https://example.com/1.jpg' }),
        makeUnsplashPhoto({ url: 'https://example.com/2.jpg' }),
        makeUnsplashPhoto({ url: 'https://example.com/3.jpg' }),
        makeUnsplashPhoto({ url: 'https://example.com/4.jpg' }),
        makeUnsplashPhoto({ url: 'https://example.com/5.jpg' }),
      ]);

      const service = new ImageEnrichmentService(unsplash, makeConfig({ maxImagesPerResponse: 2 }));

      const result = await service.enrich('Art');
      expect(result.length).toBeLessThanOrEqual(2);
    });
  });

  describe('cache eviction', () => {
    it('evicts oldest entry when cache is full', async () => {
      const service = new ImageEnrichmentService(undefined, makeConfig({ cacheMaxEntries: 2 }));

      await service.enrich('First', 'https://wiki.org/1.jpg');
      await service.enrich('Second', 'https://wiki.org/2.jpg');
      // This should trigger eviction of "first"
      await service.enrich('Third', 'https://wiki.org/3.jpg');

      // All calls should succeed
      const result = await service.enrich('Third');
      expect(result.length).toBe(1); // should be cached
    });
  });

  describe('no Unsplash client', () => {
    it('returns only wikidata images when Unsplash client is not configured', async () => {
      const service = new ImageEnrichmentService(undefined, makeConfig());
      const result = await service.enrich('Test Art', 'https://wiki.org/image.jpg');

      expect(result.length).toBe(1);
      expect(result[0].source).toBe('wikidata');
    });

    it('returns empty array when no wikidata image and no Unsplash client', async () => {
      const service = new ImageEnrichmentService(undefined, makeConfig());
      const result = await service.enrich('Test Art');
      expect(result).toEqual([]);
    });
  });

  describe('mergeWikidataImage', () => {
    it('adds a new wikidata image to existing list', () => {
      const service = new ImageEnrichmentService(undefined, makeConfig());
      const existing = [
        {
          url: 'https://unsplash.com/1.jpg',
          thumbnailUrl: 'thumb',
          caption: 'art',
          source: 'unsplash' as const,
          score: 0.5,
        },
      ];

      const merged = service.mergeWikidataImage(existing, 'https://wiki.org/new.jpg', 'art');
      expect(merged.length).toBe(2);
      expect(merged.some((img) => img.url === 'https://wiki.org/new.jpg')).toBe(true);
    });

    it('does not duplicate if wikidata URL already exists', () => {
      const service = new ImageEnrichmentService(undefined, makeConfig());
      const existing = [
        {
          url: 'https://wiki.org/existing.jpg',
          thumbnailUrl: 'thumb',
          caption: 'art',
          source: 'wikidata' as const,
          score: 0.8,
        },
      ];

      const merged = service.mergeWikidataImage(existing, 'https://wiki.org/existing.jpg', 'art');
      expect(merged.length).toBe(1);
    });

    it('sorts merged results by score descending', () => {
      const service = new ImageEnrichmentService(undefined, makeConfig());
      const existing = [
        {
          url: 'https://unsplash.com/low.jpg',
          thumbnailUrl: 'thumb',
          caption: 'low',
          source: 'unsplash' as const,
          score: 0.1,
        },
      ];

      const merged = service.mergeWikidataImage(existing, 'https://wiki.org/high.jpg', 'high');
      // Wikidata images typically score higher
      expect(merged[0].source).toBe('wikidata');
    });

    it('deduplicates when merged list has duplicate URLs', () => {
      const service = new ImageEnrichmentService(undefined, makeConfig());
      const existing = [
        {
          url: 'https://unsplash.com/dup.jpg',
          thumbnailUrl: 'thumb1',
          caption: 'art1',
          source: 'unsplash' as const,
          score: 0.5,
        },
        {
          url: 'https://unsplash.com/dup.jpg',
          thumbnailUrl: 'thumb2',
          caption: 'art2',
          source: 'unsplash' as const,
          score: 0.4,
        },
      ];

      const merged = service.mergeWikidataImage(existing, 'https://wiki.org/new.jpg', 'art');
      const urls = merged.map((img) => img.url);
      expect(new Set(urls).size).toBe(urls.length);
    });
  });

  describe('cache expiration', () => {
    it('refetches when cache entry has expired', async () => {
      jest.useFakeTimers();
      try {
        const unsplash = makeMockUnsplash();
        unsplash.searchPhotos.mockResolvedValue([makeUnsplashPhoto()]);

        const service = new ImageEnrichmentService(unsplash, makeConfig({ cacheTtlMs: 1 }));

        await service.enrich('Mona Lisa');

        // Advance past the 1ms cache TTL
        jest.advanceTimersByTime(10);

        await service.enrich('Mona Lisa');

        // Should fetch twice because cache expired
        expect(unsplash.searchPhotos).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('Unsplash fetch error (non-timeout)', () => {
    it('continues with wikidata images when Unsplash throws a regular error', async () => {
      const unsplash = makeMockUnsplash();
      unsplash.searchPhotos.mockRejectedValue(new Error('Network error'));

      const service = new ImageEnrichmentService(unsplash, makeConfig());

      const result = await service.enrich('Art', 'https://wiki.org/art.jpg');

      // Should still return the wikidata image
      expect(result.length).toBe(1);
      expect(result[0].source).toBe('wikidata');
    });
  });

  describe('Unsplash photo attribution', () => {
    it('includes attribution from Unsplash photos', async () => {
      const unsplash = makeMockUnsplash();
      unsplash.searchPhotos.mockResolvedValue([
        makeUnsplashPhoto({ photographerName: 'Jane Doe' }),
      ]);

      const service = new ImageEnrichmentService(unsplash, makeConfig());

      const result = await service.enrich('Art');

      expect(result[0].attribution).toBe('Photo by Jane Doe on Unsplash');
    });
  });
});
