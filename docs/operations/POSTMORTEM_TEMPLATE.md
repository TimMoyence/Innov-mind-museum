# Postmortem Template — Operations / Guardrail Incidents

> **Scope :** operational / safety incidents on the guardrail subsystem. For GDPR-classified breaches (Art. 33/34 triggered), use the heavier [`docs/incidents/POST_MORTEM_TEMPLATE.md`](../incidents/POST_MORTEM_TEMPLATE.md) instead — it has the regulator-facing metadata blocks.
>
> This template is the lightweight "always-on" version for ops incidents that do not involve personal-data breach. Per [design.md §12.3](../../.claude/skills/team/team-state/2026-05-12-llm-guard-perennial-10y-design/design.md) postmortem culture (RP3).

Copy to `docs/incidents/<YYYY-MM-DD>-<slug>/postmortem.md`. Keep prose factual ; describe systems and decisions, not individuals.

---

## When to write a postmortem (mandatory triggers)

Write a postmortem within **48 h of resolution** if any of the following is true :

- **User-visible outage** of any duration (chat returned `service_unavailable` to any real user).
- **Operational outage > 5 min** (regardless of user visibility).
- **Security event** (audit row in the breach-relevant set : `SECURITY_LLM_GUARD_BREAKER_OPEN`, `AUDIT_GUARDRAIL_BLOCKED_OUTPUT` for confirmed leak, supply-chain compromise S7).
- **False negative confirmed** (S5 — postmortem mandatory regardless of impact).
- **False positive surge sustained** (S4 sustained > 30 min OR user complaints > 5).
- **Policy mis-publication** (S6 — Phase 2+).
- **Breaker OPEN > 5 min** (per RP3 in design.md).

For incidents that escape these triggers (transient hiccups), a one-line note in the daily ops journal suffices.

---

## Header

```yaml
incident:
  id: INC-YYYY-NNN                      # match GitHub issue
  slug: guardrail-sidecar-restart       # kebab-case
  scenario_ref: S1                      # from RUNBOOKS/guardrail-incidents.md
  severity_final: P1                    # P0 | P1 | P2 | P3
  date: 2026-05-12
  duration_minutes: 8
  customer_impact:
    affected_users: 0                   # set 0 if pre-launch / no user visible
    visible_symptom: "service_unavailable on 100 % chat requests"
    duration_visible_minutes: 8
  author: Tim Moyence
  reviewers: [Tim Moyence]              # solo dev pre-launch — placeholder for future steward
  status: DRAFT                         # DRAFT | PUBLISHED | ACTIONS-PENDING | CLOSED
```

---

## 1. Executive summary

**Three sentences maximum.** What happened, who was affected, what we changed.

> Example : On 2026-05-12 the LLM Guard sidecar crashed (OOM kill on cold model load) and the circuit breaker tripped, returning `service_unavailable` to all chat requests for 8 min. No user-visible impact (pre-launch traffic). We added a sidecar memory limit + healthcheck on cold-boot and added a regression smoke test.

---

## 2. Timeline (UTC, minute-precision)

Distinguish **observed** (logs, alerts) from **decision** (severity declared, intervention).

| Time (UTC) | Type | Event | Source |
|---|---|---|---|
| YYYY-MM-DDThh:mm | observed | Alert `LLMGuardBreakerOpen` fires | Prometheus |
| YYYY-MM-DDThh:mm | observed | On-call paged | Slack #ops |
| YYYY-MM-DDThh:mm | decision | Severity P1 declared (T+0) | — |
| YYYY-MM-DDThh:mm | execute | Sidecar restarted | runbook S1 §3 |
| YYYY-MM-DDThh:mm | observed | Breaker auto-recovered (HALF_OPEN → CLOSED) | `/health` poll |
| YYYY-MM-DDThh:mm | decision | All-clear declared | — |

---

## 3. Detection

- **How was the incident detected ?** Alert / user report / chaos drill / red-team / audit-log review.
- **Detection signal fidelity :** high (alert fired exactly when expected) OR low (noticed via tangential symptom).
- **Latency to detection** = `<first observed event UTC>` − `<root-cause-introduction UTC>`.

If detection was low-fidelity, what alert would have caught it earlier ?

---

## 4. Resolution

What concrete actions stopped the bleeding, in order, with who did what.

| Time (UTC) | Action | Actor | Reference |
|---|---|---|---|
| hh:mm | Restarted sidecar container | on-call | runbook S1 §3.1 |
| hh:mm | Verified breaker recovered | on-call | runbook S1 §4 |

**Mean Time To Recovery (MTTR)** = `<recovery-complete UTC>` − `<T+0>` = ` < minutes > `.

---

## 5. Root cause analysis — 5 whys

Stop at the systemic cause, not at "the engineer was tired".

1. **Why** did the symptom occur ? — `<answer>`
2. **Why** did 1 happen ? — `<answer>`
3. **Why** did 2 happen ? — `<answer>`
4. **Why** did 3 happen ? — `<answer>`
5. **Why** did 4 happen ? — `<answer>`

**Root cause statement (one sentence) :** `<sentence>`

---

## 6. Contributing factors

Optional. Factors that did not cause the incident but made it worse / longer.

- Factor 1 : ...
- Factor 2 : ...

---

## 7. What went well / poorly / lucky

Three buckets, two-to-three bullets each.

**Worked well :**
- ...

**Did not work :**
- ...

**Got lucky :**
- ...

---

## 8. Action items

Actionable, owned, dated. Prefer 5-7 high-leverage items over a long list.

| ID | Action | Owner | Due | Status | PR |
|---|---|---|---|---|---|
| AI-1 | ... | @user | YYYY-MM-DD | OPEN / IN-PROGRESS / DONE | #N |
| AI-2 | ... | @user | YYYY-MM-DD | ... | ... |

**Verification gate :** every action item closes only when the linked PR is merged AND a regression test exists (or a written justification documents why no test is feasible).

---

## 9. Audit log references

List the audit log rows relevant to this incident. Use UUIDs only — never paste raw prompts.

```sql
SELECT id, action, created_at, metadata
FROM audit_logs
WHERE created_at BETWEEN '<incident-start>' AND '<incident-end>'
  AND action IN ('SECURITY_LLM_GUARD_BREAKER_OPEN', 'AUDIT_GUARDRAIL_BLOCKED_INPUT', 'AUDIT_GUARDRAIL_BLOCKED_OUTPUT');
```

Paste resulting UUIDs here :

- `<uuid>` — `<short-description>`
- `<uuid>` — `<short-description>`

---

## 10. Cross-references

- **Runbook scenario** : [S1 — Sidecar down complete](../RUNBOOKS/guardrail-incidents.md#s1--sidecar-down-complete) (etc.)
- **Related ADRs** : ...
- **Related incidents** (similar root cause) : ...
- **Compliance impact** (GDPR / AI Act) : if any, switch to [`docs/incidents/POST_MORTEM_TEMPLATE.md`](../incidents/POST_MORTEM_TEMPLATE.md) instead.

---

## 11. Sign-off

| Role | Name | Date | Comment |
|---|---|---|---|
| Author | | YYYY-MM-DD | |
| Reviewer (steward) | | YYYY-MM-DD | |
| Process Auditor (T+30 d closure) | | YYYY-MM-DD | Verifies action-item closure |
