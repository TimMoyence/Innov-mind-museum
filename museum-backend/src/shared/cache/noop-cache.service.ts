import type { CacheService } from './cache.port';

export class NoopCacheService implements CacheService {
  get<T>(): Promise<T | null> {
    return Promise.resolve(null);
  }

  set(): Promise<void> {
    return Promise.resolve();
  }

  del(): Promise<void> {
    return Promise.resolve();
  }

  delByPrefix(): Promise<void> {
    return Promise.resolve();
  }

  setNx(): Promise<boolean> {
    return Promise.resolve(true);
  }

  incrBy(): Promise<number | null> {
    return Promise.resolve(null);
  }

  ping(): Promise<boolean> {
    return Promise.resolve(true);
  }

  zadd(): Promise<void> {
    return Promise.resolve();
  }

  ztop(): Promise<{ member: string; score: number }[]> {
    return Promise.resolve([]);
  }
}
