# OPS Runbook — LLM Guard sidecar outage / degradation

> **Last reviewed :** 2026-05-12 · **Related ADR :** [ADR-047](./adr/ADR-047-llm-guard-circuit-breaker-fail-closed.md)
> **Audience :** on-call SRE / Tech Lead · **Severity guidance :** P1 (chat broken for >2 min) → P0 (chat broken AND no breaker trip visible — guard fully down + circuit not protecting)

---

## 1. Detection signals

| Signal | Source | Threshold | Means |
|---|---|---|---|
| Prometheus alert `LLMGuardLatencyHigh` | Grafana | p95 > 600 ms over 5 min | Sidecar slowing down ; ahead-of-breaker warning |
| Prometheus alert `LLMGuardLatencyCritical` | Grafana | p95 > 800 ms over 5 min | Sidecar near timeout ; breaker will trip soon |
| Prometheus alert `LLMGuardBreakerOpen` | Grafana | `musaium_llm_guard_circuit_breaker_state{state="open"} == 1` for 30 s | Breaker tripped — fail-CLOSED active on 100 % of chat |
| Log spam `llm_guard_fail_closed` | Loki / journalctl | > 5 events / minute | Same as breaker-near ; pre-trip |
| Audit log `SECURITY_LLM_GUARD_BREAKER_OPEN` | DB `audit_logs` | any new row | Authoritative trip record (correlate with /metrics by timestamp) |
| User reports "chat says my message is unsafe" | Support / Slack | any | Possible symptom — confirm via `/api/health` |

## 2. Immediate triage (≤5 min)

```bash
# 1. Confirm the chat surface is degraded
curl -fsS https://api.musaium.com/api/health | jq '.llmGuardCircuitBreaker'
# Expected healthy: {state: "CLOSED", failureCount: 0, ...}
# Tripped: {state: "OPEN", failureCount: N, openedAt: "..."}

# 2. Check sidecar reachability from the backend container
ssh ops@vps "docker compose -f /srv/museum/docker-compose.prod.yml exec backend \
  curl -fsS http://llm-guard:8081/health"
# Expected: {"status":"ok"} ; if connection refused → sidecar is down

# 3. Sidecar logs (most recent 100 lines)
ssh ops@vps "docker compose -f /srv/museum/docker-compose.prod.yml logs --tail=100 llm-guard"
# Look for: OOM kill, Python tracebacks, model load failures.

# 4. Sidecar process / memory
ssh ops@vps "docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}'"
# llm-guard target: < 2 GB / 4 GB host budget.
```

## 3. Recovery actions

### 3.1 Sidecar dead (`/health` connection refused)

```bash
ssh ops@vps "docker compose -f /srv/museum/docker-compose.prod.yml restart llm-guard"
# Wait ~30 s (warm cache) ; first boot of the day may need 3-4 min (HF model download).
# Confirm: curl http://llm-guard:8081/health  inside the backend container.
```

After restart, the breaker auto-recovers via HALF_OPEN probes after the configured `openDurationMs` (default 30 s).

### 3.2 Sidecar slow but alive (p95 spike, no OOM)

```bash
# Check CPU saturation
ssh ops@vps "docker stats --no-stream llm-guard"
# If CPU > 90 % sustained → capacity issue ; scale up (3.3).
# If CPU normal but P95 high → model thrashing ; restart and observe.
```

### 3.3 Scale up (capacity)

Pre-launch V1 the prod stack runs 1 replica. Scale to 2 if memory budget allows :

```bash
ssh ops@vps "docker compose -f /srv/museum/docker-compose.prod.yml up -d --scale llm-guard=2"
# Service-name DNS (`http://llm-guard:8081`) round-robins via Docker undici keep-alive.
# Memory budget check : free -m  on the host. 2 × 2 GB sidecar + 1 GB backend + 256 MB postgres < 6 GB on 8 GB VPS.
```

If memory tight : drop one of the OUTPUT_SCANNERS (Bias is the lowest-priority for our use case ; document the change in a follow-up ADR).

### 3.4 Emergency breaker bypass (do NOT use casually)

If the breaker is tripping due to a runaway false-positive failure-count and you've confirmed the sidecar IS healthy but the backend's view is wrong (rare — clock skew, weird network) :

```bash
# Set the threshold sky-high so the breaker effectively never trips.
# This DOES NOT bypass fail-CLOSED — every individual call still respects
# its own timeout / 5xx detection. The breaker is the optimization layer,
# not the safety layer.
ssh ops@vps "echo 'LLM_GUARD_CB_FAILURE_THRESHOLD=1000000' >> /srv/museum/.env && \
             docker compose -f /srv/museum/docker-compose.prod.yml up -d backend"
