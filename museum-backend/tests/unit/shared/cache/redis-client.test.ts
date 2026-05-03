/**
 * F Phase 2 — createRedisClusterClient unit tests.
 *
 * env.ts caches values at module load time, so we cannot toggle
 * REDIS_CLUSTER_NODES at runtime and expect the singleton `env` to reflect
 * the change. In the test environment REDIS_CLUSTER_NODES is unset, so
 * createRedisClusterClient() must return null (single-instance fallback
 * unchanged).
 */
import { createRedisClusterClient } from '@shared/cache/redis-client';

describe('createRedisClusterClient', () => {
  it('returns null when REDIS_CLUSTER_NODES is unset (env cached at module load)', () => {
    // env.redis.clusterNodes is null because REDIS_CLUSTER_NODES was not set
    // when env.ts loaded. No ioredis Cluster connection is opened.
    expect(createRedisClusterClient()).toBeNull();
  });
});
