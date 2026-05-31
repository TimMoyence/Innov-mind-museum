import type { CacheService } from '@shared/cache/cache.port';
import type { LlmCacheKeyInput } from '@modules/chat/useCase/llm/llm-cache.types';

/**
 * Shared mock CacheService factory. All methods are no-op jest.fn().
 * @param overrides
 */
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

/**
 * Shared factory for `LlmCacheKeyInput` (ADR-036 cache-key derivation).
 * Sane defaults cover the required fields (model/userId/systemSection/locale/
 * prompt); `overrides` is spread last so any field — including the optional
 * `museumContext` / `userPreferencesHash` / `voiceMode` / `audioDescriptionMode`
 * — is overridable. Return-type annotated (no `as` cast); mirrors the
 * canonical base used by the cache-key parity contract test.
 * @param overrides
 */
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
