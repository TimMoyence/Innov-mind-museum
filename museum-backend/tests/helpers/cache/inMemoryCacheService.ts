import type { CacheService } from '@shared/cache/cache.port';

/** In-memory CacheService for tests. Supports TTL tracking but does not auto-expire. */
export class InMemoryCacheService implements CacheService {
  private readonly store = new Map<string, { value: unknown; expiresAt?: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async delByPrefix(prefix: string): Promise<void> {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  async setNx<T>(key: string, value: T, ttlSeconds: number): Promise<boolean> {
    const existing = this.store.get(key);
    if (existing && (!existing.expiresAt || Date.now() <= existing.expiresAt)) return false;
    await this.set(key, value, ttlSeconds);
    return true;
  }

  /** Test helper: check if a key exists. */
  has(key: string): boolean {
    return this.store.has(key);
  }

  /** Test helper: clear all entries. */
  clear(): void {
    this.store.clear();
  }
}
