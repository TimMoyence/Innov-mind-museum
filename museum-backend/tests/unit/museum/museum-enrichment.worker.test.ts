import { processMuseumEnrichmentJob } from '@modules/museum/adapters/primary/museum-enrichment.worker';

import type { MuseumEnrichmentView } from '@modules/museum/domain/enrichment.types';
import type { MuseumEnrichmentCachePort } from '@modules/museum/domain/ports/museum-enrichment-cache.port';
import type {
  WikidataMuseumClient,
  WikidataMuseumFacts,
  WikidataMuseumMatch,
} from '@modules/museum/adapters/secondary/wikidata-museum.client';
import type {
  WikipediaClient,
  WikipediaSummary,
} from '@modules/museum/adapters/secondary/wikipedia.client';

import { InMemoryMuseumRepository } from '../../helpers/museum/inMemoryMuseumRepository';

/** Minimal in-memory cache double — mirrors the use-case helper. */
class RecordingCache implements MuseumEnrichmentCachePort {
  private readonly rows = new Map<string, MuseumEnrichmentView>();

  async findFresh(input: {
    museumId: number;
    locale: string;
    freshWindowMs: number;
    now?: Date;
  }): Promise<MuseumEnrichmentView | null> {
    return this.rows.get(`${String(input.museumId)}:${input.locale}`) ?? null;
  }

  async upsert(input: MuseumEnrichmentView): Promise<void> {
    this.rows.set(`${String(input.museumId)}:${input.locale}`, input);
  }

  get(museumId: number, locale: string): MuseumEnrichmentView | undefined {
    return this.rows.get(`${String(museumId)}:${locale}`);
  }

  size(): number {
    return this.rows.size;
  }
}

const makeQidMatch = (overrides: Partial<WikidataMuseumMatch> = {}): WikidataMuseumMatch => ({
  qid: 'Q19675',
  label: 'Louvre',
  confidence: 'high',
  method: 'name+city',
  ...overrides,
});

const makeFacts = (overrides: Partial<WikidataMuseumFacts> = {}): WikidataMuseumFacts => ({
  qid: 'Q19675',
  label: 'Louvre',
  summary: 'French national museum',
  website: 'https://www.louvre.fr',
  phone: '+33140205050',
  imageUrl: 'https://commons.wikimedia.org/Louvre.jpg',
  wikipediaTitle: 'Musée du Louvre',
  ...overrides,
});

const makeSummary = (overrides: Partial<WikipediaSummary> = {}): WikipediaSummary => ({
  title: 'Musée du Louvre',
  extract: 'Long rich Wikipedia extract',
  extractHtml: null,
  pageUrl: 'https://fr.wikipedia.org/wiki/Mus%C3%A9e_du_Louvre',
  ...overrides,
});

const makeWikidataClient = (
  overrides: Partial<WikidataMuseumClient> = {},
): WikidataMuseumClient => ({
  findMuseumQid: jest.fn<
    Promise<WikidataMuseumMatch | null>,
    [Parameters<WikidataMuseumClient['findMuseumQid']>[0]]
  >(),
  fetchFacts: jest.fn<
    Promise<WikidataMuseumFacts | null>,
    [Parameters<WikidataMuseumClient['fetchFacts']>[0]]
  >(),
  ...overrides,
});

const makeWikipediaClient = (overrides: Partial<WikipediaClient> = {}): WikipediaClient => ({
  fetchSummary: jest.fn<
    Promise<WikipediaSummary | null>,
    [Parameters<WikipediaClient['fetchSummary']>[0]]
  >(),
  ...overrides,
});

