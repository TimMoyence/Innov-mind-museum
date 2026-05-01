# 100K rps Stress Test — Runbook

**Last reviewed:** 2026-05-01
**Spec:** docs/superpowers/specs/2026-05-01-H-observability-design.md
**Targets:** subsystem F (cluster + replicas + Cloudflare must be provisioned).

## When to run

Only after the F infra is fully provisioned (PgBouncer in front of PG
primary, ≥ 2 read replicas, Redis Cluster ≥ 6 nodes, Cloudflare CDN
fronting the public surface). Before then, the test will overwhelm
the single-instance setup and produce meaningless results.

## Pre-flight checklist

- [ ] Backend horizontally scaled to ≥ 50 replicas.
- [ ] PgBouncer transaction mode active.
- [ ] PG read replicas serving (verify `dataSourceRouter.read` routes work).
- [ ] Redis Cluster healthy (`CLUSTER NODES` shows 3 masters + 3 replicas).
- [ ] Cloudflare CDN active (verify `cf-cache-status: HIT` on static assets).
- [ ] Grafana dashboard open and live.
- [ ] k6 cluster provisioned (this 100K rps test needs ~5000 pre-allocated
  VUs; single-host k6 won't work — use k6 OSS distributed mode or k6 Cloud).
- [ ] On-call notified.

## During the run

1. Start the test:
   ```bash
   BASE_URL=https://musaium-staging.example.com \
     k6 run tests/perf/k6/stress-100k-rps.k6.js
   ```

2. Watch Grafana panels:
   - HTTP request rate should ramp to 100K/s within 5 s.
   - p99 latency should stay under 5 s for `/api/chat/messages`.
   - Error rate should stay under 1%.
   - LLM cache hit ratio should climb past 30% within the 60 s window
     (cold-cache warmup tail).

3. If any threshold trips, the test exits non-zero — investigate before
   the next attempt.

## Post-run

- Capture Grafana dashboard screenshot at the run window.
- Compare results vs `docs/SLO.md` targets.
- Update `museum-backend/docs/perf/2026-MM-DD-100k-rps.md` (new) with
  conclusions.

## Rollback

- The test is read-only on `/api/health` by default; no DB writes.
- If the backend cluster goes unhealthy under load, scale down k6 first,
  then triage backend CPU / memory / DB connection pool.
