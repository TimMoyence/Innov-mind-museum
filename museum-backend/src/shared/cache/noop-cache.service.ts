import type { CacheService } from './cache.port';

/** No-op cache implementation for tests and environments without Redis. */
export class NoopCacheService implements CacheService {
  /** Returns null immediately (no-op). */
  // eslint-disable-next-line @typescript-eslint/require-await -- must match async CacheService interface
  async get<T>(): Promise<T | null> {
    return null;
  }

  /** Does nothing (no-op). */
  async set(): Promise<void> {
    // no-op
  }

  /** Does nothing (no-op). */
  async del(): Promise<void> {
    // no-op
  }

  /** Does nothing (no-op). */
  async delByPrefix(): Promise<void> {
    // no-op
  }

  /** Always returns true (no-op). */
  // eslint-disable-next-line @typescript-eslint/require-await -- must match async CacheService interface
  async setNx(): Promise<boolean> {
    return true;
  }

  /** Always returns true (no-op — no real cache to check). */
  // eslint-disable-next-line @typescript-eslint/require-await -- must match async CacheService interface
  async ping(): Promise<boolean> {
    return true;
  }
}
