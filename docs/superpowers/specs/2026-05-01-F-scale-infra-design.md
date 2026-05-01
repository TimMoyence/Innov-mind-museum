# F — Scale Infrastructure (design + code knobs)

**Date:** 2026-05-01
**Subsystem:** F of A→H scale-hardening decomposition
**Status:** Approved (autonomous mode — design + code-knob delivery; infra provisioning is user/ops responsibility)
**Predecessors:** A1+A2, C, D, E
**Successors:** G AI cache (depends on F-3 Redis), H observability (depends on F-2 replica routing for SLO measurement)

---

## 1. Context — what "100K rps" actually means here

The original audit named "100K req/sec" as the scale target. That number is aspirational ceiling, not measured baseline:
- Today Musaium runs a single Postgres + single Redis + single backend container on one VPS. Real traffic is single-digit rps.
- 100K rps would mean 8.6 billion requests/day — enterprise SaaS scale. The app would need ~50-100 backend replicas behind a load balancer, a Postgres primary + 5+ read replicas, a Redis cluster of 6+ nodes, and a CDN absorbing 80% of static traffic.

This subsystem ships **design + code knobs** so the production architecture can be flipped on by env-var changes once infra is provisioned. We do NOT ship actual infra deploy here — that requires Cloudflare/AWS accounts, capacity sizing decisions, and ops budget.

## 2. Goals

1. **ADRs** that document the target architecture for each scale component.
2. **Read/write split abstraction**: introduce `dataSource.read` and `dataSource.write` getters that today both return the single `AppDataSource`, and tomorrow return separate primary + replica connections via env config.
3. **Redis cluster-compatible client**: today's single-instance ioredis client gains a cluster-mode toggle via env (`REDIS_CLUSTER_NODES`). Falls back to single-node when not set.
4. **PgBouncer-compatible SQL**: audit the codebase for prepared statements / multi-statement transactions / `LISTEN/NOTIFY` patterns that PgBouncer transaction mode breaks. Document any exceptions.
5. **CDN-friendly cache headers**: review the static-asset surface (admin panel, landing) and add `Cache-Control` headers compatible with Cloudflare's edge cache.
6. **Capacity plan document**: a sizing worksheet for the 100K rps target — primary connection pool size, replica count, Redis cluster shard count, CDN origin requests/sec, expected $$$ — so when the time comes to provision, the operator has a starting point.

Non-goals:

- Actually provisioning Cloudflare, replicas, or PgBouncer in production.
- Migrating to PostGIS for geo (subsystem A3, deferred).
- Load test against 100K rps (subsystem H scope).

---

## 3. Architecture target (post-F)

```
                  ┌─────────────────┐
                  │   Cloudflare    │  static cache, DDoS, TLS
                  │      CDN        │  cache hit ratio target ≥ 80%
                  └────────┬────────┘
                           │ origin pulls
                  ┌────────▼────────┐
                  │   Backend LB    │  (already in scope: existing _deploy-backend.yml)
                  └────────┬────────┘
                  ┌────────▼─────────┐
                  │ Backend replicas │  N=10-100 per traffic
                  │ (Node 22 + Express) │
                  └────┬─────────┬───┘
                       │         │
                  ┌────▼──┐  ┌───▼────┐
                  │PgBouncer│ │Redis   │
                  │transaction│ │Cluster │  ≥ 3 master + 3 replica nodes
                  │   mode  │ │(BullMQ │
                  └────┬────┘ │+rate-  │
                       │      │limit + │
                  ┌────▼─────┐│cache)  │
                  │ Postgres ││        │
                  │ Primary  │└────────┘
                  └────┬─────┘
                       │ async repl
              ┌────────┴───────────┐
              │  Postgres Replicas │  N=2-5
              │  (read-only,       │
              │   eventual consistency)
              └────────────────────┘
```

Read traffic (90%+) → replica via PgBouncer.
Write traffic + read-after-write → primary via PgBouncer.

---

## 4. ADRs

This spec ships four:

- `docs/adr/ADR-XXX-pgbouncer-transaction-mode.md`
- `docs/adr/ADR-XXX-pg-read-replica-strategy.md`
- `docs/adr/ADR-XXX-redis-cluster-vs-sentinel.md`
- `docs/adr/ADR-XXX-cloudflare-cdn-strategy.md`

Numbering chosen at write time using next-available. Each ADR includes context, decision, consequences, alternatives.

---

## 5. Code knobs (this PR's actual code surface)

### 5.1 Read/write DataSource split (`src/data/db/data-source.ts`)

Today: single `AppDataSource` exported. Reads + writes share the connection.

Future: introduce a `DataSourceRouter` that wraps two underlying DataSources. The existing `AppDataSource` stays as the primary (writer); a new `AppReplicaDataSource` (env-toggled, defaults to the same as primary) handles reads. Repository code that wants to read from replicas calls `dataSourceRouter.read.getRepository(X)` instead of `AppDataSource.getRepository(X)`.

