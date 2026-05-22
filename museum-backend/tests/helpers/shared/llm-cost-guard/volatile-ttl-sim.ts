/**
 * C4 I-SEC1 (2026-05-21) — pure simulator for Redis `volatile-ttl` policy.
 *
 * Used by `tests/unit/shared/llm-cost-guard/redis-volatile-ttl-policy.test.ts`
 * (spec R7b, design D5) to assert: under memory pressure, Redis evicts
 * WITH-TTL keys ordered by ascending remaining TTL. Counters (25h TTL)
 * survive 200 cache-key (1h TTL) evictions iff `cacheTtl < counterTtl`.
 *
 * No ioredis, no testcontainers — testing OUR invariant (TTL ordering),
 * not Redis 7 internals.
 *
 * @param seed Key/TTL pairs.
 * @param evictCount Number of evictions to perform.
 * @returns Names of evicted keys, in eviction order.
 */
export interface KeyWithTtl {
  key: string;
  ttl: number;
}

export function simulateVolatileTtlEviction(
  seed: readonly KeyWithTtl[],
  evictCount: number,
): string[] {
  // Stable sort by ttl ascending. ECMAScript Array.prototype.sort is stable
  // since ES2019 so ties preserve insertion order — deterministic.
  const sorted = [...seed].sort((a, b) => a.ttl - b.ttl);
  const n = Math.max(0, Math.min(evictCount, sorted.length));
  return sorted.slice(0, n).map((entry) => entry.key);
}
