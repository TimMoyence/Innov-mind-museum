import {
  RefreshStaleEnrichmentsUseCase,
  SCAN_BATCH_SIZE,
  STALE_ENRICHMENT_THRESHOLD_DAYS,
} from '@modules/museum/useCase/enrichment/refreshStaleEnrichments.useCase';

import type { MuseumEnrichmentCachePort } from '@modules/museum/domain/ports/museum-enrichment-cache.port';
import type { MuseumEnrichmentView } from '@modules/museum/domain/enrichment/enrichment.types';

import { InMemoryMuseumEnrichmentQueue } from '../../helpers/museum/in-memory-museum-enrichment-queue';

/**
 * Scriptable cache double — records every `findStaleRows` call and returns a
 * prewired list so tests can assert both the query shape and the processing
 * loop.
 */
class ScriptableEnrichmentCache implements MuseumEnrichmentCachePort {
  readonly findStaleCalls: { threshold: Date; limit: number }[] = [];
  private staleRows: { museumId: number; locale: string }[] = [];

  setStaleRows(rows: { museumId: number; locale: string }[]): void {
    this.staleRows = rows;
  }

  async findFresh(): Promise<MuseumEnrichmentView | null> {
    return null;
  }

  async upsert(): Promise<void> {
    // no-op for these tests
  }

  async findStaleRows(
    thresholdDate: Date,
    limit: number,
  ): Promise<{ museumId: number; locale: string }[]> {
    this.findStaleCalls.push({ threshold: thresholdDate, limit });
    return this.staleRows.slice(0, limit);
  }

  async deleteStaleSince(): Promise<number> {
    return 0;
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1_000;

describe('RefreshStaleEnrichmentsUseCase', () => {
  let cache: ScriptableEnrichmentCache;
  let queue: InMemoryMuseumEnrichmentQueue;
  let useCase: RefreshStaleEnrichmentsUseCase;
  const now = new Date('2026-04-22T12:00:00Z');

  beforeEach(() => {
    cache = new ScriptableEnrichmentCache();
    queue = new InMemoryMuseumEnrichmentQueue();
    useCase = new RefreshStaleEnrichmentsUseCase(cache, queue);
  });

  it('calls findStaleRows with threshold = now - 180d and SCAN_BATCH_SIZE limit', async () => {
    await useCase.execute(now);

    expect(cache.findStaleCalls).toHaveLength(1);
    const call = cache.findStaleCalls[0];
    expect(call.limit).toBe(SCAN_BATCH_SIZE);
    const expectedThresholdMs = now.getTime() - STALE_ENRICHMENT_THRESHOLD_DAYS * MS_PER_DAY;
    expect(call.threshold.getTime()).toBe(expectedThresholdMs);
  });

  it('returns zero enqueued when no stale rows found', async () => {
    cache.setStaleRows([]);

    const result = await useCase.execute(now);

    expect(result).toEqual({ enqueued: 0, skipped: 0 });
    expect(queue.snapshot()).toHaveLength(0);
  });

  it('enqueues up to SCAN_BATCH_SIZE stale rows', async () => {
    const rows = Array.from({ length: SCAN_BATCH_SIZE + 10 }, (_, i) => ({
      museumId: i + 1,
      locale: 'fr',
    }));
    cache.setStaleRows(rows);

    const result = await useCase.execute(now);

    expect(result.enqueued).toBe(SCAN_BATCH_SIZE);
    expect(result.skipped).toBe(0);
    expect(queue.snapshot()).toHaveLength(SCAN_BATCH_SIZE);
  });

  it('skips rows already having an active job (dedup via isJobActive)', async () => {
    cache.setStaleRows([
      { museumId: 1, locale: 'fr' },
      { museumId: 2, locale: 'fr' },
      { museumId: 3, locale: 'en' },
    ]);
    // Pre-flight: museum 2/fr already active, should be skipped.
    await queue.enqueue({ museumId: 2, locale: 'fr' });

    const result = await useCase.execute(now);

    expect(result).toEqual({ enqueued: 2, skipped: 1 });
    // Queue holds 3 jobs: the prewired one + the 2 freshly enqueued.
    expect(queue.snapshot()).toHaveLength(3);
  });

  it('enqueues with the exact (museumId, locale) pair returned by the cache', async () => {
    cache.setStaleRows([
      { museumId: 42, locale: 'fr' },
      { museumId: 42, locale: 'en' },
    ]);

    await useCase.execute(now);

    const jobIds = queue.snapshot().map((j) => j.jobId);
    expect(jobIds).toEqual(expect.arrayContaining(['mus:42:fr', 'mus:42:en']));
  });
});
