import { DAILY_KEY_TTL_SECONDS } from '@shared/llm-cost-guard/redis-llm-cost-counter';
import { simulateVolatileTtlEviction } from '../../../helpers/shared/llm-cost-guard/volatile-ttl-sim';

const CACHE_SESSION_TTL_SECONDS_DEFAULT = 3600;

describe('Redis volatile-ttl policy invariant', () => {
  it('R7a — LLM cache TTL is strictly less than llm_cost counter TTL', () => {
    const cacheTtl = CACHE_SESSION_TTL_SECONDS_DEFAULT;
    const counterTtl = DAILY_KEY_TTL_SECONDS;

    expect(cacheTtl).toBeGreaterThan(0);
    expect(counterTtl).toBeGreaterThan(0);
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
