# Musaium Backend — SLO Targets

**Owner:** staff DB/SRE pass — subsystem H
**ADR:** docs/adr/ADR-026-slo-observability-strategy.md
**Last reviewed:** 2026-05-01

## Service-level objectives

| SLO | Target | Measurement window | Budget consumed by |
|---|---|---|---|
| API availability | 99.9% | 30 days rolling | HTTP 5xx + timeouts on critical routes |
| `POST /api/chat/messages` p99 latency | < 5 s | 5 minutes rolling | LLM inference + fallback chain |
| All other API p99 latency | < 200 ms | 5 minutes rolling | DB + cache lookups |
| LLM cache hit ratio | ≥ 30% | 1 hour rolling | Subsystem G effectiveness |
| Redis cache hit ratio (chat session bag) | ≥ 80% | 1 hour rolling | Eviction pressure on Redis Cluster |
| BullMQ job lag (knowledge-extraction + retention crons) | < 60 s p99 | 1 hour rolling | Queue backpressure |
| Audit log integrity (hash chain) | 100% | per write | Hash mismatch = critical anomaly |

## Error budget policy

- **Available budget**: 0.1% downtime per month = ~43 minutes.
- **Soft freeze (≥ 50% budget consumed)**: pause non-critical deploys;
  drainable changes only (revert + small fixes).
- **Hard freeze (≥ 80% budget consumed)**: revert-only; no deploys
  except the fix for the active incident.
- **Budget reset**: monthly, on the 1st at 00:00 UTC.

## Critical routes

These routes consume error budget when they emit 5xx:
- `POST /api/chat/messages` (chat happy path)
- `POST /api/chat/sessions` (session creation)
- `POST /api/auth/login`, `POST /api/auth/refresh` (auth)
- `GET /api/health` (liveness — never 5xx)

## Non-critical routes

These do NOT consume error budget at the same rate:
- `/api/admin/*` (operator surface — separate dashboard)
- `/api/support/*` (low-traffic moderation)
- `/api/openapi.json` (cached by CDN; backend availability irrelevant most of the time)

## Alert tiers

| Tier | Condition | Action | Channel |
|---|---|---|---|
| P0 | Burn rate > 14.4 (1h budget exhausted in 1h) | Page on-call | PagerDuty / Sentry critical |
| P1 | Burn rate > 1 (slow erosion) | Ticket within 24h | Slack #ops + Sentry |
| P2 | Anomaly (cache hit ratio drop > 20% baseline) | Dashboard + log | Slack #ops |

## Review cadence

- Monthly: SLO numbers vs targets — adjust budget if persistently consumed (true SLO breach) or persistently surplus (target was too lax).
- Quarterly: re-baseline cache hit ratios after major UX changes.
