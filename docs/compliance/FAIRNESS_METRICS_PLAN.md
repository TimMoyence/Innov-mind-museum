# Fairness Metrics Plan — Guardrail Bias Monitoring

> **Mandate :** AI Act Art. 10 §2(f) bias examination — enforceable 2026-08-02 (limited-risk transparency horizon ; high-risk Annex III deferred to 2027-12 per Omnibus 2026-05-07 provisional accord).
> **Phasing :** consistent with [design.md §13](../../.claude/skills/team/team-state/2026-05-12-llm-guard-perennial-10y-design/design.md) (RC4) and [`compliance-research-bias-monitoring.md`](../../.claude/skills/team/team-state/2026-05-12-llm-guard-perennial-10y-design/compliance-research-bias-monitoring.md).
> **Last reviewed :** 2026-05-12.

The core question this plan addresses : **does the guardrail system disproportionately block content from any of Musaium's 8 locales (ar, de, en, es, fr, it, ja, zh) ?** The Meta-Arabic-moderation precedent (research §1) shows aggregate metrics conceal locale asymmetry. We instrument **per-locale** from day 1.

---

## 1. Phasing roadmap

### Phase 1.A — Per-locale counters (pre-launch, zero ML)

**Goal :** have data when needed, not after the first incident.

Counter set added to `museum-backend/src/shared/observability/prometheus-metrics.ts` :

| Metric | Type | Labels | Cardinality | Purpose |
|---|---|---|---|---|
| `musaium_guardrail_decisions_total` | Counter | `locale` (8), `layer` (3), `decision` (2) | **48** | Source of truth for block-rate computations |
| `musaium_guardrail_category_blocks_total` | Counter | `locale` (8), `category` (7) | **56** | Root-cause analysis ("AR spike in `religious`") |

**Categories** (stable taxonomy) : `nudity_art`, `religious`, `political_history`, `offensive_language`, `off_topic`, `injection`, `unknown`.

**Total active series : 104** — below 200-series Phase 1 budget (per design.md §10 observability budget).

Wiring point : single call site in `chat.service.ts` at the guardrail decision boundary. The audit log already carries `metadata.locale` (per `compliance-research-bias-monitoring.md` §6), so no schema migration needed.

Phase 1.A delivery is **~80 LOC** : counter declarations + 1 wire-up + 1 Grafana panel "Block rate per locale".

### Phase 1.B — Threshold alerts (day 1 post-launch)

Prometheus alert rules in [`docs/observability/alerts-llm-guard.yml`](../observability/alerts-llm-guard.yml) group `bias-monitoring` :

- **Recording rule** `musaium:guardrail_block_rate_per_locale:1h` — block rate per locale, 1 h rolling window.
- **Recording rule** `musaium:guardrail_block_rate_avg_locales:1h` — equal-weighted average across locales. **Methodological note :** this is the correct baseline ; the global rate (`global_blocks / global_requests`) is inflated by any single-locale anomaly and silently masks the alert (research §4 trap).
- **Alert** `BiasLocalBlockRateDrift` — 2× the per-locale average, 24 h sustained → warning.
- **Alert** `BiasLocalBlockRateDriftCritical` — 3× the per-locale average, 24 h sustained → critical, postmortem mandatory.
- **Alert** `BiasLocaleDominance` — any single locale accounts for > 50 % of all blocks for 1 h → warning.

Calibration : the 2×/3× multipliers are conservative pre-data starting points. After 30 days of production data, replace `avg(per-locale)` with locale-specific historical baselines stored in Postgres.

### Phase 2 — Statistical drift detection (post B2B onset)

Nightly cron Python job (< 60 LOC) :
1. Pull 7-day rolling `(locale, decision)` counts from Postgres audit log read replica.
2. Compare to a frozen 30-day post-launch baseline.
3. Chi-squared test per locale (p < 0.01 → flag).
4. KS test on the daily block-rate time series as secondary signal.
5. Emit `musaium_guardrail_block_rate_drift_score{locale, window}` gauge via Prometheus Pushgateway.

Plus : surface aggregated drift in the Langfuse self-hosted dashboard (LangChain callback adds `locale` + `category` to trace metadata).

### Phase 3 — ML-based drift + monthly bias report (SOC2 prep)

