jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { ImageEnrichmentService } from '@modules/chat/useCase/image/image-enrichment.service';

import type { ImageEnrichmentConfig } from '@modules/chat/useCase/image/image-enrichment.service';
import { makeEnrichedImage } from '../../helpers/chat/enrichedImage.fixtures';
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
        makeEnrichedImage({
          url: 'https://unsplash.com/1.jpg',
          thumbnailUrl: 'thumb',
          caption: 'art',
          source: 'unsplash',
          score: 0.5,
        }),
      ];

      const merged = service.mergeWikidataImage(existing, 'https://wiki.org/new.jpg', 'art');
      expect(merged.length).toBe(2);
      expect(merged.some((img) => img.url === 'https://wiki.org/new.jpg')).toBe(true);
    });

    it('does not duplicate if wikidata URL already exists', () => {
      const service = new ImageEnrichmentService(undefined, makeConfig());
      const existing = [
        makeEnrichedImage({
          url: 'https://wiki.org/existing.jpg',
          thumbnailUrl: 'thumb',
          caption: 'art',
          source: 'wikidata',
          score: 0.8,
        }),
      ];

      const merged = service.mergeWikidataImage(existing, 'https://wiki.org/existing.jpg', 'art');
      expect(merged.length).toBe(1);
    });

    it('sorts merged results by score descending', () => {
      const service = new ImageEnrichmentService(undefined, makeConfig());
      const existing = [
        makeEnrichedImage({
          url: 'https://unsplash.com/low.jpg',
          thumbnailUrl: 'thumb',
          caption: 'low',
          source: 'unsplash',
          score: 0.1,
        }),
      ];

      const merged = service.mergeWikidataImage(existing, 'https://wiki.org/high.jpg', 'high');
      // Wikidata images typically score higher
      expect(merged[0].source).toBe('wikidata');
    });

    it('deduplicates when merged list has duplicate URLs', () => {
      const service = new ImageEnrichmentService(undefined, makeConfig());
      const existing = [
        makeEnrichedImage({
          url: 'https://unsplash.com/dup.jpg',
          thumbnailUrl: 'thumb1',
          caption: 'art1',
          source: 'unsplash',
          score: 0.5,
        }),
        makeEnrichedImage({
          url: 'https://unsplash.com/dup.jpg',
          thumbnailUrl: 'thumb2',
          caption: 'art2',
          source: 'unsplash',
          score: 0.4,
        }),
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

  // =========================================================================
  // C2 v2 (2026-05) — multi-source aggregator + tie-break + spans + R13 pin
  // =========================================================================
  describe('C2 v2 multi-source aggregator', () => {
    it('R1 — fans out one enrich() call per searchTerm in parallel', async () => {
      const unsplash = makeMockUnsplash();
      unsplash.searchPhotos.mockImplementation((q: string) =>
        Promise.resolve([
          makeUnsplashPhoto({ url: `https://unsplash/${q.replace(/\s+/g, '-')}.jpg`, caption: q }),
        ]),
      );
      const service = new ImageEnrichmentService(unsplash, makeConfig());

      const result = await service.enrich(['Monet', 'Manet', 'Van Gogh']);
      expect(unsplash.searchPhotos).toHaveBeenCalledTimes(3);
      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('R3 — dedup tie-break: musaium URL beats unsplash on duplicate URL', async () => {
      const unsplash = makeMockUnsplash();
      unsplash.searchPhotos.mockResolvedValue([
        makeUnsplashPhoto({
          url: 'https://shared.example/dup.jpg',
          caption: 'Unsplash variant',
        }),
      ]);
      const musaium = {
        searchPhotos: jest.fn().mockResolvedValue([
          {
            url: 'https://shared.example/dup.jpg',
            thumbnailUrl: 'https://shared.example/dup.jpg',
            caption: 'Mona Lisa',
            width: 0,
            height: 0,
            photographerName: 'Musaium curated',
          },
        ]),
      };
      const service = new ImageEnrichmentService(unsplash, makeConfig(), undefined, musaium);

      const result = await service.enrich('Mona Lisa');
      expect(result.length).toBe(1);
      expect(result[0].source).toBe('musaium');
    });

    it('R13 — museumMode hoists Musaium hit to position 0 even if a higher-score wikidata exists', async () => {
      const unsplash = makeMockUnsplash();
      unsplash.searchPhotos.mockResolvedValue([]);
      const musaium = {
        searchPhotos: jest.fn().mockResolvedValue([
          {
            url: 'https://museum.example/mona.jpg',
            thumbnailUrl: 'https://museum.example/mona.jpg',
            caption: 'Mona Lisa',
            width: 0,
            height: 0,
            photographerName: 'Musaium curated',
          },
        ]),
      };
      const service = new ImageEnrichmentService(unsplash, makeConfig(), undefined, musaium);

      const result = await service.enrich(
        'Mona Lisa',
        'https://wiki.org/p18.jpg',
        undefined,
        true,
      );
      expect(result[0].source).toBe('musaium');
    });

    it('R9 — when v2 clients are undefined, only Unsplash + Wikidata flow exercised', async () => {
      const unsplash = makeMockUnsplash();
      unsplash.searchPhotos.mockResolvedValue([
        makeUnsplashPhoto({ url: 'https://unsplash/x.jpg' }),
      ]);
      const service = new ImageEnrichmentService(unsplash, makeConfig());
      const result = await service.enrich('Art', 'https://wiki.org/p18.jpg');

      const sources = new Set(result.map((r) => r.source));
      expect(sources.has('musaium')).toBe(false);
      expect(sources.has('commons')).toBe(false);
      expect(sources.has('wikidata')).toBe(true);
    });

    it('R11 — per-source error fail-open: commons throws, unsplash + wikidata still produced', async () => {
      const unsplash = makeMockUnsplash();
      unsplash.searchPhotos.mockResolvedValue([makeUnsplashPhoto({ caption: 'art' })]);
      const commons = {
        searchPhotos: jest.fn().mockRejectedValue(new Error('connection refused')),
      };
      const service = new ImageEnrichmentService(unsplash, makeConfig(), commons);

      const result = await service.enrich('Art', 'https://wiki.org/p18.jpg');
      const sources = result.map((r) => r.source);
      expect(sources).toContain('wikidata');
      expect(sources).toContain('unsplash');
      // commons contributed [], no entry
      expect(sources).not.toContain('commons');
    });

    it('R6 — propagates LLM-authored caption + rationale from annotations into EnrichedImage', async () => {
      const unsplash = makeMockUnsplash();
      unsplash.searchPhotos.mockResolvedValue([]);
      const musaium = {
        searchPhotos: jest.fn().mockResolvedValue([
          {
            url: 'https://museum.example/mona.jpg',
            thumbnailUrl: 'https://museum.example/mona.jpg',
            caption: 'Mona Lisa', // photo caption
            width: 0,
            height: 0,
            photographerName: 'Musaium curated',
          },
        ]),
      };
      const service = new ImageEnrichmentService(unsplash, makeConfig(), undefined, musaium);
      const result = await service.enrich(
        ['Mona Lisa'],
        undefined,
        [
          {
            query: 'Mona Lisa',
            caption: 'Mona Lisa at the Louvre',
            rationale: 'The exact work the visitor asked about.',
          },
        ],
      );
      expect(result[0].caption).toBe('Mona Lisa at the Louvre');
      expect(result[0].rationale).toBe('The exact work the visitor asked about.');
    });
  });

  // Existing factory used by tests above
  it('factory makeEnrichedImage returns the v2 default shape', () => {
    const img = makeEnrichedImage();
    expect(img.rationale).toBeDefined();
    expect(typeof img.rationale).toBe('string');
  });
});
