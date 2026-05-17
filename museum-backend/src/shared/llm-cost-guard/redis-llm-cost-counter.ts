import { logger } from '@shared/logger/logger';

import type { LlmCostCounter } from '@shared/llm-cost-guard/llm-cost-counter.port';
import type Redis from 'ioredis';
import type { Cluster } from 'ioredis';

/**
 * Production Redis-backed {@link LlmCostCounter} (P0-4, audit 2026-05-12).
 * Key `llm_cost:user:{userId}:{YYYY-MM-DD}` with 25h TTL on first increment.
 *
 * NEVER swallows errors — propagates ioredis throws verbatim so guard layer
 * translates into fail-CLOSED `LLM_COST_GUARD_REDIS_UNAVAILABLE`.
 */

/** 25h = 1h slack over UTC day boundary so late writes survive into next day's audit window. */
const DAILY_KEY_TTL_SECONDS = 25 * 60 * 60;
const KEY_PREFIX = 'llm_cost:user:';

/**
 * Atomic INCRBYFLOAT + EXPIRE-on-first-write in one round-trip.
 * WHY atomic (vs 2 calls): crash between INCRBYFLOAT and EXPIRE leaves TTL-less key
 * persisting indefinitely → silently expands user's effective cap. Mirrors
 * INCR_EXPIRE_LUA pattern in redis-rate-limit-store.ts adapted for floats.
 * KEYS[1]=key, ARGV[1]=$delta, ARGV[2]=TTLseconds. Returns new total (string).
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

/** Defensive: non-numeric reply throws → guard fails CLOSED rather than silently capping at NaN. */
const parseFloatReply = (reply: unknown): number => {
  if (typeof reply === 'number' && Number.isFinite(reply)) return reply;
  if (typeof reply === 'string') {
    const n = Number(reply);
    if (Number.isFinite(n)) return n;
  }
  throw new Error(`unexpected INCRBYFLOAT reply: ${String(reply)}`);
};

/** Accepts single-instance Redis or Cluster client (project pattern). */
export class RedisLlmCostCounter implements LlmCostCounter {
  private readonly redis: Redis | Cluster;

  constructor(redis: Redis | Cluster) {
    this.redis = redis;
  }

  async get(userId: string, day: string): Promise<number> {
    const raw = await this.redis.get(buildKey(userId, day));
    if (raw === null) return 0;
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      // SEC: log here (not just rethrow) — guard's canonical fail-CLOSED code obscures
      // root cause; ops needs corrupt-value signal directly.
      logger.warn('llm_cost_counter_corrupt_value', { userId, day, raw });
      throw new Error(`corrupt llm_cost value for ${userId}:${day} — raw=${raw}`);
    }
    return n;
  }

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
