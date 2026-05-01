import { Cluster } from 'ioredis';

import { env } from '@src/config/env';

import type { ClusterNode, ClusterOptions } from 'ioredis';

/**
 * Parses a comma-separated "host:port" string into ioredis ClusterNode array.
 * Entries with no port default to 6379.
 */
const parseClusterNodes = (raw: string): ClusterNode[] =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [host, portStr] = entry.split(':');
      return { host, port: Number(portStr) || 6379 };
    });

/**
 * Creates an ioredis Cluster client when `REDIS_CLUSTER_NODES` is set.
 * Returns `null` when the env var is absent — callers fall back to the
 * single-instance Redis connection unchanged.
 *
 * Usage pattern:
 *   const cluster = createRedisClusterClient();
 *   if (cluster) {
 *     // use cluster client
 *   } else {
 *     // use existing single-instance client
 *   }
 *
 * Spec: docs/superpowers/specs/2026-05-01-F-scale-infra-design.md section 5.2
 * ADR: docs/adr/ADR-023-redis-cluster-topology.md
 */
export function createRedisClusterClient(opts?: ClusterOptions): Cluster | null {
  const raw = env.redis.clusterNodes;
  if (!raw) return null;
  const nodes = parseClusterNodes(raw);
  if (nodes.length === 0) return null;
  return new Cluster(nodes, {
    redisOptions: { password: env.redis.password ?? undefined },
    ...opts,
  });
}
