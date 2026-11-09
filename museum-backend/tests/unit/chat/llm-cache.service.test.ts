import { LlmCacheServiceImpl } from '@modules/chat/useCase/llm/llm-cache.service';

import type { CacheService } from '@shared/cache/cache.port';
import type { LlmCacheKeyInput } from '@modules/chat/useCase/llm/llm-cache.types';

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
    expect(cache.delByPrefix.mock.calls.some(([p]) => p.includes('42'))).toBe(true);
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

  describe('fail-open on cache exceptions (R8)', () => {
    it('lookup returns hit=false when cache.get throws (Redis down / network)', async () => {
      const cache = buildMockCache();
      cache.get.mockRejectedValueOnce(new Error('redis unreachable'));
      const service = new LlmCacheServiceImpl(cache);

      const result = await service.lookup<{ text: string }>(baseInput);

      expect(result.hit).toBe(false);
      expect(result.value).toBeNull();
    });

    it('lookup propagates the contextClass on fail-open so callers can log it', async () => {
      const cache = buildMockCache();
      cache.get.mockRejectedValueOnce(new Error('boom'));
      const service = new LlmCacheServiceImpl(cache);

      const result = await service.lookup<{ text: string }>({
        ...baseInput,
        museumContext: { museumId: 5, museumName: 'Orsay' },
      });

      expect(result.hit).toBe(false);
      expect(result.contextClass).toBe('museum-mode');
    });

    it('store does not throw when cache.set rejects', async () => {
      const cache = buildMockCache();
      cache.set.mockRejectedValueOnce(new Error('OOM redis'));
      const service = new LlmCacheServiceImpl(cache);

      await expect(service.store(baseInput, { text: 'x' })).resolves.toBeUndefined();
    });

    it('lookup logs the failure with structured fields {layer, requestId, error}', async () => {
      const loggerSpy = jest.spyOn(require('@shared/logger/logger').logger, 'warn');
      const cache = buildMockCache();
      cache.get.mockRejectedValueOnce(new Error('boom'));
      const service = new LlmCacheServiceImpl(cache);

      await service.lookup<{ text: string }>(baseInput);

      expect(loggerSpy).toHaveBeenCalledWith(
        'llm_cache_lookup_failed',
        expect.objectContaining({
          layer: 'l1',
          contextClass: 'generic',
          error: 'boom',
        }),
      );
      loggerSpy.mockRestore();
    });
  });

  describe('F1 — voiceMode / audioDescriptionMode key discrimination (KEY_VERSION v3)', () => {
    it('A — two inputs differing only in voiceMode produce different keys', async () => {
      const cache = buildMockCache();
      const service = new LlmCacheServiceImpl(cache);

      await service.store(baseInput, { text: 'long-prose' });
      await service.store({ ...baseInput, voiceMode: true }, { text: 'short-voice' });

      const keyNoVoice = String(cache.set.mock.calls[0][0]);
      const keyVoice = String(cache.set.mock.calls[1][0]);
      expect(keyNoVoice).not.toBe(keyVoice);
    });

    it('B — two inputs differing only in audioDescriptionMode produce different keys', async () => {
      const cache = buildMockCache();
      const service = new LlmCacheServiceImpl(cache);

      await service.store({ ...baseInput, audioDescriptionMode: false }, { text: 'normal' });
      await service.store({ ...baseInput, audioDescriptionMode: true }, { text: 'alt-text' });

      const keyNormal = String(cache.set.mock.calls[0][0]);
      const keyAltText = String(cache.set.mock.calls[1][0]);
      expect(keyNormal).not.toBe(keyAltText);
    });

    it('C — golden-hash for canonical input without voiceMode/audioDescriptionMode', async () => {
      const cache = buildMockCache();
      const service = new LlmCacheServiceImpl(cache);

      await service.store(baseInput, { text: 'x' });

      const key = String(cache.set.mock.calls[0][0]);
      expect(key).toBe('llm:v4:generic:none:anon:6c3364ef2dd9937a4a72638ab32b67b8');
    });

    it('D — buildKey output contains the `:v4:` version segment', async () => {
      const cache = buildMockCache();
      const service = new LlmCacheServiceImpl(cache);

      await service.store(baseInput, { text: 'x' });

      const key = String(cache.set.mock.calls[0][0]);
      expect(key).toContain(':v4:');
      expect(key).not.toContain(':v3:');
    });
  });

  describe('US-12.2 — lowDataMode key discrimination (KEY_VERSION v3)', () => {
    it('INV-21 — two inputs differing only in lowDataMode produce different keys', async () => {
      const cache = buildMockCache();
      const service = new LlmCacheServiceImpl(cache);

      await service.store(baseInput, { text: 'normal-length' });
      await service.store({ ...baseInput, lowDataMode: true }, { text: 'concise-low' });

      const keyNormal = String(cache.set.mock.calls[0][0]);
      const keyLow = String(cache.set.mock.calls[1][0]);
      expect(keyNormal).not.toBe(keyLow);
    });

    it('INV-21 — lowDataMode:false folds to the absent-field canonical (truthy-only emit)', async () => {
      const cache = buildMockCache();
      const service = new LlmCacheServiceImpl(cache);

      await service.store(baseInput, { text: 'x' });
      await service.store({ ...baseInput, lowDataMode: false }, { text: 'x' });

      expect(String(cache.set.mock.calls[0][0])).toBe(String(cache.set.mock.calls[1][0]));
    });
  });
});
