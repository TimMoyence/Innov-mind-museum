import { makeArtworkFacts } from '../../../helpers/chat/visual-similarity/artwork-facts.fixtures';
import { makeCache } from '../../../helpers/chat/cache.fixtures';

import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';
import type { CacheService } from '@shared/cache/cache.port';

const lookupMock = jest.fn<
  Promise<ArtworkFacts | null>,
  [{ searchTerm: string; language?: string }]
>();

jest.mock('@modules/chat/adapters/secondary/search/wikidata.client', () => ({
  WikidataClient: jest.fn().mockImplementation(() => ({ lookup: lookupMock })),
}));

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

interface WikidataEnricherCtorArgs {
  client: { lookup: typeof lookupMock };
  cache: CacheService;
  cacheTtlSeconds?: number;
}

const { WikidataEnricher } =
  require('@modules/chat/useCase/visual-similarity/wikidata-enricher') as {
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

  it('does NOT reject when a lookup THROWS — drops that qid (gap in Map) and resolves the rest', async () => {
    lookupMock.mockImplementation(async ({ searchTerm }) => {
      if (searchTerm === 'Q2') throw new Error('ENOTFOUND wikidata.org (prod egress block)');
      return makeArtworkFacts({ qid: searchTerm, title: `Title ${searchTerm}` });
    });
    const cache = makeCache();
    const enricher = new WikidataEnricher({ client: { lookup: lookupMock }, cache });

    const result = await enricher.enrichBatch(['Q1', 'Q2', 'Q3'], 'en');

    expect(result.size).toBe(2);
    expect(result.has('Q2')).toBe(false);
    expect(result.get('Q1')?.qid).toBe('Q1');
    expect(result.get('Q3')?.qid).toBe('Q3');
  });

  it('caps in-flight WikidataClient.lookup calls at 5 concurrent', async () => {
    let inFlight = 0;
    let observedMax = 0;
    lookupMock.mockImplementation(async ({ searchTerm }) => {
      inFlight += 1;
      observedMax = Math.max(observedMax, inFlight);
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
      get: jest
        .fn()
        .mockImplementation(async (key: string) => (key.includes('Q12418') ? cached : null)),
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
