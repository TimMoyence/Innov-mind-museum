/**
 * RED — T7.2 — `catalog-ingest.helpers` (unit, mocked HTTP via global.fetch).
 *
 * Locks down tasks.md T7.2 + design.md §3 / §9 D8:
 *   - `fetchArtworksOfMuseum(qid, license, lang)` issues a SPARQL query against
 *     Wikidata (`https://query.wikidata.org/sparql`), parses the JSON binding
 *     format, and yields one `ArtworkSeed` per result row. Optional bindings
 *     (artist, inception, …) collapse to `undefined` cleanly.
 *   - `downloadThumbnail(url, maxBytes)` rate-limits to 1 req/s per hostname
 *     so the Wikimedia "polite" budget is respected, and aborts/throws when
 *     the response payload exceeds `maxBytes`.
 *   - `normalizeMetadata(seed)` is a pure transform (table-driven test).
 *
 * SUT does not yet exist (Phase 7). Tests are RED until the editor lands the
 * file.
 */

import { makePartialResponse, makeFetchSpy } from '../../../helpers/fetch/fetch-mock.helpers';

import type { ArtworkMetadata } from '@modules/chat/domain/visual-similarity/compare-result.types';
import type { ArtworkImageLicense } from '@modules/chat/domain/visual-similarity/artworkEmbedding.entity';

// Silence logger noise from the SUT during these tests.
jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

/**
 * T-A1 (RED — C2 license URI→slug — UFR-022 fresh-context red phase).
 *
 * Constants verified 2026-05-21 against query.wikidata.org/sparql (cf.
 * `.claude/skills/team/team-reports/working/2026-05-21-p0-feature-gates/`
 * `c2-license-uris.md`). Pattern strict : `http://www.wikidata.org/entity/Qxxx`.
 *
 *   - `WIKIDATA_URI_PUBLIC_DOMAIN`  → slug `'public-domain'` (free / accepted).
 *   - `WIKIDATA_URI_CC0`            → slug `'cc-0'` (free / accepted).
 *   - `WIKIDATA_URI_UNKNOWN`        → null (rejected — non-free or unmapped).
 *
 * These constants pin the fixtures + the URI→slug mapper contract. Changing
 * them in this file = changing the C2 contract.
 */
const WIKIDATA_URI_PUBLIC_DOMAIN = 'http://www.wikidata.org/entity/Q19652';
const WIKIDATA_URI_CC0 = 'http://www.wikidata.org/entity/Q6938433';
const WIKIDATA_URI_UNKNOWN = 'http://www.wikidata.org/entity/Q99999999';

/**
 * Shape of one row yielded by `fetchArtworksOfMuseum`. Mirrors the SPARQL
 * SELECT clause: `?item ?itemLabel ?creatorLabel ?inception ?image ?license`.
 * Optional fields collapse to `undefined` when the binding is absent.
 */
interface ArtworkSeed {
  qid: string;
  title: string;
  artist?: string;
  inception?: string;
  imageUrl: string;
  license: string;
  museumQid: string;
}

// SUT — Phase 7 file, must not yet exist. Path is relative to the test
// file because `scripts/` lives outside the `src/` tree (no path alias).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic SUT load to surface a useful Jest failure when the module is missing
const helpers = require('../../../../scripts/catalog-ingest.helpers') as {
  fetchArtworksOfMuseum: (
    qid: string,
    license: ArtworkImageLicense[],
    lang: string,
  ) => AsyncIterable<ArtworkSeed>;
  downloadThumbnail: (url: string, maxBytes: number) => Promise<Buffer>;
  normalizeMetadata: (seed: ArtworkSeed) => ArtworkMetadata;
  // T-A1 (RED) — SUT not yet implemented. The mapper resolves a Wikidata P275
  // license URI to the internal slug used by `classifyLicense` ; unknown URI
  // → null (rejected). Existence of this export is the C2 contract.
  mapLicenseUriToSlug: (uriOrSlug: string) => string | null;
};

const originalFetch = global.fetch;

