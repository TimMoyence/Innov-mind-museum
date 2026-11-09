import { LlmCacheServiceImpl } from '@modules/chat/useCase/llm/llm-cache.service';

import type { CacheService } from '@shared/cache/cache.port';

const buildMockCache = (): jest.Mocked<CacheService> =>
  ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    delByPrefix: jest.fn(),
    setNx: jest.fn(),
    ping: jest.fn(),
    zadd: jest.fn(),
  }) as unknown as jest.Mocked<CacheService>;

describe('admin → invalidateMuseum cache contract', () => {
  it('purges both museum-mode and personalized buckets for the museumId', async () => {
    const cache = buildMockCache();
    cache.delByPrefix.mockResolvedValue(undefined);
    const service = new LlmCacheServiceImpl(cache);

    await service.invalidateMuseum(42);

    expect(cache.delByPrefix).toHaveBeenCalledWith('llm:v4:museum-mode:42:');
    expect(cache.delByPrefix).toHaveBeenCalledWith('llm:v4:personalized:42:');
    expect(cache.delByPrefix).toHaveBeenCalledTimes(2);
  });

  it('does not touch the generic bucket — generic entries are not museum-scoped', async () => {
    const cache = buildMockCache();
    cache.delByPrefix.mockResolvedValue(undefined);
    const service = new LlmCacheServiceImpl(cache);

    await service.invalidateMuseum(7);

    const calls = cache.delByPrefix.mock.calls.map((c) => c[0]);
    expect(calls.some((p) => p.includes(':generic:'))).toBe(false);
  });

  it('continues purging the second bucket even when the first delByPrefix throws (fail-open)', async () => {
    const cache = buildMockCache();
    cache.delByPrefix
      .mockRejectedValueOnce(new Error('redis is sad'))
      .mockResolvedValueOnce(undefined);
    const service = new LlmCacheServiceImpl(cache);

    await expect(service.invalidateMuseum(99)).resolves.toBeUndefined();
    expect(cache.delByPrefix).toHaveBeenCalledTimes(2);
    expect(cache.delByPrefix).toHaveBeenNthCalledWith(1, 'llm:v4:museum-mode:99:');
    expect(cache.delByPrefix).toHaveBeenNthCalledWith(2, 'llm:v4:personalized:99:');
  });

  it('uses the same key shape the cache lookup writes to', async () => {
    const writtenKeys: string[] = [];
    const cache = {
      ...buildMockCache(),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockImplementation((key: string) => {
        writtenKeys.push(key);
        return Promise.resolve();
      }),
      delByPrefix: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<CacheService>;

    const service = new LlmCacheServiceImpl(cache);

    await service.store(
      {
        model: 'gpt-4o-mini',
        userId: 1,
        systemSection: 'art-default',
        locale: 'fr',
        prompt: 'Tell me about the Mona Lisa',
        museumContext: { museumId: 7, museumName: 'Louvre' },
      },
      { text: 'art' },
    );
    await service.store(
      {
        model: 'gpt-4o-mini',
        userId: 1,
        systemSection: 'art-default',
        locale: 'fr',
        prompt: 'Tell me about the Mona Lisa',
        museumContext: { museumId: 7, museumName: 'Louvre' },
        userPreferencesHash: 'pref-1',
      },
      { text: 'art (personalized)' },
    );

    await service.invalidateMuseum(7);

    expect(writtenKeys[0]).toMatch(/^llm:v4:museum-mode:7:/);
    expect(writtenKeys[1]).toMatch(/^llm:v4:personalized:7:/);
    expect(cache.delByPrefix).toHaveBeenCalledWith('llm:v4:museum-mode:7:');
    expect(cache.delByPrefix).toHaveBeenCalledWith('llm:v4:personalized:7:');
  });
});
