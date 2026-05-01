# ADR-023 — Redis cluster (not Sentinel) for cache + BullMQ

**Status:** Accepted (design — provisioning deferred to ops)
**Date:** 2026-05-01
**Deciders:** staff DB/SRE pass — subsystem F
**Spec:** docs/superpowers/specs/2026-05-01-F-scale-infra-design.md

## Context

Current architecture: single Redis instance shared by:
- Rate-limit middleware (`F2 fail-closed` per ADR-011).
- Backend cache (chat session bag, geo lookup cache).
- BullMQ (knowledge-extraction worker, audit IP anonymization cron, retention
  prune crons from subsystem E).

At single-instance scale, a Redis outage takes down rate-limit (F2 ADR-011
fail-closed handles this gracefully) and stops queues. At 100K rps, a single
Redis box (4-8GB) hits memory + CPU limits.

## Decision

Migrate to **Redis Cluster** with 3 master + 3 replica nodes (6 nodes
total). Cluster mode shards keys across masters via slot hashing; replica
nodes provide HA failover.

Backend ioredis client gains a cluster toggle: `REDIS_CLUSTER_NODES` env
var (comma-separated `host:port` pairs). When set, `new Redis.Cluster(...)`.
When unset, falls back to single-instance `new Redis(url)`.

BullMQ supports cluster mode out of the box (uses `{}` curly-brace key
prefixes for hash-slot affinity — its native pattern).

## Consequences

- Cluster mode handles 50K+ ops/sec per shard → 150K+ aggregate (3 masters).
- Cache key namespacing must use `{tag}:key` pattern for related keys
  (e.g. `{user:123}:profile`, `{user:123}:sessions`) so they hash to the
  same slot — required for `MGET`/`MSET` across keys.
- Failover latency: ~5-15s on master crash (sentinel-style detection +
  promotion). Existing F2 fail-closed rate-limit handles this gracefully.
- Operational: managed Redis Cluster (Upstash, Aiven, AWS ElastiCache) is
  preferred over self-hosted. Cost ~$200-500/mo for 6-node cluster at
  modest sizing.

## Alternatives considered

- **Redis Sentinel** (single primary + N replicas with auto-failover):
  rejected — does not shard memory, single primary still bottlenecks at
  ~50K ops/sec on a single box. Sentinel is a HA solution, not a scaling
  one. Cluster is both.
- **Memcached for cache + Redis for BullMQ**: rejected — operating two
  systems, no big win, BullMQ requires Redis.
- **Redis Cluster from day one (skip single-instance)**: rejected for
  current scale — cluster adds operational complexity that single-instance
  doesn't need at <1K rps.