Initial implementation: the router exists but `read` and `write` BOTH point at the single primary. No behavior change. When `DB_REPLICA_URL` env var is set, `read` swaps to the replica DataSource. Migration path is gradual — repository-by-repository.

### 5.2 Redis cluster toggle (`src/shared/cache/redis-client.ts` or wherever ioredis is wired)

Today: `new Redis(url)` single instance.

Future: env `REDIS_CLUSTER_NODES` (comma-separated `host:port` pairs). When set, instantiate `new Redis.Cluster(nodes, opts)`. When unset, fall back to single-instance.

### 5.3 PgBouncer-compatible SQL audit + ADR

Run a grep audit for patterns PgBouncer transaction mode breaks:
- `LISTEN`/`NOTIFY` (rejected by transaction mode)
- Prepared statement reuse across transactions (TypeORM uses simple query mode by default — verify)
- Server-side cursor reuse (`@QueryRunner` instances kept across HTTP requests)
- Session-scoped settings (`SET LOCAL` works; `SET` doesn't survive)
- Advisory locks (transaction-scoped only)

Document findings in the ADR. Fix anything found that's incompatible.

### 5.4 CDN-friendly cache headers

Review static-asset response paths (admin panel index, landing HTML, OpenAPI JSON, `museum-frontend` build artifacts). Add `Cache-Control: public, max-age=<X>, s-maxage=<Y>, stale-while-revalidate=<Z>` headers per asset class.

OpenAPI JSON (already cacheable): `public, max-age=300, s-maxage=3600`.
Admin static (built JS/CSS bundles with hashed filenames): `public, max-age=31536000, immutable`.
Admin HTML index (changes per deploy): `public, max-age=0, must-revalidate, s-maxage=60`.

### 5.5 Capacity plan doc

`docs/CAPACITY_PLAN.md` — single-page sizing worksheet:

| Component | At current (~10 rps) | At 1K rps | At 100K rps |
|---|---|---|---|
| Backend replicas | 1 | 5 | 50-100 |
| PG primary | shared 2GB RAM, 4 conn pool | dedicated 16GB, 50 conn pool | dedicated 64GB, 100 conn pool + PgBouncer |
| PG replicas | 0 | 1 (lag tolerated) | 3-5 read-replicas, lag monitored |
| Redis | single 1GB | single 4GB | cluster 6 nodes × 4GB (3 primary 3 replica) |
| BullMQ workers | 1 | 5 | dedicated worker tier 10+ |
| CDN cache hit ratio | n/a | 50% | ≥ 80% |
| Estimated $$$/mo | <$50 | $200-500 | $5000-15000 |

Sources for the numbers (Postgres tuning best practices, Redis cluster sizing 2025, Cloudflare ratios) cited inline.

---

## 6. Files

```
docs/adr/
├── ADR-XXX-pgbouncer-transaction-mode.md          NEW
├── ADR-XXX-pg-read-replica-strategy.md            NEW
├── ADR-XXX-redis-cluster-vs-sentinel.md           NEW
└── ADR-XXX-cloudflare-cdn-strategy.md             NEW

docs/
└── CAPACITY_PLAN.md                                NEW

museum-backend/src/
├── data/db/
│   └── data-source-router.ts                       NEW — read/write router
├── shared/cache/
│   └── redis-client.ts                             MODIFY — cluster toggle
├── helpers/
│   └── http-cache-headers.ts                       NEW — CDN-friendly headers helper
├── config/env.ts                                   MODIFY — DB_REPLICA_URL, REDIS_CLUSTER_NODES
└── modules/admin/adapters/primary/http/
    └── admin-static.middleware.ts                  MODIFY (if exists) — apply cache headers
```

---

## 7. Tests

- `tests/unit/data/db/data-source-router.test.ts` — asserts read/write fallback to single source when no replica configured.
- `tests/unit/shared/cache/redis-client.test.ts` — asserts cluster vs single-instance branching.
- `tests/unit/helpers/http-cache-headers.test.ts` — asserts header values per asset class.

---

## 8. Acceptance criteria

- 4 ADRs landed.
- `docs/CAPACITY_PLAN.md` landed.
- `DataSourceRouter` shipped, exports `read` and `write` getters, both default to `AppDataSource` when env knob absent.
- Redis client supports cluster mode via `REDIS_CLUSTER_NODES` env (single-instance fallback).
- HTTP cache headers helper exists and is wired on at least the OpenAPI endpoint and admin static path.
- Tests passing.
- `pnpm exec tsc --noEmit` clean. Lint clean. Drift clean.

## 9. Out of scope

- Actually deploying PgBouncer / replicas / Cluster / Cloudflare.
- Migrating every repository call to use `dataSourceRouter.read` (gradual; tracked in follow-up ticket).
- 100K rps load test — subsystem H.
- AI semantic cache — subsystem G.
- Observability dashboards — subsystem H.
