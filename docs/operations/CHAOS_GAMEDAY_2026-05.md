# Chaos game-day — pre-V1 (target: 2026-05-19/20)

**Audience:** Musaium founder + on-call (founder is on-call until a delegate is hired).
**Goal:** Execute the 3 experiments in [`docs/CHAOS_RUNBOOKS.md`](../CHAOS_RUNBOOKS.md) one at a time, capture findings, amend the runbooks where reality differs from the hypothesis. This is the pre-V1 "last call" before the launch freeze, so blockers found here either trigger a rollback or a documented `accepted residual risk` with rationale.
**Source spec:** [`docs/CHAOS_RUNBOOKS.md`](../CHAOS_RUNBOOKS.md) — hypothesis, pre-flight, run, expected behaviour, recovery, rollback per experiment.
**Last updated:** 2026-05-17. **Audit run:** `2026-05-17-w4-compliance-ops-release` (cluster C, TC1 / C7.2).
**TL executes** — chaos cannot be safely run from a Claude Code session. This document is the *plan + post-game template*; the human runs it.

> Production-tagged caveat: per the chaos-runbooks header, "All experiments are run on **staging only** unless an explicit prod chaos game day is scheduled with on-call." We have no formal staging server pre-V1 (memory `project_no_staging_v1.md`). The pre-V1 game-day therefore runs against the **local Docker stack** (`infra/grafana/docker-compose.local.yml` + `museum-backend/docker-compose.dev.yml`). Findings from a local game-day are weaker than from staging (no real load, no real network), but they expose the deterministic failure modes (config errors, mis-wired alerts, broken recovery scripts) that are the dominant V1 risk.

---

## 1. Pre-flight (the morning of the game-day)

Run all of these to T-flag (PASS / FAIL) before touching anything:

### 1.1 Environment readiness

| # | Check | Command | Pass |
|---|---|---|---|
| 1 | Docker stack up | `docker compose -f museum-backend/docker-compose.dev.yml ps` | All services Up |
| 2 | Grafana stack up | `docker compose -f infra/grafana/docker-compose.local.yml ps` | prometheus + grafana + alertmanager Up |
| 3 | Backend serving | `curl -s http://localhost:3000/api/health \| jq` | `{"status":"ok"}` |
| 4 | Redis reachable | `redis-cli -p 6379 PING` (or via `docker exec` if remote) | `PONG` |
| 5 | Sentry projection prepared | Open <https://sentry.io/organizations/musaium/issues/> in browser | UI loads |
| 6 | Grafana dashboards loaded | Open <http://localhost:3001/d/chat-latency> | Dashboard renders, time range = last 1 h |
| 7 | All cluster-B alerts wired (W4) | `ls infra/grafana/alerting/*.yml` | `chat-latency.yml`, `chat-stages-latency.yml`, `llm-cost.yml`, `wikidata-resilience.yml` present |
| 8 | Founder reachable | Self-check phone has signal + Slack `#security` push enabled | Yes |

Any FAIL row blocks the game-day. **Especially row 7** — running chaos without the cluster-B alerts in place means we lose the very signal we are trying to validate.

### 1.2 Snapshots (before chaos)

Capture a 5-minute baseline so post-game diffs are anchored. From the Grafana UI, snapshot these dashboards (Share → Snapshot, expire 30 d):

- `chat-latency` — full panel
- `chat-stages-latency` (W4 C1.1)
- `wikidata-resilience`
- `guardrail-fairness` (W4 W6.10)

Save the snapshot URLs in this file's §4 below.

### 1.3 Recovery rehearsal

Before each experiment, **dry-rehearse the recovery step on a non-chaos resource** to prove the operator's commands work. Example: before Experiment 1 (Redis kill), run `docker compose -f museum-backend/docker-compose.dev.yml restart redis` to a healthy redis — confirm it restarts. This catches stale docker-compose paths *before* the chaos has burned 60 s.

## 2. Execution plan

> **One experiment at a time. Recover fully before the next.** Do NOT chain.
> **Time-box each experiment to 15 min total** (5 min run + 5 min observe + 5 min recover). If you blow the budget, ABORT and recover; document the abort as the finding.

### 2.1 Experiment 1 — Redis kill (~15 min)

Step | Action | Operator clock
--- | --- | ---
0 | Note start time `T0` | manually
1 | Identify Redis pid: `docker exec musaium-redis pidof redis-server` | T0 + 0:30
2 | `docker kill --signal=SIGTERM musaium-redis` | T0 + 1:00
3 | Watch dashboard `chat-latency` panel `http_requests_total rate` for 60 s | T0 + 2:00
4 | Issue test chat request: `curl -X POST http://localhost:3000/api/chat -H 'Authorization: Bearer <test>' -d @samples/chat-request.json` | T0 + 3:00
5 | Expected: request succeeds with cache miss path (slower). Note actual latency. | T0 + 3:30
6 | Restart Redis: `docker compose -f museum-backend/docker-compose.dev.yml up -d redis` | T0 + 5:00
7 | Wait for connection re-establish (BullMQ logs `redis ready`). | T0 + 7:00
8 | Re-issue test chat request. Cache should be empty (fresh). | T0 + 8:00
9 | Note end time `T1`. Capture: latency p50/p99 during outage, # of 5xx, Sentry events. | T1

**Verdict criteria:**

- PASS — zero 5xx during the outage window; latency p99 ≤ 1.5× baseline.
- WARN — 5xx ≤ 5 % during the outage; latency p99 ≤ 3× baseline.
- FAIL — 5xx > 5 % or sustained outage > 60 s after recovery.

### 2.2 Experiment 2 — Postgres replica → primary failover (~15 min)

