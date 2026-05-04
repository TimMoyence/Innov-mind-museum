import { LowDataPackService } from '@modules/museum/useCase/search/low-data-pack.service';
import { makeMockCache } from 'tests/helpers/chat/cacheService.fixtures';

import type { MuseumQaSeedRepository } from '@modules/museum/domain/qa-seed/museumQaSeed.repository.interface';
import type { MuseumQaSeed } from '@modules/museum/domain/qa-seed/museumQaSeed.entity';
import type { CacheService } from '@shared/cache/cache.port';

/**
 * Creates a mock seed repository with configurable results.
 * @param seeds
 */
function makeMockSeedRepo(seeds: MuseumQaSeed[] = []): MuseumQaSeedRepository {
  return {
    findByMuseumAndLocale: async (_museumId: string, _locale: string) =>
      seeds.filter((s) => s.museumId === _museumId && s.locale === _locale),
  };
}

/**
 * Creates a MuseumQaSeed fixture.
 * @param overrides
 */
function makeSeed(overrides: Partial<MuseumQaSeed> = {}): MuseumQaSeed {
  return {
    id: 'seed-1',
    museumId: 'museum-1',
    locale: 'fr',
    question: 'Qui a peint la Joconde ?',
    answer: 'Leonard de Vinci a peint la Joconde.',
    metadata: {},
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

/**
 * Populates the mock cache with a cached entry and its popularity score.
 * @param cache
 * @param museumId
 * @param key
 * @param entry
 * @param entry.originalText
 * @param entry.locale
 * @param entry.text
 * @param entry.metadata
 * @param score
 */
async function seedCacheEntry(
  cache: CacheService,
  museumId: string,
  key: string,
  entry: { originalText: string; locale: string; text: string; metadata?: Record<string, unknown> },
  score: number,
): Promise<void> {
  await cache.set(key, entry);
  await cache.zadd(`chat:llm:popular:${museumId}`, key, score);
}

describe('LowDataPackService', () => {
  const MUSEUM_ID = 'museum-1';
  const LOCALE = 'fr';
  const MAX_ENTRIES = 10;

  it('returns popular cached entries + seeded entries merged', async () => {
    const cache = makeMockCache();
    const seeds = [makeSeed()];
    const seedRepo = makeMockSeedRepo(seeds);
    const service = new LowDataPackService(cache, seedRepo, MAX_ENTRIES);

    await seedCacheEntry(
      cache,
      MUSEUM_ID,
      'cache:key:1',
      {
        originalText: 'Horaires du musee ?',
        locale: 'fr',
        text: 'Le musee est ouvert de 9h a 18h.',
        metadata: { category: 'info' },
      },
      42,
    );

    const pack = await service.getLowDataPack(MUSEUM_ID, LOCALE);

    expect(pack.museumId).toBe(MUSEUM_ID);
    expect(pack.locale).toBe(LOCALE);
    expect(pack.generatedAt).toBeDefined();
    expect(pack.entries).toHaveLength(2);

    const cached = pack.entries[0];
    expect(cached.source).toBe('cache');
    expect(cached.question).toBe('Horaires du musee ?');
    expect(cached.answer).toBe('Le musee est ouvert de 9h a 18h.');
    expect(cached.hits).toBe(42);
    expect(cached.metadata).toEqual({ category: 'info' });

    const seeded = pack.entries[1];
    expect(seeded.source).toBe('seeded');
    expect(seeded.question).toBe('Qui a peint la Joconde ?');
    expect(seeded.answer).toBe('Leonard de Vinci a peint la Joconde.');
    expect(seeded.hits).toBeUndefined();
  });

  it('returns only seeded entries when cache is empty', async () => {
    const cache = makeMockCache();
    const seeds = [makeSeed(), makeSeed({ id: 'seed-2', question: 'Q2', answer: 'A2' })];
    const seedRepo = makeMockSeedRepo(seeds);
    const service = new LowDataPackService(cache, seedRepo, MAX_ENTRIES);

    const pack = await service.getLowDataPack(MUSEUM_ID, LOCALE);

    expect(pack.entries).toHaveLength(2);
    expect(pack.entries.every((e) => e.source === 'seeded')).toBe(true);
  });

  it('returns empty entries when both cache and seeds are empty', async () => {
    const cache = makeMockCache();
    const seedRepo = makeMockSeedRepo([]);
    const service = new LowDataPackService(cache, seedRepo, MAX_ENTRIES);

    const pack = await service.getLowDataPack(MUSEUM_ID, LOCALE);

    expect(pack.entries).toHaveLength(0);
    expect(pack.museumId).toBe(MUSEUM_ID);
    expect(pack.locale).toBe(LOCALE);
  });

  it('is fail-open when cache.ztop throws', async () => {
    const cache = makeMockCache();
    const seeds = [makeSeed()];
    const seedRepo = makeMockSeedRepo(seeds);
    const service = new LowDataPackService(cache, seedRepo, MAX_ENTRIES);

    // Override ztop to throw
    cache.ztop = async () => {
      throw new Error('Redis connection lost');
    };

    const pack = await service.getLowDataPack(MUSEUM_ID, LOCALE);

    // Should still return seeded entries despite cache failure
    expect(pack.entries).toHaveLength(1);
    expect(pack.entries[0].source).toBe('seeded');
  });

  it('filters cached entries by locale', async () => {
    const cache = makeMockCache();
    const seedRepo = makeMockSeedRepo([]);
    const service = new LowDataPackService(cache, seedRepo, MAX_ENTRIES);

    // Add a French entry and an English entry
    await seedCacheEntry(
      cache,
      MUSEUM_ID,
      'cache:fr:1',
      {
        originalText: 'Question FR',
        locale: 'fr',
        text: 'Reponse FR',
      },
      10,
    );
    await seedCacheEntry(
      cache,
      MUSEUM_ID,
      'cache:en:1',
      {
        originalText: 'Question EN',
        locale: 'en',
        text: 'Answer EN',
      },
      20,
    );

    const packFr = await service.getLowDataPack(MUSEUM_ID, 'fr');
    expect(packFr.entries).toHaveLength(1);
    expect(packFr.entries[0].question).toBe('Question FR');

    const packEn = await service.getLowDataPack(MUSEUM_ID, 'en');
    expect(packEn.entries).toHaveLength(1);
    expect(packEn.entries[0].question).toBe('Question EN');
  });
});
