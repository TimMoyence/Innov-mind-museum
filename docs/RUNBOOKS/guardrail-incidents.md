# Runbook — Guardrail Incident Catalogue

> **Owner :** Tim Moyence (steward — see [design.md §12.1](../../.claude/skills/team/team-state/2026-05-12-llm-guard-perennial-10y-design/design.md))
> **Last reviewed :** 2026-05-12
> **Related ADRs :** [ADR-015](../adr/ADR-015-llm-judge-guardrail-v2.md) · [ADR-047](../adr/ADR-047-llm-guard-circuit-breaker-fail-closed.md) · ADR-048 (Phase 0 strategy interface)
> **Audience :** on-call / tech lead.
> **Format :** every scenario uses **ROBE** — Recognize, Orient, Bend, Execute. Each section ends with an escalation row.

The pre-existing surgical playbook [`docs/OPS_INCIDENT_LLM_GUARD.md`](../OPS_INCIDENT_LLM_GUARD.md) is the long-form version of **S1 — Sidecar down complete** in this catalogue. This file is the index and adds the six other scenarios.

---

## Escalation chain (applies to every scenario)

| Severity | Trigger | Who pages | Response time |
|---|---|---|---|
| **P3** | Single non-blocking alert, no user impact | On-call SRE — Slack #ops | Same business day |
| **P2** | Latency degradation, chat still serving | On-call SRE — Slack #ops + Sentry | < 30 min |
| **P1** | Chat broken for > 2 min OR security event | Tech Lead — phone + Slack | < 15 min |
| **P0** | Chat broken AND security event AND no clear cause | Tech Lead + Founder | < 5 min |

`docs/incidents/BREACH_PLAYBOOK.md` § 4 holds the contact list. P1+ opens a war-room channel.

---

## S1 — Sidecar down complete

**Class :** availability — 2026-05-12 incident class. **Severity start :** P1. **Long form :** [`OPS_INCIDENT_LLM_GUARD.md`](../OPS_INCIDENT_LLM_GUARD.md).

### Recognize
- Alert `LLMGuardBreakerOpen` fires AND `/health` returns `llmGuardCircuitBreaker.state == "OPEN"`.
- Sidecar `/health` from inside backend container returns connection refused.
- Audit log row `SECURITY_LLM_GUARD_BREAKER_OPEN` recently inserted.

### Orient
```bash
curl -fsS https://api.musaium.com/api/health | jq '.llmGuardCircuitBreaker'
ssh ops@vps "docker compose -f /srv/museum/docker-compose.prod.yml exec backend curl -fsS http://llm-guard:8081/health"
ssh ops@vps "docker compose -f /srv/museum/docker-compose.prod.yml logs --tail=200 llm-guard"
```

### Bend
Fail-CLOSED is doing its job. Chat is degraded (every request returns `service_unavailable`), no safety contract violation. The intervention is to bring the sidecar back, NOT to bypass the breaker.

