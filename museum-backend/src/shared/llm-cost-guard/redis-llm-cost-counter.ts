import { logger } from '@shared/logger/logger';

import type { LlmCostCounter } from '@shared/llm-cost-guard/llm-cost-counter.port';
import type Redis from 'ioredis';
import type { Cluster } from 'ioredis';

/**
 * Production-grade {@link LlmCostCounter} backed by Redis (single-instance
 * or Cluster). Stores the running USD total under
 * `llm_cost:user:{userId}:{YYYY-MM-DD}` with a 25-hour TTL applied only on
 * the first increment of the day, mirroring the `RedisRateLimitStore` Lua
 * pattern so concurrent increments cannot leak a TTL-less key into Redis.
 *
 * The adapter NEVER swallows errors — it propagates the underlying ioredis
 * error verbatim. The guard layer translates that throw into a
 * fail-CLOSED `LLM_COST_GUARD_REDIS_UNAVAILABLE`.
 *
 * Spec: P0-4 (audit 2026-05-12, `docs/audit-2026-05-12/details/04-kiss.md` §P0-U-2).
 */

/**
 * TTL applied to the daily key. 25h gives 1h slack over the UTC day boundary so
 *  late-night writes survive into the next day's read window for audit.
 */
const DAILY_KEY_TTL_SECONDS = 25 * 60 * 60;
const KEY_PREFIX = 'llm_cost:user:';

/**
 * Atomic INCRBYFLOAT + EXPIRE-on-first-write in one Redis round-trip.
 *
 * KEYS[1] = `llm_cost:user:{userId}:{day}`
 * ARGV[1] = increment in USD (string)
 * ARGV[2] = TTL in seconds applied only when the key did not exist before
 *
 * Returns the new running total as a string (INCRBYFLOAT semantics).
 *
 * Why this script (vs INCRBYFLOAT then EXPIRE in two calls): without the
 * atomic guard, a crash between the two calls leaves a TTL-less key that
 * persists indefinitely and silently expands the user's effective cap.
 * Equivalent to the `INCR_EXPIRE_LUA` pattern in `redis-rate-limit-store.ts`
 * adapted for floats.
 */
const INCRBYFLOAT_EXPIRE_LUA = `
local total = redis.call('INCRBYFLOAT', KEYS[1], ARGV[1])
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[2])
end
return total
`;

const buildKey = (userId: string, day: string): string => `${KEY_PREFIX}${userId}:${day}`;

/**
 * Parses an `INCRBYFLOAT` reply (string in ioredis) into a JS number. Defensive:
 * an unexpected non-numeric reply is treated as a Redis-side failure so the
 * guard fails CLOSED rather than silently capping at `NaN`.
 */
const parseFloatReply = (reply: unknown): number => {
  if (typeof reply === 'number' && Number.isFinite(reply)) return reply;
  if (typeof reply === 'string') {
    const n = Number(reply);
    if (Number.isFinite(n)) return n;
  }
  throw new Error(`unexpected INCRBYFLOAT reply: ${String(reply)}`);
};

/**
 * Redis-backed implementation of {@link LlmCostCounter}.
 *
 * Accepts either a single-instance `Redis` client or a `Cluster` client
 * (matches the existing project pattern from `redis-rate-limit-store.ts`
 * and `redis-client.ts`).
 */
export class RedisLlmCostCounter implements LlmCostCounter {
  private readonly redis: Redis | Cluster;

  constructor(redis: Redis | Cluster) {
    this.redis = redis;
  }

  /**
   * Read the current running daily total in USD. Returns 0 when the key is
   * absent (typed `null` on the wire). Propagates any ioredis error so the
   * guard layer can fail CLOSED.
   */
  async get(userId: string, day: string): Promise<number> {
    const raw = await this.redis.get(buildKey(userId, day));
    if (raw === null) return 0;
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      // Corrupt value in Redis — treat as outage to force fail-CLOSED at the
      // guard. Logging here (not just rethrowing) because the guard's log
      // path obscures the underlying cause behind the canonical fail-CLOSED
      // code, and ops needs to see the corrupt-value signal directly.
      logger.warn('llm_cost_counter_corrupt_value', { userId, day, raw });
      throw new Error(`corrupt llm_cost value for ${userId}:${day} — raw=${raw}`);
    }
    return n;
  }

  /**
   * Atomically increment the daily total. Applies the 25h TTL only on the
   * first write of the day (see `INCRBYFLOAT_EXPIRE_LUA` rationale).
   */
  async increment(userId: string, day: string, dollars: number): Promise<number> {
    const reply = await this.redis.eval(
      INCRBYFLOAT_EXPIRE_LUA,
      1,
      buildKey(userId, day),
      String(dollars),
      String(DAILY_KEY_TTL_SECONDS),
    );
    return parseFloatReply(reply);
  }
}
