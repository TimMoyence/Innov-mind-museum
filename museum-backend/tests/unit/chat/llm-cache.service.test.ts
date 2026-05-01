import { LlmCacheServiceImpl } from '@modules/chat/useCase/llm-cache.service';

import type { CacheService } from '@shared/cache/cache.port';
import type { LlmCacheKeyInput } from '@modules/chat/useCase/llm-cache.types';

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

const baseInput: LlmCacheKeyInput = {
  model: 'gpt-4o-mini',
  userId: 'anon',
  systemSection: 'art-default',
  locale: 'fr',
  prompt: 'Tell me about the Mona Lisa',
};

describe('LlmCacheServiceImpl', () => {
  it('classify returns "generic" with no context', () => {
    const service = new LlmCacheServiceImpl(buildMockCache());
    expect(service.classify(baseInput)).toBe('generic');
  });

  it('classify returns "museum-mode" when museumId is set', () => {
    const service = new LlmCacheServiceImpl(buildMockCache());
    expect(
      service.classify({ ...baseInput, museumContext: { museumId: 1, museumName: 'Louvre' } }),
    ).toBe('museum-mode');
  });

  it('classify returns "personalized" when userPreferencesHash is set', () => {
    const service = new LlmCacheServiceImpl(buildMockCache());
    expect(service.classify({ ...baseInput, userPreferencesHash: 'abc' })).toBe('personalized');
  });

  it('lookup returns hit=false on cache miss', async () => {
    const cache = buildMockCache();
    cache.get.mockResolvedValueOnce(null);
    const service = new LlmCacheServiceImpl(cache);
    const result = await service.lookup<{ text: string }>(baseInput);
    expect(result.hit).toBe(false);
    expect(result.value).toBeNull();
  });

  it('lookup returns hit=true and value on cache hit', async () => {
    const cache = buildMockCache();
    cache.get.mockResolvedValueOnce({ text: 'cached' });
    const service = new LlmCacheServiceImpl(cache);
    const result = await service.lookup<{ text: string }>(baseInput);
    expect(result.hit).toBe(true);
    expect(result.value).toEqual({ text: 'cached' });
  });

  it('store uses 7-day TTL for generic context', async () => {
    const cache = buildMockCache();
    const service = new LlmCacheServiceImpl(cache);
    await service.store(baseInput, { text: 'x' });
    expect(cache.set).toHaveBeenCalledWith(expect.any(String), { text: 'x' }, 7 * 24 * 60 * 60);
  });

  it('store uses 1-day TTL for museum-mode context', async () => {
    const cache = buildMockCache();
    const service = new LlmCacheServiceImpl(cache);
    await service.store(
      { ...baseInput, museumContext: { museumId: 5, museumName: 'Orsay' } },
      { text: 'x' },
    );
    expect(cache.set).toHaveBeenCalledWith(expect.any(String), { text: 'x' }, 24 * 60 * 60);
  });

  it('store uses 1-hour TTL for personalized context', async () => {
    const cache = buildMockCache();
    const service = new LlmCacheServiceImpl(cache);
    await service.store({ ...baseInput, userPreferencesHash: 'xyz' }, { text: 'x' });
    expect(cache.set).toHaveBeenCalledWith(expect.any(String), { text: 'x' }, 60 * 60);
  });

  it('invalidateMuseum calls delByPrefix for each scope', async () => {
    const cache = buildMockCache();
    cache.delByPrefix.mockResolvedValue(undefined);
    const service = new LlmCacheServiceImpl(cache);
    await service.invalidateMuseum(42);
    expect(cache.delByPrefix.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(cache.delByPrefix.mock.calls.some(([p]) => String(p).includes('42'))).toBe(true);
  });

  it('different prompts produce different keys (no collision)', async () => {
    const cache = buildMockCache();
    const service = new LlmCacheServiceImpl(cache);
    await service.store(baseInput, { text: 'a' });
    await service.store({ ...baseInput, prompt: 'Different question' }, { text: 'b' });
    expect(cache.set.mock.calls[0][0]).not.toBe(cache.set.mock.calls[1][0]);
  });

  it('same prompt + different users produce different keys (per-user scope)', async () => {
    const cache = buildMockCache();
    const service = new LlmCacheServiceImpl(cache);
    await service.store({ ...baseInput, userId: 1 }, { text: 'a' });
    await service.store({ ...baseInput, userId: 2 }, { text: 'b' });
    expect(cache.set.mock.calls[0][0]).not.toBe(cache.set.mock.calls[1][0]);
  });
});
