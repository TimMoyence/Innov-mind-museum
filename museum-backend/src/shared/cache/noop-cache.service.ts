import type { CacheService } from './cache.port';

/** No-op cache for tests and environments without Redis. */
export class NoopCacheService implements CacheService {
  // eslint-disable-next-line @typescript-eslint/require-await -- must match async CacheService interface
  async get<T>(): Promise<T | null> {
    return null;
  }

  async set(): Promise<void> {
    // no-op
  }

  async del(): Promise<void> {
    // no-op
  }

  async delByPrefix(): Promise<void> {
    // no-op
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- must match async CacheService interface
  async setNx(): Promise<boolean> {
    return true;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- must match async CacheService interface
  async incrBy(): Promise<number | null> {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- must match async CacheService interface
  async ping(): Promise<boolean> {
    return true;
  }

  async zadd(): Promise<void> {
    // no-op
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- must match async CacheService interface
  async ztop(): Promise<{ member: string; score: number }[]> {
    return [];
  }
}