Reserved for B2B GA + SOC2 Type II horizon (~18-36 months post-launch).
- Alibi Detect MMD sidecar (mirrors LLM Guard sidecar pattern in ADR-047) for embedding-level semantic drift.
- Aequitas monthly batch report (DSSG, Apache 2.0) exports Postgres audit aggregates to pandas DataFrame → FPR Parity + Equal Opportunity metrics per locale → HTML report.
- Evidently AI HTML → wkhtmltopdf → S3 archive for monthly B2B-customer-facing bias report.

---

## 2. Metric list (consolidated)

Per research §2 — total Phase 1 budget 104 series, expandable to 120 with drift score in Phase 2.

```
musaium_guardrail_decisions_total{locale, layer, decision}
musaium_guardrail_category_blocks_total{locale, category}
musaium_guardrail_false_positive_rate{locale}                  # Phase 2 — populated via feedback loop
musaium_guardrail_block_rate_drift_score{locale, window}       # Phase 2
```

Plus the two recording rules derived from these in [`docs/observability/alerts-llm-guard.yml`](../observability/alerts-llm-guard.yml).

---

## 3. Baseline methodology (the trap)

**Use** : `avg(block_rate_per_locale)` — arithmetic mean across the 8 locales, equal-weighted.
**Do NOT use** : `global_blocks / global_requests` — inflated by single-locale anomalies, silently raises the alert threshold for the locale that is actually the problem.

This is documented in [`compliance-research-bias-monitoring.md` §4](../../.claude/skills/team/team-state/2026-05-12-llm-guard-perennial-10y-design/compliance-research-bias-monitoring.md). The Meta-Arabic-moderation case study is the canonical worked example of why this matters.

---

## 4. Audit trail integration

Per research §6, no schema migration needed. The existing `AuditLogEntry.metadata` accepts arbitrary keys. Wire at the guardrail decision point in `chat.service.ts` :

```typescript
await auditService.log({
  action: AUDIT_GUARDRAIL_BLOCKED_INPUT,
  actorType: 'user',
  actorId: userId ?? null,
  metadata: {
    locale,            // 'ar' | 'de' | 'en' | 'es' | 'fr' | 'it' | 'ja' | 'zh'
    layer: 'keyword',  // 'keyword' | 'llm_guard' | 'llm_judge'
    category: 'religious',
    fingerprint: sha256(sanitizedInput).slice(0, 16),
  },
});
```

**GDPR compliance** : the `fingerprint` is a truncated SHA-256 of the **sanitized** input. It is not personal data (not reversible). The `locale` field is not PII. This satisfies AI Act Art. 10 §5 special-category-data processing for bias correction (legal basis is the bias-monitoring necessity).

Nightly aggregation (SQL group-by on `metadata->>'locale', metadata->>'category', action`) produces the bias report with zero new infrastructure.

---

## 5. AI Act Art. 10 compliance mapping

| Clause | Coverage |
|---|---|
| **§2(f)** — Bias examination | Phase 1.A counters + Phase 1.B alerts produce the evidence record. |
| **§2(g)** — Bias mitigation | Phase 2 drift detection + Phase 3 monthly report demonstrate ongoing effort. Findings feed RMS doc. |
| **§4** — Contextual characteristics | Per-locale instrumentation is the direct mandate. |
| **§5** — Special-category data processing | Fingerprint-only pattern (sanitized input → truncated SHA-256) satisfies "strictly necessary for bias detection". |

Enforcement deadline for Art. 10 against high-risk systems is 2026-08-02 (per research). Musaium B2C remains limited-risk for now ; Art. 10 becomes binding if a B2B contract escalates classification (Annex III §3 educational evaluation scenario).

---

## See also

- [`docs/observability/alerts-llm-guard.yml`](../observability/alerts-llm-guard.yml) — group `bias-monitoring` (recording rules + alerts).
- [`docs/compliance/AI_ACT_CONFORMITY_MATRIX.md`](./AI_ACT_CONFORMITY_MATRIX.md) — Art. 10 row.
- [`docs/RUNBOOKS/guardrail-incidents.md`](../RUNBOOKS/guardrail-incidents.md) — scenario S4 (false-positive surge), the operational arm of bias alerts.
- Research : [`compliance-research-bias-monitoring.md`](../../.claude/skills/team/team-state/2026-05-12-llm-guard-perennial-10y-design/compliance-research-bias-monitoring.md).