/**
 * Build a synthetic SPARQL JSON binding row in the shape Wikidata returns.
 * Every binding is `{ value: string }` — optional fields are simply omitted.
 */
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
                  // T-A1 — Wikidata P275 returns an entity URI, NOT a slug.
                  // Fixture corrected 2026-05-21 to reflect reality (prior
                  // `'public-domain'` slug was a misleading fixture that hid
                  // C2 bug : `classifyLicense` compares slug ⊂ slug → 100 %
                  // licenseRejected in prod because raw value is URI).
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
      for await (const seed of helpers.fetchArtworksOfMuseum(
        'Q19675',
        ['public-domain', 'cc-0'],
        'en',
      )) {
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
      // Inception missing on row 2 collapses to undefined (does not crash).
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
                // Missing `image` — must be skipped (no image URL → unrenderable).
                makeSparqlBinding({
                  item: 'http://www.wikidata.org/entity/Q1',
                  itemLabel: 'Broken row',
                  museum: 'http://www.wikidata.org/entity/Q19675',
                }),
                // Valid row.
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
      for await (const seed of helpers.fetchArtworksOfMuseum('Q19675', ['public-domain'], 'en')) {
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
      for await (const seed of helpers.fetchArtworksOfMuseum('Q99999', ['public-domain'], 'en')) {
        seeds.push(seed);
      }
      expect(seeds).toHaveLength(0);
    });
  });

  describe('downloadThumbnail (rate-limit + maxBytes)', () => {
    it('rate-limits 5 sequential calls to the same hostname to ≥ 4s elapsed (1 req/s/hostname)', async () => {
      jest.useFakeTimers();
      try {
        // Stub fetch to resolve immediately with a tiny payload — rate-limit
        // is per-hostname client-side, not network-bound.
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

        // Kick off 5 downloads concurrently — they should serialise via the
        // per-hostname rate-limiter (1 req/s).
        const promises = Array.from({ length: 5 }, () =>
          helpers.downloadThumbnail(url, 1024 * 1024),
        );

        // Drive the rate-limiter forward — every advance unblocks the next slot.
        // Five calls → first runs immediately, four waits of 1s each = ≥ 4s.
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
      const oversize = Buffer.alloc(2 * 1024 * 1024); // 2 MiB
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
        helpers.downloadThumbnail('https://upload.wikimedia.org/big.jpg', 1024 * 1024),
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
      // Title + imageUrl are mandatory in ArtworkMetadata.
      expect(meta.title).toBe(seed.title);
      expect(meta.imageUrl).toBe(seed.imageUrl);
    });
  });

  /**
   * T-A1 (RED — UFR-022 Wave A) — `mapLicenseUriToSlug` contract.
   *
   * The SPARQL P275 predicate yields Wikidata entity URIs
   * (`http://www.wikidata.org/entity/Qxxx`), NOT slugs. Today `classifyLicense`
   * (catalog-ingest.ts:175-183) compares `raw ⊂ ['public-domain','cc-0']`
   * so 100 % of seeds are silently rejected with `licenseRejected += 1`. The
   * mapper closes the URI→slug gap at the catalog-ingest.helpers boundary so
   * `classifyLicense` receives slugs (back-compatible) for known free
   * licenses, and the raw URI for unknowns (still rejected, fail-safe).
   *
   * RED expectation: `helpers.mapLicenseUriToSlug` is `undefined` →
   * `TypeError: helpers.mapLicenseUriToSlug is not a function`.
   */
  describe('mapLicenseUriToSlug (T-A1 — C2 URI→slug mapping)', () => {
    it('maps the Wikidata public-domain URI (Q19652) to slug "public-domain"', () => {
      expect(helpers.mapLicenseUriToSlug(WIKIDATA_URI_PUBLIC_DOMAIN)).toBe('public-domain');
    });

    it('maps the Wikidata CC0 URI (Q6938433) to slug "cc-0"', () => {
      expect(helpers.mapLicenseUriToSlug(WIKIDATA_URI_CC0)).toBe('cc-0');
    });

    it('returns null for an unknown Wikidata license URI (rejected fail-safe)', () => {
      // Q99999999 is well outside the assigned Wikidata Q-code range —
      // serves as a deterministic "unmapped URI" sentinel. The mapper MUST
      // return null so `classifyLicense` keeps rejecting the seed.
      expect(helpers.mapLicenseUriToSlug(WIKIDATA_URI_UNKNOWN)).toBeNull();
    });

    it('does not crash on empty string (defensive — empty SPARQL cell)', () => {
      // SPARQL `cell()` helper can return undefined; runIngest guards against
      // that path, but a defensive empty-string input must still produce a
      // safe null (no throw, no slug fabrication).
      expect(helpers.mapLicenseUriToSlug('')).toBeNull();
    });
  });
});
