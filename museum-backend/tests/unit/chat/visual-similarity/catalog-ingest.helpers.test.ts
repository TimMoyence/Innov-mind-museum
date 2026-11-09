import { makePartialResponse, makeFetchSpy } from '../../../helpers/fetch/fetch-mock.helpers';

import type { ArtworkMetadata } from '@modules/chat/domain/visual-similarity/compare-result.types';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const WIKIDATA_URI_PUBLIC_DOMAIN = 'http://www.wikidata.org/entity/Q19652';
const WIKIDATA_URI_CC0 = 'http://www.wikidata.org/entity/Q6938433';
const WIKIDATA_URI_UNKNOWN = 'http://www.wikidata.org/entity/Q99999999';

interface ArtworkSeed {
  qid: string;
  title: string;
  artist?: string;
  inception?: string;
  imageUrl: string;
  license: string;
  museumQid: string;
}

const helpers = require('../../../../scripts/catalog-ingest.helpers') as {
  fetchArtworksOfMuseum: (qid: string, lang: string) => AsyncIterable<ArtworkSeed>;
  downloadThumbnail: (url: string, maxBytes: number) => Promise<Buffer>;
  normalizeMetadata: (seed: ArtworkSeed) => ArtworkMetadata;
  mapLicenseUriToSlug: (uriOrSlug: string) => string | null;
};

const originalFetch = global.fetch;

const makeSparqlBinding = (
  overrides: Partial<{
    item: string;
    itemLabel: string;
    creatorLabel: string;
    inception: string;
    image: string;
    license: string;
    museum: string;
  }>,
): Record<string, { value: string }> => {
  const result: Record<string, { value: string }> = {};
  for (const [key, val] of Object.entries(overrides)) {
    if (val !== undefined) {
      result[key] = { value: val };
    }
  }
  return result;
};

