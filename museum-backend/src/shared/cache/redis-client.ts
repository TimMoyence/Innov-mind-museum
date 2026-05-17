import { Cluster } from 'ioredis';

import { env } from '@src/config/env';

import type { ClusterNode, ClusterOptions } from 'ioredis';

/** "host:port,..." → ClusterNode[]. No port → 6379. */
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
 * ioredis Cluster client when `REDIS_CLUSTER_NODES` set; null otherwise
 * (caller falls back to single-instance). ADR-023.
 */
export function createRedisClusterClient(opts?: ClusterOptions): Cluster | null {
  const raw = env.redis.clusterNodes;
  // Stryker: cannot kill — env captured at module-load and tests run with
  // REDIS_CLUSTER_NODES unset (raw === null). Process-wide env reset avoided.
  // Stryker disable next-line ConditionalExpression
  if (!raw) return null;
  const nodes = parseClusterNodes(raw);
  if (nodes.length === 0) return null;
  return new Cluster(nodes, {
    redisOptions: { password: env.redis.password ?? undefined },
    ...opts,
  });
}
