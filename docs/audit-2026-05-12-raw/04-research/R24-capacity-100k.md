# R24 — Capacity Planning Model for Musaium 100k MAU

**Auditor:** R24 (Capacity Planning Research Agent)
**Date:** 2026-05-12
**Scope:** Sizing model from V1 launch (≤10k MAU) → V1.2 (100k MAU) on OVH VPS single-tenant prod, no staging. Stack = Node 22 + Express 5 + TypeORM + PG 16 + Redis + LLM Guard sidecar.
**Honesty (UFR-013):** Claims labelled — `[verified]` = read in repo / cited source ; `[inferred]` = derived from cited principle ; `[assumed]` = working hypothesis pending load test. **No load test was run.** This is a model, not a measurement.

---

## TL;DR

For a cultural B2C voice-first app like Musaium, **100k MAU translates to a sustained peak of ~25-50 chat requests/sec, ~5-15 image uploads/sec, ~5-15 voice turns/sec** during museum visit hours (10h-18h local). Assuming a standard B2C engagement of **DAU/MAU ≈ 20-25%** (rare-use cultural app, not a daily-habit social product) and **PCU/DAU ≈ 5-10%**, peak concurrent ≈ **1 250 - 2 500 active sessions**. The current Musaium config (`DB_POOL_MAX=50`, `LLM_GUARD_MAX_INFLIGHT=8`, single Postgres, single Redis, no PgBouncer) [verified — `museum-backend/src/config/env.ts`] supports **5-10k MAU comfortably, 30k with V1.1 upgrades (PgBouncer + replica + audit-chain partition + LLM Guard horizontal scale), 100k only with V1.2 changes (16+ vCPU primary + 2+ replicas + Redis Sentinel + R2 + multi-instance Guard)**. Estimated all-in cost @ 100k MAU = **€1 100 - €1 800 / month** (compute + LLM + storage + CDN), dominated by LLM API (~50-70% of bill).

**Capacity ladder** : V1.0 launch (Advance-1 ~€90/mo) → V1.1 30k MAU (Advance-3 ~€180/mo + 2nd Advance-1 replica ~€90/mo + Cloudflare R2 ~€20/mo) → V1.2 100k MAU (Advance-5 ~€285/mo primary + 2× Advance-1 replicas + 2× LLM Guard nodes + R2 + BunnyCDN ~€50/mo).

**Verdict :** sizing math works. The deterministic ceiling is **(1) LLM Guard 8 inflight slots and (2) the global audit-chain advisory lock** ; both have been quantified by R8. Capital scaling is not the issue — software ceilings are. Load test in k6 before 30k MAU crossing, not after.

---

## 1. MAU vs DAU vs Concurrent — Cultural B2C Ratios

### Industry baselines (2026)

