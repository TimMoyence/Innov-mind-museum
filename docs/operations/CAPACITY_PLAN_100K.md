# Capacity Plan — Guardrail Subsystem at 100k DAU

> **Scope :** guardrail pipeline (keyword → LLM Guard sidecar → LLM judge) at 1k / 10k / 50k / 100k Daily Active Users.
> **Date :** 2026-05-12 · **Owner :** founder (Tim Moyence)
> **Companion :** [`docs/CAPACITY_PLAN.md`](../CAPACITY_PLAN.md) covers backend/Redis/PG at rps tiers. This doc focuses on the guardrail-specific bottlenecks (sidecar CPU, LLM API cost, audit log write amplification).

This plan is order-of-magnitude. Real provisioning re-measures with k6 (subsystem H) at each scale jump. Numbers exist so the team is not blindsided.

---

## 1. Traffic hypotheses

| Hypothesis | Value | Source |
|---|---|---|
| Conversion DAU/MAU | 30 % | Mobile-first social app industry median (post-launch) |
| Chat messages per active user per day | 5 | Conservative for a balade-companion (15 min avg session, 3 messages/min on key POIs) |
| % messages triggering guardrail | 100 % (input scan) + 100 % (output scan) | Layered defense — every user message + every LLM response is scanned |
| Peak-hour amplification vs avg | 4× | Cultural use case is concentrated in afternoons; museum opening hours |
| LLM judge fan-out per message | 1.0 (Phase 0/1) → 1.0 (Phase 2 if cost CB holds) | One judge call per L1 layer scan |

Resulting scan rates per DAU tier (input + output combined):

| DAU | Scans/day | Avg scans/sec | Peak-hour scans/sec |
|---|---|---|---|
| **1k** | 10 000 | 0.12 | 0.46 |
| **10k** | 100 000 | 1.16 | 4.6 |
| **50k** | 500 000 | 5.8 | 23 |
| **100k** | 1 000 000 | 11.6 | 46 |

These are the **target throughputs** the pipeline must meet without breaker trips.

---

## 2. LLM Guard sidecar capacity

Per [design.md §9.4](../../.claude/skills/team/team-state/2026-05-12-llm-guard-perennial-10y-design/design.md):

| Replica throughput | p95 | RAM | Inflight cap |
|---|---|---|---|
| ~8 scans/sec/replica (CPU-bound) | < 600 ms | 2 GB/replica | 8 inflight default |

**Scaling math :** to absorb peak-hour, you need ⌈peak / 8⌉ replicas with headroom :

| DAU | Peak/s | Required replicas (no headroom) | With 50 % headroom | Notes |
|---|---|---|---|---|
| 1k | 0.5 | 1 | 1 | Current pre-launch posture |
| 10k | 4.6 | 1 | 2 | Recommended : 2 replicas (resilience over capacity) |
| 50k | 23 | 3 | 4 | Multi-host needed — single VPS no longer enough |
| 100k | 46 | 6 | 8 (4 per region × 2 regions EU+US) | Geo-distribution kicks in |

**At 100k DAU, the single-VPS posture is broken.** The mitigation path is in §5.

---

## 3. LLM judge cost projection (Phase 1+)

Assumptions :
- Provider mix : Deepseek primary ($0.14 / 1M input + $0.28 / 1M output, 2026-Q2 pricing), OpenAI gpt-4o-mini fallback ($0.15 / $0.60 per 1M).
- Avg prompt + response token count per scan : 800 in + 200 out = 1k tokens (judge eval prompt is short).
- Cost per scan (Deepseek) : 800 × 0.14e-6 + 200 × 0.28e-6 ≈ $0.000168.
- Cost per scan (OpenAI fallback) : $0.000240.

| DAU | Scans/month | Monthly LLM-judge cost (Deepseek) | Worst-case (OpenAI only) |
|---|---|---|---|
| 1k | 300 000 | $50 | $72 |
| 10k | 3 000 000 | $504 | $720 |
| 50k | 15 000 000 | $2 520 | $3 600 |
| 100k | 30 000 000 | $5 040 | $7 200 |

