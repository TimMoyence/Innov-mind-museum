import type { CacheService } from '@shared/cache/cache.port';

export interface BrokenRedisOptions {
  /** 'always-throw' fails every op (deterministic). 'flaky' fails randomly N% of ops. */
  mode: 'always-throw' | 'flaky';
  /** Probability 0–1 for 'flaky' mode. Default 0.5. */
  failureRate?: number;
  /** Override error message — defaults to ECONNREFUSED-shaped. */
  errorMessage?: string;
}

/**
 * Test-only CacheService that simulates a broken Redis connection.
 *
 * Implements the full CacheService port; every method either always throws
 * (deterministic mode) or throws probabilistically (flaky mode). Use in
 * Phase 6 chaos e2e tests to assert graceful degradation paths.
 */
export class BrokenRedisCache implements CacheService {
  private callCount = 0;
  private failureCount = 0;

  constructor(private readonly opts: BrokenRedisOptions) {}

  /** Number of times any op was invoked. Useful for assertions. */
  callsMade(): number {
    return this.callCount;
  }

  /** Number of times an op actually threw. */
  failuresInjected(): number {
    return this.failureCount;
  }

  /** Reset call counters between tests. */
  reset(): void {
    this.callCount = 0;
    this.failureCount = 0;
  }

  private maybeFail(): void {
    this.callCount += 1;
    if (this.opts.mode === 'always-throw') {
      this.failureCount += 1;
      this.fail();
    }
    if (Math.random() < (this.opts.failureRate ?? 0.5)) {
      this.failureCount += 1;
      this.fail();
    }
  }

  private fail(): never {
    const err = new Error(this.opts.errorMessage ?? 'ECONNREFUSED 127.0.0.1:6379');
    (err as Error & { code: string }).code = 'ECONNREFUSED';
    throw err;
  }

  async get<T>(_key: string): Promise<T | null> {
    this.maybeFail();
    return null;
  }

  async set<T>(_key: string, _value: T, _ttlSeconds?: number): Promise<void> {
    this.maybeFail();
  }

  async del(_key: string): Promise<void> {
    this.maybeFail();
  }

  async delByPrefix(_prefix: string): Promise<void> {
    this.maybeFail();
  }

  async setNx<T>(_key: string, _value: T, _ttlSeconds: number): Promise<boolean> {
    this.maybeFail();
    return false;
  }

  async incrBy(_key: string, _amount: number, _ttlSeconds: number): Promise<number | null> {
    this.maybeFail();
    return null;
  }

  async ping(): Promise<boolean> {
    this.callCount += 1;
    if (this.opts.mode === 'always-throw') {
      // ping returns false on unreachable backend — does NOT throw, per port contract.
      return false;
    }
    return Math.random() >= (this.opts.failureRate ?? 0.5);
  }

  async zadd(_key: string, _member: string, _increment: number): Promise<void> {
    this.maybeFail();
  }

  async ztop(_key: string, _n: number): Promise<{ member: string; score: number }[]> {
    this.maybeFail();
    return [];
  }

  async destroy(): Promise<void> {
    // No-op; counters reset via reset().
  }
}
