# ADR-026 — SLO + Observability Strategy

**Status:** Accepted
**Date:** 2026-05-01
**Deciders:** staff DB/SRE pass — subsystem H
**Spec:** see git log (deleted 2026-05-03 — original in commit history)

## Context

Subsystems A through G ship scale-hardening infra (FK indexes, retention,
cache, replicas, etc.). Without numeric SLOs and an alerting strategy
the value of those investments cannot be measured or defended in
incidents — operators have no anchor for "is the system OK or not".

The current observability surface is OpenTelemetry traces + Sentry
errors. Missing: RED metrics (Rate, Errors, Duration) per route,
business metrics (cache hit ratio, LLM cost), explicit SLO numeric
targets, error-budget policy.

## Decision

Adopt the SLO numeric targets in `docs/SLO.md` (committed alongside
this ADR). Expose Prometheus metrics at `/metrics` for an external
Grafana to scrape. Wire alert tiers:

- **Page (P0)**: SLO burn rate > 14.4 (1h budget burn in 1h) → page on-call.
- **Ticket (P1)**: SLO burn rate > 1 (slow erosion) → ticket within 24h.
- **Log only (P2)**: anomaly detection signals (e.g. cache hit ratio
  drop) → log + dashboard, no alert.

Error budget: 0.1% per month (43 minutes downtime). When the budget is
≥ 50% consumed, freeze non-critical deploys until the burn slows.

## Consequences

- Operators have a single source of truth for "system health".
- Incident reviews can quantify the impact ("X minutes of error budget
  consumed").
- Deploy decisions become data-driven (freeze vs ship).
- Initial Prometheus scrape adds ~50ms p99 to the /metrics endpoint
  itself; trivial overhead on the rest of the API.

## Alternatives considered

- **Sentry-only (no Prometheus)**: rejected — Sentry tracks errors,
  not throughput / latency distributions / business metrics.
- **OTLP metrics export instead of Prometheus**: deferred — Prometheus
  scrape model is simpler for the first dashboard; OTLP can be added
  later.
- **No SLOs (treat all incidents as P0)**: rejected — burns out on-call
  with non-actionable alerts.
