# ADR-047 — LLM Guard circuit breaker preserves fail-CLOSED unconditionally

> **Status:** Accepted · **Date:** 2026-05-12 · **Deciders:** Tech Lead
> **Run:** `team-state/2026-05-12-llm-guard-resilience-enterprise/`
> **Incident:** 2026-05-12 17:18 UTC prod chat outage (100 % `advanced_guardrail_block`)

---

## Context

The LLM Guard sidecar (Python FastAPI wrapper around `protectai/llm-guard`) sits in front of the chat pipeline as a defense-in-depth layer — it scans user prompts and LLM outputs for prompt injection, PII, toxicity, schema violations, and other categories that the upstream keyword guardrail cannot reliably catch. The adapter has always enforced a **fail-CLOSED** contract: when the sidecar is unreachable, slow, or returns malformed data, the chat message is blocked rather than passed through. This is appropriate for a security gate.

On 2026-05-12 the sidecar CPU-bound P95 latency on the production VPS exceeded the 500 ms timeout, and every chat message hit the fail-CLOSED path — 100 % of legitimate user prompts received the canned `unsafe_output` refusal. To address this, a parallel implementation track introduced a three-state circuit breaker (CLOSED / OPEN / HALF_OPEN) so the backend could short-circuit the sidecar for 30 s after N failures, sparing the dying sidecar and cleaning up the timeout log spam.

In the initial implementation, the short-circuit path returned `{ allow: true }` — a **fail-OPEN** posture. A fresh-context code review on 2026-05-12 17:51 flagged this as a security regression: during the 30 s open-window of every breaker cycle, the LLM Guard defense layer was silently bypassed, allowing prompt-injection / PII / data-exfiltration attempts to reach the LLM without sidecar inspection. The upstream keyword filter and prompt isolation remain active, but they are intentionally weaker than the sidecar — that's why the sidecar exists.

The tech lead rejected the proposal to gate this behind a `GUARDRAILS_V2_BREAKER_FAIL_OPEN` feature flag (project doctrine pre-launch V1: no feature flags — "live or revert").

## Decision

**The LLM Guard adapter shall return fail-CLOSED (`{ allow: false, reason: 'error' }`) in every branch where the sidecar verdict cannot be obtained**, including:

1. Network errors (DNS, refused, reset, etc.)
2. HTTP non-2xx responses
3. Malformed JSON / unexpected payload shape
4. Timeout (AbortController fired)
5. **Circuit breaker is OPEN or HALF_OPEN-no-slot** — short-circuit before any HTTP call
6. **Inflight semaphore queue overflow** — fast-fail when concurrent load exceeds capacity

The keyword guardrail, structural prompt isolation, and `sanitizePromptInput` continue to run upstream of the LLM Guard layer and ARE NOT a replacement for the sidecar verdict.

**There is no feature flag** to disable this behavior. The breaker thresholds (`LLM_GUARD_CB_*`) and the inflight cap (`LLM_GUARD_MAX_INFLIGHT`, `LLM_GUARD_QUEUE_MAX`) are operational tunables: they tune *when* and *how many* requests short-circuit, but every short-circuit ends with fail-CLOSED. Emergency disable of the breaker is `LLM_GUARD_CB_FAILURE_THRESHOLD=1000000` (effectively never trips) — documented in `docs/OPS_INCIDENT_LLM_GUARD.md`. That path is not a kill-switch for the safety contract, only for the optimization layer.

## Consequences

**Positive :**
- User cannot bypass LLM Guard layer during a sidecar outage.
- Audit trail (`AUDIT_SECURITY_LLM_GUARD_BREAKER_OPEN`) records every breaker trip for forensic correlation.
- Latency histogram (`musaium_llm_guard_scan_duration_seconds`) provides leading indicator before fail-CLOSED triggers — SRE can page on p95 > 600 ms instead of after 5 timeouts.
- Inflight semaphore prevents the death-spiral pattern (traffic surge → sidecar P95 explodes → all time out → 100 % fail-CLOSED).

**Negative :**
- During a real sidecar outage, chat remains broken until the sidecar recovers OR the operator manually raises `LLM_GUARD_CB_FAILURE_THRESHOLD` (which only stops the breaker logs, doesn't fix the underlying sidecar latency).
- The 1500 ms timeout (raised from 300/500 ms on 2026-05-12) adds up to 3 s of guardrail overhead per chat message in the steady-state success path. The latency histogram is the SRE's only insight into this — alerts must be wired.

**Neutral :**
- The breaker is mostly useful for log hygiene and reduced sidecar pressure; it does NOT improve user experience during an outage (still fail-CLOSED). Its primary value is the audit + alerting surface.

## Reversal path

Reversing this ADR — i.e. allowing fail-OPEN under any condition — requires:

1. A new ADR amending or superseding this one.
2. A security review documented in the new ADR's "Risk assessment" section, naming the specific threat class (injection / PII / etc.) that the system accepts losing during fail-OPEN windows.
3. The change must NOT introduce a per-request kill-switch flag — if fail-OPEN becomes acceptable, it becomes the always-on behavior gated by a single config decision documented at the ADR level.

The project doctrine `feedback_no_feature_flags_prelaunch` makes any "fail-OPEN flag" proposal a non-starter before B2B revenue. Post-launch the doctrine inverts and flags become available — but even then, this contract is load-bearing for the AI safety story (`docs/AI_SAFETY.md`) and any reversal must update that doc too.

## Metrics SLO (amendment 2026-05-12 Phase 0)

Operational thresholds for the alert rules in `infra/grafana/alerting/llm-guard-bias.yml`:

| Alert | Expression (Prometheus) | Severity | Routing |
|---|---|---|---|
| `LLMGuardLatencyHigh` | `histogram_quantile(0.95, rate(musaium_llm_guard_scan_duration_seconds_bucket[5m])) > 0.6` for 2m | warning | Slack #ops-musaium |
| `LLMGuardLatencyCritical` | `histogram_quantile(0.95, rate(musaium_llm_guard_scan_duration_seconds_bucket[5m])) > 0.8` for 2m | critical | Telegram on-call |
| `LLMGuardBreakerOpen` | `musaium_llm_guard_circuit_breaker_state{state="open"} == 1` for 30s | critical | Telegram on-call |
| `LLMGuardSkipsRateHigh` | `rate(musaium_llm_guard_circuit_breaker_skips_total[5m]) > 1` for 2m | warning | Slack #ops-musaium |
| `LLMGuardScanErrorsHigh` | `rate(musaium_llm_guard_scan_duration_seconds_count{outcome="fail_closed"}[5m]) > 0.5` for 5m | warning | Slack #ops-musaium |

Runbook entry for each alert: `docs/RUNBOOKS/guardrail-incidents.md` (scenarios S1-S7). Forensic procedure: `docs/RUNBOOKS/audit-chain-forensics.md`. Long-form sidecar-down playbook: `docs/OPS_INCIDENT_LLM_GUARD.md` (scenario S1).

## References

- Parent run : `.claude/skills/team/team-state/2026-05-12-llm-guard-resilience-enterprise/`
- Parent audit (CHANGES_REQUESTED, safety=62/100) : `.claude/skills/team/team-reports/2026-05-12-llm-guard-circuit-breaker-audit/code-review.json`
- Layered defense doc : `docs/AI_SAFETY.md`
- Doctrine memory : `feedback_no_feature_flags_prelaunch`, `feedback_quality_doctrine`, `feedback_honesty_no_pretense`
- Runbook : `docs/OPS_INCIDENT_LLM_GUARD.md`