**Cost CB at $50/day default** (design.md §D9 / 11.2) protects against runaway. At 100k DAU avg, baseline is $168/day — the CB needs to be raised proportionally (Phase 1B telemetry-driven tune, ADR required).

**Multi-instance counter amplification risk :** the cost CB state is in Redis ; if Redis is partitioned, each replica falls back to in-process counters and the **effective cap multiplies by replica count**. At 100k DAU with 8 replicas, a Redis outage means 8× the cap until partition heals. This is documented in [design.md §11.2](../../.claude/skills/team/team-state/2026-05-12-llm-guard-perennial-10y-design/design.md) and flagged in the risk register as R-A5 partial mitigation.

---

## 4. Postgres audit log volume

Per audit-log-patterns research §A1 + §A4 :

- Avg row size : ~2 KB (UUID + action enum + metadata JSON with redacted snippet + hash chain pointers).
- Retention : 13 months active in Postgres (aligned with IP anonymization job already in place — see `museum-backend/src/shared/audit/audit-ip-anonymizer.job.ts`), 7 years in S3 Object Lock cold archive (AI Act Art. 12 + ROPA retention).

| DAU | Audit rows/day | Daily size | Monthly size | 13-month hot retention | 7-year S3 cold |
|---|---|---|---|---|---|
| 1k | 10 k | 20 MB | 600 MB | 8 GB | 50 GB |
| 10k | 100 k | 200 MB | 6 GB | 80 GB | 500 GB |
| 50k | 500 k | 1 GB | 30 GB | 400 GB | 2.5 TB |
| 100k | 1 M | 2 GB | 60 GB | 800 GB | 5 TB |

**At 100k DAU, audit log dominates Postgres write IO.** Mitigation per Phase 2 in [audit-log-patterns research §C](../../.claude/skills/team/team-state/2026-05-12-llm-guard-perennial-10y-design/compliance-research-audit-log-patterns.md) : BRIN index on `created_at`, batch insert (already shipped), partition by month at 50k+ DAU, dedicated read replica for audit queries at 100k.

S3 cold archive cost (S3 Standard us-east-1 $0.023/GB-mo + Glacier Instant Retrieval $0.004/GB-mo after 6 mo) at 100k DAU = ~$20/month for 7-year retention. Negligible.

---

## 5. Bottlenecks identified

| # | Bottleneck | Trigger | Phase | Mitigation |
|---|---|---|---|---|
| **B1** | Sidecar CPU (single VPS) | > 10k DAU peak | 1 | Horizontal scale to 2+ replicas (Docker Compose `--scale`), eventually move to dedicated host. |
| **B2** | Postgres write amplification (audit) | > 50k DAU | 2 | Audit-log table partitioning by month, BRIN index, dedicated read replica for chain-verify queries. |
| **B3** | LLM judge cost amplification (multi-replica counter) | Cost CB Redis outage | 1B | ADR for B4-class cost CB. Mitigation : Redis Sentinel + fail-CLOSED on cost overrun (no judge call instead of in-process count). |
| **B4** | Region latency (cross-Atlantic chat) | > 50k DAU outside EU | 3 | Multi-region deployment (EU + US), regional sidecar replicas. |
| **B5** | OpenAI / Deepseek rate limit | Peak-hour > 50/s judge calls | 2 | Multi-provider load balancing (LangChain orchestrator already supports it). Cost CB acts as safety net. |
| **B6** | TTS audio storage growth (S3) | > 10k DAU (voice) | 1 | Lifecycle policy : audio assets > 30 d → Glacier Instant. ROPA item. |

---

## 6. Scaling path per DAU tier

### 1k DAU — current (pre-launch)
- 1 VPS, 1 backend, 1 sidecar replica.
- Postgres on the same VPS (docker-compose).
- Redis single instance.
- **No CDN, no load balancer.** Adequate for V1 launch.
- Cost : < $50/mo (OVH VPS).

### 10k DAU — first traction
- 1 VPS upgraded to higher tier (8 GB → 16 GB).
- Backend single replica still adequate (Express handles 200-500 rps per core easily).
- Sidecar scaled to **2 replicas** (resilience > capacity at this tier).
- Redis single instance with persistence enabled.
- Add Cloudflare in front of landing + admin static surfaces.
- Cost : ~$150/mo VPS + ~$70/mo LLM (Deepseek primary) + $0 CDN free tier ≈ $220/mo.

