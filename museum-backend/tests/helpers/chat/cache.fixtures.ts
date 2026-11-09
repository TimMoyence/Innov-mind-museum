import type { CacheService } from '@shared/cache/cache.port';
import type { LlmCacheKeyInput } from '@modules/chat/useCase/llm/llm-cache.types';

export const makeCache = (
  overrides: Partial<jest.Mocked<CacheService>> = {},
): jest.Mocked<CacheService> => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  delByPrefix: jest.fn().mockResolvedValue(undefined),
  setNx: jest.fn().mockResolvedValue(true),
  incrBy: jest.fn().mockResolvedValue(null),
  ping: jest.fn().mockResolvedValue(true),
  zadd: jest.fn().mockResolvedValue(undefined),
  ztop: jest.fn().mockResolvedValue([]),
  ...overrides,
});

export const makeLlmCacheKeyInput = (
  overrides: Partial<LlmCacheKeyInput> = {},
): LlmCacheKeyInput => ({
  model: 'gpt-4o-mini',
  userId: 'anon',
  systemSection: 'art-default',
  locale: 'fr',
  prompt: 'Tell me about the Mona Lisa',
  ...overrides,
});
