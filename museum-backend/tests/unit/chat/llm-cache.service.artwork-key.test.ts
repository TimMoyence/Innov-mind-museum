import { LlmCacheServiceImpl } from '@modules/chat/useCase/llm/llm-cache.service';

import type { CacheService } from '@shared/cache/cache.port';
import type { LlmCacheKeyInput } from '@modules/chat/useCase/llm/llm-cache.types';

jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

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
  systemSection: 'chat-default',
  locale: 'fr',
  prompt: 'Tell me about this painting',
  museumContext: { museumId: 42, museumName: 'Aquitaine' },
};

const inputWithArtwork = (
  base: LlmCacheKeyInput,
  currentArtworkKey: string | undefined,
): LlmCacheKeyInput => ({ ...base, currentArtworkKey }) as unknown as LlmCacheKeyInput;

const hashFromStoredKey = async (
  service: LlmCacheServiceImpl,
  cache: jest.Mocked<CacheService>,
  input: LlmCacheKeyInput,
): Promise<string> => {
  cache.set.mockClear();
  await service.store(input, { text: 'sentinel' });
  const lastCall = cache.set.mock.calls.at(-1);
  if (!lastCall) {
    throw new Error('cache.set was not called — service.store contract changed');
  }
  const key = String(lastCall[0]);
  const match = /^llm:v4:[a-z-]+:[0-9a-z-]+:[0-9a-z-]+:([0-9a-f]{32})$/.exec(key);
  if (!match) {
    throw new Error(`cache key shape unexpected : ${key}`);
  }
  return match[1];
};

describe('I-FIX2 — LlmCacheServiceImpl folds currentArtworkKey (R-IFIX2)', () => {
  let legacyHashSnapshot: string;

  beforeAll(async () => {
    const cache = buildMockCache();
    const service = new LlmCacheServiceImpl(cache);
    legacyHashSnapshot = await hashFromStoredKey(service, cache, baseInput);
  });

  it('Test 1 — two inputs differing ONLY by currentArtworkKey produce DIFFERENT cache keys (R-IFIX2 core)', async () => {
    const cache = buildMockCache();
    const service = new LlmCacheServiceImpl(cache);

    const hashA = await hashFromStoredKey(service, cache, inputWithArtwork(baseInput, 'A'));
    const hashB = await hashFromStoredKey(service, cache, inputWithArtwork(baseInput, 'B'));

    expect(hashA).not.toBe(hashB);
  });

  it('Test 2 — input with currentArtworkKey:undefined produces a hash BYTE-IDENTICAL to the legacy snapshot (no-regression, R-IFIX2 R8/AC6-mirror)', async () => {
    const cache = buildMockCache();
    const service = new LlmCacheServiceImpl(cache);

    const hashUndef = await hashFromStoredKey(
      service,
      cache,
      inputWithArtwork(baseInput, undefined),
    );

    expect(hashUndef).toBe(legacyHashSnapshot);
  });

  it('Test 3 — truthy-only fold : currentArtworkKey === "" (empty string) produces the SAME hash as undefined, byte-identical to legacy snapshot', async () => {
    const cache = buildMockCache();
    const service = new LlmCacheServiceImpl(cache);

    const hashEmpty = await hashFromStoredKey(service, cache, inputWithArtwork(baseInput, ''));
    const hashUndef = await hashFromStoredKey(
      service,
      cache,
      inputWithArtwork(baseInput, undefined),
    );

    expect(hashEmpty).toBe(hashUndef);
    expect(hashEmpty).toBe(legacyHashSnapshot);
  });
});
