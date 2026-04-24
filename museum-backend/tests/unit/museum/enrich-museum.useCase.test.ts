import { EnrichMuseumUseCase } from '@modules/museum/useCase/enrichMuseum.useCase';

import type { MuseumEnrichmentView } from '@modules/museum/domain/enrichment.types';
import type { MuseumEnrichmentCachePort } from '@modules/museum/domain/ports/museum-enrichment-cache.port';

import { InMemoryMuseumRepository } from '../../helpers/museum/inMemoryMuseumRepository';
import { InMemoryMuseumEnrichmentQueue } from '../../helpers/museum/in-memory-museum-enrichment-queue';

/** In-memory cache double — keyed by `${museumId}:${locale}`. */
class InMemoryEnrichmentCache implements MuseumEnrichmentCachePort {
  private readonly rows = new Map<string, MuseumEnrichmentView>();

  async findFresh(input: {
    museumId: number;
    locale: string;
    freshWindowMs: number;
    now?: Date;
  }): Promise<MuseumEnrichmentView | null> {
    const row = this.rows.get(`${String(input.museumId)}:${input.locale}`);
    if (!row) return null;
    const now = (input.now ?? new Date()).getTime();
    const fetchedAt = new Date(row.fetchedAt).getTime();
    if (now - fetchedAt > input.freshWindowMs) return null;
    return row;
  }

  async upsert(input: MuseumEnrichmentView): Promise<void> {
    this.rows.set(`${String(input.museumId)}:${input.locale}`, input);
  }

  async findStaleRows(): Promise<{ museumId: number; locale: string }[]> {
    return [];
  }

  async deleteStaleSince(): Promise<number> {
    return 0;
  }
}

const makeView = (overrides: Partial<MuseumEnrichmentView> = {}): MuseumEnrichmentView => ({
  museumId: 1,
  locale: 'fr',
  summary: 'Famous Paris museum',
  wikidataQid: 'Q19675',
  website: 'https://www.louvre.fr',
  phone: null,
  imageUrl: null,
  openingHours: null,
  fetchedAt: new Date('2026-04-22T10:00:00Z').toISOString(),
  ...overrides,
});

describe('EnrichMuseumUseCase', () => {
  let museumRepo: InMemoryMuseumRepository;
  let cache: InMemoryEnrichmentCache;
  let queue: InMemoryMuseumEnrichmentQueue;
  let clockNow: Date;
  let useCase: EnrichMuseumUseCase;

  beforeEach(async () => {
    museumRepo = new InMemoryMuseumRepository();
    await museumRepo.create({ name: 'Louvre', slug: 'louvre' });
    cache = new InMemoryEnrichmentCache();
    queue = new InMemoryMuseumEnrichmentQueue();
    clockNow = new Date('2026-04-22T12:00:00Z');
    useCase = new EnrichMuseumUseCase(
      museumRepo,
      cache,
      queue,
      30 * 24 * 60 * 60 * 1000,
      () => clockNow,
    );
  });

  it('returns ready with cached data when museum_enrichment fresh (<30d) exists', async () => {
    const freshView = makeView({
      museumId: 1,
      locale: 'fr',
      fetchedAt: new Date('2026-04-20T10:00:00Z').toISOString(),
    });
    await cache.upsert(freshView);

    const result = await useCase.execute({ museumId: 1, locale: 'fr' });

    expect(result).toEqual({ status: 'ready', data: freshView });
    expect(queue.snapshot()).toHaveLength(0);
  });

  it('enqueues job and returns pending when cache miss', async () => {
    const result = await useCase.execute({ museumId: 1, locale: 'fr' });

    expect(result.status).toBe('pending');
    if (result.status !== 'pending') throw new Error('unreachable');
    expect(result.jobId).toBe('mus:1:fr');
    expect(queue.snapshot()).toHaveLength(1);
    expect(queue.snapshot()[0].status).toBe('active');
  });

  it('returns existing jobId when a job is already active for (museumId, locale)', async () => {
    const first = await useCase.execute({ museumId: 1, locale: 'fr' });
    const second = await useCase.execute({ museumId: 1, locale: 'fr' });

    expect(first).toEqual(second);
    expect(queue.snapshot()).toHaveLength(1);
  });

  it('getJobStatus returns ready after worker persisted result', async () => {
    const enqueued = await useCase.execute({ museumId: 1, locale: 'fr' });
    if (enqueued.status !== 'pending') throw new Error('expected pending');

    // Simulate worker completion: cache populated + queue marked completed.
    const persisted = makeView({
      museumId: 1,
      locale: 'fr',
      fetchedAt: clockNow.toISOString(),
    });
    await cache.upsert(persisted);
    queue.markCompleted({ museumId: 1, locale: 'fr' });

    const status = await useCase.getJobStatus({
      museumId: 1,
      locale: 'fr',
      jobId: enqueued.jobId,
    });

    expect(status).toEqual({ status: 'ready', data: persisted });
  });

  it('getJobStatus returns pending when job still active', async () => {
    const enqueued = await useCase.execute({ museumId: 1, locale: 'fr' });
    if (enqueued.status !== 'pending') throw new Error('expected pending');

    const status = await useCase.getJobStatus({
      museumId: 1,
      locale: 'fr',
      jobId: enqueued.jobId,
    });

    expect(status).toEqual({ status: 'pending', jobId: enqueued.jobId });
  });

  it('throws NotFound error for unknown museumId', async () => {
    await expect(useCase.execute({ museumId: 9999, locale: 'fr' })).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('treats stale cache row (>30d) as miss and enqueues new job', async () => {
    const staleView = makeView({
      museumId: 1,
      locale: 'fr',
      fetchedAt: new Date('2026-01-01T00:00:00Z').toISOString(),
    });
    await cache.upsert(staleView);

    const result = await useCase.execute({ museumId: 1, locale: 'fr' });

    expect(result.status).toBe('pending');
    expect(queue.snapshot()).toHaveLength(1);
  });
});
