import type { CacheService } from '@shared/cache/cache.port';

/** Shared mock CacheService factory. All methods are no-op jest.fn(). */
export const makeCache = (
  overrides: Partial<jest.Mocked<CacheService>> = {},
): jest.Mocked<CacheService> => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  delByPrefix: jest.fn().mockResolvedValue(undefined),
  setNx: jest.fn().mockResolvedValue(true),
  ping: jest.fn().mockResolvedValue(true),
  ...overrides,
});
