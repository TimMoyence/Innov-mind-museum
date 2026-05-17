// TTL semantics: values expire after `ttlSeconds`. 0 = default.

/** Zod-compatible. Avoid importing zod from port so fakes don't drag typings. */
export interface CacheValueSchema<T> {
  safeParse(raw: unknown): { success: true; data: T } | { success: false };
}

/** Shared by Redis/memory/noop adapters; swappable for tests/dev w/o Redis. */
export interface CacheService {
  /**
   * Returns `null` on miss or schema validation failure. Without schema,
   * value cast to T without runtime validation — caller owns safety.
   */
  get<T>(key: string, schema?: CacheValueSchema<T>): Promise<T | null>;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- generic interface API where T constrains input
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;

  del(key: string): Promise<void>;

  /** Pattern-based invalidation (e.g. `session:user:42:`). */
  delByPrefix(prefix: string): Promise<void>;

  /** Distributed lock pattern; returns true if set. */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- generic interface API where T constrains input
  setNx<T>(key: string, value: T, ttlSeconds: number): Promise<boolean>;

  /**
   * Atomic increment + (re)apply TTL. Returns new value, or `null` on failure
   * (caller treats null as skip — fail-soft, mirroring `set`/`del`). Used for
   * cumulative counters needing atomicity (multi-instance guardrail-judge
   * budget, rate-limit windows).
   */
  incrBy(key: string, amount: number, ttlSeconds: number): Promise<number | null>;

  ping(): Promise<boolean>;

  /** Sorted set score increment (popularity tracking). */
  zadd(key: string, member: string, increment: number): Promise<void>;

  /** Top N members by score descending. */
  ztop(key: string, n: number): Promise<{ member: string; score: number }[]>;

  /** Release long-lived resources at process shutdown. */
  destroy?(): Promise<void>;
}
