/**
 * RED — T4.6 — `WikidataEnricher.enrichBatch`.
 *
 * Locks down tasks.md T4.6 + design.md §3:
 *   - Calls `WikidataClient.lookup` once per unique QID (dedup),
 *   - Honours a max concurrency of 5 (in-flight upper bound),
 *   - Reads from + writes to the cache adapter (Redis) with a 7-day TTL,
 *   - Returns a `Map<qid, ArtworkFacts>` containing only resolved QIDs (null
 *     responses are dropped, not mapped to undefined).
 *
 * The C2 file `wikidata.client.ts` is read-only territory for this phase
 * (cohabitation forbidden zone). We mock the class via `jest.mock` and
 * assert on call shape only.
 *
 * SUT does not yet exist (Phase 4). Tests are RED until Phase 4 lands.
 */

import { makeArtworkFacts } from '../../../helpers/chat/visual-similarity/artwork-facts.fixtures';
import { makeCache } from '../../../helpers/chat/cache.fixtures';

import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';
import type { CacheService } from '@shared/cache/cache.port';

// ---------------------------------------------------------------------------
// Mock WikidataClient — its real impl performs HTTPS calls. We capture the
// `lookup` mock + record the in-flight count so concurrency assertions are
// possible without a real network round-trip.
// ---------------------------------------------------------------------------
const lookupMock = jest.fn<Promise<ArtworkFacts | null>, [{ searchTerm: string; language?: string }]>();

jest.mock('@modules/chat/adapters/secondary/search/wikidata.client', () => ({
  WikidataClient: jest.fn().mockImplementation(() => ({ lookup: lookupMock })),
}));

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

interface WikidataEnricherCtorArgs {
  client: { lookup: typeof lookupMock };
  cache: CacheService;
  /** Optional override of the default 7-day TTL — kept for tests. */
  cacheTtlSeconds?: number;
}

// SUT — Phase 4 file, must not yet exist.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic SUT load
const { WikidataEnricher } = require('@modules/chat/useCase/visual-similarity/wikidata-enricher') as {
  WikidataEnricher: new (args: WikidataEnricherCtorArgs) => {
    enrichBatch: (qids: string[], lang: string) => Promise<Map<string, ArtworkFacts>>;
  };
};

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

describe('WikidataEnricher.enrichBatch (T4.6)', () => {
  beforeEach(() => {
    lookupMock.mockReset();
  });

  it('calls WikidataClient.lookup exactly once per UNIQUE qid (dedupes the input list)', async () => {
    lookupMock.mockImplementation(async ({ searchTerm }) =>
      makeArtworkFacts({ qid: searchTerm, title: `Title ${searchTerm}` }),
    );
    const cache = makeCache();
    const enricher = new WikidataEnricher({
      client: { lookup: lookupMock },
      cache,
    });

    const result = await enricher.enrichBatch(['Q1', 'Q2', 'Q1', 'Q3', 'Q2'], 'en');

    expect(lookupMock).toHaveBeenCalledTimes(3);
    expect(result.size).toBe(3);
    expect(result.get('Q1')?.qid).toBe('Q1');
    expect(result.get('Q2')?.qid).toBe('Q2');
    expect(result.get('Q3')?.qid).toBe('Q3');
  });

  it('caps in-flight WikidataClient.lookup calls at 5 concurrent', async () => {
    let inFlight = 0;
    let observedMax = 0;
    lookupMock.mockImplementation(async ({ searchTerm }) => {
      inFlight += 1;
      observedMax = Math.max(observedMax, inFlight);
      // Yield to the event loop so several callers can pile up before resolve.
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return makeArtworkFacts({ qid: searchTerm });
    });
    const cache = makeCache();
    const enricher = new WikidataEnricher({
      client: { lookup: lookupMock },
      cache,
    });

    const qids = Array.from({ length: 12 }, (_, i) => `Q${i + 1}`);
    await enricher.enrichBatch(qids, 'en');

    expect(observedMax).toBeLessThanOrEqual(5);
    expect(observedMax).toBeGreaterThan(0);
  });

  it('returns the cached value without calling lookup when the cache hits', async () => {
    const cached = makeArtworkFacts({ qid: 'Q12418', title: 'Cached Mona Lisa' });
    const cache = makeCache({
      get: jest.fn().mockImplementation(async (key: string) =>
        key.includes('Q12418') ? cached : null,
      ),
    });
    lookupMock.mockResolvedValue(makeArtworkFacts({ qid: 'Q-other' }));

    const enricher = new WikidataEnricher({ client: { lookup: lookupMock }, cache });

    const result = await enricher.enrichBatch(['Q12418'], 'en');

    expect(result.get('Q12418')?.title).toBe('Cached Mona Lisa');
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('persists newly-fetched facts to the cache with a 7-day TTL', async () => {
    lookupMock.mockResolvedValue(makeArtworkFacts({ qid: 'Q12418' }));
    const cache = makeCache();
    const enricher = new WikidataEnricher({ client: { lookup: lookupMock }, cache });

    await enricher.enrichBatch(['Q12418'], 'en');

    expect(cache.set).toHaveBeenCalledWith(
      expect.stringContaining('Q12418'),
      expect.objectContaining({ qid: 'Q12418' }),
      SEVEN_DAYS_SECONDS,
    );
  });

  it('drops null lookup responses (qid not present in the returned Map)', async () => {
    lookupMock.mockImplementation(async ({ searchTerm }) =>
      searchTerm === 'Q-MISSING' ? null : makeArtworkFacts({ qid: searchTerm }),
    );
    const cache = makeCache();
    const enricher = new WikidataEnricher({ client: { lookup: lookupMock }, cache });

    const result = await enricher.enrichBatch(['Q1', 'Q-MISSING', 'Q2'], 'en');

    expect(result.size).toBe(2);
    expect(result.has('Q-MISSING')).toBe(false);
    expect(result.get('Q1')?.qid).toBe('Q1');
    expect(result.get('Q2')?.qid).toBe('Q2');
  });
});
