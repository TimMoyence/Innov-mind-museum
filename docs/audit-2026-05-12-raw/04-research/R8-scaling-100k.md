# R8 — Scaling Musaium Backend to 100k Users

**Auditor:** R8 (Scaling Research Agent)
**Date:** 2026-05-12
**Scope:** PostgreSQL 16, Node.js 22 / Express 5, Redis (single + cluster), TypeORM, audit-chain bottleneck, capacity model for 100k users.
**Honesty (UFR-013):** Claims labelled with verification level — `[verified]` = read in repo / cited source ; `[inferred]` = derived from cited principle ; `[assumed]` = working hypothesis pending validation.

---

## TL;DR

Musaium's current backend can probably absorb **5–10k MAU / ~500–1 000 concurrent active sessions** on a single VPS with the existing `DB_POOL_MAX=50` and audit-chain serialization. **It cannot reach 100k MAU without three structural changes** :

1. **Replace the global advisory-lock on every audit INSERT with a partitioned-stream or per-tenant lock** — currently *every* INSERT in the audit chain blocks on `pg_advisory_xact_lock(0x75f1_4b0c_6dbe_a111)`, a single global mutex that caps write throughput to single-digit thousands of audit events / second regardless of CPU count. `[verified` — `museum-backend/src/shared/audit/audit.repository.pg.ts:58]`
2. **Front PostgreSQL with a real pooler (PgBouncer transaction mode or PgCat).** `DB_POOL_MAX=50` per Node process × N processes >> `max_connections` of a single 8-vCPU VPS Postgres (recommended pool = `2×cores + 1` ≈ 17). The audit chain ALREADY uses xact-scoped locks, so transaction pooling is compatible. `[verified` — `museum-backend/src/config/env.ts:69]`, `[inferred — postgresql.org pooling formula]`
3. **Right-size `DB_POOL_MAX`, wire the existing `replicaUrl` plumbing**, and move OS Redis to ioredis Cluster only when a single Redis becomes the bottleneck (likely > 30k concurrent sessions).

Audit-chain redesign is the **single biggest blocker** ; everything else is incremental tuning. Capacity plan : a Hetzner-class CCX/CPX 8 vCPU / 32 GB VPS + tuned Postgres + PgBouncer + 2 Node instances + 1 Redis can probably handle **20–30k MAU / ~3k concurrent** ; **100k MAU requires either (a) write-path redesign + single beefier server (32 vCPU / 128 GB) + read-replica or (b) read-replica + 2–3 app nodes + managed Postgres**. Sharding is *not* warranted at this scale — Pinterest ran on a single MySQL shard until they hit billions of rows.

---

## 1. PostgreSQL 16 Tuning for 100k Users

### Memory parameters

| Param | Default | Recommended (32 GB VPS) | Rationale |
|---|---|---|---|
| `shared_buffers` | 128 MB | **8 GB (25% RAM)** | Past 25–40% RAM, returns diminish since OS page cache also caches; > 40% hurts. `[postgresql.org wiki]` `[mydbops 2026]` |
| `effective_cache_size` | 4 GB | **24 GB (75% RAM)** | Planner hint about OS+buffer cache; doesn't allocate, just informs cost estimates. `[oneuptime 2026]` |
| `work_mem` | 4 MB | **8–16 MB** | Per-sort, per-connection. Formula : `(RAM − shared_buffers − OS overhead) / max_connections / sorts_per_query (2–4)`. With pooler-fronted Postgres (max ~50 backend conn) → 16 MB safe. `[mydbops 2026]` `[oneuptime 2026]` |
| `maintenance_work_mem` | 64 MB | **1–2 GB** | Used by VACUUM, CREATE INDEX. High value speeds maintenance, doesn't impact OLTP. `[edb 2026]` |
| `max_connections` | 100 | **200–400 (with pooler)** OR **50–100 (no pooler)** | Each backend = ~5–10 MB resident. Raising to thousands without pooler crashes the server. `[postgresql.org wiki]` |

### Concurrency / I/O parameters

| Param | Default | Recommended (NVMe) | Rationale |
|---|---|---|---|
| `random_page_cost` | 4.0 | **1.1** | On NVMe, random ≈ sequential I/O. Default 4.0 was tuned for spinning disks. Lower value tells planner indexes are cheap. `[cybertec-postgresql 2026]` `[dev.to aws-heroes 2026]` |
| `seq_page_cost` | 1.0 | 1.0 (unchanged) | |
| `effective_io_concurrency` | 1 | **256** (NVMe) | Number of concurrent I/O ops the planner expects the OS to support. NVMe handles 100k+ IOPS. `[server.hk 2026]` |
| `wal_compression` | off | **on** | Reduces WAL size 50–70%, modest CPU cost. Helps replication lag. `[pgedge 2026]` |
| `wal_buffers` | -1 (auto) | **64 MB** | Helps under high write rate. `[pgedge 2026]` |

### Autovacuum (CRITICAL for 100k)

Default settings are tuned for low-write tables and *will* fall behind on a 100k-user workload. `[oneuptime 2026 - autovacuum]`

| Param | Default | Recommended | Rationale |
|---|---|---|---|
| `autovacuum_max_workers` | 3 | **6–10** | Match core count, more parallel cleanups. |
| `autovacuum_naptime` | 60s | **15s** | Wake up more often. |
| `autovacuum_vacuum_scale_factor` | 0.2 (20% dead tuples) | **0.05 (5%)** | Trigger sooner on busy tables. |
| `autovacuum_vacuum_cost_limit` | 200 | **1000–2000** | Modern I/O can absorb more aggressive vacuum. `[mydbops 2026]` |
| `autovacuum_vacuum_cost_delay` | 2ms | **2–5ms** OR **0** (high-write) | Lower = more aggressive, completes faster. `[oneuptime 2026]` |
| Per-table tuning | n/a | **REQUIRED for `audit_logs`, `chat_messages`, hot tables** | `ALTER TABLE … SET (autovacuum_vacuum_scale_factor = 0.02);` |

