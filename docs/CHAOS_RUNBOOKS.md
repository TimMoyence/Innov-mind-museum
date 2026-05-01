# Chaos Runbooks — Musaium Backend

**Owner:** staff DB/SRE pass — subsystem H
**Spec:** docs/superpowers/specs/2026-05-01-H-observability-design.md

Three controlled chaos experiments validate the F-component fault
tolerance. **All experiments are run on staging only** unless an
explicit "prod chaos game day" is scheduled with on-call.

## 1. Redis kill — verify graceful degrade

**Hypothesis:** killing the Redis node (or a Cluster master) does not
cause a multi-second user-visible outage. Rate-limit fails closed
(per ADR-011), cache misses propagate as fresh DB queries (slower but
functional), BullMQ queues pause until Redis returns.

### Pre-flight

- [ ] Backend deployed and serving normal traffic on staging.
- [ ] Grafana dashboard open, focus on `http_requests_total` rate +
  `llm_cache_hit_ratio` panels.
- [ ] On-call notified (chaos exercise window).
- [ ] Sentry projection prepared for spike of `redis_unreachable` events.

### Run

1. Identify Redis instance (or Cluster master): `redis-cli -h <host> info server`.
2. Kill the process: `kill <pid>` (graceful) OR `kill -9 <pid>` (immediate).
3. Watch dashboard for 60 s.

### Expected behaviour

- Rate-limit middleware fails closed → returns 429 to new requests
  (ADR-011). Existing in-flight requests complete normally.
- LLM cache misses 100% during outage → all requests hit LLM (latency
  spike). Backend stays up.
- BullMQ workers reconnect-loop with exponential backoff (BullMQ default).
  No job loss.

### Recovery

1. Restart Redis: `systemctl start redis` (or Cluster master promotion if
   sentinel/cluster mode).
2. Watch dashboard: rate-limit recovers, cache hit ratio climbs back
   over 5-10 minutes (cold cache).

### Rollback if experiment goes wrong

- The kill is reversible. If the rate-limit fail-closed policy degrades
  user experience beyond acceptable, deploy the kill-switch
  `RATE_LIMIT_FAIL_OPEN=true` env var (per ADR-011 escape hatch).

## 2. PostgreSQL replica kill — verify primary fallback

**Hypothesis:** killing a read replica drops `dataSourceRouter.read`
back to the primary; no user-visible failure.

### Pre-flight

- [ ] At least one replica deployed (DB_REPLICA_URL set).
- [ ] Backend code paths actively reading from replicas (post F migration).

### Run

1. Identify replica: `psql -h <replica-host>` smoke test.
2. Stop replication: `pg_ctl stop -D /var/lib/postgresql/data` on replica.

### Expected behaviour

- TypeORM connection pool on backend re-routes via DataSourceRouter
  fallback (read fails → fall back to write source).
- Brief latency spike as the primary absorbs replica's read load.
- No HTTP 5xx if primary has headroom.

### Recovery

- Restart replica + wait for replication lag to drain.
- Verify lag with `SELECT NOW() - pg_last_xact_replay_timestamp() FROM pg_stat_replication`.

### Rollback if experiment goes wrong

- If primary CPU saturates, reduce backend traffic via Cloudflare cache TTL bump.

## 3. LLM provider kill — verify multi-provider fallback

**Hypothesis:** primary LLM provider (e.g. OpenAI) returning 500/timeout
fails over to the secondary (Deepseek / Google) within a single
request budget.

### Pre-flight

- [ ] LangChain orchestrator's provider chain configured with at least
  two providers.
- [ ] Operator has a way to toggle provider availability per env (or
  iptables block on the OpenAI hostname).

### Run

1. Block egress to `api.openai.com`:
   `iptables -A OUTPUT -d api.openai.com -j REJECT` (root needed).
2. Send a chat request via curl.

### Expected behaviour

- LangChain orchestrator catches first-provider error, retries on
  secondary. p99 latency budget allows for one fallback (~3 s extra).
- User sees a successful response (slightly slower).
- Sentry logs `llm_provider_fallback` event.

### Recovery

- Remove the iptables rule: `iptables -D OUTPUT -d api.openai.com -j REJECT`.
- Verify cache + queue normality.

### Rollback if experiment goes wrong

- LangChain orchestrator should never block forever — has per-call
  timeout. If it does, revert backend to the prior deploy.

## When to run

- After each major F-component deploy (per-component, in isolation).
- Quarterly chaos game day (all three in sequence).
- Whenever a claim of fault tolerance is added to the codebase or docs.