describe('catalog-ingest.helpers (T7.2 — unit)', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  describe('fetchArtworksOfMuseum', () => {
    it('issues a SPARQL request against query.wikidata.org and yields one ArtworkSeed per row', async () => {
      const fetchSpy = makeFetchSpy();
      fetchSpy.mockResolvedValueOnce(
        makePartialResponse({
          ok: true,
          status: 200,
          body: {
            results: {
              bindings: [
                makeSparqlBinding({
                  item: 'http://www.wikidata.org/entity/Q12418',
                  itemLabel: 'Mona Lisa',
                  creatorLabel: 'Leonardo da Vinci',
                  inception: '1503-01-01T00:00:00Z',
                  image: 'http://commons.wikimedia.org/wiki/Special:FilePath/Mona%20Lisa.jpg',
                  license: WIKIDATA_URI_PUBLIC_DOMAIN,
                  museum: 'http://www.wikidata.org/entity/Q19675',
                }),
                makeSparqlBinding({
                  item: 'http://www.wikidata.org/entity/Q160236',
                  itemLabel: 'Liberty Leading the People',
                  creatorLabel: 'Eugène Delacroix',
                  image: 'http://commons.wikimedia.org/wiki/Special:FilePath/liberty.jpg',
                  license: WIKIDATA_URI_PUBLIC_DOMAIN,
                  museum: 'http://www.wikidata.org/entity/Q19675',
                }),
              ],
            },
          },
        }),
      );
      global.fetch = fetchSpy;

      const seeds: ArtworkSeed[] = [];
      for await (const seed of helpers.fetchArtworksOfMuseum('Q19675', 'en')) {
        seeds.push(seed);
      }

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [calledUrl] = fetchSpy.mock.calls[0] as [string, RequestInit?];
      expect(calledUrl).toContain('query.wikidata.org/sparql');
      expect(seeds).toHaveLength(2);
      expect(seeds[0].qid).toBe('Q12418');
      expect(seeds[0].title).toBe('Mona Lisa');
      expect(seeds[0].artist).toBe('Leonardo da Vinci');
      expect(seeds[0].museumQid).toBe('Q19675');
      expect(seeds[1].qid).toBe('Q160236');
      expect(seeds[1].inception).toBeUndefined();
    });

    it('skips rows whose mandatory bindings are missing (defensive parsing)', async () => {
      const fetchSpy = makeFetchSpy();
      fetchSpy.mockResolvedValueOnce(
        makePartialResponse({
          ok: true,
          status: 200,
          body: {
            results: {
              bindings: [
                makeSparqlBinding({
                  item: 'http://www.wikidata.org/entity/Q1',
                  itemLabel: 'Broken row',
                  museum: 'http://www.wikidata.org/entity/Q19675',
                }),
                makeSparqlBinding({
                  item: 'http://www.wikidata.org/entity/Q43270',
                  itemLabel: 'The Starry Night',
                  image: 'http://commons.wikimedia.org/wiki/Special:FilePath/starry.jpg',
                  license: WIKIDATA_URI_PUBLIC_DOMAIN,
                  museum: 'http://www.wikidata.org/entity/Q188740',
                }),
              ],
            },
          },
        }),
      );
      global.fetch = fetchSpy;

      const seeds: ArtworkSeed[] = [];
      for await (const seed of helpers.fetchArtworksOfMuseum('Q19675', 'en')) {
        seeds.push(seed);
      }

      expect(seeds).toHaveLength(1);
      expect(seeds[0].qid).toBe('Q43270');
    });

    it('returns an empty iterable when SPARQL returns no bindings', async () => {
      const fetchSpy = makeFetchSpy();
      fetchSpy.mockResolvedValueOnce(
        makePartialResponse({
          ok: true,
          status: 200,
          body: { results: { bindings: [] } },
        }),
      );
      global.fetch = fetchSpy;

      const seeds: ArtworkSeed[] = [];
      for await (const seed of helpers.fetchArtworksOfMuseum('Q99999', 'en')) {
        seeds.push(seed);
      }
      expect(seeds).toHaveLength(0);
    });
  });

  describe('downloadThumbnail (rate-limit + maxBytes)', () => {
    it('rate-limits 5 sequential calls to the same hostname to ≥ 4s elapsed (1 req/s/hostname)', async () => {
      jest.useFakeTimers();
      try {
        const fetchSpy = makeFetchSpy();
        fetchSpy.mockImplementation(() =>
          Promise.resolve(
            makePartialResponse({
              ok: true,
              status: 200,
              body: 'tiny',
            }),
          ),
        );
        global.fetch = fetchSpy;

        const url = 'https://upload.wikimedia.org/fixture.jpg';
        const start = Date.now();

        const promises = Array.from({ length: 5 }, () =>
          helpers.downloadThumbnail(url, 1024 * 1024),
        );

        await jest.advanceTimersByTimeAsync(5_000);
        await Promise.all(promises);

        const elapsedMs = Date.now() - start;
        expect(elapsedMs).toBeGreaterThanOrEqual(4_000);
        expect(fetchSpy).toHaveBeenCalledTimes(5);
      } finally {
        jest.useRealTimers();
      }
    });

    it('throws when the downloaded payload exceeds maxBytes', async () => {
      const oversize = Buffer.alloc(2 * 1024 * 1024);
      const fetchSpy = makeFetchSpy();
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (k: string) =>
            k.toLowerCase() === 'content-length' ? String(oversize.byteLength) : null,
          has: (k: string) => k.toLowerCase() === 'content-length',
        },
        arrayBuffer: () => Promise.resolve(oversize.buffer),
      } as unknown as Response);
      global.fetch = fetchSpy;

      await expect(
        helpers.downloadThumbnail('https://thumbs.example.org/big.jpg', 1024 * 1024),
      ).rejects.toThrow();
    });
  });

  describe('normalizeMetadata (pure transform — table-driven)', () => {
    it.each<[ArtworkSeed, Partial<ArtworkMetadata>]>([
      [
        {
          qid: 'Q12418',
          title: 'Mona Lisa',
          artist: 'Leonardo da Vinci',
          inception: '1503-01-01T00:00:00Z',
          imageUrl: 'https://upload.wikimedia.org/Mona_Lisa.jpg',
          license: 'public-domain',
          museumQid: 'Q19675',
        },
        {
          title: 'Mona Lisa',
          artist: 'Leonardo da Vinci',
          imageUrl: 'https://upload.wikimedia.org/Mona_Lisa.jpg',
          museumQid: 'Q19675',
        },
      ],
      [
        {
          qid: 'Q43270',
          title: 'The Starry Night',
          imageUrl: 'https://upload.wikimedia.org/starry.jpg',
          license: 'cc-0',
          museumQid: 'Q188740',
        },
        {
          title: 'The Starry Night',
          imageUrl: 'https://upload.wikimedia.org/starry.jpg',
          museumQid: 'Q188740',
        },
      ],
    ])('normalizes seed %# to ArtworkMetadata', (seed, expected) => {
      const meta = helpers.normalizeMetadata(seed);
      expect(meta).toMatchObject(expected);
      expect(meta.title).toBe(seed.title);
      expect(meta.imageUrl).toBe(seed.imageUrl);
    });
  });

  describe('mapLicenseUriToSlug (T-A1 — C2 URI→slug mapping)', () => {
    it('maps the Wikidata public-domain URI (Q19652) to slug "public-domain"', () => {
      expect(helpers.mapLicenseUriToSlug(WIKIDATA_URI_PUBLIC_DOMAIN)).toBe('public-domain');
    });

    it('maps the Wikidata CC0 URI (Q6938433) to slug "cc-0"', () => {
      expect(helpers.mapLicenseUriToSlug(WIKIDATA_URI_CC0)).toBe('cc-0');
    });

    it('returns null for an unknown Wikidata license URI (rejected fail-safe)', () => {
      expect(helpers.mapLicenseUriToSlug(WIKIDATA_URI_UNKNOWN)).toBeNull();
    });

    it('does not crash on empty string (defensive — empty SPARQL cell)', () => {
      expect(helpers.mapLicenseUriToSlug('')).toBeNull();
    });
  });
});