### 50k DAU — B2B GA threshold
- Move Postgres to **dedicated managed instance** (16 GB RAM, PgBouncer transaction mode — ADR-021).
- Backend scaled to **3 replicas** behind a load balancer (still single region).
- Sidecar scaled to **4 replicas** on a dedicated host (CPU contention with backend no longer acceptable).
- Postgres **read replica** for audit log queries (chain-verify cron + Art. 22 explanation endpoint).
- Redis with persistence + Sentinel for HA.
- Cost CB hardened (Phase 1B ADR).
- Cost : ~$1 200/mo infra + ~$2 500/mo LLM judge ≈ $3 700/mo.

### 100k DAU — multi-region
- **Multi-region deployment** (EU primary + US satellite).
- Backend 5 replicas per region (10 total) with regional load balancer + global anycast for ingress.
- Sidecar 4 replicas per region (8 total).
- Postgres regional with cross-region read replica for audit aggregation.
- **CDN required** : Cloudflare Pro tier (WAF + analytics + image optimization).
- Postgres write amplification mitigation : audit log partitioning by month, BRIN index on `created_at`, dedicated audit-only read replica.
- LLM provider mix : Deepseek primary, OpenAI secondary (geo-aware routing), Google Gemini Flash tertiary.
- Cost : ~$10k/mo infra + ~$5 000/mo LLM ≈ $15k/mo. Matches the [`docs/CAPACITY_PLAN.md`](../CAPACITY_PLAN.md) "100K rps" tier cost envelope.

---

## 7. Cost projection table (consolidated)

| DAU | Infra/mo | LLM API/mo | Audit storage/mo | Observability/mo | Total/mo |
|---|---|---|---|---|---|
| 1k | < $50 | < $50 | < $1 | $0 (UptimeRobot free) | **~ $100** |
| 10k | $150 | $504 | $5 | $0 | **~ $660** |
| 50k | $1 200 | $2 520 | $25 | $50 (Better Stack Pro) | **~ $3 800** |
| 100k | $10 000 | $5 040 | $80 | $200 (Grafana Cloud + Sentry team) | **~ $15 300** |

These numbers feed the B2B pricing model. Unit economics target at 100k DAU : $0.15 / DAU / month operational cost ; B2B licensing per museum needs to cover the corresponding cohort plus margin.

---

## 8. Capacity drills

Per [design.md §11.4](../../.claude/skills/team/team-state/2026-05-12-llm-guard-perennial-10y-design/design.md) chaos drills validate recovery quarterly. Capacity-specific drills :

1. **Sidecar replica loss** — `docker compose stop` one replica, observe breaker behavior. Expected : remaining replica absorbs load until p95 alert fires.
2. **Postgres failover** — promote read replica, measure audit-log write delay. Goal : < 30 s degradation.
3. **Redis outage** — kill Redis container, verify cost CB falls back to in-process counter safely.
4. **LLM provider outage** — block OpenAI egress at firewall, verify Deepseek fallback works without latency spike > 1 s.

Drill cadence : quarterly post-launch ; before each B2B GA milestone.

---

## See also

- [`docs/CAPACITY_PLAN.md`](../CAPACITY_PLAN.md) — backend / PG / Redis / CDN tier table (request-per-second axis).
- [`docs/observability/alerts-llm-guard.yml`](../observability/alerts-llm-guard.yml) — alerts that fire when capacity is breached.
- [`docs/RUNBOOKS/guardrail-incidents.md`](../RUNBOOKS/guardrail-incidents.md) — what to do when those alerts fire.
- [`docs/compliance/FAIRNESS_METRICS_PLAN.md`](../compliance/FAIRNESS_METRICS_PLAN.md) — bias monitoring throughput considerations.
- [design.md §9.4](../../.claude/skills/team/team-state/2026-05-12-llm-guard-perennial-10y-design/design.md) — per-provider capacity table (source of throughput numbers).
