import type { CacheService } from '@shared/cache/cache.port';

/**
 * Creates an in-memory mock CacheService for unit testing.
 * All operations are synchronous Map-based — no Redis needed.
 * Exposes internal Maps for test assertions.
 */
export function makeMockCache(): CacheService & {
  /** Inspect the raw store for assertions. */
  readonly store: Map<string, unknown>;
  /** Inspect the raw sorted sets for assertions. */
  readonly zsets: Map<string, Map<string, number>>;
} {
  const store = new Map<string, unknown>();
  const zsets = new Map<string, Map<string, number>>();

  return {
    store,
    zsets,

    async get<T>(key: string): Promise<T | null> {
      const val = store.get(key);
      return val !== undefined ? (val as T) : null;
    },

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- mirrors CacheService generic interface
    async set<T>(key: string, value: T, _ttlSeconds?: number): Promise<void> {
      store.set(key, value);
    },

    async del(key: string): Promise<void> {
      store.delete(key);
    },

    async delByPrefix(prefix: string): Promise<void> {
      for (const k of store.keys()) {
        if (k.startsWith(prefix)) store.delete(k);
      }
    },

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- mirrors CacheService generic interface
    async setNx<T>(key: string, value: T, _ttlSeconds: number): Promise<boolean> {
      if (store.has(key)) return false;
      store.set(key, value);
      return true;
    },

    async ping(): Promise<boolean> {
      return true;
    },

    async zadd(key: string, member: string, increment: number): Promise<void> {
      if (!zsets.has(key)) zsets.set(key, new Map());
      const zset = zsets.get(key)!;
      zset.set(member, (zset.get(member) ?? 0) + increment);
    },

    async ztop(key: string, n: number): Promise<{ member: string; score: number }[]> {
      const zset = zsets.get(key);
      if (!zset) return [];
      return [...zset.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([member, score]) => ({ member, score }));
    },
  };
}