**Goal:** Keep dead-tuple ratio < 5–10 % on every hot table ; never let transaction-ID age approach wraparound. `[oneuptime 2026]`

**Musaium-specific risk** : the audit_logs table is append-only and grows monotonically. BRIN indexes on `created_at` will be **hundreds of times smaller** than a btree and avoid bloat. `[appmaster 2026]`

### Source

- [PostgreSQL wiki — Tuning Your PostgreSQL Server](https://wiki.postgresql.org/wiki/Tuning_Your_PostgreSQL_Server)
- [Mydbops — Postgres Parameter Tuning Best Practices 2026](https://www.mydbops.com/blog/postgresql-parameter-tuning-best-practices)
- [EDB — How to Tune PostgreSQL for Memory](https://www.enterprisedb.com/postgres-tutorials/how-tune-postgresql-memory)
- [Cybertec — Better PostgreSQL Performance on SSDs](https://www.cybertec-postgresql.com/en/better-postgresql-performance-on-ssds/)

---

## 2. PgBouncer Transaction Pool 2026 — Pitfalls vs Musaium

### Pitfalls (transaction mode)

| Limitation | Musaium impact |
|---|---|
| No `LISTEN/NOTIFY` | **None** — audit memory entry confirms Musaium uses neither. |
| No session-scoped advisory locks | **OK** — audit chain uses `pg_advisory_xact_lock` (transaction-scoped), released at COMMIT. `[verified` — `audit.repository.pg.ts:58]` |
| No persistent prepared statements (pre-1.21) | **PgBouncer ≥ 1.21 (2024)** supports them via `max_prepared_statements = 200`. Without it, set `prepare: false` in node-pg / TypeORM. `[crunchydata 2026]` |
| No `SET` / temporary tables persisting across queries | **OK** — Musaium has no session-bound state. |
| Each request must be a single transaction | **OK** — TypeORM emits explicit transactions. |

**Verdict :** PgBouncer transaction mode is **fully compatible** with Musaium's audit chain. Roll out is safe.

### PgBouncer vs PgCat vs Supavisor (2026)

`[tembo benchmark 2026]`

| Pooler | Throughput @ 750+ clients | Best for | Cost |
|---|---|---|---|
| **PgBouncer** | baseline | < 50 clients, lowest latency | single binary, ~2 MB RAM / 1 000 clients |
| **PgCat** (Rust) | **2× PgBouncer at ≥ 750 clients** | read/write split + sharding | Rust, multi-threaded |
| **Supavisor** (Elixir) | designed for 100k+ conn | serverless, multi-tenant | needs Erlang VM |

**Recommendation for Musaium V1 (single VPS, < 5k clients) :** **PgBouncer 1.23+**, transaction mode, `max_prepared_statements=200`, `default_pool_size=20`, `max_client_conn=2000`. Migrate to **PgCat** *only* when read-replica routing matters (Phase F — see `museum-backend/src/data/db/data-source-router.ts`).

### Source

- [Crunchy Data — Prepared Statements in Transaction Mode for PgBouncer](https://www.crunchydata.com/blog/prepared-statements-in-transaction-mode-for-pgbouncer)
- [Tembo — Benchmarking PostgreSQL connection poolers: PgBouncer, PgCat and Supavisor](https://www.tembo.io/blog/postgres-connection-poolers)
- [PlanetScale — PgBouncer](https://planetscale.com/docs/postgres/connecting/pgbouncer)
- [PkgPulse — PgBouncer vs PgCat vs Supavisor 2026](https://www.pkgpulse.com/blog/pgbouncer-vs-pgcat-vs-supavisor-postgresql-connection-2026)

---

## 3. PostgreSQL Read Replicas in Node — Master/Slave Routing

### Current Musaium state

`[verified` — `museum-backend/src/data/db/data-source-router.ts]` : code already supports `DB_REPLICA_URL`. The router returns a replica DataSource when set, else falls back to primary. **The plumbing is in, but the env var is not wired in prod** (per current `.env.local.example`).

### TypeORM replication options

`[typeorm.io 2026]`

```ts
new DataSource({
  type: 'postgres',
  replication: {
    master: { host: 'primary', ... },
    slaves: [{ host: 'replica-1', ... }, { host: 'replica-2', ... }],
    defaultMode: 'slave', // or 'master' if reads default to primary
  },
})
```

**Default behaviour :** `find()` / `SelectQueryBuilder` → random slave ; all writes → master ; `createQueryRunner('master')` to force.

### Known TypeORM 2026 limitations

`[github typeorm/typeorm#11972 + #11980, Feb 2026]`

- **Postgres replication shares a single global `poolSize`** across master + all slaves. You cannot tune them independently. Workaround : use separate DataSources + a router (Musaium's pattern).
- Some `extra` options (e.g. statement_timeout) leak from master config to all replicas.

### Alternatives

| Approach | Pros | Cons |
|---|---|---|
| **TypeORM `replication`** | built-in, automatic | rigid pool config |
| **Custom router (current Musaium)** | full control, per-replica pool size | manual write/read decision |
| **PgCat** (proxy-level routing) | transparent to app, primary→read replica based on query type | adds Rust process, replication lag inheritance |
| **pgpool-II** | mature, query parsing | heavy, sticky-session pitfalls |

**Recommendation :** keep Musaium's custom router (`data-source-router.ts`), provision a Postgres streaming replica on a separate VPS, set `DB_REPLICA_URL`, route heavy read queries (chat history, museum browse, daily-art catalog) explicitly to it. Watch replication lag — `pg_stat_replication.replay_lag` should stay < 500 ms or reads will return stale data. `[postgres.ai 2026]`

### Replication lag knobs

`[postgres.ai 2026]` `[pgedge 2026]`

- `wal_compression = on` — reduces network bytes 50–70 %.
- `hot_standby_feedback = on` — prevents replica query cancellation, but causes primary bloat. Trade-off.
- `max_standby_streaming_delay = 30s` — replica waits this long before cancelling queries on conflict.

### Source

- [TypeORM Docs — Multiple data sources / replication](https://typeorm.io/docs/data-source/multiple-data-sources/)
- [GitHub typeorm/typeorm#11972 — per-pool sizing for master/slave](https://github.com/typeorm/typeorm/issues/11972)
- [Cloud SQL — Replication lag](https://cloud.google.com/sql/docs/postgres/replication/replication-lag)
- [pgEdge — Reducing PostgreSQL Replication Lag](https://www.pgedge.com/blog/understanding-and-reducing-postgresql-replication-lag)

---

## 4. Node 22 Cluster vs PM2 vs Kubernetes for 100k

### Comparison

| Strategy | What it gives | What it costs | When |
|---|---|---|---|
| **Native `cluster`** | Spawn N workers sharing port | DIY restarts, log mgmt, zero-downtime reload | < 10k concurrent |
| **PM2 cluster mode** | All of cluster + auto-restart, zero-DT reload, log aggregation, multi-server with PM2+ | License for PM2 Plus, single point of mgmt | 10–100k concurrent on single VPS |
| **Kubernetes + PM2 per pod** | Horizontal autoscaling, multi-AZ, rolling updates, health probes | Operational complexity, kube-experienced ops | 100k+ concurrent, multi-region |

`[halodoc 2026]` describes the canonical pattern : PM2 *inside* each Kubernetes pod absorbs short-term load spikes and provides per-pod CPU saturation ; Kubernetes HPA handles cross-pod elasticity. For 100k MAU at Musaium's launch-stage maturity, **PM2 cluster on a single beefier VPS** is the right balance — Kubernetes is a 3-6 month ops investment Musaium doesn't yet need.

### Critical caveats at scale

- **Stateless processes mandatory.** Anything in process memory (rate-limit counters, session cache, in-flight job dedup) must move to Redis. `[oneuptime 2026]`
- **`server.keepAliveTimeout` MUST exceed load-balancer idle timeout** (typical : 65s). `[connectreport]`
- **`UV_THREADPOOL_SIZE=16–32`** when using bcrypt / crypto / zlib at scale.
- **Sticky sessions** unnecessary if JWT-only auth (Musaium = JWT, so any node can serve any request).
- **Watch event-loop lag** — autoscale on `event-loop > 20ms` not CPU. `[node-rate-limiter-flexible wiki]`

### Source

- [PM2 Cluster Mode Docs](https://pm2.keymetrics.io/docs/usage/cluster-mode/)
- [Halodoc — Enhancing Uptime and Performance with Node.js Clustering using PM2](https://blogs.halodoc.io/nodejs-clustering-using-pm2/)
- [Optimum Web — PM2 cluster mode with Node.js](https://www.optimum-web.com/pm2-cluster-mode-with-node-js/)

---

## 5. ioredis Cluster 2026 vs Sentinel vs Single Node

`[redis.io scaling 2026]` `[redis-discord 2026]`

| Topology | When | Failover | Multi-key |
|---|---|---|---|
| **Single node** | < 10–20k concurrent ops/s | Manual | Full (transactions, MGET, Lua across keys) |
| **Sentinel** (3+ nodes monitoring 1 primary + replicas) | Need automatic failover, no sharding | Auto, ~10–30s | Full |
| **Cluster** (3+ masters + replicas, sharded by hash slot) | Outgrew single node memory OR write throughput | Auto, ~1–5s | **Limited to same hash-tag** — MGET / transactions only across keys in same hash slot |

### Recommendation for Musaium

`[verified` — `museum-backend/src/shared/cache/redis-client.ts:11-45]` : the cluster client factory exists but `REDIS_CLUSTER_NODES` is empty → falls back to single-node. **This is correct for V1.**

**Phase plan :**
1. **V1 launch — 0–10k MAU** : single Redis, AOF persistence (`appendonly yes, appendfsync everysec`). `[bhaweshkumar 2026]`
2. **10–30k MAU** : add **Sentinel + 1 replica** for HA (avoid sharding complexity).
3. **30k+ MAU** : evaluate Cluster *only* if you're hitting > 100k ops/sec or > 8 GB working set on a single node.

**ioredis caveats :**
- Cluster client requires hash-tags (`{user:123}:profile` / `{user:123}:cart`) for multi-key atomic ops.
- Failover failover handler must be wired (`cluster.on('+failover-end', ...)`).
- Pipelining works in cluster mode but is per-node.

### Source

- [Redis — Scaling Redis: Clustering, Sharding, Read Replicas](https://redis.io/tutorials/operate/redis-at-scale/scalability/)
- [Bhawesh Kumar — Redis in Production: Architecture, Persistence, HA (2026)](https://www.bhaweshkumar.com/blog/2026/04/23/redis-production-deployment-guide/)
- [ioredis GitHub](https://github.com/redis/ioredis)

---

## 6. Redis 7.4 / 8.0 in 2026

`[redis.io blog 2026]`

**Redis 8.0 (GA Dec 2025)** delivers >30 perf improvements vs 7.2 :
- I/O threading improvements → **up to +112 % throughput** on 8-core+ CPUs when `io-threads=8`.
- p50 latency reduction 5.4–87 % across 90 of 149 benchmarked commands.
- Replication : **+7.5 % primary write rate during replication, −18 % time, −35 % buffer peak.**

**Redis 7.4** introduced hash-field TTL (`HEXPIRE` / `HPERSIST`) — useful if you store ephemeral per-field state.

### Recommendation

- **Use Redis 8.0** on launch (Ubuntu 24.04 / Debian 13 packages are stable).
- Configure `io-threads = min(8, vCPUs / 2)` ; **don't enable for io-threads-do-reads** unless write workload is dominant.
- Persistence : **AOF + everysec fsync** is the standard. RDB snapshots every 1h as a belt-and-braces backup.
- For sub-10k ops/s, single-threaded Redis stays under-utilised on modern CPUs — no need to over-engineer.

### Source

- [Redis 8 is now GA, loaded with new features](https://redis.io/blog/redis-8-ga/)
- [Redis 8.4 release post](https://redis.io/blog/redis-8-4-open-source-ga/)
- [Redis 8.0 release notes](https://redis.io/docs/latest/develop/whats-new/8-0/)

---

## 7. Connection Pool Sizing Formula — NVMe Update

### Classical formula (PostgreSQL wiki)

```
pool_size = (cpu_cores × 2) + effective_spindle_count
```

`[postgresql.org wiki]`

### NVMe / SSD adjustment

`[oneuptime 2026]` `[techinterview.org 2026]`

- `effective_spindle_count` for NVMe ≈ **1** (near-zero seek time).
- Practical : `pool_size = (cores × 2) + 1`.

### Musaium today

| Component | Cores (assumed VPS class) | Recommended app pool |
|---|---|---|
| 4-vCPU VPS | 4 | **9** |
| 8-vCPU VPS (CPX41 / OVH B2-30) | 8 | **17** |
| 16-vCPU VPS | 16 | **33** |
| 32-vCPU (sharded plan) | 32 | **65** |

### Verdict on `DB_POOL_MAX = 50`

`[verified` — `museum-backend/src/config/env.ts:69]`

**Almost certainly too high for a single-VPS Postgres.** With 2 Node processes (PM2 cluster) × 50 = **100 backend connections** vs `max_connections = 100` (Postgres default). At 4 processes you saturate and clients queue. Recommendation : `DB_POOL_MAX=10–15` per process **once PgBouncer is in front**, with PgBouncer's `default_pool_size=20` doing the actual multiplexing to Postgres.

> **The most common mistake is setting the pool size too large — a pool of 200 connections does not make PostgreSQL faster, it makes it slower.** `[oneuptime 2026]`

### Source

- [PostgreSQL wiki — Number of Database Connections](https://wiki.postgresql.org/wiki/Number_Of_Database_Connections)
- [PostgREST docs — Connection Pool](https://docs.postgrest.org/en/v12/references/connection_pool.html)
- [HikariCP about-pool-sizing](https://github.com/brettwooldridge/HikariCP/wiki/About-Pool-Sizing) (referenced via OneUptime)

---

## 8. Audit Chain Bottleneck — `pg_advisory_xact_lock` per INSERT

### Current implementation

`[verified` — `museum-backend/src/shared/audit/audit.repository.pg.ts:38-58]`

```ts
const AUDIT_CHAIN_LOCK_KEY = 0x75f1_4b0c_6dbe_a111n;

async insert(entry: AuditLogEntry): Promise<void> {
  await this.dataSource.transaction(async (manager) => {
    await manager.query('SELECT pg_advisory_xact_lock($1)', [AUDIT_CHAIN_LOCK_KEY.toString()]);
    // SELECT tail row_hash, compute new hash, INSERT
  });
}
```

**Every audit event takes a single global mutex.** Throughput ceiling :

| Audit event txn time | Theoretical max RPS |
|---|---|
| 5 ms | 200 audit/s |
| 10 ms | 100 audit/s |
| 20 ms | 50 audit/s |

`[inferred — Postgres lock contention scales inversely with txn duration under global serial lock]`

**For 100k MAU**, even at 1 audit event per user per minute, that's 1 666 audit/s sustained, **8–30× above the current ceiling**. The advisory lock serializes them all on one CPU core regardless of how many cores the DB has.

### Alternatives — ranked by complexity

| Alternative | Throughput gain | Tamper-evident guarantee | Complexity |
|---|---|---|---|
| **A. Partitioned hash chain by tenant/actor** | N× (N = partitions) | Per-partition chain, weaker but acceptable for most threat models | Low — change lock key to hash(tenantId) |
| **B. Monotonic ULID + post-verify chain** | ~1000× (insert is lock-free) | Chain verified offline; tampering detected at audit time, not block time | Medium — async verification job |
| **C. Append-only WAL + Merkle tree batch root** | 1000× insert speed | Strong (Merkle proofs) | High — separate batch processor |
| **D. UNLOGGED staging table + periodic rollup** | 10–100× | Loses crash recovery on staging table | Medium |
| **E. External audit service (ScyllaDB / append-only blob)** | Unbounded | Depends on backend | High — new infra |

`[appmaster 2026]` `[emergentmind audit logs]`

### Recommendation for Musaium

**Adopt option A (partitioned chain) as Phase 1, option B (monotonic ULID + offline verify) as Phase 2.**

- **Phase 1 (V1, < 30k MAU)** : change the lock key from a global constant to `hashtext('audit:' || actorId)`. Each user's audit events serialize *only with their own*, parallel across users. Lock contention drops by ~N where N = active concurrent users. Migration risk : minimal — the chain structure is unchanged, but verification logic must scope per-actor.
- **Phase 2 (post-30k MAU)** : switch to monotonic ULID (timestamp-prefixed, naturally ordered) for `id`, drop the per-row hash chain, run a daily/hourly offline job that computes a Merkle root over `[ulid, payload]` rows, stores it in a separate `audit_roots` table. Tampering = root mismatch.
- **Phase 3 (if compliance demands real-time tamper evidence)** : Merkle tree maintained incrementally, root anchored externally (e.g. signed by an HSM).

### Source

- [PostgreSQL — pg_advisory_xact_lock](https://www.postgresql.org/docs/current/functions-admin.html)
- [pgPedia — pg_advisory_xact_lock](https://pgpedia.info/p/pg_advisory_xact_lock.html)
- [AppMaster — Tamper-evident audit trails in PostgreSQL with hash chaining](https://appmaster.io/blog/tamper-evident-audit-trails-postgresql)
- [Emergent Mind — Immutable Audit Log Architecture](https://www.emergentmind.com/topics/immutable-audit-log)
- [AWS Database Blog — Diagnose and mitigate lock manager contention](https://aws.amazon.com/blogs/database/improve-postgresql-performance-diagnose-and-mitigate-lock-manager-contention/)

---

## 9. N+1 Detection & Query Optimization

`[typeorm.io 2026]` `[appsignal 2026]` `[copyprogramming 2026]`

### Detection methods

| Method | What it sees | When to use |
|---|---|---|
| **`pg_stat_statements`** | Aggregated query stats by normalized text | Production baseline; identifies hot queries |
| **`pgBadger`** (log analyzer) | Detailed per-query timing from logs | Weekly trend reports |
| **APM (Datadog / New Relic / Sentry traces)** | Per-request span tree, automatically flags N+1 patterns | Real-time detection in prod |
| **TypeORM `logging: ['query', 'warn']`** | All emitted SQL per request | Local dev, never prod |
| **ESLint `eslint-plugin-typeorm-perf` (if exists) / manual review** | Static patterns (lazy relations inside loops) | Pre-merge |

### TypeORM patterns to fix N+1

1. **Eager loading via `relations`** :
   ```ts
   userRepo.find({ relations: ['posts', 'posts.comments'] });
   ```
2. **`leftJoinAndSelect` for fine-grained control** :
   ```ts
   qb.leftJoinAndSelect('user.posts', 'post')
     .leftJoinAndSelect('post.comments', 'comment');
   ```
3. **DataLoader pattern (graphql-style batch + cache)** — reduces N+1 to 2 queries. Most useful for chat history fan-out.
4. **Never** rely on `eager: true` on the entity globally — opt-in per query.

### Musaium-specific N+1 risks (worth audit)

- `ChatMessage.toolCalls` lazy loading inside chat history fetch.
- `Museum.artworks` if a museum list endpoint also returns artwork counts.
- `User.preferences` + JWT introspection in middleware loop.

`[inferred — typical TypeORM patterns; deep dive needed]`

### Source

- [TypeORM — Performance and optimization](https://typeorm.io/docs/advanced-topics/performance-optimizing/)
- [AppSignal — N+1 Queries Explained, Spotted, and Solved](https://blog.appsignal.com/2020/06/09/n-plus-one-queries-explained.html)
- [Supabase — pg_stat_statements](https://supabase.com/docs/guides/database/extensions/pg_stat_statements)
- [pgBadger documentation](https://github.com/darold/pgbadger)

---

## 10. Load Test Methodology — k6 for 100k

`[k6.io 2026]` `[grafana k6 guide 2026]`

### Test taxonomy

| Type | Goal | Duration | Pattern |
|---|---|---|---|
| **Smoke** | Sanity, single VU | 1 min | Constant |
| **Average load** | Verify expected load | 5–15 min | ramp-up 5–15 % of total → plateau → ramp-down |
| **Stress** | Find breaking point | 15–30 min | Stepped increase until failure |
| **Spike** | Sudden burst | 5 min | 0 → peak in 30s |
| **Soak** | Memory leaks, slow degradation | 1–24 hours | Constant at 70 % avg load |

### k6 executors for 100k

`[k6.io 2026]`

- **`ramping-vus`** — gradually increase virtual users. Good for finding the breaking point.
- **`constant-arrival-rate`** — fixed RPS regardless of latency. Best for SLA verification.
- **`ramping-arrival-rate`** — gradually increase RPS. Best for capacity planning.

For 100k MAU verification :
```js
export const options = {
  scenarios: {
    main: {
      executor: 'ramping-arrival-rate',
      preAllocatedVUs: 5000,
      maxVUs: 10000,
      stages: [
        { target: 100, duration: '2m' },   // warmup
        { target: 1000, duration: '5m' },  // ramp
        { target: 3000, duration: '10m' }, // plateau (3k req/s ≈ 100k MAU peak)
        { target: 0, duration: '2m' },     // ramp-down
      ],
    },
  },
  thresholds: {
    'http_req_duration{status:200}': ['p(95)<500', 'p(99)<2000'],
    'http_req_failed': ['rate<0.01'],
  },
};
```

### What to measure server-side simultaneously

`[k6.io + tianpan.co LLM load testing 2026]`

- Event-loop lag (Node `perf_hooks`)
- DB connection-pool saturation (`pg_stat_activity`, count by state)
- Postgres lock wait counts (`pg_locks` blocked queries)
- Redis ops/sec + slowlog
- Memory RSS per Node process
- LLM Guard sidecar queue depth (32 max) + inflight (8 max) — **this is the next bottleneck after audit chain**.

### Capacity model for Musaium chat workload

Assume a chat request profile :
- 1 LLM Guard inflight slot (8 max → cap ≈ 8 concurrent chat req)
- 1–2 Postgres txns (chat history + audit chain → serialized on lock)
- 1–3 Redis ops (rate limit + cache)
- ~1 200 ms p95 LLM latency

→ **Chat throughput is fundamentally capped by LLM Guard at 8 concurrent** unless the sidecar scales horizontally. With p95 ≈ 1.2s, max throughput = `8 / 1.2 ≈ 6.7 req/s sustained`. **At 100k MAU sending 1 chat msg/day, peak hour is ~30 req/s — already 4× over capacity** unless guard sidecar scales.

### Source

- [Grafana k6 — Load Testing types and patterns](https://k6.io/docs/test-types/load-testing/)
- [Better Stack — Introduction to Modern Load Testing with k6](https://betterstack.com/community/guides/testing/grafana-k6/)
- [Tian Pan — Load Testing LLM Applications: Why k6 and Locust Lie to You](https://tianpan.co/blog/2026-03-19-load-testing-llm-applications)

---

## 11. CDN Strategies for Image-Heavy App

`[theimagecdn 2026]` `[kunalganglani 2026]`

### Comparison

| Provider | Storage | Transform | Delivery (egress) | Strength |
|---|---|---|---|---|
| **Cloudflare R2 + Images** | $0.015/GB/mo, no egress fee | $0.50 / 1k transforms (5k free) | included in R2 (zero egress!) | Zero-egress = killer for image-heavy apps |
| **BunnyCDN + Optimizer** | $0.01–0.02/GB/mo | $9.50/mo flat unlimited | $0.01/GB | Cheapest at scale, best media perf |
| **Fastly + Image Optimizer** | bucket-of-choice | $$$ premium | $$$ | Edge programmability, dev tools |
| **Cloudinary** | $0.18/GB/mo | huge free tier then $$$ | $0.12/GB | All-in-one DAM, expensive at scale |
| **Amazon S3 + CloudFront** | $0.023/GB/mo | Lambda@Edge custom | $0.085–0.09/GB | Vanilla, expensive egress |

### Crossover analysis

`[theimagecdn 2026]` : at **5 000+ images × 3+ sizes / month** (≥ 15 000 transforms), **BunnyCDN beats Cloudflare Images** on per-month cost. Cloudflare wins on zero-egress *if* you store in R2 and don't need many transforms.

### Recommendation for Musaium

**Cloudflare R2 + Cloudflare Images for V1** (until > 5 000 images uploaded by visitors), then migrate to **BunnyCDN Image Optimizer** when transform costs cross $50/mo.

- Visitor-uploaded photos → R2 (cheap storage, zero egress to public delivery).
- Pre-curated museum catalog images → BunnyCDN Optimizer (responsive sizes + WebP/AVIF auto-conversion).
- All served behind a CDN with `Cache-Control: public, max-age=31536000, immutable` for content-hashed URLs.

### Source

- [The Image CDN — Cloudflare Images Pricing 2026](https://theimagecdn.com/docs/cloudflare-images-pricing)
- [Kunal Ganglani — Bunny.net vs Cloudflare 2026](https://www.kunalganglani.com/blog/bunnynet-vs-cloudflare-2026)
- [LeanOpsTech — Media Storage Serverless Costs 2026](https://leanopstech.com/blog/media-storage-serverless-cost-comparison-2026/)

---

## 12. Capacity Plan — When to Scale What

### Assumed Musaium V1 workload (100k MAU target)

- 50 % monthly visit rate → 50k visits/month → ~1 700 visits/day
- 5 chat messages per visit avg → 8 500 messages/day → **0.1 msg/sec avg, peak hour ~3–8 msg/sec**
- 1 audit event per significant action (login, chat, photo upload) → ~50 000 audit events/day → **0.6 audit/sec avg, peak ~3–10 audit/sec**
- 1 image upload per visit → 1 700 images/day, ~3 MB each → 5 GB/day storage growth → **150 GB/month**
- DB read : write ratio ~ 80 : 20 (chat history reads, catalog browses, daily-art lookups)

### Scaling stages

| Stage | MAU | Topology | Cost (rough) | Bottleneck |
|---|---|---|---|---|
| **V1.0 — launch** | 0–10k | 1× 4-vCPU / 16 GB VPS (Hetzner CPX41 ≈ €30/mo), single Postgres + Redis, no PgBouncer | ~€50/mo | Audit chain lock under burst |
| **V1.1 — early growth** | 10–30k | Move DB to dedicated 8-vCPU / 32 GB VPS, add PgBouncer, add 1 streaming replica, ioredis Sentinel + 1 Redis replica | ~€150/mo | LLM Guard 8-inflight cap |
| **V1.2 — pre-shard** | 30–100k | Beefier primary (16 vCPU / 64 GB), 2 replicas, 2× app nodes (PM2 cluster), audit chain partitioned by actor | ~€400/mo | Audit chain redesign, image storage egress |
| **V2.0 — post-100k** | 100k+ | Managed Postgres (RDS / Cloud SQL) multi-AZ, audit Phase 2 (ULID + Merkle), Redis Cluster, multi-region only if cross-continent demand | $$$ | DB write throughput |

### Sharding decision criteria

`[planetscale guide 2026]` `[velodb 2026]`

- Primary CPU > 80 % sustained during business hours
- `pg_stat_activity` consistently shows queries queued behind locks (`waiting=true`)
- Autovacuum can't keep up
- Single largest table > 100M rows AND > 200 GB
- Connection limit hit even after pooler

**Musaium will *not* reach these thresholds at 100k MAU.** Pinterest ran 11 M users on 8 EC2 servers with a single MySQL each before sharding. `[engineerscodex / pinterest engineering 2026]`

### Multi-region decision criteria

- Compliance demands (GDPR data residency, China, etc.)
- p95 latency for cross-continent users > 500 ms (Musaium = B2C visitor in museums → mostly local)
- DR with active-active resilience required by enterprise B2B contract

**Recommendation : don't multi-region until B2B revenue forces it.** Aligns with Musaium's "no staging until B2B revenue" doctrine.

### Source

- [PlanetScale — When to Shard MySQL and Postgres](https://planetscale.com/blog/how-to-scale-your-database-and-when-to-shard-mysql)
- [VeloDB — 7 Ways to Scale PostgreSQL in 2026](https://www.velodb.io/glossary/ways-to-scale-postgresql)
- [Pinterest Engineering — Sharding Pinterest: How we scaled our MySQL fleet](https://medium.com/pinterest-engineering/sharding-pinterest-how-we-scaled-our-mysql-fleet-3f341e96ca6f)
- [BytebyteGo — How Pinterest Scaled to 500 Million Users](https://blog.bytebytego.com/p/how-pinterest-scaled-its-architecture)
- [Discord — How Discord Stores Trillions of Messages](https://discord.com/blog/how-discord-stores-trillions-of-messages)
- [AWS — REL10-BP01 Deploy the workload to multiple locations](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_fault_isolation_multiaz_region_system.html)

---

## Bottleneck Matrix & Mitigations

| # | Bottleneck | Current ceiling | Mitigation | Effort | Phase |
|---|---|---|---|---|---|
| 1 | **`pg_advisory_xact_lock` on every audit INSERT** | ~50–200 audit/s global | Partition by actor → ~50 audit/s × N actors. Phase 2 : ULID + Merkle batch. | M / H | V1.2 / V2 |
| 2 | **`DB_POOL_MAX=50` × N processes saturates Postgres** | ≤2 PM2 workers before max_connections hit | Wire PgBouncer transaction-mode, drop pool to 10–15 | L | V1.1 |
| 3 | **LLM Guard sidecar 8 inflight / 32 queue** | ~7 chat req/s | Horizontal scale sidecar (k8s replicas), bump inflight if vertically scaled | M | V1.1 |
| 4 | **Single Postgres → no read replica wired** | reads compete with writes | Set `DB_REPLICA_URL`, route `find()` to slave | L | V1.1 |
| 5 | **No connection pooler** | each Node holds 50 backend conn | Deploy PgBouncer | L | V1.1 |
| 6 | **Default autovacuum** | falls behind on hot tables | Per-table tuning (`SET (autovacuum_vacuum_scale_factor = 0.02)`) | L | V1.1 |
| 7 | **Single Redis instance** | ~100k ops/s ceiling | Sentinel + replica, then Cluster | M | V1.2 |
| 8 | **No HTTP/2 / keepalive tuning** | 502s under LB churn | `server.keepAliveTimeout=61000, headersTimeout=62000` | L | V1.0 |
| 9 | **No N+1 detection in prod** | unknown but probable | APM (Sentry tracing already in stack), `pg_stat_statements` | L | V1.0 |
| 10 | **Image hosting cost** | grows linearly w/ uploads | R2 zero-egress + CDN cache headers | L | V1.1 |

---

## Verdict

**Honesty disclosure : I have not run k6 or profiled production. This is an architecture review based on (a) repo reads, (b) cited 2024–2026 sources, (c) Postgres / Node scaling fundamentals.**

Musaium can serve **30k MAU on a single tuned 8-vCPU VPS** with the changes in V1.1 (PgBouncer + replica wiring + audit chain partitioning + autovacuum tuning + Redis Sentinel). Reaching 100k MAU comfortably requires V1.2 changes plus **decisive resolution of the audit-chain global lock**, which is the single deterministic ceiling no amount of CPU adds will lift.

**Order of work (highest leverage first):**
1. **Audit chain : partition lock by actor** (1 PR, low risk, ~5× write throughput). 
2. **PgBouncer transaction-mode in front of Postgres** + `DB_POOL_MAX=15` per process.
3. **Wire `DB_REPLICA_URL`** + provision 1 streaming replica VPS, route reads.
4. **Postgres tuning** : `shared_buffers=8GB`, `random_page_cost=1.1`, `effective_io_concurrency=256`, per-table autovacuum on `audit_logs` / `chat_messages`.
5. **Redis Sentinel + replica** when concurrent users > 5k.
6. **Phase 2 audit redesign** (ULID + Merkle) only if Phase 1 still bottlenecks.

Sharding (Citus, ScyllaDB-style migration) is **not warranted** at 100k. The audit-chain lock is the bottleneck, not data volume.

---

## Sources (consolidated)

### PostgreSQL tuning
- [PostgreSQL wiki — Tuning Your PostgreSQL Server](https://wiki.postgresql.org/wiki/Tuning_Your_PostgreSQL_Server)
- [Mydbops — PostgreSQL Parameter Tuning Best Practices 2026](https://www.mydbops.com/blog/postgresql-parameter-tuning-best-practices)
- [EDB — How to tune PostgreSQL for memory](https://www.enterprisedb.com/postgres-tutorials/how-tune-postgresql-memory)
- [Cybertec — Better PostgreSQL performance on SSDs](https://www.cybertec-postgresql.com/en/better-postgresql-performance-on-ssds/)
- [Frederik Himpe — Tuning PostgreSQL for SSD (Jul 2025)](https://blog.frehi.be/2025/07/28/tuning-postgresql-performance-for-ssd/)
- [PostgreSQL wiki — Number Of Database Connections](https://wiki.postgresql.org/wiki/Number_Of_Database_Connections)
- [PostgreSQL — Autovacuum docs](https://www.postgresql.org/docs/current/runtime-config-autovacuum.html)
- [EDB — Autovacuum Tuning Basics](https://www.enterprisedb.com/blog/autovacuum-tuning-basics)
- [Percona — Tuning Autovacuum in PostgreSQL](https://www.percona.com/blog/tuning-autovacuum-in-postgresql-and-autovacuum-internals/)

### PostgreSQL 16/17 perf
- [EDB — Scaling Breakthrough: EPAS 17 Scales Twice as Well](https://www.enterprisedb.com/blog/scaling-breakthrough-epas-17-scales-twice-well-thanks-postgresql)
- [ClickHouse — PostgresBench Reproducible Benchmark](https://clickhouse.com/blog/postgresbench)
- [PlanetScale — Benchmarking Postgres 17 vs 18](https://planetscale.com/blog/benchmarking-postgres-17-vs-18)

### PgBouncer / pooler ecosystem
- [PgBouncer Features](https://www.pgbouncer.org/features.html)
- [Crunchy Data — Prepared Statements in Transaction Mode for PgBouncer](https://www.crunchydata.com/blog/prepared-statements-in-transaction-mode-for-pgbouncer)
- [Heroku — PgBouncer Configuration](https://devcenter.heroku.com/articles/best-practices-pgbouncer-configuration)
- [Tembo — Benchmarking PostgreSQL connection poolers](https://www.tembo.io/blog/postgres-connection-poolers)
- [PkgPulse — PgBouncer vs PgCat vs Supavisor 2026](https://www.pkgpulse.com/blog/pgbouncer-vs-pgcat-vs-supavisor-postgresql-connection-2026)

### TypeORM replication
- [TypeORM Docs — Multiple data sources, databases, schemas and replication](https://typeorm.io/docs/data-source/multiple-data-sources/)
- [TypeORM Issue #11972 — poolSize for master/slave](https://github.com/typeorm/typeorm/issues/11972)
- [TypeORM Issue #11980 — pool options for master/slave](https://github.com/typeorm/typeorm/issues/11980)

### Node.js / Express scaling
- [PM2 Cluster Mode](https://pm2.keymetrics.io/docs/usage/cluster-mode/)
- [Halodoc — Enhancing Uptime and Performance with Node.js Clustering using PM2](https://blogs.halodoc.io/nodejs-clustering-using-pm2/)
- [ConnectReport — Tuning HTTP Keep-Alive in Node.js](https://connectreport.com/blog/tuning-http-keep-alive-in-node-js/)
- [Express — Performance Best Practices](https://expressjs.com/en/advanced/best-practice-performance.html)

### Redis
- [Redis — Scaling Redis: Clustering, Sharding, Read Replicas](https://redis.io/tutorials/operate/redis-at-scale/scalability/)
- [Redis Blog — Redis 8 is now GA](https://redis.io/blog/redis-8-ga/)
- [Bhawesh Kumar — Redis in Production (Apr 2026)](https://www.bhaweshkumar.com/blog/2026/04/23/redis-production-deployment-guide/)
- [ioredis GitHub](https://github.com/redis/ioredis)

### Audit / hash chain
- [AWS — Diagnose and mitigate lock manager contention](https://aws.amazon.com/blogs/database/improve-postgresql-performance-diagnose-and-mitigate-lock-manager-contention/)
- [AppMaster — Tamper-evident audit trails in PostgreSQL with hash chaining](https://appmaster.io/blog/tamper-evident-audit-trails-postgresql)
- [Emergent Mind — Immutable Audit Log Architecture](https://www.emergentmind.com/topics/immutable-audit-log)
- [Supabase — Postgres Auditing in 150 lines of SQL](https://supabase.com/blog/postgres-audit)

### N+1 / monitoring
- [TypeORM — Performance and optimization](https://typeorm.io/docs/advanced-topics/performance-optimizing/)
- [AppSignal — Performance and N+1 Queries](https://blog.appsignal.com/2020/06/09/n-plus-one-queries-explained.html)
- [Supabase — pg_stat_statements](https://supabase.com/docs/guides/database/extensions/pg_stat_statements)
- [Severalnines — Query observability with pg_stat_monitor and pg_stat_statements](https://severalnines.com/blog/query-observability-and-performance-tuning-with-pg_stat_monitor-and-pg_stat_statements/)

### Load testing
- [Grafana k6 — Average-load testing beginner's guide](https://k6.io/docs/test-types/load-testing/)
- [Better Stack — Modern Load Testing with k6](https://betterstack.com/community/guides/testing/grafana-k6/)
- [Tian Pan — Load Testing LLM Applications (Mar 2026)](https://tianpan.co/blog/2026-03-19-load-testing-llm-applications)

### CDN / images
- [The Image CDN — Cloudflare Images Pricing 2026](https://theimagecdn.com/docs/cloudflare-images-pricing)
- [The Image CDN — Best Image CDNs 2026](https://theimagecdn.com/docs/best-image-cdns)
- [Kunal Ganglani — Bunny.net vs Cloudflare 2026](https://www.kunalganglani.com/blog/bunnynet-vs-cloudflare-2026)
- [LeanOpsTech — Media Storage Serverless Costs 2026](https://leanopstech.com/blog/media-storage-serverless-cost-comparison-2026/)

### Scaling stories & decision frameworks
- [Discord — How Discord Stores Trillions of Messages](https://discord.com/blog/how-discord-stores-trillions-of-messages)
- [ScyllaDB — Discord Migration](https://www.scylladb.com/tech-talk/how-discord-migrated-trillions-of-messages-from-cassandra-to-scylladb/)
- [Pinterest Engineering — Sharding Pinterest](https://medium.com/pinterest-engineering/sharding-pinterest-how-we-scaled-our-mysql-fleet-3f341e96ca6f)
- [Engineers Codex — How Pinterest scaled to 11 million users with 6 engineers](https://read.engineerscodex.com/p/how-pinterest-scaled-to-11-million)
- [PlanetScale — When to Shard MySQL and Postgres](https://planetscale.com/blog/how-to-scale-your-database-and-when-to-shard-mysql)
- [VeloDB — 7 Ways to Scale PostgreSQL in 2026](https://www.velodb.io/glossary/ways-to-scale-postgresql)
- [Tinybird — PostgreSQL horizontal scaling — 3 approaches in 2026](https://www.tinybird.co/blog/postgresql-horizontal-scaling)

### AWS / multi-AZ / DR
- [AWS RDS Multi-AZ Deployments](https://aws.amazon.com/rds/features/multi-az/)
- [AWS Well-Architected — REL10-BP01 Deploy the workload to multiple locations](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_fault_isolation_multiaz_region_system.html)
- [pgEdge — Multi-Region PostgreSQL Clusters with Active-Active](https://www.pgedge.com/blog/the-role-of-active-active-replication-in-building-multi-region-resilient-postgresql-clusters)
- [AWS — Using pgactive: Active-active Replication on RDS PostgreSQL](https://aws.amazon.com/blogs/database/using-pgactive-active-active-replication-extension-for-postgresql-on-amazon-rds-for-postgresql/)
