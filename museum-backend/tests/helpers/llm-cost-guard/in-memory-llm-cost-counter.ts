import type { LlmCostCounter } from '@shared/llm-cost-guard/llm-cost-counter.port';

/**
 * Test double for {@link LlmCostCounter}. Stores running daily totals in a
 * plain Map keyed by `${userId}:${YYYY-MM-DD}`. Mirrors the production
 * Redis-backed counter contract closely enough to drive the unit tests for
 * {@link LlmCostGuard} without spinning a Redis testcontainer.
 *
 * Used in the P0-4 red-phase suite (`llm-cost-guard.test.ts`).
 */
export class InMemoryLlmCostCounter implements LlmCostCounter {
  private readonly totals = new Map<string, number>();

  /**
   * Pre-seed a user's running daily total (USD).
   * @param userId
   * @param day
   * @param dollars
   */
  seed(userId: string, day: string, dollars: number): void {
    this.totals.set(`${userId}:${day}`, dollars);
  }

  /**
   * Read the current running daily total (USD), 0 when unset.
   * @param userId
   * @param day
   */
  async get(userId: string, day: string): Promise<number> {
    return this.totals.get(`${userId}:${day}`) ?? 0;
  }

  /**
   * Atomically increment a user's running daily total. Returns the new total.
   * In production this is a single Redis INCRBYFLOAT + PEXPIRE Lua call; here
   * we approximate the contract without the atomicity guarantee — single-
   * threaded tests don't race.
   * @param userId
   * @param day
   * @param dollars
   */
  async increment(userId: string, day: string, dollars: number): Promise<number> {
    const key = `${userId}:${day}`;
    const next = (this.totals.get(key) ?? 0) + dollars;
    this.totals.set(key, next);
    return next;
  }
}

/**
 * Test double that simulates a Redis outage: every method rejects.
 * Drives the fail-CLOSED contract test — the guard MUST deny the call
 * (not let it through) when the cost store is unreachable.
 */
export class FailingLlmCostCounter implements LlmCostCounter {
  private readonly reason: Error;

  constructor(reason = 'Redis connection refused') {
    this.reason = new Error(reason);
  }

  async get(): Promise<number> {
    throw this.reason;
  }

  async increment(): Promise<number> {
    throw this.reason;
  }
}
