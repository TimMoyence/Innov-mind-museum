export interface CacheValueSchema<T> {
  safeParse(raw: unknown): { success: true; data: T } | { success: false };
}

export interface CacheService {
  get<T>(key: string, schema?: CacheValueSchema<T>): Promise<T | null>;

  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;

  del(key: string): Promise<void>;

  delByPrefix(prefix: string): Promise<void>;

  setNx(key: string, value: unknown, ttlSeconds: number): Promise<boolean>;

  incrBy(key: string, amount: number, ttlSeconds: number): Promise<number | null>;

  ping(): Promise<boolean>;

  zadd(key: string, member: string, increment: number): Promise<void>;

  ztop(key: string, n: number): Promise<{ member: string; score: number }[]>;

  destroy?(): Promise<void>;
}
