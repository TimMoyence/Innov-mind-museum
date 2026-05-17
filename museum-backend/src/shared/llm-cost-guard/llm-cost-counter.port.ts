/**
 * Per-user daily LLM cost counter (P0-4). Key `(userId, day)` where `day` is
 * ISO `YYYY-MM-DD` UTC. Production: RedisLlmCostCounter.
 *
 * Contract:
 *   - `get` returns 0 (never undefined) for unincremented bucket.
 *   - `increment` is atomic — production MUST use single round-trip (INCRBYFLOAT
 *     + EXPIRE in one Lua script, see `redis-rate-limit-store.ts`).
 *   - Both throw on store unavailability → guard fail-CLOSED LLM_COST_GUARD_REDIS_UNAVAILABLE.
 */
export interface LlmCostCounter {
  /** Returns 0 (never undefined) for unincremented bucket. */
  get(userId: string, day: string): Promise<number>;

  /** Atomic. 25h TTL applied only on first INCR of day (no sliding expiry). `dollars` ≥ 0 (no debits). */
  increment(userId: string, day: string, dollars: number): Promise<number>;
}
