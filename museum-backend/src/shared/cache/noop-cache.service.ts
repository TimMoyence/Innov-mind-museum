import type { CacheService } from './cache.port';

/** No-op cache implementation for tests and environments without Redis. */
export class NoopCacheService implements CacheService {
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

  async setNx(): Promise<boolean> {
    return true;
  }
}
