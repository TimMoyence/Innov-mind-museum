# Capacity Plan — Musaium Backend Scale Tiers

**Status:** Draft (design — guides ops provisioning, not prescriptive)
**Date:** 2026-05-01
**Spec:** docs/superpowers/specs/2026-05-01-F-scale-infra-design.md

This worksheet sizes infrastructure for three traffic tiers. Numbers are
order-of-magnitude estimates from PostgreSQL tuning best practices, Redis
cluster sizing 2025, and Cloudflare ratios. Real provisioning should
re-measure with k6 (subsystem H) before committing to a tier.

## Tiers

| Component | Current (~10 rps) | 1K rps | 100K rps |
|---|---|---|---|
| Backend replicas | 1 | 5 | 50-100 |
| Backend RAM each | 512MB | 1GB | 2GB |
| PG primary | 2GB shared | 16GB dedicated | 64GB dedicated + PgBouncer |
| PG primary conn pool | 4 (TypeORM) | 50 (via PgBouncer) | 100 (via PgBouncer) |
| PG replicas | 0 | 1 (lag tolerated) | 3-5 (round-robin via DataSourceRouter) |
| Redis | single 1GB | single 4GB | cluster 6 nodes × 4GB (3 master + 3 replica) |
| BullMQ workers | 1 (in-process) | 5 (in-process) | dedicated worker tier (10+ pods) |
| CDN cache hit ratio | n/a | 50% (warmup) | ≥ 80% |
| Estimated $$$/month | <$50 (single VPS) | $200-500 (managed PG + Redis + 5 backend) | $5K-15K (managed everything + Cloudflare Pro) |

## Per-component sizing reasoning

### PostgreSQL
- **2GB → 16GB → 64GB**: 80% of working set should fit in `shared_buffers`
  (typically 25% of RAM). At 100K rps, hot data set is roughly 16GB
  (chat sessions + museum + recent messages).
- **Connection pool**: PgBouncer transaction mode multiplexes — backend can
  hold 5-10 client connections per replica, PgBouncer keeps 50-100 real PG
  connections. `max_connections = 200` on PG primary is enough.

### Redis
- **Cluster sharding**: at 100K rps, each shard sees ~33K ops/sec (within
  the 50K/sec single-instance comfort zone). 6 nodes = 3 active + 3 standby.
- **Memory**: each shard ~4GB → 12GB total active. Cache + BullMQ + rate
  limit fit comfortably.

### CDN
- **80% hit ratio**: industry standard for SPA/landing-heavy traffic.
  Expected mix: 60% static JS/CSS bundles (immutable), 15% landing/admin
  HTML, 5% OpenAPI JSON. The 20% origin is API + uncacheable POSTs.

### Backend
- **CPU per RPS**: roughly 1 CPU core handles 200-500 rps for typical Node
  Express + TypeORM workloads. 100K rps ÷ 250 = 400 cores → 50 pods × 8
  cores OR 100 pods × 4 cores. Choice depends on container density vs
  per-pod overhead.

## Migration path (current → 1K rps)

1. Provision managed PG (1GB → 16GB).
2. Provision managed Redis (1GB → 4GB).
3. Add 2nd backend replica behind existing LB.
4. Set up Cloudflare in front of landing + admin static.
5. Activate `httpCacheHeaders` helper on backend.
6. Measure with k6 (subsystem H).

## Migration path (1K → 100K rps)

1. Add PgBouncer between backend and PG primary.
2. Provision PG read replicas; flip `DB_REPLICA_URL` env on backend.
3. Migrate Redis to Cluster (6 nodes); set `REDIS_CLUSTER_NODES` env.
4. Scale backend to 50-100 replicas via Kubernetes HPA.
5. Move BullMQ workers to dedicated tier (separate deployment).
6. Cloudflare Pro tier (analytics + WAF).
7. Re-measure with k6 + chaos test (subsystem H).

## Open questions

- Per-region deployment (multi-region or single-region with global CDN)?
  → Defer until traffic forecast justifies multi-region.
- Object storage provider (S3 vs R2) — already on S3-compatible. R2 saves
  egress, but Cloudflare R2 + Cloudflare CDN is a natural pairing.
  → F follow-up if CDN ships.