> Local stack has only a primary (no replica wired pre-V1). For the local game-day, simulate by **stopping the connection pool for 30 s** instead of stopping a replica. This validates the application's reaction to a transient DB unavailability, which is the failure mode we actually need to cover before V1.

Step | Action | Operator clock
--- | --- | ---
0 | Note `T0` | —
1 | Block backend → Postgres traffic: `docker network disconnect museum-backend_default musaium-db` | T0 + 0:30
2 | Issue 3 chat requests + 1 admin metrics request via curl | T0 + 1:30
3 | Expected: backend returns 5xx with `db_unreachable` error class within ~5 s (not hanging on TCP). | T0 + 3:00
4 | Reconnect: `docker network connect museum-backend_default musaium-db` | T0 + 5:00
5 | Wait for `pg_isready -h localhost -p 5433` | T0 + 6:00
6 | Re-issue requests — expect 200 + normal latency within ~10 s of reconnect. | T0 + 7:30
7 | Capture: total downtime, error class returned, p99 of recovery curve. | —

**Verdict criteria:**

- PASS — backend returns 503 with a clear error code within 5 s (no infinite TCP wait), recovers within 10 s of reconnect.
- WARN — 5xx delayed > 10 s (silent retry loop swallows the failure).
- FAIL — backend never recovers without restart, or returns 200 with stale data during the outage.

### 2.3 Experiment 3 — LLM provider kill (~15 min)

Step | Action | Operator clock
--- | --- | ---
0 | Note `T0` | —
1 | Block OpenAI: `iptables -A OUTPUT -d api.openai.com -j REJECT` (or set `OPENAI_API_KEY` to invalid value via container env restart — `docker exec` doesn't change env) | T0 + 1:00
2 | Send chat request | T0 + 2:00
3 | Expected: orchestrator falls over to DeepSeek or Google within 3 s. Response succeeds, slightly slower. | T0 + 3:00
4 | Verify Sentry event `llm_provider_fallback` emitted. | T0 + 4:00
5 | Unblock: `iptables -D OUTPUT -d api.openai.com -j REJECT` | T0 + 5:00
6 | Re-issue request — should hit OpenAI again, p99 back to baseline. | T0 + 7:00

**Verdict criteria:**

- PASS — fallback succeeds within 5 s, response correct, Sentry event emitted, no user-visible error.
- WARN — fallback adds > 5 s latency or partial degradation (e.g. shorter response).
- FAIL — request fails with 5xx, no fallback attempt logged.

## 3. Post-game findings template

Fill this immediately after recovery (memory fades fast). Append into `team-state/2026-05-17-w4-compliance-ops-release/STORY.md` under `## verify — chaos game-day — <ts>` AND mirror into `docs/CHAOS_RUNBOOKS.md` as a dated case-study block at the bottom.

```markdown
## Chaos game-day — 2026-05-19 (or actual date)

### Operator + time
- Operator: <founder name>
- Wall-clock total: __ min (target ≤ 75 min for 3 experiments)
- Stack tested: local Docker (no staging pre-V1)

### Pre-flight verdicts
- Environment readiness rows: __ / 8 PASS
- Snapshot URLs captured: yes / no
- Recovery rehearsal: completed / skipped (reason: …)

### Experiment 1 — Redis kill
- Wall-clock: __ min
- 5xx during outage: __ %
- Latency p99 ratio (outage / baseline): __ ×
- Verdict: PASS / WARN / FAIL
- Findings:
  - …
- Runbook amendments needed:
  - …

### Experiment 2 — DB unavailability (simulated failover)
- Wall-clock: __ min
- Error class returned: …
- Time to first 5xx after disconnect: __ s
- Time to recovery after reconnect: __ s
- Verdict: PASS / WARN / FAIL
- Findings:
  - …
- Runbook amendments needed:
  - …

### Experiment 3 — LLM provider kill
- Wall-clock: __ min
- Fallback latency add: __ s
- Sentry `llm_provider_fallback` event emitted: yes / no
- Verdict: PASS / WARN / FAIL
- Findings:
  - …
- Runbook amendments needed:
  - …

### Overall verdict
- PASS / WARN / FAIL (`max(verdicts)`)
- Launch-blockers: …
- Accepted residual risks (with rationale): …
- ADR(s) to write: …
```

## 4. Snapshots + raw artefacts placeholder

```
Grafana baseline snapshot URLs (filled at T-0 of game-day):
- chat-latency:        <url>
- chat-stages-latency: <url>
- wikidata-resilience: <url>
- guardrail-fairness:  <url>

Grafana during-chaos snapshot URLs (filled at T1 of each experiment):
- exp1 (Redis kill):     <url>
- exp2 (DB failover):    <url>
- exp3 (LLM kill):       <url>

Sentry event filter (during-chaos window):
- https://sentry.io/.../issues/?query=is:unresolved+environment:dev&statsPeriod=1h
```

## 5. Done = ?

TC1 (C7.2) is closed when:

- [ ] Pre-flight 8/8 PASS captured in this file's §1.
- [ ] All 3 experiments executed (or explicitly aborted with documented rationale).
- [ ] Findings template fully filled in this file's §3.
- [ ] `CHAOS_RUNBOOKS.md` amended for each experiment where reality diverged from hypothesis.
- [ ] If overall verdict is FAIL → launch-blocker filed as `team-reports/2026-05-XX-launch-blocker-chaos.md` + escalated to TL for V1 gate decision.
- [ ] STORY.md `## verify — chaos game-day —` section appended (W4 STORY).

> **Note** — chaos game-day cannot be executed inside Claude Code. This document scaffolds the operator's day so the findings land in the audit trail without re-discovery effort.
