/**
 * Port for the per-user daily LLM cost counter.
 *
 * Implementations store a running `dollars-spent` total keyed by
 * `(userId, day)` where `day` is an ISO `YYYY-MM-DD` UTC date string.
 * Production uses `RedisLlmCostCounter`; the test suite uses the
 * in-memory double at `tests/helpers/llm-cost-guard/in-memory-llm-cost-counter.ts`.
 *
 * Contract:
 *   - `get` returns 0 (not undefined) for a never-incremented bucket.
 *   - `increment` is conceptually atomic — production implementations MUST
 *     use a single-round-trip Redis call (INCRBYFLOAT + EXPIRE in one Lua
 *     script, see `redis-rate-limit-store.ts` for the canonical pattern).
 *   - Both methods throw on store unavailability; the guard layer
 *     translates the throw into a fail-CLOSED `LLM_COST_GUARD_REDIS_UNAVAILABLE`.
 *
 * Spec: P0-4 (audit 2026-05-12, `docs/audit-2026-05-12/details/04-kiss.md` §P0-U-2).
 */
export interface LlmCostCounter {
  /**
   * Read the current running daily total (USD) for `userId` on `day`.
   *
   * @param userId - Stable user identifier (UUID, string).
   * @param day - ISO `YYYY-MM-DD` UTC date.
   * @returns Current running total in USD; `0` if the bucket has never been
   *   incremented today. NEVER `undefined`.
   */
  get(userId: string, day: string): Promise<number>;

  /**
   * Atomically increment the running daily total by `dollars` and return
   * the new total. Production implementations attach a 25h TTL on the
   * key only on first INCR of the day to avoid sliding the expiry on
   * every write.
   *
   * @param userId - Stable user identifier.
   * @param day - ISO `YYYY-MM-DD` UTC date.
   * @param dollars - Amount to add (USD). Must be ≥ 0 (no debits).
   * @returns The new running total.
   */
  increment(userId: string, day: string, dollars: number): Promise<number>;
}