### Execute
1. `ssh ops@vps "docker compose -f /srv/museum/docker-compose.prod.yml restart llm-guard"` — wait 30 s (4 min on cold cache, HF model fetch).
2. Validate inside the backend container : `curl http://llm-guard:8081/health` → `{"status":"ok"}`.
3. Breaker auto-recovers via HALF_OPEN probes after `openDurationMs` (default 30 s).
4. Smoke a benign prompt from staging client → expect HTTP 201, `mappedReason != "service_unavailable"`.
5. Postmortem mandatory if outage > 5 min (see [§ Postmortem trigger](../operations/POSTMORTEM_TEMPLATE.md#when-to-write-a-postmortem)).

**Escalate to P0** if : restart fails twice in a row OR audit logs show breaker trips clustering around suspicious request fingerprints (possible attack) OR sidecar image digest does not match the pinned one (supply-chain — go to S7).

---

## S2 — Sidecar partial degradation (slow but alive)

**Class :** performance. **Severity start :** P2.

### Recognize
- Alert `LLMGuardLatencyHigh` (p95 > 600 ms / 2 min) — warning.
- Alert `LLMGuardLatencyCritical` (p95 > 800 ms / 2 min) — critical, breaker imminent.
- Log spam `llm_guard_semaphore_overflow` if inflight saturated.

### Orient
```bash
ssh ops@vps "docker stats --no-stream llm-guard"   # CPU sustained > 90 % → capacity issue
ssh ops@vps "docker compose -f /srv/museum/docker-compose.prod.yml logs --tail=50 backend | grep llm_guard_semaphore_overflow"
curl -fsS https://api.musaium.com/api/health | jq '.llmGuardCircuitBreaker.failureCount'
```

### Bend
Either (a) restart to clear model thrashing, (b) scale to 2 replicas if memory budget allows, or (c) drop the lowest-priority OUTPUT scanner (Bias) — last resort, requires a follow-up ADR per [`OPS_INCIDENT_LLM_GUARD.md`](../OPS_INCIDENT_LLM_GUARD.md) § 3.3.

### Execute
```bash
# Scale to 2 replicas (8 GB VPS budget allows: 2×2 GB sidecar + 1 GB backend + 256 MB pg)
ssh ops@vps "docker compose -f /srv/museum/docker-compose.prod.yml up -d --scale llm-guard=2"
# Verify load distribution (Docker DNS round-robins via undici keep-alive)
ssh ops@vps "docker compose -f /srv/museum/docker-compose.prod.yml logs --tail=50 llm-guard | grep scan"
```

**Escalate to P1** if degradation persists > 10 min after scale-up — likely a downstream issue (Postgres slow, network) hiding behind the sidecar.

---

## S3 — Breaker stuck OPEN (sidecar healthy, breaker view stale)

**Class :** state-machine / view skew. **Severity start :** P1 (chat is broken).

### Recognize
- `/health` reports `llmGuardCircuitBreaker.state == "OPEN"` AND `failureCount` >= threshold.
- Sidecar `/health` from inside backend container returns `200 OK`.
- No new fail logs in backend for > `openDurationMs`.

### Orient
```bash
curl -fsS https://api.musaium.com/api/health | jq '.llmGuardCircuitBreaker'
ssh ops@vps "docker compose -f /srv/museum/docker-compose.prod.yml exec backend curl -fsS http://llm-guard:8081/health"
psql "$PROD_DB_URL" -c "SELECT created_at, metadata FROM audit_logs WHERE action='SECURITY_LLM_GUARD_BREAKER_OPEN' ORDER BY created_at DESC LIMIT 5;"
```

### Bend
Breaker is a **detective** layer, not a safety layer — every individual call still respects its own timeout. Manual reset is acceptable only when the view is provably stale (sidecar healthy, no failing requests in flight). The legitimate reset is via backend restart, NOT a manual breaker bypass (which is for surge / death-spiral, S2 § 3.5 of long-form).

### Execute
1. Restart the **backend** container (NOT the sidecar) :
   ```bash
   ssh ops@vps "docker compose -f /srv/museum/docker-compose.prod.yml restart backend"
   ```
2. Backend re-creates the breaker in CLOSED state on boot. Wait 30 s.
3. Smoke a benign prompt — expect HTTP 201.
4. If breaker re-trips within 60 s, root cause is NOT view skew — go back to S1 or S2.

**Postmortem mandatory.** A breaker stuck OPEN despite a healthy sidecar means either (a) Docker DNS returned stale records, (b) gauge-seeding bug from ADR-047 wiring (see [`OPS_INCIDENT_LLM_GUARD.md`](../OPS_INCIDENT_LLM_GUARD.md) § 7), or (c) clock skew between containers.

---

## S4 — False-positive surge

**Class :** safety / UX. **Severity start :** P2 (no safety breach, user trust hit).

### Recognize
- Alert `GuardrailBlockRateSpike` (block_rate > 5 % / 5 min) — warning.
- Support inbox spike of "Musaium censored me" tickets.
- Spike in `category=off_topic` or `category=religious` blocks in audit log.
- Bias alert `BiasLocalBlockRateDrift` for a specific locale (see [`alerts-llm-guard.yml`](../observability/alerts-llm-guard.yml)).

### Orient
```bash
# Block rate breakdown over the last hour
psql "$PROD_DB_URL" <<'SQL'
SELECT
  metadata->>'locale' AS locale,
  metadata->>'category' AS category,
  COUNT(*) AS blocks
FROM audit_logs
WHERE action IN ('AUDIT_GUARDRAIL_BLOCKED_INPUT','AUDIT_GUARDRAIL_BLOCKED_OUTPUT')
  AND created_at > now() - interval '1 hour'
GROUP BY 1, 2
ORDER BY blocks DESC LIMIT 20;
SQL

# Compare to baseline (prior 7 days same hour-of-day)
# → Grafana panel "Block rate per locale × category"

# Sample fingerprints from the spike to inspect content categories
psql "$PROD_DB_URL" -c "SELECT metadata->>'snippetRedacted', metadata->>'category' FROM audit_logs WHERE action='AUDIT_GUARDRAIL_BLOCKED_INPUT' AND created_at > now() - interval '15 minutes' ORDER BY created_at DESC LIMIT 20;"
```

### Bend
Two failure modes look identical aggregate-side : (a) **legitimate concentration** (museum exhibit on religious art opens, real spike) — do NOT lower threshold. (b) **false-positive inflation** (filter calibration off for a locale) — lower threshold or carve a category exception. Distinguish via the snippet sample above. The Meta-Arabic-moderation precedent in `compliance-research-bias-monitoring.md` § 1 is the canonical case study.

### Execute
1. If the spike is **concentrated in one locale** and snippet sample shows legitimate cultural commentary → file a `guardrail-policy.md` issue with category-level loosening proposal. Do NOT push a hot-fix. Pre-launch, the live/revert doctrine (`feedback_no_feature_flags_prelaunch`) means a config change ships as a full revert if wrong — handle via a normal PR with red-team regression.
2. If the spike is **across all locales** AND maps to a known attack pattern (e.g., prompt-injection wave) → no action ; the system is working.
3. If the spike is **attributable to a deploy** in the last 4 h → roll back the deploy via [`auto-rollback.md`](./auto-rollback.md).
4. Open a postmortem if user complaints > 5 or block-rate sustains > 5 % for > 30 min.

**Escalate to P1** if a press / social media signal appears (the "Musaium censors X speakers" risk).

---

## S5 — False-negative detected

**Class :** safety contract failure. **Severity start :** P1. **Postmortem MANDATORY regardless of duration.**

### Recognize
- User report of unsafe output that should have been blocked.
- Security researcher disclosure.
- Periodic red-team corpus regression (CI red-team job — see RP4 pentest scope in [`PENTEST_SCOPE.md`](../operations/PENTEST_SCOPE.md)).
- Audit log shows `decision=allow` for a prompt that matches a known unsafe pattern.

### Orient
```bash
# Pull the audit row for the offending message
psql "$PROD_DB_URL" -c "SELECT created_at, action, metadata FROM audit_logs WHERE metadata->>'messageId' = '<message-uuid>';"

# Pull the full pipeline trace from Langfuse (Phase 1+)
# https://langfuse.musaium.app/traces?messageId=<uuid>

# Confirm which provider returned allow (keyword? llm-guard? llm-judge?)
# Look for `layer=keyword,decision=allow` AND `layer=llm_guard,decision=allow`
```

### Bend
A false negative is the most dangerous failure mode of a guardrail system — it is silent. The fix is **never** a quick threshold tweak ; it is a regression test added to the red-team corpus plus a policy adjustment. Per design.md § 7 audit trail, the offending prompt fingerprint goes into the corpus; the raw prompt does NOT (PII).

### Execute
1. **Containment first** : if the unsafe output is still served (cached response, voice TTS audio in S3), purge it via `museum-backend` admin tools and rotate the audio URL.
2. Add the offending pattern to the red-team corpus (`museum-backend/tests/red-team/guardrail-corpus.json` — Phase 1 artifact). Use the fingerprint, not the raw prompt.
3. File a postmortem within 48 h ([`POSTMORTEM_TEMPLATE.md`](../operations/POSTMORTEM_TEMPLATE.md)).
4. Run the full red-team corpus against the proposed policy fix in CI before merging.
5. If the false negative had user-visible impact AND the user is identified, send a written notification (alignment with GDPR Art. 22 best practice — see `GDPR_ART22_SCOPE.md` if/when extracted).

**Escalate to P0** if : (a) PII was leaked in the unsafe output, (b) the false negative affects > 10 users, or (c) the unsafe content is illegal under Art. 5 AI Act prohibitions.

---

## S6 — Policy mis-published (Phase 2 trigger)

**Class :** configuration / deployment. **Severity start :** P1. **Becomes relevant when D11 per-tenant policy DB schema lands** ([design.md § D11](../../.claude/skills/team/team-state/2026-05-12-llm-guard-perennial-10y-design/design.md)).

### Recognize
- A new `guardrail_policies` version was activated AND block-rate or false-positive metric shifts > 20 % from baseline within 5 min.
- Steward / Security review missed (CODEOWNERS bypassed).
- Customer-specific complaints concentrated on tenants with the new policy.

### Orient
```bash
# Check what policy version is currently active per tenant
psql "$PROD_DB_URL" -c "SELECT tenant_id, policy_id, version, activated_at FROM tenant_active_policies ORDER BY activated_at DESC LIMIT 20;"

# Diff vs prior version
psql "$PROD_DB_URL" -c "SELECT version, body FROM guardrail_policies WHERE id = '<policy-id>' ORDER BY version DESC LIMIT 2;"
```

### Bend
Per-tenant rollback is the path. The schema is designed for it ([design.md § D11](../../.claude/skills/team/team-state/2026-05-12-llm-guard-perennial-10y-design/design.md)). Avoid a global revert that affects healthy tenants. The canary → ramp protocol ([design.md § 10.1](../../.claude/skills/team/team-state/2026-05-12-llm-guard-perennial-10y-design/design.md)) is meant to catch this earlier ; if you are here, it failed and that fact goes into the postmortem.

### Execute
1. For each affected tenant, re-activate prior version :
   ```sql
   UPDATE tenant_active_policies
   SET policy_id = (SELECT id FROM guardrail_policies WHERE tenant_id = $1 AND version = $prior_version),
       activated_at = now()
   WHERE tenant_id = $1;
   ```
2. Audit-log the rollback (`AUDIT_POLICY_ROLLBACK` with metadata `{ tenant, fromVersion, toVersion, reason }`).
3. Notify the affected tenants (B2B contracts require this — see RP2 review gates).
4. Reproduce the regression in shadow mode against the offending corpus BEFORE re-promoting.

**Postmortem mandatory** with steward sign-off — this is the RP3 trigger.

---

## S7 — Supply-chain compromise (LLM Guard upstream hijack)

**Class :** security incident. **Severity start :** P0. **Triggers GDPR Art. 33 breach assessment**.

### Recognize
- Renovate / dependabot alert on `llm-guard` image with security advisory.
- GHCR / Docker Hub notification of a tag re-publication for a previously-pinned digest.
- Sidecar starts emitting unexpected outbound traffic (egress alert).
- Image digest of the running sidecar does not match the digest pinned in `docker-compose.prod.yml`.

### Orient
```bash
# Verify the running digest vs the pinned one
ssh ops@vps "docker inspect llm-guard --format '{{.Image}}'"
grep "image:.*llm-guard" /Users/Tim/Desktop/all/dev/Pro/InnovMind/infra/docker-compose.prod.yml

# Check egress traffic from the sidecar (should be NONE — sidecar is local-only)
ssh ops@vps "docker exec llm-guard ss -tn"

# Pull the original publisher's advisory page
# https://github.com/protectai/llm-guard/security/advisories
```

### Bend
Per [design.md § 11.4](../../.claude/skills/team/team-state/2026-05-12-llm-guard-perennial-10y-design/design.md) (disaster recovery — supply chain) : the policy switches active provider to LLM judge + keyword only. Sidecar image is pinned by digest, not by tag — rollback = pin previous digest. Recovery is validated quarterly via chaos drill (RO3).

### Execute
1. Take the sidecar offline immediately :
   ```bash
   ssh ops@vps "docker compose -f /srv/museum/docker-compose.prod.yml stop llm-guard"
   ```
   Fail-CLOSED kicks in — chat returns `service_unavailable`. This is the SAFE state.
2. Pin to the **previous** known-good digest in `docker-compose.prod.yml` :
   ```yaml
   image: ghcr.io/protectai/llm-guard@sha256:<previous-known-good-digest>
   ```
3. Restart with the pinned digest.
4. Run the red-team corpus to confirm safety contract holds with the rollback image.
5. **GDPR Art. 33 breach pipeline** : if compromise window > 5 min OR there is any evidence of data exfiltration, follow [`BREACH_PLAYBOOK.md`](../incidents/BREACH_PLAYBOOK.md) — CNIL deadline is 72 h.
6. Until upstream publishes a clean image + post-hijack incident report :
   - Disable the LLM Guard provider in the policy (it is no longer a trusted layer).
   - Run on keyword + LLM Judge only.
   - Document the downgrade in `docs/incidents/<YYYY-MM-DD>-supply-chain-llm-guard/`.

**Escalate to P0 + Security on-call + Founder.** This is the ADR-047 R-A7 risk materializing.

---

## See also

- [`docs/OPS_INCIDENT_LLM_GUARD.md`](../OPS_INCIDENT_LLM_GUARD.md) — long-form S1 surgical playbook.
- [`docs/observability/alerts-llm-guard.yml`](../observability/alerts-llm-guard.yml) — Prometheus alert rules referenced above.
- [`docs/operations/POSTMORTEM_TEMPLATE.md`](../operations/POSTMORTEM_TEMPLATE.md) — when and how to write a postmortem.
- [`docs/operations/CAPACITY_PLAN_100K.md`](../operations/CAPACITY_PLAN_100K.md) — capacity headroom assumptions.
- [`docs/operations/PENTEST_SCOPE.md`](../operations/PENTEST_SCOPE.md) — annual pentest scope template.
- [`docs/incidents/BREACH_PLAYBOOK.md`](../incidents/BREACH_PLAYBOOK.md) — GDPR Art. 33/34 mechanics.
- [`docs/compliance/AI_ACT_CONFORMITY_MATRIX.md`](../compliance/AI_ACT_CONFORMITY_MATRIX.md) — regulatory mapping per scenario.
