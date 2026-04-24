import { PurgeDeadEnrichmentsUseCase } from '@modules/museum/useCase/purgeDeadEnrichments.useCase';

import type { MuseumEnrichmentCachePort } from '@modules/museum/domain/ports/museum-enrichment-cache.port';
import type { MuseumEnrichmentView } from '@modules/museum/domain/enrichment.types';

/**
 * Scriptable cache double — records every `deleteStaleSince` call and returns
 * a prewired count so tests can assert both the query shape and the result.
 */
class ScriptableEnrichmentCache implements MuseumEnrichmentCachePort {
  readonly deleteCalls: { threshold: Date }[] = [];
  private deletedCount = 0;
  private deleteError: Error | null = null;

  setDeletedCount(count: number): void {
    this.deletedCount = count;
  }

  setDeleteError(err: Error): void {
    this.deleteError = err;
  }

  async findFresh(): Promise<MuseumEnrichmentView | null> {
    return null;
  }

  async upsert(): Promise<void> {
    // no-op for these tests
  }

  async findStaleRows(): Promise<{ museumId: number; locale: string }[]> {
    return [];
  }

  async deleteStaleSince(threshold: Date): Promise<number> {
    this.deleteCalls.push({ threshold });
    if (this.deleteError) {
      throw this.deleteError;
    }
    return this.deletedCount;
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1_000;

describe('PurgeDeadEnrichmentsUseCase', () => {
  let cache: ScriptableEnrichmentCache;
  let useCase: PurgeDeadEnrichmentsUseCase;
  const now = new Date('2026-04-22T12:00:00Z');

  beforeEach(() => {
    cache = new ScriptableEnrichmentCache();
    useCase = new PurgeDeadEnrichmentsUseCase(cache);
  });

  it('calls deleteStaleSince with threshold = now - thresholdDays (UTC-safe arithmetic)', async () => {
    await useCase.execute(now, 180);

    expect(cache.deleteCalls).toHaveLength(1);
    const call = cache.deleteCalls[0];
    const expectedThresholdMs = now.getTime() - 180 * MS_PER_DAY;
    expect(call.threshold.getTime()).toBe(expectedThresholdMs);
  });

  it('returns { deleted: N } forwarded from the repo', async () => {
    cache.setDeletedCount(3);

    const result = await useCase.execute(now, 180);

    expect(result).toEqual({ deleted: 3 });
  });

  it('returns { deleted: 0 } when nothing matches', async () => {
    cache.setDeletedCount(0);

    const result = await useCase.execute(now, 180);

    expect(result).toEqual({ deleted: 0 });
    expect(cache.deleteCalls).toHaveLength(1);
  });

  it('respects the threshold parameter (not a hard-coded constant)', async () => {
    await useCase.execute(now, 30);

    const call = cache.deleteCalls[0];
    expect(call.threshold.getTime()).toBe(now.getTime() - 30 * MS_PER_DAY);
  });

  it('swallows repo errors and returns { deleted: 0 } (fail-open, mirrors refresh scan)', async () => {
    cache.setDeleteError(new Error('db connection lost'));

    const result = await useCase.execute(now, 180);

    expect(result).toEqual({ deleted: 0 });
    expect(cache.deleteCalls).toHaveLength(1);
  });

  it('defaults to new Date() when now is omitted', async () => {
    const before = Date.now();
    await useCase.execute(undefined, 180);
    const after = Date.now();

    const call = cache.deleteCalls[0];
    const thresholdMs = call.threshold.getTime();
    // threshold must be exactly 180 days before a timestamp between before/after
    expect(thresholdMs).toBeGreaterThanOrEqual(before - 180 * MS_PER_DAY);
    expect(thresholdMs).toBeLessThanOrEqual(after - 180 * MS_PER_DAY);
  });
});
