/**
 * C4 I-SEC1 (2026-05-21) — RED phase, spec R7 + design D5.
 *
 * Documents — by test — the invariant that makes Redis `volatile-ttl`
 * eviction policy correct for Musaium's shared single-instance topology:
 *
 *     cache TTL (1 h)  <  llm_cost counter TTL (25 h)
 *
 * Under memory pressure Redis 7 with `volatile-ttl` evicts the WITH-TTL
 * key whose remaining TTL is smallest first. As long as cache TTL stays
 * strictly less than counter TTL, the financial-DoS guarantee holds:
 * counters survive cache pressure, no quota bypass via OOM eviction.
 *
 * RED expectations (will fail today):
 *  - `DAILY_KEY_TTL_SECONDS` is NOT yet exported from
 *    `museum-backend/src/shared/llm-cost-guard/redis-llm-cost-counter.ts`
 *    (line 16 declares `const` without `export`). Import throws.
 *  - The deterministic simulator
 *    `tests/helpers/shared/llm-cost-guard/volatile-ttl-sim.ts` does not
 *    yet exist (green creates it).
 *
 * Test stays a pure JS simulation (no testcontainers, no ioredis). Per
 * design D5: the `volatile-ttl` semantics are an upstream Redis 7
 * contract; what we own is the TTL ordering invariant. The simulator
 * reproduces the "evict min-TTL first" contract so a future cache TTL
 * bump that approaches counter TTL fires this test.
 */

import { DAILY_KEY_TTL_SECONDS } from '@shared/llm-cost-guard/redis-llm-cost-counter';
import { simulateVolatileTtlEviction } from '../../../helpers/shared/llm-cost-guard/volatile-ttl-sim';

// `env.cache.sessionTtlSeconds` default from `museum-backend/src/config/env.ts:233`
// — duplicated here as the canonical 1h cache TTL so the test does not have to
// boot the full env module (which requires PGDATABASE / JWT secrets / etc).
// If `CACHE_SESSION_TTL_SECONDS` default ever changes, update both this
// constant AND revisit the policy doc (spec.md §4.D Q3).
const CACHE_SESSION_TTL_SECONDS_DEFAULT = 3600;

describe('Redis volatile-ttl policy invariant', () => {
  it('R7a — LLM cache TTL is strictly less than llm_cost counter TTL', () => {
    const cacheTtl = CACHE_SESSION_TTL_SECONDS_DEFAULT;
    const counterTtl = DAILY_KEY_TTL_SECONDS;

    expect(cacheTtl).toBeGreaterThan(0);
    expect(counterTtl).toBeGreaterThan(0);
    // Strict inequality — `volatile-ttl` picks the SHORTEST-TTL key.
    // If anyone bumps cache TTL ≥ counter TTL the financial-DoS guarantee
    // documented in spec.md §4.D collapses.
    expect(cacheTtl).toBeLessThan(counterTtl);
  });

  it('R7b — simulated volatile-ttl eviction preserves counters over cache', () => {
    type Key = { key: string; ttl: number };
    const seedKeys: Key[] = [
      ...Array.from({ length: 200 }, (_v, i) => ({
        key: `llm:v1:cache:${i}`,
        ttl: CACHE_SESSION_TTL_SECONDS_DEFAULT,
      })),
      ...Array.from({ length: 5 }, (_v, i) => ({
        key: `llm_cost:user:${i}`,
        ttl: DAILY_KEY_TTL_SECONDS,
      })),
    ];

    const evicted = simulateVolatileTtlEviction(seedKeys, 200);

    expect(evicted.filter((k) => k.startsWith('llm_cost:user:'))).toHaveLength(0);
    expect(evicted.filter((k) => k.startsWith('llm:v1:cache:'))).toHaveLength(200);
  });
});
