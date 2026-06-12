/**
 * C1 Phase 1 PR-A — admin museum cache invalidation contract test.
 *
 * Pins the {@link LlmCacheServiceImpl.invalidateMuseum} contract at the
 * boundary the admin path consumes (museum profile update + admin cache
 * purge route). Spec R9 (`team-state/2026-05-08-c1-chat-fast/spec.md` §3)
 * requires that BOTH `museum-mode` and `personalized` context-class buckets
 * are purged on a single invalidation call — this test asserts both
 * `delByPrefix` invocations carry the canonical key shape
 * `llm:v3:{contextClass}:{museumId}:` so a future refactor that drops one
 * bucket trips a clear failure. (KEY_VERSION bumped v1→v2 on 2026-05-19
 * audit-360-w2 T1-GREEN to isolate pre-F1 canonical-input entries ; bumped
 * v2→v3 on 2026-06-12 for the lowDataMode dimension — US-12.2/INV-21, run
 * undefined-network-detection-reliability.)
 *
 * Lives under `tests/integration/admin/` because the contract is consumed
 * by the admin module ; the cache itself is exercised against a mocked
 * {@link CacheService} (no testcontainer needed — the SQL-level invalidation
 * paths are exhaustively covered in `tests/unit/chat/llm-cache.service.test.ts`).
 */
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

    expect(cache.delByPrefix).toHaveBeenCalledWith('llm:v3:museum-mode:42:');
    expect(cache.delByPrefix).toHaveBeenCalledWith('llm:v3:personalized:42:');
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
    expect(cache.delByPrefix).toHaveBeenNthCalledWith(1, 'llm:v3:museum-mode:99:');
    expect(cache.delByPrefix).toHaveBeenNthCalledWith(2, 'llm:v3:personalized:99:');
  });

  it('uses the same key shape the cache lookup writes to', async () => {
    // Round-trip pin — store something under each context_class for museumId
    // 7, then invalidate, and confirm the prefix used to delete matches the
    // prefix the keys were written under.
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

    expect(writtenKeys[0]).toMatch(/^llm:v3:museum-mode:7:/);
    expect(writtenKeys[1]).toMatch(/^llm:v3:personalized:7:/);
    expect(cache.delByPrefix).toHaveBeenCalledWith('llm:v3:museum-mode:7:');
    expect(cache.delByPrefix).toHaveBeenCalledWith('llm:v3:personalized:7:');
  });
});