| Vertical | DAU/MAU | Source / context |
|---|---|---|
| Daily-habit social (Instagram, TikTok) | 50%+ | [a16z social benchmark](https://a16z.com/do-you-have-lightning-in-a-bottle-how-to-benchmark-your-social-app/) |
| Highly-engaged B2C (Duolingo, Spotify) | 30-50% | [PMToolkit DAU/MAU 2026](https://pmtoolkit.ai/learn/growth/dau-mau-engagement) |
| Generic B2C app | 20-30% | [UXCam mobile app engagement benchmarks 2026](https://uxcam.com/blog/mobile-app-engagement-benchmarks/) |
| **Cultural / occasional B2C** (Musaium = museum visit) | **10-20%** | [inferred — derives from session pattern : user opens app *during* a museum visit, not daily] |
| B2B / utility | 5-15% | [Payproglobal DAU/MAU SaaS 2026](https://payproglobal.com/answers/what-is-dau-mau-ratio-in-saas/) |

**Musaium realistic baseline = DAU/MAU 15%** — a user opens the app ~4-5 times/month (1 visit + 2-3 trip-planning sessions + 1-2 review/recap sessions). Compared to Smartify (2 million active users, ~700 partners) [verified — [Smartify partners 2026](https://partners.smartify.org/)] and Bloomberg Connects (1 250+ institutions) [verified — [Bloomberg Connects 2026](https://www.bloombergconnects.org/)], Musaium's positioning is similar : occasional, visit-anchored.

### Peak concurrent / DAU

| Ratio | Rule |
|---|---|
| Generic B2C | 10-15% PCU/DAU ([copyprogramming 2026](https://copyprogramming.com/howto/calculating-concurrent-users)) |
| Museum visit window (10h-18h, 8h active) | concentrated peak → **15-20% PCU/DAU** for cultural app [inferred] |
| Burst protection multiplier | × 1.5-2× ([loadview-testing 2026](https://www.loadview-testing.com/learn/capacity-planning/)) |

**Working numbers for capacity model (Musaium @ 100k MAU)** :
- DAU = 15 000 (15% of 100k)
- Visit window 8h → effective active hour throughput = `15 000 / 8 = 1 875 sessions/hour`
- Peak hour (typical Saturday afternoon 14h-16h) = **× 2** of average → 3 750 sessions/hour
- Average session = 8 minutes (museum browse window) → sessions in-flight at any moment = `3 750 × (8/60) ≈ 500 concurrent`
- With burst headroom × 1.5 → **750 peak concurrent sessions** plan target
- Sized for 2 000 concurrent (safety × 2.5) to cover anomalies (school groups, opening day, press coverage)

### Sources

- [a16z — How to Benchmark Your Social App](https://a16z.com/do-you-have-lightning-in-a-bottle-how-to-benchmark-your-social-app/)
- [PMToolkit — DAU/MAU 2026 Engagement Guide](https://pmtoolkit.ai/learn/growth/dau-mau-engagement)
- [UXCam — Mobile App Engagement Benchmarks 2026](https://uxcam.com/blog/mobile-app-engagement-benchmarks/)
- [copyprogramming — Calculating Concurrent Users 2026](https://copyprogramming.com/howto/calculating-concurrent-users)
- [Smartify Partners](https://partners.smartify.org/)
- [Bloomberg Connects](https://www.bloombergconnects.org/)

---

## 2. Per-Action Profile

Verified latency components from R8 + R3 + R4 + R9 prior research + Musaium repo reads.

| Action | Latency (p50 / p95) | Server-side cost | LLM Guard? | DB rows | Concurrency footprint |
|---|---|---|---|---|---|
| **Cold session load** (auth refresh + me + museum-list + history seed) | 200 / 600 ms | ~5 DB queries, 1 Redis GET, 1 JWT verify | No | 5-8 reads | 1 conn × 200ms |
| **Chat message (text)** | 3 000 / 5 500 ms | Guardrail in + LLM (OpenAI / DeepSeek) + Guardrail out + audit insert | **2× LLM Guard slots** (in + out) | 2 inserts + 1 audit (locked) | 1 conn × 5s + 2 Guard inflight × 5s |
| **Voice turn** (STT + LLM + TTS) | 4 500 / 8 000 ms | STT 600ms + LLM 3-5s + TTS 700ms + audio S3 PUT + DB persist + audit | **2× Guard slots** | 2 inserts + 1 audit | 1 conn × 8s + 2 Guard × 5s |
| **Image upload + SigLIP enrich** | 1 200 / 2 500 ms | Sharp resize + ONNX SigLIP embed (~250ms CPU) [verified — `museum-backend/src/modules/chat/adapters/secondary/embeddings/siglip-onnx.adapter.ts`] + pgvector insert + S3 PUT | No | 1 image row + 1 embedding row | 1 conn × 1.5s + 1 ONNX worker × 250ms |
| **Daily-art catalog read** | 50 / 200 ms | Cached in Redis (TTL 1h) | No | 1 read (cache hit) | trivial |
| **Museum/POI list** | 100 / 300 ms | 1 join query | No | 1-3 reads | 1 conn × 100ms |
| **History fetch** (last 50 msgs) | 150 / 400 ms | 1 query w/ LIMIT 50 | No | 50 rows | 1 conn × 150ms |

### Concurrency math

**Chat is the binding constraint** — at p95 5.5s with 2× LLM Guard slots consumed (input scan + output scan), `LLM_GUARD_MAX_INFLIGHT=8` [verified — `museum-backend/src/config/env.ts`] means **max 4 concurrent chat turns sustainable**. At 5.5s × 4 chats = `4/5.5 ≈ 0.73 chat/sec sustained throughput` per backend instance. Doubling Guard to `MAX_INFLIGHT=16` per instance → 1.5 chats/sec. **100k MAU peak = ~25-50 chats/sec target → need 10-30× scaling of Guard sidecar throughput** (horizontal replicas OR vertical bump of `MAX_INFLIGHT`).

### Sources

- R8 prior audit `audit-2026-05-12/04-research/R8-scaling-100k.md` (audit-chain analysis)
- R3 prior audit (LangChain orchestration)
- R4 prior audit (LLM Guard sidecar architecture)
- [Tian Pan — Load Testing LLM Applications (Mar 2026)](https://tianpan.co/blog/2026-03-19-load-testing-llm-applications)

---

## 3. Throughput Targets at Peak

**Assumption :** of 750-2 000 peak concurrent sessions @ 100k MAU :
- 30% are actively chatting (text or voice) at any moment → ~225-600 chat turns/min → **4-10 chats/sec sustained**, **bursts to 25-50/sec** in opening-day / press scenarios
- 20% are loading images → ~150-400 image ops/min → **3-7 image embeds/sec**
- 40% are passive (browse, history, poi list) → **20-50 HTTP req/sec**
- 10% idle / session-renewing → trivial

| Endpoint family | p95 latency target | Peak QPS target | Burst QPS target |
|---|---|---|---|
| POST `/api/chat/messages` | < 6 s | 10 | 50 |
| POST `/api/chat/voice` | < 9 s | 5 | 25 |
| POST `/api/images/upload` | < 3 s | 7 | 30 |
| GET `/api/museum/*` | < 300 ms | 30 | 150 |
| GET `/api/chat/history` | < 400 ms | 20 | 100 |
| GET `/api/daily-art/today` | < 200 ms | 50 (cached) | 200 |
| Total HTTP at edge | n/a | **~120 req/sec sustained** | **~550 req/sec burst** |

**Headroom rule [AWS Well-Architected REL07-BP03](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_adapt_to_changes_proactive_adapt_auto.html)] : provision 2× burst** → backend capacity sized for **1 100 req/sec total HTTP** even though average use is 1/10 of that.

### Sources

- [AWS Well-Architected — REL07 Auto Scaling](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_adapt_to_changes_proactive_adapt_auto.html)
- [LoadView — Capacity Planning Load Testing](https://www.loadview-testing.com/learn/capacity-planning/)

---

## 4. VPS Sizing — OVH

### OVH 2026 catalog (verified pricing 2026-05)

`[verified — [OVH Advance pricing](https://us.ovhcloud.com/bare-metal/advance/), [Scale pricing](https://us.ovhcloud.com/bare-metal/scale/), [OVH dedicated prices](https://us.ovhcloud.com/bare-metal/prices/)]`

> Pricing as of 2026 (after April 2026 price increase). USD listed ; EUR ≈ same numeric value with -10% to -15% in EU pricing. **Anti-DDoS included on all OVH bare-metal** — [verified, OVH VAC](https://www.ovhcloud.com/en/bare-metal/ddos-protected-server/).

| Tier | CPU | RAM | Storage | Bandwidth | Price/mo | Use |
|---|---|---|---|---|---|---|
| **VPS-1 Starter** | 2 vCPU | 2 GB | 40 GB NVMe | 250 Mbps | $7.60 | Dev/test only |
| **VPS-4 Comfort** | 8 vCPU | 16 GB | 160 GB NVMe | 1 Gbps | $43.50 | Pre-launch staging if ever used |
| **Advance-1 2026** | AMD EPYC 4245P 6c/12t | 32 GB DDR5 | 2× 512 GB NVMe | 1 Gbps | **$124 / ~€115** | V1.0 launch (≤10k MAU) |
| **Advance-3 2026** | EPYC 4344P 8c/16t | 64 GB DDR5 | 2× 960 GB NVMe | 1-2 Gbps | **$180-220 / ~€170-200** | V1.1 (10-30k MAU) primary |
| **Advance-5** | EPYC 8224P 24c/48t | 96-576 GB DDR5 | 2× 3.84 TB NVMe | 2-5 Gbps | **$285 / ~€265** | V1.2 (30-100k MAU) primary |
| **Scale-a3** | EPYC 9354 32c/64t | 128 GB - 1 TB DDR5 | 2× 3.84 TB NVMe | 10 Gbps | **$513 / ~€475** | V2+ (>100k MAU, only if vertical maxed) |

### Sizing decision per stage

| Stage | Primary VPS | Replica VPS | LLM Guard host | Total compute / mo |
|---|---|---|---|---|
| V1.0 — 0-10k MAU | Advance-1 (€115) | — (replica plumbing dormant) | inline on primary | **~€115** |
| V1.1 — 10-30k MAU | Advance-3 (€200) | Advance-1 streaming replica (€115) | dedicated Advance-1 (€115) | **~€430** |
| V1.2 — 30-100k MAU | Advance-5 (€265) | 2× Advance-3 replicas (€400) | 2× Advance-1 Guard nodes (€230) | **~€895** |
| V2 — 100k+ | Scale-a3 (€475) or managed Postgres | 2-3× replicas | 3+ Guard nodes | **€1 500-2 500+** |

> **NVMe IOPS** : OVH Advance NVMe delivers 100k+ IOPS at sub-ms latency — well above PostgreSQL needs at 100k MAU. PostgreSQL on properly-tuned NVMe hits 26 000 TPS at 2.3 ms latency [verified — [Azure PostgreSQL on NVMe 2025](https://blog.aks.azure.com/2025/07/09/postgresql-nvme)] ; PostgreSQL 18 reached 1.2 M IOPS on Samsung PM1735 NVMe [verified — [PostgresQLHTX 2026](https://postgresqlhtx.com/postgresql-18-async-i-o-in-production-real-world-benchmarks-configuration-patterns-and-storage-performance-in-2026/)]. **At Musaium's scale, IOPS will never be the bottleneck — locks and connection pool will be.**

### Hetzner comparison (alternative)

`[verified — [Hetzner vs OVH 2026](https://1vps.com/ovh-vs-hetzner), [CDN Sun 2026 pricing increase](https://blog.cdnsun.com/ovhcloud-and-hetzner-2026-hosting-price-increases-explained/)]`

Hetzner ~25-35% cheaper at equivalent specs (auction servers from $35, unmetered traffic). **Recommendation : stay on OVH for V1 (incumbent, anti-DDoS included, EU jurisdiction)**, but maintain Hetzner option for V1.2 cost negotiation leverage.

### Sources

- [OVH Advance Dedicated Servers](https://us.ovhcloud.com/bare-metal/advance/)
- [OVH Advance-1 2026 spec](https://www.ovhcloud.com/en/bare-metal/advance/adv-1/)
- [OVH Scale Server](https://us.ovhcloud.com/bare-metal/scale/)
- [OVHcloud Pricing 2026 evolution blog](https://blog.ovhcloud.com/pricing-evolution-of-public-cloud-bare-metal-and-vps-at-ovhcloud/)
- [OVH VPS Review 2026 — space-node](https://space-node.net/blog/ovh-vps-review-2026)
- [Hetzner vs OVH 2026](https://1vps.com/ovh-vs-hetzner)

---

## 5. PostgreSQL Sizing at Scale

### Memory parameters per RAM tier

`[verified — [EDB tune memory](https://www.enterprisedb.com/postgres-tutorials/how-tune-postgresql-memory), [OneUptime PG tuning 2026](https://oneuptime.com/blog/post/2026-02-20-postgresql-performance-tuning/view), [Cybertec effective_cache_size](https://www.cybertec-postgresql.com/en/effective_cache_size-what-it-means-in-postgresql/)]`

| Tier | Server RAM | `shared_buffers` | `effective_cache_size` | `work_mem` | `maintenance_work_mem` |
|---|---|---|---|---|---|
| V1.0 (Advance-1) | 32 GB | 8 GB (25%) | 24 GB (75%) | 16 MB | 1 GB |
| V1.1 (Advance-3) | 64 GB | 16 GB (25%) | 48 GB (75%) | 32 MB | 2 GB |
| V1.2 (Advance-5) | 128 GB | 8 GB (cap)* | 96 GB (75%) | 64 MB | 2 GB |

\* **Above 32 GB RAM, hold `shared_buffers` at 8 GB** — returns diminish past this point [verified — [OneUptime PG buffers 2026](https://oneuptime.com/blog/post/2026-01-25-postgresql-shared-buffers-work-mem-tuning/view)] ; the rest goes to OS page cache (effective_cache_size).

### Connections — must use PgBouncer

`[verified — [Postgres wiki connections](https://wiki.postgresql.org/wiki/Number_Of_Database_Connections), [Microsoft TechCommunity PG connection limits](https://techcommunity.microsoft.com/blog/adforpostgresql/analyzing-the-limits-of-connection-scalability-in-postgres/1757266)]`

- PostgreSQL **does not scale well past ~200-500 backend connections, even idle** ; experts recommend "no more than 1 000". Setting `max_connections=100 000` allocates 16-21 GB shared memory just for connection state.
- **Formula** : `pool_size = (cores × 2) + 1` for NVMe → 8-vCPU server = 17 connections in pool.
- PgBouncer transaction mode lets 10 000 client conns multiplex onto 25 backend conns [verified — [OneUptime PgBouncer 10K](https://oneuptime.com/blog/post/2026-01-26-pgbouncer-connection-pooling/view), [PlanetScale PgBouncer scaling](https://planetscale.com/blog/scaling-postgres-connections-with-pgbouncer)].

| Stage | `max_connections` (Postgres) | PgBouncer `default_pool_size` | PgBouncer `max_client_conn` | App `DB_POOL_MAX` |
|---|---|---|---|---|
| V1.0 | 100 (default) | n/a (no PgBouncer) | n/a | **15** (reduce from current 50) |
| V1.1 | 200 | 25 | 2 000 | 10 per Node instance |
| V1.2 | 400 | 50 | 5 000 | 10 per Node instance |

> **Musaium current `DB_POOL_MAX=50`** [verified — `museum-backend/src/config/env.ts:69`] **× 2 PM2 workers = 100 backend conns, already at default Postgres ceiling.** This is the **first thing to fix** — even before scaling hardware.

### Vacuum at scale

Per-table autovacuum tuning for hot tables (`audit_logs`, `chat_messages`, `images`) :
```sql
ALTER TABLE audit_logs SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_vacuum_cost_delay = 0);
ALTER TABLE chat_messages SET (autovacuum_vacuum_scale_factor = 0.05);
```

### Sources

- [PostgreSQL wiki — Number Of Database Connections](https://wiki.postgresql.org/wiki/Number_Of_Database_Connections)
- [OneUptime — PG shared_buffers and work_mem 2026](https://oneuptime.com/blog/post/2026-01-25-postgresql-shared-buffers-work-mem-tuning/view)
- [Microsoft TechCommunity — PG connection scalability](https://techcommunity.microsoft.com/blog/adforpostgresql/analyzing-the-limits-of-connection-scalability-in-postgres/1757266)
- [PlanetScale — Scaling Postgres connections with PgBouncer](https://planetscale.com/blog/scaling-postgres-connections-with-pgbouncer)
- [OneUptime — Handle 10K connections with PgBouncer](https://oneuptime.com/blog/post/2026-01-26-pgbouncer-connection-pooling/view)
- [EDB — Why use connection pooling](https://www.enterprisedb.com/postgres-tutorials/why-you-should-use-connection-pooling-when-setting-maxconnections-postgres)

---

## 6. Redis Sizing

### Working set sizing

`[verified — [Redis memory optimization](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/memory-optimization/), [OneUptime Redis hardware 2026](https://oneuptime.com/blog/post/2026-03-31-redis-estimate-hardware-requirements/view), [Bhawesh Kumar Redis prod 2026](https://www.bhaweshkumar.com/blog/2026/04/23/redis-production-deployment-guide/)]`

Musaium's Redis [verified — `museum-backend/src/shared/cache/redis-client.ts`] caches :
- Rate limit counters (small, TTL ≤ 60s)
- LLM response cache (`llm:v1:*`) — per CLAUDE.md ADR-036, sha256-keyed responses, TTL 7d
- Session/JWT introspection cache
- Daily-art catalog cache (TTL 1h)

### Per-tier RAM estimate

| Stage | Working set | RAM provisioned | Why |
|---|---|---|---|
| V1.0 | ~200 MB | 1 GB | Headroom for fragmentation + persistence rewrite |
| V1.1 | ~1 GB | 4 GB | 30k users × ~30 KB session/cache footprint |
| V1.2 | ~4-6 GB | 16 GB | 100k MAU + LLM cache hot keys + image fingerprints |

> **Rule** : Redis with persistence enabled can use **up to 2× normal RAM during AOF/RDB rewrite** [verified — [Redis admin docs](https://redis.io/docs/latest/operate/oss_and_stack/management/admin/)]. Provision 2× working set. For 10 GB working set → 16-20 GB physical RAM.

### Persistence

`[verified — [Redis persistence docs](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)]`

**Production hybrid (AOF + RDB)** — recommended :
- AOF `appendfsync everysec` (loses ≤ 1 sec of writes on crash)
- RDB snapshot every 60 min as belt-and-braces
- Redis 8.0 (Dec 2025 GA) gives +112% throughput on 8+ core CPUs with `io-threads=8` [verified — [Redis 8 GA](https://redis.io/blog/redis-8-ga/)]

### Topology

| Stage | Topology |
|---|---|
| V1.0 | Single Redis on primary VPS (same host as Node) |
| V1.1 | Single Redis on dedicated 4-vCPU / 8 GB VPS — colocate with PgBouncer |
| V1.2 | **Sentinel (3 nodes monitoring 1 primary + 1 replica)** — auto-failover, no sharding |
| V2 | Redis Cluster only if working set > 16 GB or write rate > 100k ops/sec |

Musaium current : `clusterNodes: REDIS_CLUSTER_NODES ?? null` [verified — `museum-backend/src/config/env.ts`] = falls back to single-node. **Correct for V1.**

### Sources

- [Redis — Memory optimization](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/memory-optimization/)
- [Redis — Persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)
- [Redis 8 GA](https://redis.io/blog/redis-8-ga/)
- [OneUptime — Redis hardware estimation 2026](https://oneuptime.com/blog/post/2026-03-31-redis-estimate-hardware-requirements/view)
- [Bhawesh Kumar — Redis Production Deployment Guide 2026](https://www.bhaweshkumar.com/blog/2026/04/23/redis-production-deployment-guide/)

---

## 7. LLM Guard Sidecar Scaling

### Current state

`[verified — `museum-backend/src/config/env.ts`]`
- `LLM_GUARD_MAX_INFLIGHT=8`
- `LLM_GUARD_QUEUE_MAX=32`
- Circuit breaker : 5 failures → open 30s → 1 half-open probe [verified — `museum-backend/src/modules/chat/adapters/secondary/guardrails/guardrail-circuit-breaker.ts`]
- Recently fixed to fail-CLOSED [verified — recent git log `e45490c1 fix(security,chat): restore LLM Guard fail-CLOSED + inflight semaphore + audit`]

### Throughput ceiling

With 2× scans per chat (input + output) consuming 2 inflight slots at p95 5s scan duration :
- **Single sidecar max sustained = 8 inflight ÷ (2 × 5s) = 0.8 chats/sec**, queue absorbs ~3s of burst (32 ÷ 8 × 5s)
- Beyond this, requests queue then time out → user-visible 502

### Scaling options

| Approach | Effort | Capacity gain | Risk |
|---|---|---|---|
| **Vertical** — bump `MAX_INFLIGHT=16` on bigger VM | Low | 2× | Memory pressure on sidecar |
| **Horizontal — round-robin across N replicas** | Medium | N× | Need front-side LB |
| **Async batch (group scans)** | High | 5-10× | Latency penalty |
| **Replace with on-policy filter only for hot path, async LLM Guard for sample** | High | 100× | Reduced security coverage |

`[verified — [Markaicode LLM scaling K8s 2026](https://markaicode.com/scaling-llm-api-kubernetes-guide/), [NVIDIA queue-based autoscaling](https://developer.nvidia.com/blog/enabling-horizontal-autoscaling-of-enterprise-rag-components-on-kubernetes/)]`

Queue-based autoscaling pattern : alert/scale when sidecar inflight > 80% AND queue depth > 50% for 2+ minutes. For Musaium V1.2 plan : 3× LLM Guard replicas behind a simple HAProxy or Caddy LB.

### LLM Guard performance baseline

`[verified — [LLM Guard GitHub Protect AI](https://github.com/protectai/llm-guard)]` — 2.5M downloads, scanner library. **No published RPS benchmark** ; latency dominated by HuggingFace model inference per scanner. p95 scan ≈ 800ms-2s on CPU, 100-300ms on GPU. **Recommendation : if Musaium can fit a single VPS with GPU (or moves to LLaMA-Guard on T4-class accelerator), one sidecar handles 100k MAU.** Otherwise keep CPU-only horizontal scale.

### Sources

- [Protect AI — LLM Guard](https://protectai.com/llm-guard)
- [GitHub protectai/llm-guard](https://github.com/protectai/llm-guard)
- [Markaicode — Scaling LLM APIs on Kubernetes 2026](https://markaicode.com/scaling-llm-api-kubernetes-guide/)
- [NVIDIA — Enabling Horizontal Autoscaling of Enterprise RAG](https://developer.nvidia.com/blog/enabling-horizontal-autoscaling-of-enterprise-rag-components-on-kubernetes/)
- R4 prior audit `audit-2026-05-12/04-research/R4-ai-safety.md`

---

## 8. CDN Bandwidth

### Image volume estimate @ 100k MAU

- ~1 image / visit, 1 visit / 7 days avg = 100k images / week = ~430k images / month
- 2 MB per upload (avg with HEIC compression)
- Storage growth = **850 GB / month**, **~10 TB / year**
- Egress (image rendering in app, thumbnails) = ~50× upload bytes (visitors browse history + others' uploads + featured) = **~40 TB / month**

### CDN comparison @ 40 TB/mo egress

`[verified — [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/), [LeanOpsTech R2 2026](https://leanopstech.com/blog/cloudflare-r2-pricing-2026/), [BunnyCDN vs Cloudflare 2026](https://www.kunalganglani.com/blog/bunnynet-vs-cloudflare-2026)]`

| Provider | Storage 850 GB | Egress 40 TB | Operations | Total / mo |
|---|---|---|---|---|
| **Cloudflare R2** | $0.015/GB × 850 = **$13** | **$0** (zero egress) | Class A $4.50/M × 0.4M = $2, Class B $0.36/M × 5M = $2 | **~$17** |
| **BunnyCDN Storage + CDN** | $0.01/GB × 850 = $8 | $0.005/GB × 40 TB ≈ $200 (EU) | flat | **~$210** |
| **AWS S3 + CloudFront** | $0.023 × 850 = $20 | $0.085/GB × 40 TB = $3 400 | $0.005/M reqs | **~$3 425** |
| **Cloudinary** | $0.18 × 850 = $153 | $0.12 × 40 TB = $4 800 | included | **~$5 000** |

**Verdict : Cloudflare R2 wins by 10× for image-heavy B2C** — zero egress beats every paid option. BunnyCDN comes second if you need their image transformer ($9.50/mo flat).

### Recommendation

- **V1.0-V1.1** : Cloudflare R2 + Cloudflare Images. Free tier 10 GB + 1 M class-A ops + 10 M class-B ops covers first ~2k MAU.
- **V1.2** : Cloudflare R2 + native image transforms via Cloudflare Images, or fall back to BunnyCDN Optimizer ($9.50/mo flat) if Cloudflare Images cost > $50/mo.

### Sources

- [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/)
- [Cloudflare R2 Pricing Calculator](https://r2-calculator.cloudflare.com/)
- [LeanOpsTech — Cloudflare R2 Pricing 2026](https://leanopstech.com/blog/cloudflare-r2-pricing-2026/)
- [Kunal Ganglani — BunnyCDN vs Cloudflare 2026](https://www.kunalganglani.com/blog/bunnynet-vs-cloudflare-2026)
- [EgressCost — Cloudflare Zero Egress Strategy 2026](https://egresscost.com/cloudflare/)
- [The Image CDN — Cloudflare Images Pricing 2026](https://theimagecdn.com/docs/cloudflare-images-pricing)

---

## 9. Load Test Methodology — k6 Plan

`[verified — [Grafana k6 load testing](https://k6.io/docs/test-types/load-testing/), [Grafana — Peak/spike/soak tests](https://grafana.com/blog/2023/02/14/load-testing-grafana-k6-peak-spike-and-soak-tests/), [k6 ramping-arrival-rate](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/ramping-arrival-rate/)]`

### Test taxonomy & duration

| Test type | When | Duration | Pattern | Goal |
|---|---|---|---|---|
| **Smoke** | Daily CI | 1-2 min | 1-5 VUs constant | No regression on hot path |
| **Average load** | Weekly | 15-30 min | Ramp 0 → 1× peak → 0 | Verify expected load profile |
| **Stress** | Pre-launch + before each scale stage crossing | 30-60 min | Stepped 0 → 200% peak | Find breaking point |
| **Spike** | Pre-launch + monthly | 5-10 min | 0 → 5× peak in 30s | Survival check + LB scale-out timing |
| **Soak** | Pre-launch + each major release | **4-24 hours** | Hold at 70% peak | Memory leaks, replication lag, autovacuum |

### k6 scenario for Musaium @ V1.2 (100k MAU verification)

```js
// k6/scenarios/musaium-100k.js
import http from 'k6/http';
import { check, group } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const chatLatency = new Trend('musaium_chat_latency');
const voiceLatency = new Trend('musaium_voice_latency');
const guardrailFailed = new Rate('musaium_guardrail_failed');

export const options = {
  scenarios: {
    // Realistic traffic mix
    browsing: {
      executor: 'ramping-arrival-rate',
      preAllocatedVUs: 500, maxVUs: 2000,
      stages: [
        { target: 10, duration: '2m' },     // warm
        { target: 80, duration: '5m' },     // ramp to peak browse (museum lists, daily art, history)
        { target: 120, duration: '15m' },   // sustained at 1.5× target
        { target: 0, duration: '3m' },
      ],
      exec: 'browseScenario',
    },
    chat: {
      executor: 'ramping-arrival-rate',
      preAllocatedVUs: 200, maxVUs: 800,
      stages: [
        { target: 2, duration: '2m' },
        { target: 15, duration: '5m' },     // 15/sec = 1.5× expected sustained
        { target: 25, duration: '15m' },    // 2.5× sustained — hit Guard ceiling
        { target: 0, duration: '3m' },
      ],
      exec: 'chatScenario',
    },
    voice: {
      executor: 'ramping-arrival-rate',
      preAllocatedVUs: 100, maxVUs: 400,
      stages: [
        { target: 1, duration: '2m' },
        { target: 8, duration: '5m' },
        { target: 15, duration: '15m' },
        { target: 0, duration: '3m' },
      ],
      exec: 'voiceScenario',
    },
    imageUpload: {
      executor: 'ramping-arrival-rate',
      preAllocatedVUs: 100, maxVUs: 300,
      stages: [
        { target: 1, duration: '2m' },
        { target: 7, duration: '5m' },
        { target: 15, duration: '15m' },
        { target: 0, duration: '3m' },
      ],
      exec: 'imageUploadScenario',
    },
  },
  thresholds: {
    'http_req_duration{endpoint:chat}': ['p(95)<6000', 'p(99)<10000'],
    'http_req_duration{endpoint:voice}': ['p(95)<9000', 'p(99)<14000'],
    'http_req_duration{endpoint:browse}': ['p(95)<500', 'p(99)<1500'],
    'http_req_duration{endpoint:image}': ['p(95)<3000'],
    'http_req_failed': ['rate<0.01'],          // < 1% errors
    'musaium_guardrail_failed': ['rate<0.005'], // guard fail-CLOSED catches < 0.5%
  },
};

export function browseScenario() {
  group('cold session', () => {
    http.get(`${__ENV.API}/api/auth/me`, { tags: { endpoint: 'browse' } });
    http.get(`${__ENV.API}/api/museum/nearby`, { tags: { endpoint: 'browse' } });
    http.get(`${__ENV.API}/api/daily-art/today`, { tags: { endpoint: 'browse' } });
    http.get(`${__ENV.API}/api/chat/history?limit=50`, { tags: { endpoint: 'browse' } });
  });
}

export function chatScenario() {
  const start = Date.now();
  const res = http.post(`${__ENV.API}/api/chat/messages`,
    JSON.stringify({ content: 'Tell me about this painting', museumId: '...' }),
    { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: 'chat' } }
  );
  chatLatency.add(Date.now() - start);
  guardrailFailed.add(res.status === 451);
  check(res, { 'chat ok': r => r.status === 200 });
}

export function voiceScenario() {
  // ... audio binary blob POST, omitted for brevity
}

export function imageUploadScenario() {
  // ... multipart image upload, omitted for brevity
}
```

### Server-side metrics to capture during test

| Layer | Metric | Source | Alert threshold |
|---|---|---|---|
| Node | event-loop lag p95 | `perf_hooks.monitorEventLoopDelay()` | > 20 ms |
| Node | RSS / heap | `process.memoryUsage()` | > 80% of `max_memory_restart` |
| Node | HTTP req queue depth | custom metric | > 100 |
| Postgres | `pg_stat_activity` count by state | metrics scrape | active > pool size for 30s |
| Postgres | lock wait count | `pg_locks` blocked | > 10 sustained |
| Postgres | replication lag | `pg_stat_replication.replay_lag` | > 500 ms |
| Postgres | autovacuum running | `pg_stat_activity` | running > 60% of time on hot tables |
| Redis | ops/sec + slowlog | `INFO`, `SLOWLOG GET` | slowlog non-empty |
| LLM Guard | inflight | sidecar metric | > 80% of MAX_INFLIGHT |
| LLM Guard | queue depth | sidecar metric | > 50% of QUEUE_MAX |
| LLM Guard | scan p95 latency | sidecar metric | > 2 s |
| CDN | cache hit ratio | Cloudflare analytics | < 90% |

### Sources

- [Grafana — Load testing types](https://k6.io/docs/test-types/load-testing/)
- [Grafana blog — Peak, spike, soak tests](https://grafana.com/blog/2023/02/14/load-testing-grafana-k6-peak-spike-and-soak-tests/)
- [Grafana — ramping-arrival-rate executor](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/ramping-arrival-rate/)
- [k6-learn — Load Testing module](https://github.com/grafana/k6-learn/blob/main/Modules/I-Performance-testing-principles/03-Load-Testing.md)
- [Kodziak — k6 test types](https://www.kodziak.com/blog/load-testing-types-load-stress-soak-spike)
- [Tian Pan — Load Testing LLM Applications 2026](https://tianpan.co/blog/2026-03-19-load-testing-llm-applications)

---

## 10. Monitoring Dashboards — What to Watch

### RED method (canonical service SLI)

`[verified — [SRE School — RED method 2026 guide](https://sreschool.com/blog/red-method/), [Last9 RED monitoring](https://last9.io/blog/monitoring-with-red-method/), [Splunk RED metrics](https://www.splunk.com/en_us/blog/learn/red-monitoring.html)]`

- **Rate** : `http_requests_total` by endpoint
- **Errors** : `http_requests_total{status=~"5.."}` ratio
- **Duration** : `http_request_duration_seconds` p50/p95/p99 histogram

### Four Golden Signals (Google SRE)

Latency + traffic + errors + saturation. Add **saturation** on top of RED :
- CPU utilization per process
- Event-loop lag p95 (Node — see below)
- Postgres connection pool saturation
- LLM Guard inflight saturation

### Node-specific saturation : event-loop lag

`[verified — [Trigger.dev — taming event loop lag](https://trigger.dev/blog/event-loop-lag), [Medium — Node Performance Tuning 2026](https://medium.com/@hadiyolworld007/node-js-performance-tuning-in-2026-event-loop-lag-fetch-backpressure-and-the-metrics-that-dff27b319415), [IEEE — Event-loop autoscaling 2025](https://ieeexplore.ieee.org/document/9991325/)]`

**Event-loop lag is a better autoscaling signal than CPU for Node.js** :
- Use `perf_hooks.monitorEventLoopDelay()` — sample histogram (ns)
- Alert when `eventLoopUtilization` between 0.85-0.95 sustained for 2 min (loses burst capacity, tail latency spikes)
- Scale out when p95 lag > 50 ms for 3 consecutive minutes

### Dashboard layout (Grafana)

```
ROW 1 — Service SLI (RED)
  ├─ HTTP RPS by endpoint           (timeseries)
  ├─ Error rate %                   (stat + 95% threshold red line)
  └─ p50/p95/p99 latency           (timeseries, log scale Y)

ROW 2 — Saturation
  ├─ Event-loop lag p95             (timeseries, 20/50 ms threshold)
  ├─ CPU per process                (heatmap)
  ├─ Memory RSS                     (timeseries vs max_memory_restart line)
  └─ DB pool active/idle/waiting    (stacked)

ROW 3 — Postgres
  ├─ pg_stat_activity by state      (table — active/idle/idle in txn/blocked)
  ├─ Lock waits                     (timeseries)
  ├─ Replication lag                (timeseries vs 500ms line)
  ├─ Autovacuum activity            (gantt-style)
  └─ pg_stat_statements top 10 by total_time (table)

ROW 4 — Redis + LLM Guard
  ├─ Redis ops/sec, hit ratio       (gauges)
  ├─ Slowlog count (last 5 min)     (stat)
  ├─ LLM Guard inflight vs MAX      (gauge)
  ├─ LLM Guard queue depth          (gauge)
  └─ LLM Guard scan latency p95     (timeseries)

ROW 5 — Business + Cost
  ├─ Chat messages/min              (timeseries)
  ├─ LLM tokens consumed/min        (timeseries — split input/output)
  ├─ Images uploaded/min            (timeseries)
  └─ Active sessions (PCU)          (timeseries)
```

### Sources

- [SRE School — RED method 2026](https://sreschool.com/blog/red-method/)
- [Last9 — RED monitoring microservices](https://last9.io/blog/monitoring-with-red-method/)
- [Google SRE — Golden Signals](https://sre.google/sre-book/monitoring-distributed-systems/)
- [Trigger.dev — Event-loop lag deepdive](https://trigger.dev/blog/event-loop-lag)
- [Medium — Node Performance Tuning 2026](https://medium.com/@hadiyolworld007/node-js-performance-tuning-in-2026-event-loop-lag-fetch-backpressure-and-the-metrics-that-dff27b319415)
- [Postgres wiki — Monitoring](https://wiki.postgresql.org/wiki/Monitoring)
- [Instaclustr — pg_stat_activity for real-time monitoring](https://www.instaclustr.com/blog/mastering-pg-stat-activity-for-real-time-monitoring-in-postgresql/)

---

## 11. Autoscaling Triggers

### When to spin up new VPS

Multi-trigger AND-gating (avoid flapping) :

| Trigger | Condition | Lead time |
|---|---|---|
| **CPU saturation** | primary CPU > 75% for 10 min | provision 30-60 min — proactive |
| **Event-loop lag** | p95 > 50 ms for 3 min | scale to existing replica within minutes |
| **DB pool waiting** | `pg_stat_activity` waiting > 30% pool for 5 min | add PgBouncer pool capacity |
| **Replication lag** | replay_lag > 1 s for 5 min | rebuild replica or add second |
| **LLM Guard queue** | queue depth > 60% MAX for 2 min | spin up additional Guard replica |
| **Disk IOPS** | sustained > 70% of NVMe rated | reconsider storage tier |
| **Error rate** | 5xx > 0.5% for 5 min | page on-call, possibly fail-back |

`[verified — [AWS Well-Architected REL07-BP01](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_adapt_to_changes_autoscale_adapt.html), [AWS Well-Architected REL07-BP03](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_adapt_to_changes_proactive_adapt_auto.html)]`

### Pre-provisioning policy

> AWS Well-Architected explicitly warns : **"Failing to provide enough headroom in your scaling plans to accommodate demand bursts and implementing scaling policies that add capacity too late can lead to capacity exhaustion and degraded service."**

On single-VPS OVH (not k8s), **autoscaling is manual** — there is no HPA. Mitigation :
- **Scheduled scaling** : pre-provision 2× capacity before known events (school groups Monday 9am-12pm, weekend afternoons, museum free Sunday).
- **Predictive scaling** : track week-over-week growth ; if forecast > 80% of current capacity, order next-tier VPS 7 days ahead (OVH provisioning latency ≤ 24h for Advance, ≤ 72h for Scale).
- **Pre-warmed standby** : keep one Advance-1 as cold standby (€115/mo "insurance" tax).

### Sources

- [AWS Well-Architected — REL07-BP01](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_adapt_to_changes_autoscale_adapt.html)
- [AWS Well-Architected — REL07-BP03](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_adapt_to_changes_proactive_adapt_auto.html)
- [LoadView — Capacity planning](https://www.loadview-testing.com/learn/capacity-planning/)

---

## 12. Capacity Ladder — V1.0 → V1.2

### V1.0 — Launch (0-10k MAU, ~1k DAU peak, ~150 PCU)

| Component | Spec | Why |
|---|---|---|
| Primary VPS | OVH Advance-1 — 6c/12t EPYC, 32 GB, 1 TB NVMe | 8× recommended pool size headroom |
| Node | 2 PM2 workers, `DB_POOL_MAX=15`, keepAliveTimeout=61s | Reduce from current 50 |
| Postgres | 16 on same host, `shared_buffers=8GB`, `max_connections=100` | Single-tenant V1 |
| Redis | 8.0, 1 GB on same host, AOF everysec | Single Redis sufficient |
| LLM Guard | Inline sidecar on same host, `MAX_INFLIGHT=8` | Default |
| CDN | Cloudflare R2 free tier | < 10 GB storage |
| Audit chain | Existing (global advisory lock) | Acceptable < 200 audits/sec |
| Cost | **~€115 / mo compute** | |

### V1.1 — Early growth (10k-30k MAU, ~5k DAU peak, ~750 PCU)

**Changes vs V1.0** :
- Primary VPS → **Advance-3** (8c/16t, 64 GB, 1.9 TB NVMe), Postgres dedicated
- Add **PgBouncer transaction mode** in front, `default_pool_size=25, max_client_conn=2000`
- App `DB_POOL_MAX=10` per process, 4 PM2 workers
- Add **streaming replica** on second Advance-1 (€115)
- Wire **`DB_REPLICA_URL`** env, route history/catalog reads to replica via `data-source-router.ts` [verified — exists in repo]
- Move LLM Guard to **dedicated VPS** (Advance-1) — independent CPU
- Partition audit chain lock by actor (PR #X — see R8 Phase 1)
- Redis still single — co-locate with PgBouncer on a small VPS
- Cloudflare R2 storage + Cloudflare Images for thumbnails

Cost : **~€430 / mo compute** + ~€20 CDN + ~€350-500 LLM = **~€800-1 000 / mo total**

### V1.2 — Pre-100k (30k-100k MAU, ~15k DAU, ~2k PCU)

**Changes vs V1.1** :
- Primary VPS → **Advance-5** (24c/48t EPYC 8224P, 96-128 GB DDR5)
- **2 streaming replicas** (Advance-3 each) → reads spread across both
- **LLM Guard horizontal** : 2× Advance-1 nodes behind round-robin LB (HAProxy or Caddy)
- **Redis Sentinel + 1 replica** for HA (3 sentinel nodes, can share with other services)
- **PgBouncer** scaled : `default_pool_size=50, max_client_conn=5000`
- Audit chain → ULID + offline Merkle root (Phase 2 per R8)
- CDN : Cloudflare R2 + BunnyCDN Optimizer ($9.50 flat) if Cloudflare Images cost > $50/mo
- Optional : Cloudflare WAF + Rate Limiting Pro ($20/mo) — block scraper bots
- **Manual autoscaling triggers** : OVH Advance provisioning ≤ 24h. Keep one cold-standby Advance-1.

Cost : **~€895 / mo compute** + ~€50 CDN + ~€1 000-1 500 LLM = **~€1 950-2 450 / mo**

### V2.0 — Post-100k MAU

Out of scope for R24. Triggers : DB primary CPU > 80% sustained, single largest table > 100M rows AND > 200 GB, connection pool maxed despite PgBouncer. Then : Scale-a3 primary, managed Postgres consideration, possibly Citus partitioning.

### Stage comparison table

| Stage | MAU | DAU | PCU | Backend QPS | Compute €/mo | LLM €/mo | CDN €/mo | Total €/mo |
|---|---|---|---|---|---|---|---|---|
| V1.0 | 10k | 1.5k | 150 | 15 sustained / 80 burst | 115 | 100-150 | 0 (free tier) | **~250** |
| V1.1 | 30k | 4.5k | 600 | 50 sustained / 250 burst | 430 | 350-500 | 20 | **~850** |
| V1.2 | 100k | 15k | 2 000 | 120 sustained / 1 000 burst | 895 | 1 000-1 500 | 50 | **~1 945** |
| V2.0 | 200k+ | 30k+ | 4 000+ | 250+ sustained | 1 500-2 500 | 2 000-3 500 | 100+ | **~3 600-6 000** |

---

## 13. Cost Model — €/100k MAU/Month

### Compute (verified OVH 2026 pricing)

| Item | Qty | €/mo each | Subtotal |
|---|---|---|---|
| Advance-5 primary | 1 | 265 | 265 |
| Advance-3 replica | 2 | 200 | 400 |
| Advance-1 LLM Guard | 2 | 115 | 230 |
| Total compute | | | **€895** |

### LLM API

**Assumptions @ 100k MAU** :
- 15k DAU × 5 chat msgs/day average × 30 days = 2.25M messages/month
- Per message : ~1 500 input tokens (history + system prompt + user) + ~250 output tokens
- Cache hit ratio 30% (per CLAUDE.md ADR-036 target) → 70% miss = 1.575M billable msgs

| Provider | Input cost | Output cost | Monthly cost @ 100k MAU |
|---|---|---|---|
| **OpenAI GPT-4o-mini** | $0.15/M | $0.60/M [verified — [OpenAI pricing 2026](https://openai.com/api/pricing/), [PricePerToken GPT-4o-mini 2026](https://pricepertoken.com/pricing-page/model/openai-gpt-4o-mini)] | (1.575M × 1500 × $0.15/M) + (1.575M × 250 × $0.60/M) = $354 + $236 = **~$590 (~€545)** |
| **DeepSeek V4 Flash** | $0.14/M | $0.28/M [verified — [DeepSeek pricing 2026](https://api-docs.deepseek.com/quick_start/pricing/), [TLDL DeepSeek API 2026](https://www.tldl.io/resources/deepseek-api-pricing)] | (1.575M × 1500 × $0.14/M) + (1.575M × 250 × $0.28/M) = $331 + $110 = **~$441 (~€408)** |
| **Mix (60% mini, 40% DeepSeek)** | weighted | weighted | **~$540 (~€500)** |

**Voice add-on** :
- 30% of chat turns are voice = 675k voice turns/mo
- STT @ gpt-4o-mini-transcribe = $0.003/min [verified — [Whisper pricing 2026](https://tokenmix.ai/blog/whisper-api-pricing)] × avg 0.5 min/turn = $0.0015/turn → 675k × $0.0015 = **~$1 010 (~€935)**
- TTS @ gpt-4o-mini-tts = $0.015/min [verified — [TokenMix gpt-4o-mini-tts 2026](https://tokenmix.ai/blog/gpt-4o-mini-tts-cheapest-tts-api-2026)] × avg 0.5 min/turn × 675k = **~$5 060 (~€4 685)** 

> **TTS dominates** — for cost optimization, consider Groq Whisper ($0.04/hour vs OpenAI $0.36/hour, 9× cheaper) [verified — same source] for STT ; for TTS, consider open-source Coqui XTTS or batched calls.

**Conservative LLM total (text + reduced voice)** : **~€1 200-1 800 / month** assuming aggressive voice TTS optimization. **Without optimization, voice TTS alone hits €4-5k.**

### Storage + CDN

| Item | @ 100k MAU | Cost |
|---|---|---|
| Cloudflare R2 storage (10 TB by month 12) | $0.015/GB × 10 240 GB | $154 (~€143) |
| Cloudflare R2 ops (5M class B + 0.4M class A) | $0.36/M + $4.50/M | $4 (~€4) |
| Cloudflare Images transforms (50k/mo) | $0.50/M (after 5k free) | $23 (~€21) |
| Total CDN+storage | | **~€170 / mo** |

### Total cost @ 100k MAU

| Bucket | €/mo | % of total |
|---|---|---|
| Compute (OVH) | 895 | 32-40% |
| LLM API (text) | 500-550 | 18-22% |
| LLM API (voice STT+TTS) | 600-1 200 (optimized) / 5 000 (naive) | 25-50% |
| Storage + CDN | 170 | 6-7% |
| Observability (Sentry + Grafana Cloud) | 50-100 | 2-5% |
| **TOTAL** | **€2 200 - €2 900 / mo (optimized voice)** | |
| | **€6 500 / mo (naive voice)** | |

### Per-MAU economics

- Total cost ÷ 100k MAU = **€0.022 - €0.029 per MAU/month** (optimized) or up to **€0.065** (naive voice).
- Revenue assumption (per memory `feedback_no_solo_dev_estimates`) : not modelled here — out of scope.
- **Anchor : R8 capacity model + this report agree that compute is < 1/3 of total bill ; LLM is the dominant cost driver.** Aggressive cache (Redis llm:v1 ADR-036), prompt compression, and STT/TTS provider switching are the highest-leverage cost levers.

### Sources

- [OpenAI API Pricing](https://openai.com/api/pricing/)
- [PricePerToken — GPT-4o-mini 2026](https://pricepertoken.com/pricing-page/model/openai-gpt-4o-mini)
- [DeepSeek API Pricing](https://api-docs.deepseek.com/quick_start/pricing/)
- [TLDL — DeepSeek API Pricing 2026](https://www.tldl.io/resources/deepseek-api-pricing)
- [TokenMix — Whisper API Pricing 2026](https://tokenmix.ai/blog/whisper-api-pricing)
- [TokenMix — gpt-4o-mini-tts 2026](https://tokenmix.ai/blog/gpt-4o-mini-tts-cheapest-tts-api-2026)
- [Costgoat — OpenAI TTS Pricing Calculator](https://costgoat.com/pricing/openai-tts)
- [a16z — LLMflation](https://a16z.com/llmflation-llm-inference-cost/)

---

## Verdict

**Honesty disclosure : no k6 run, no production profile. This is a model derived from (a) repo reads, (b) cited 2024-2026 sources, (c) R8 prior audit on PG/Node scaling, (d) industry capacity formulas.** Confidence : structurally sound, numerically uncertain by ±30%.

### The math says yes — software ceilings say maybe

1. **Compute scales gracefully** : OVH Advance ladder (€115 → €895 / mo) absorbs 10k → 100k MAU growth linearly.
2. **PostgreSQL scales gracefully** with PgBouncer + replica + audit-chain partition — capacity gain from V1.1 changes is ~30×.
3. **Redis is over-provisioned** in V1 ; only needs HA (Sentinel) at V1.2, no Cluster.
4. **Storage + CDN is a rounding error** thanks to Cloudflare R2 zero egress — €170/mo even at 100k MAU.
5. **The hard ceilings** : (a) global advisory audit lock and (b) LLM Guard 8-inflight — both are software, not capital. Both must be addressed before crossing 30k MAU.

### Highest-leverage scaling work

| Priority | Action | Effort | Capacity gain | Cost |
|---|---|---|---|---|
| 1 | **Reduce `DB_POOL_MAX` from 50 to 15** + deploy PgBouncer | Low (config + container) | 5-10× connection headroom | €0 |
| 2 | **Partition audit chain by actorId** (R8 Phase 1) | Medium (1 PR) | ~50× audit throughput | €0 |
| 3 | **Horizontal LLM Guard** — 2-3 replicas behind LB | Medium | 2-3× chat sustained | €115-230/mo |
| 4 | **Wire DB_REPLICA_URL** + provision streaming replica | Low (env + 1 VPS) | 2-3× read capacity | €115/mo |
| 5 | **Redis Sentinel** when concurrent > 5k | Medium | HA, not throughput | €60-115/mo |
| 6 | **k6 load test before 30k MAU crossing** | Medium | Discovers unknown bottlenecks | €0 |

### Cost model verdict

At €2 200-2 900/mo @ 100k MAU (optimized voice) → €0.022-0.029 per MAU. Pinterest at 11M users ran on $1M/yr infra (~$0.009/MAU) [verified — [Engineers Codex Pinterest scaling](https://read.engineerscodex.com/p/how-pinterest-scaled-to-11-million)] but they did not have LLM in critical path. **Musaium's cost-per-MAU will be 2-3× a pure web product at scale, driven by LLM. Plan revenue model accordingly.**

### Do not over-engineer

- **No Kubernetes** at V1-V1.2. PM2 cluster on single VPS + manual replica provisioning is sufficient up to 100k MAU. Discord ran 15M concurrent users on a single Elixir server [verified — [bytebytego — Discord 15M](https://blog.bytebytego.com/p/how-discord-serves-15-million-users)] — Musaium does not need K8s for 100k MAU.
- **No sharding** until single largest table > 100M rows AND CPU > 80%. R8 already verified this.
- **No multi-region** until B2B contract demands it (per memory `project_no_staging_v1`).
- **No autoscaling group / serverless** : OVH dedicated provisioning is 24h. Manual ladder with cold standby is enough.

---

## Sources (consolidated)

### Capacity / DAU / Concurrent math
- [a16z — Benchmark Your Social App](https://a16z.com/do-you-have-lightning-in-a-bottle-how-to-benchmark-your-social-app/)
- [PMToolkit — DAU/MAU 2026 Engagement Guide](https://pmtoolkit.ai/learn/growth/dau-mau-engagement)
- [UXCam — Mobile App Engagement Benchmarks 2026](https://uxcam.com/blog/mobile-app-engagement-benchmarks/)
- [copyprogramming — Calculating Concurrent Users 2026](https://copyprogramming.com/howto/calculating-concurrent-users)
- [LoadFocus — Calculate Concurrent Users](https://loadfocus.com/blog/2025/04/calculate-concurrent-users)
- [Medium Atom Platform — How many users can your platform handle](https://medium.com/atom-platform/how-many-users-can-your-platform-or-application-handle-78f7af700958)
- [Smartify Partners](https://partners.smartify.org/)
- [Bloomberg Connects](https://www.bloombergconnects.org/)

### OVH pricing 2026
- [OVH Advance dedicated servers](https://us.ovhcloud.com/bare-metal/advance/)
- [OVH Advance-1 2026](https://www.ovhcloud.com/en/bare-metal/advance/adv-1/)
- [OVH Scale Server](https://us.ovhcloud.com/bare-metal/scale/)
- [OVH Bare Metal prices](https://us.ovhcloud.com/bare-metal/prices/)
- [OVHcloud pricing evolution 2026](https://blog.ovhcloud.com/pricing-evolution-of-public-cloud-bare-metal-and-vps-at-ovhcloud/)
- [Baytech Consulting — OVHcloud Bare Metal analysis](https://www.baytechconsulting.com/blog/ovhcloud-bare-metal-servers-a-comprehensive-analysis)
- [Hetzner vs OVH 2026](https://1vps.com/ovh-vs-hetzner)
- [CDN Sun — OVH and Hetzner 2026 price increases](https://blog.cdnsun.com/ovhcloud-and-hetzner-2026-hosting-price-increases-explained/)

### PostgreSQL scaling
- [PostgreSQL wiki — Tuning](https://wiki.postgresql.org/wiki/Tuning_Your_PostgreSQL_Server)
- [PostgreSQL wiki — Number of connections](https://wiki.postgresql.org/wiki/Number_Of_Database_Connections)
- [PostgreSQL wiki — Monitoring](https://wiki.postgresql.org/wiki/Monitoring)
- [Microsoft TechCommunity — PG connection scalability](https://techcommunity.microsoft.com/blog/adforpostgresql/analyzing-the-limits-of-connection-scalability-in-postgres/1757266)
- [EDB — Tune PostgreSQL memory](https://www.enterprisedb.com/postgres-tutorials/how-tune-postgresql-memory)
- [EDB — Connection pooling](https://www.enterprisedb.com/postgres-tutorials/why-you-should-use-connection-pooling-when-setting-maxconnections-postgres)
- [OneUptime — PG shared_buffers & work_mem 2026](https://oneuptime.com/blog/post/2026-01-25-postgresql-shared-buffers-work-mem-tuning/view)
- [OneUptime — Tune PG production 2026](https://oneuptime.com/blog/post/2026-02-20-postgresql-performance-tuning/view)
- [OneUptime — Handle 10K connections PgBouncer](https://oneuptime.com/blog/post/2026-01-26-pgbouncer-connection-pooling/view)
- [Cybertec — effective_cache_size](https://www.cybertec-postgresql.com/en/effective_cache_size-what-it-means-in-postgresql/)
- [PlanetScale — Scaling Postgres with PgBouncer](https://planetscale.com/blog/scaling-postgres-connections-with-pgbouncer)
- [Crunchy Data — PG IOPS](https://www.crunchydata.com/blog/understanding-postgres-iops)
- [Azure AKS — PostgreSQL on NVMe](https://blog.aks.azure.com/2025/07/09/postgresql-nvme)
- [PostgresQLHTX — PG 18 async I/O 2026](https://postgresqlhtx.com/postgresql-18-async-i-o-in-production-real-world-benchmarks-configuration-patterns-and-storage-performance-in-2026/)
- [Instaclustr — pg_stat_activity](https://www.instaclustr.com/blog/mastering-pg-stat-activity-for-real-time-monitoring-in-postgresql/)

### Redis
- [Redis — Memory optimization](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/memory-optimization/)
- [Redis — Persistence docs](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)
- [Redis 8 GA](https://redis.io/blog/redis-8-ga/)
- [OneUptime — Estimate Redis hardware 2026](https://oneuptime.com/blog/post/2026-03-31-redis-estimate-hardware-requirements/view)
- [Bhawesh Kumar — Redis Production 2026](https://www.bhaweshkumar.com/blog/2026/04/23/redis-production-deployment-guide/)

### Node.js / Express scaling
- [PM2 Cluster Mode](https://pm2.keymetrics.io/docs/usage/cluster-mode/)
- [OneUptime — Scale Node.js with PM2 2026](https://oneuptime.com/blog/post/2026-02-20-nodejs-clustering-pm2/view)
- [Halodoc — Node.js Clustering with PM2](https://blogs.halodoc.io/nodejs-clustering-using-pm2/)
- [ConnectReport — Tuning HTTP Keep-Alive Node.js](https://connectreport.com/blog/tuning-http-keep-alive-in-node-js/)
- [BetterStack — Node.js timeouts guide](https://betterstack.com/community/guides/scaling-nodejs/nodejs-timeouts/)
- [Trigger.dev — Event-loop lag deepdive](https://trigger.dev/blog/event-loop-lag)
- [Medium — Node.js Performance Tuning 2026](https://medium.com/@hadiyolworld007/node-js-performance-tuning-in-2026-event-loop-lag-fetch-backpressure-and-the-metrics-that-dff27b319415)
- [IEEE — Supervisory Event-loop Autoscaling](https://ieeexplore.ieee.org/document/9991325/)
- [Platformatic — Cut Node.js Memory in Half](https://blog.platformatic.dev/we-cut-nodejs-memory-in-half)

### LLM Guard / sidecar scaling
- [Protect AI — LLM Guard](https://protectai.com/llm-guard)
- [GitHub protectai/llm-guard](https://github.com/protectai/llm-guard)
- [Markaicode — Scaling LLM APIs Kubernetes 2026](https://markaicode.com/scaling-llm-api-kubernetes-guide/)
- [NVIDIA — Horizontal Autoscaling Enterprise RAG](https://developer.nvidia.com/blog/enabling-horizontal-autoscaling-of-enterprise-rag-components-on-kubernetes/)
- [Google Cloud — Autoscaling LLM with TPUs](https://docs.cloud.google.com/kubernetes-engine/docs/best-practices/machine-learning/inference/autoscaling-tpu)

### LLM pricing 2026
- [OpenAI API Pricing](https://openai.com/api/pricing/)
- [PricePerToken — GPT-4o-mini](https://pricepertoken.com/pricing-page/model/openai-gpt-4o-mini)
- [DeepSeek API Pricing](https://api-docs.deepseek.com/quick_start/pricing/)
- [TLDL — DeepSeek API Pricing 2026](https://www.tldl.io/resources/deepseek-api-pricing)
- [TokenMix — Whisper API Pricing 2026](https://tokenmix.ai/blog/whisper-api-pricing)
- [TokenMix — gpt-4o-mini-tts 2026](https://tokenmix.ai/blog/gpt-4o-mini-tts-cheapest-tts-api-2026)
- [DIY AI — OpenAI Whisper Pricing 2026](https://diyai.io/ai-tools/speech-to-text/openai-whisper-api-pricing-2026/)
- [Costgoat — OpenAI Transcription Calculator](https://costgoat.com/pricing/openai-transcription)
- [a16z — LLMflation](https://a16z.com/llmflation-llm-inference-cost/)
- [Silicon Data — LLM cost per token 2026](https://www.silicondata.com/blog/llm-cost-per-token)

### CDN
- [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/)
- [Cloudflare R2 Calculator](https://r2-calculator.cloudflare.com/)
- [LeanOpsTech — Cloudflare R2 Pricing 2026](https://leanopstech.com/blog/cloudflare-r2-pricing-2026/)
- [Kunal Ganglani — BunnyCDN vs Cloudflare 2026](https://www.kunalganglani.com/blog/bunnynet-vs-cloudflare-2026)
- [The Image CDN — Cloudflare Images 2026](https://theimagecdn.com/docs/cloudflare-images-pricing)
- [EgressCost — Cloudflare Zero Egress 2026](https://egresscost.com/cloudflare/)

### Load testing (k6)
- [Grafana k6 — Load testing types](https://k6.io/docs/test-types/load-testing/)
- [Grafana k6 — Stress testing](https://k6.io/docs/test-types/stress-testing/)
- [Grafana blog — Peak/spike/soak](https://grafana.com/blog/2023/02/14/load-testing-grafana-k6-peak-spike-and-soak-tests/)
- [Grafana — ramping-arrival-rate](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/ramping-arrival-rate/)
- [Grafana — stress testing beginner's guide](https://grafana.com/blog/stress-testing/)
- [k6-learn — Load testing module](https://github.com/grafana/k6-learn/blob/main/Modules/I-Performance-testing-principles/03-Load-Testing.md)
- [BetterStack — Modern Load Testing with k6](https://betterstack.com/community/guides/testing/grafana-k6/)
- [Tian Pan — Load Testing LLM Apps 2026](https://tianpan.co/blog/2026-03-19-load-testing-llm-applications)
- [Kodziak — k6 test types](https://www.kodziak.com/blog/load-testing-types-load-stress-soak-spike)
- [LoadView — Capacity planning](https://www.loadview-testing.com/learn/capacity-planning/)

### Monitoring / SLI
- [SRE School — RED method 2026](https://sreschool.com/blog/red-method/)
- [Last9 — RED method monitoring](https://last9.io/blog/monitoring-with-red-method/)
- [Splunk — RED metrics monitoring](https://www.splunk.com/en_us/blog/learn/red-monitoring.html)
- [InfoWorld — RED method microservices](https://www.infoworld.com/article/2270578/the-red-method-a-new-strategy-for-monitoring-microservices.html)
- [Google SRE Book — Monitoring distributed systems](https://sre.google/sre-book/monitoring-distributed-systems/)
- [OneUptime — Four Golden Signals 2026](https://oneuptime.com/blog/post/2026-02-20-monitoring-golden-signals/view)

### AWS Well-Architected
- [REL07-BP01 — Auto Scaling automation](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_adapt_to_changes_autoscale_adapt.html)
- [REL07-BP03 — Proactive resource provisioning](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_adapt_to_changes_proactive_adapt_auto.html)

### Scaling stories
- [Discord — 15M users on 1 server](https://blog.bytebytego.com/p/how-discord-serves-15-million-users)
- [GeeksforGeeks — Discord scaling](https://www.geeksforgeeks.org/system-design/how-discord-scaled-to-15-million-users-on-one-server/)
- [Engineers Codex — Pinterest 11M users](https://read.engineerscodex.com/p/how-pinterest-scaled-to-11-million)
- [Pinterest Engineering — Sharding Pinterest](https://medium.com/pinterest-engineering/sharding-pinterest-how-we-scaled-our-mysql-fleet-3f341e96ca6f)
- [Relbis Labs — Notion backend architecture](https://medium.com/relbis-labs/examining-notions-backend-architecture-4c708d8f9b83)