describe('processMuseumEnrichmentJob', () => {
  const fixedNow = new Date('2026-04-22T12:00:00Z');
  let museumRepo: InMemoryMuseumRepository;
  let cache: RecordingCache;

  beforeEach(async () => {
    museumRepo = new InMemoryMuseumRepository();
    await museumRepo.create({
      name: 'Louvre',
      slug: 'louvre',
      latitude: 48.8606,
      longitude: 2.3376,
    });
    cache = new RecordingCache();
  });

  it('persists enrichment row with summary/qid/phone/imageUrl/openingHours', async () => {
    const wikidata = makeWikidataClient();
    (wikidata.findMuseumQid as jest.Mock).mockResolvedValue(makeQidMatch());
    (wikidata.fetchFacts as jest.Mock).mockResolvedValue(makeFacts());
    const wikipedia = makeWikipediaClient();
    (wikipedia.fetchSummary as jest.Mock).mockResolvedValue(makeSummary());
    const fetchOpeningHoursTag = jest.fn().mockResolvedValue('Mo-Fr 09:00-18:00');

    const view = await processMuseumEnrichmentJob(
      { museumId: 1, locale: 'fr' },
      {
        museumRepo,
        cache,
        wikidata,
        wikipedia,
        fetchOpeningHoursTag,
        clock: () => fixedNow,
      },
    );

    expect(view.museumId).toBe(1);
    expect(view.locale).toBe('fr');
    expect(view.wikidataQid).toBe('Q19675');
    expect(view.summary).toBe('Long rich Wikipedia extract');
    expect(view.phone).toBe('+33140205050');
    expect(view.imageUrl).toBe('https://commons.wikimedia.org/Louvre.jpg');
    expect(view.website).toBe('https://www.louvre.fr');
    expect(view.openingHours).not.toBeNull();
    expect(view.openingHours?.raw).toBe('Mo-Fr 09:00-18:00');
    expect(view.fetchedAt).toBe(fixedNow.toISOString());

    expect(cache.size()).toBe(1);
    expect(cache.get(1, 'fr')).toEqual(view);
  });

  it('still persists with nulls when Wikidata returns no match (fail-open)', async () => {
    const wikidata = makeWikidataClient();
    (wikidata.findMuseumQid as jest.Mock).mockResolvedValue(null);
    const wikipedia = makeWikipediaClient();
    (wikipedia.fetchSummary as jest.Mock).mockResolvedValue(null);
    const fetchOpeningHoursTag = jest.fn().mockResolvedValue(null);

    const view = await processMuseumEnrichmentJob(
      { museumId: 1, locale: 'fr' },
      {
        museumRepo,
        cache,
        wikidata,
        wikipedia,
        fetchOpeningHoursTag,
        clock: () => fixedNow,
      },
    );

    expect(view).toEqual({
      museumId: 1,
      locale: 'fr',
      summary: null,
      wikidataQid: null,
      website: null,
      phone: null,
      imageUrl: null,
      openingHours: null,
      fetchedAt: fixedNow.toISOString(),
    });
    expect(wikidata.fetchFacts).not.toHaveBeenCalled();
    expect(cache.get(1, 'fr')).toEqual(view);
  });

  it('falls back to Wikidata summary when Wikipedia returns null', async () => {
    const wikidata = makeWikidataClient();
    (wikidata.findMuseumQid as jest.Mock).mockResolvedValue(makeQidMatch());
    (wikidata.fetchFacts as jest.Mock).mockResolvedValue(
      makeFacts({ summary: 'Short Wikidata description', wikipediaTitle: null }),
    );
    const wikipedia = makeWikipediaClient();
    (wikipedia.fetchSummary as jest.Mock).mockResolvedValue(null);
    const fetchOpeningHoursTag = jest.fn().mockResolvedValue(null);

    const view = await processMuseumEnrichmentJob(
      { museumId: 1, locale: 'fr' },
      { museumRepo, cache, wikidata, wikipedia, fetchOpeningHoursTag, clock: () => fixedNow },
    );

    expect(view.summary).toBe('Short Wikidata description');
    expect(wikipedia.fetchSummary).not.toHaveBeenCalled();
  });

  it('upserts existing row (same museumId+locale) rather than duplicating', async () => {
    const wikidata = makeWikidataClient();
    (wikidata.findMuseumQid as jest.Mock).mockResolvedValue(makeQidMatch());
    (wikidata.fetchFacts as jest.Mock).mockResolvedValue(makeFacts());
    const wikipedia = makeWikipediaClient();
    (wikipedia.fetchSummary as jest.Mock).mockResolvedValue(makeSummary());
    const fetchOpeningHoursTag = jest.fn().mockResolvedValue(null);

    await processMuseumEnrichmentJob(
      { museumId: 1, locale: 'fr' },
      { museumRepo, cache, wikidata, wikipedia, fetchOpeningHoursTag, clock: () => fixedNow },
    );
    await processMuseumEnrichmentJob(
      { museumId: 1, locale: 'fr' },
      { museumRepo, cache, wikidata, wikipedia, fetchOpeningHoursTag, clock: () => fixedNow },
    );

    expect(cache.size()).toBe(1);
  });

  it('skips opening-hours fetch when museum has no coordinates', async () => {
    await museumRepo.create({ name: 'Virtual Museum', slug: 'virtual' });
    // Reset mocks: the newly created museum gets id 2
    const wikidata = makeWikidataClient();
    (wikidata.findMuseumQid as jest.Mock).mockResolvedValue(null);
    const wikipedia = makeWikipediaClient();
    (wikipedia.fetchSummary as jest.Mock).mockResolvedValue(null);
    const fetchOpeningHoursTag = jest.fn();

    const view = await processMuseumEnrichmentJob(
      { museumId: 2, locale: 'fr' },
      { museumRepo, cache, wikidata, wikipedia, fetchOpeningHoursTag, clock: () => fixedNow },
    );

    expect(fetchOpeningHoursTag).not.toHaveBeenCalled();
    expect(view.openingHours).toBeNull();
  });

  it('throws when museum does not exist', async () => {
    const wikidata = makeWikidataClient();
    const wikipedia = makeWikipediaClient();

    await expect(
      processMuseumEnrichmentJob(
        { museumId: 9999, locale: 'fr' },
        { museumRepo, cache, wikidata, wikipedia, clock: () => fixedNow },
      ),
    ).rejects.toThrow(/museum 9999 not found/);
  });

  it('sets fetchedAt=now on completion', async () => {
    const wikidata = makeWikidataClient();
    (wikidata.findMuseumQid as jest.Mock).mockResolvedValue(null);
    const wikipedia = makeWikipediaClient();
    (wikipedia.fetchSummary as jest.Mock).mockResolvedValue(null);
    const fetchOpeningHoursTag = jest.fn().mockResolvedValue(null);

    const view = await processMuseumEnrichmentJob(
      { museumId: 1, locale: 'fr' },
      { museumRepo, cache, wikidata, wikipedia, fetchOpeningHoursTag, clock: () => fixedNow },
    );

    expect(view.fetchedAt).toBe(fixedNow.toISOString());
  });
});