```

**REQUIRED post-action :** open a follow-up incident ticket and revert the env to default once the root cause is understood. The threshold is an operational knob, not a permanent state.

### 3.5 Surge / death-spiral pattern

Symptoms : breaker oscillates rapidly between CLOSED ↔ OPEN ; chat alternates working / broken every ~30 s. Likely caused by a traffic surge exceeding the inflight semaphore.

```bash
# Check semaphore stats via the warn log
ssh ops@vps "docker compose -f /srv/museum/docker-compose.prod.yml logs --tail=50 backend | grep llm_guard_semaphore_overflow"
# If overflow logs are firing → backend is fan-out-throttled correctly,
# the sidecar just can't keep up. Scale up (3.3) and / or raise LLM_GUARD_MAX_INFLIGHT.
```

## 4. Validation after recovery

```bash
# 1. Send a benign test prompt from the staging client (or curl)
# Expected: HTTP 201, response body has assistant text, NOT mappedReason="service_unavailable"

# 2. Confirm breaker recovered
curl -fsS https://api.musaium.com/api/health | jq '.llmGuardCircuitBreaker.state'
# Expected: "CLOSED"

# 3. Confirm latency dropped back
# Grafana panel: "LLM Guard /scan p95" should be < 500 ms steady state.

# 4. Read the audit log row for the trip
psql "$PROD_DB_URL" -c "SELECT created_at, metadata FROM audit_logs \
  WHERE action='SECURITY_LLM_GUARD_BREAKER_OPEN' ORDER BY created_at DESC LIMIT 5;"
```

## 5. Escalation

| Severity | Who | When |
|---|---|---|
| P2 | On-call SRE | Sidecar p95 > 600 ms for > 5 min |
| P1 | Tech Lead | Chat broken (breaker OPEN) for > 2 min |
| P0 | Tech Lead + Security on-call | Chat broken AND a security alert fired (e.g., audit log shows breaker trips clustering around suspicious request patterns) |

Contact list lives in `docs/incidents/BREACH_PLAYBOOK.md` § 4.

## 6. Post-incident

Within 48 h of resolution :

1. Write a post-mortem using `docs/incidents/POST_MORTEM_TEMPLATE.md`.
2. Review the breaker / inflight env values — was the threshold appropriate? Should we adjust defaults?
3. Inspect the audit_log timeline against /metrics — do the trips correlate with deploys, traffic patterns, or external events?
4. If the incident exposed a deeper safety gap (e.g., upstream filters caught threats the sidecar normally catches), amend `docs/AI_SAFETY.md` § Layered defense to document the gap.
5. If the recovery required disabling the breaker (3.4), file an ADR follow-up explaining the bypass duration and why it was safe.

## 6.5 Forensics — audit-log query

When an incident-triage requires correlating breaker trips with chat blocks visible to users, run the following SQL against the prod audit-log replica (read-only credentials in `secrets:db_audit_ro`):

```sql
-- Breaker state transitions in the incident window
SELECT created_at, payload->>'failureCount' AS fails,
       payload->>'windowMs' AS window_ms,
       payload->>'policyVersion' AS policy
FROM audit_logs
WHERE action = 'SECURITY_LLM_GUARD_BREAKER_OPEN'
  AND created_at BETWEEN $1 AND $2
ORDER BY created_at DESC;

-- User-visible blocks during the same window
SELECT created_at, actor_id, payload->>'reason' AS reason,
       payload->>'category' AS category,
       payload->>'localeHint' AS locale
FROM audit_logs
WHERE action IN ('GUARDRAIL_BLOCKED_INPUT', 'GUARDRAIL_BLOCKED_OUTPUT')
  AND created_at BETWEEN $1 AND $2
ORDER BY created_at DESC
LIMIT 200;
```

For deeper inspection — hash-chain integrity, IP-anonymisation verification — follow `docs/RUNBOOKS/audit-chain-forensics.md` and run the `audit-chain` CLI (`museum-backend/src/shared/audit/audit-chain-cli-core.ts`). 13-month retention applies; older windows require restoring from snapshot per `docs/RUNBOOKS/V1_FALLBACKS.md` §audit-restore.

Cross-references for the broader incident playbook (false-positive surge, breaker stuck OPEN, false-negative review, supply-chain compromise, policy mis-publication): `docs/RUNBOOKS/guardrail-incidents.md`.

## 7. Common false-positive triage

- **Breaker trips but sidecar /health is OK from inside the backend container** — Docker DNS may be returning stale records ; restart the backend container, not the sidecar.
- **Audit log shows `failureCount: 5` but Prometheus shows no scrape failures** — confirm scrape interval (15 s default) ; the breaker's 60 s window can trip on transient failures invisible to coarse-grained alerts. This is expected.
- **`musaium_llm_guard_circuit_breaker_state{state="closed"}` is 0 AND none of the others is 1** — gauge seeding bug (should be fixed in ADR-047 wiring). Investigate `chat-module.ts` composition root + add a test if missing.
