import type { CacheService } from '@shared/cache/cache.port';

export function makeMockCache(): CacheService & {
  readonly store: Map<string, unknown>;
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

    async setNx<T>(key: string, value: T, _ttlSeconds: number): Promise<boolean> {
      if (store.has(key)) return false;
      store.set(key, value);
      return true;
    },

    async incrBy(key: string, amount: number, _ttlSeconds: number): Promise<number | null> {
      if (!Number.isFinite(amount) || amount === 0) return null;
      const current = store.has(key) ? Number(store.get(key)) : 0;
      const next = (Number.isFinite(current) ? current : 0) + Math.trunc(amount);
      store.set(key, next);
      return next;
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
