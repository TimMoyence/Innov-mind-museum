# Prometheus Metric-Naming Consistency Audit (TD-PC-03)

> **Status:** AUDIT-ONLY. No metric is renamed by this document or its companion
> sentinel. Renames are deferred to a follow-up batch (see [§6](#6-follow-up-rename-plan-deferred))
> because every rename silently breaks the Grafana dashboards / alert rules that
> still query the old name — that migration needs a coordinated dashboard + alert
> PR, not a registry edit.
>
> - **Source of truth audited:** `museum-backend/src/shared/observability/prometheus-metrics.ts` (post-W1+W3 merge).
> - **Companion ratchet:** `scripts/sentinels/metric-naming.mjs` (`pnpm sentinel:metric-naming`).
> - **Reference:** `docs/HANDOFF-2026-05-19-debt-collision-report.md` §5 Batch C.
> - **Date:** 2026-05-20. **Registry size at audit:** 44 application metrics (excl. `prom-client` default `process_*` / `nodejs_*`).

---

## 1. Conventions assessed (Prometheus best-practices)

Per the official Prometheus naming guidelines:

| # | Rule | Severity if violated |
|---|------|----------------------|
| R1 | Metric name is lowercase `snake_case` (`^[a-z][a-z0-9_]*$`), no camelCase, no uppercase | HARD |
| R2 | Counters carry the `_total` suffix | HARD |
| R3 | Latency/duration histograms use the **base unit** `_seconds` (never `_ms`, `_millis`) | HARD |
| R4 | Application/subsystem prefix is **consistent** across the registry | CONSISTENCY |
| R5 | Avoid reserved suffixes (`_count`, `_sum`, `_bucket`) on standalone Gauges/Counters — they collide with histogram/summary internals | MINOR |
| R6 | Avoid encoding a rate/time window in the metric name (`_per_hour`) — expose a counter and derive with `rate()` | MINOR |

> **Note on identifiers vs. names.** The *TypeScript variable* identifiers in
> `prometheus-metrics.ts` are camelCase (`rerankLatencyMs`, `geoDetectMuseumTotal`)
> — that is correct TS style and **out of scope**. R1 applies only to the
> Prometheus `name:` string field, which is what Prometheus, Grafana and alert
> rules actually see.

---

## 2. Full registry inventory (46 metrics)

Legend: ✅ compliant · ⚠️ minor deviation (documented, grandfathered) · ❌ hard violation.

### 2.1 Bare-prefix metrics (31) — subsystem prefix, no `musaium_`

| Metric name | Type | R1 snake | R2/R3 suffix | Verdict |
|---|---|---|---|---|
| `http_requests_total` | Counter | ✅ | ✅ `_total` | ✅ |
| `http_request_duration_seconds` | Histogram | ✅ | ✅ `_seconds` | ✅ |
| `llm_cache_hits_total` | Counter | ✅ | ✅ `_total` | ✅ |
| `llm_cache_misses_total` | Counter | ✅ | ✅ `_total` | ✅ |
| `chat_phase_duration_seconds` | Histogram | ✅ | ✅ `_seconds` | ✅ |
| `chat_request_duration_seconds` | Histogram | ✅ | ✅ `_seconds` | ✅ |
| `chat_phase_errors_total` | Counter | ✅ | ✅ `_total` | ✅ |
| `chat_enrichment_source_calls_total` | Counter | ✅ | ✅ `_total` | ✅ |
| `chat_enrichment_source_latency_seconds` | Histogram | ✅ | ✅ `_seconds` | ✅ |
| `chat_sources_emitted_total` | Counter | ✅ | ✅ `_total` | ✅ |
| `chat_sources_rejected_total` | Counter | ✅ | ✅ `_total` | ✅ |
| `chat_websearch_fallback_total` | Counter | ✅ | ✅ `_total` | ✅ |
| `chat_url_head_probe_total` | Counter | ✅ | ✅ `_total` | ✅ |
| `compare_requests_total` | Counter | ✅ | ✅ `_total` | ✅ |
| `compare_duration_seconds` | Histogram | ✅ | ✅ `_seconds` | ✅ |
| `compare_fallback_total` | Counter | ✅ | ✅ `_total` | ✅ |
| `compare_cache_hits_total` | Counter | ✅ | ✅ `_total` | ✅ |
| `artwork_embeddings_count` | Gauge | ✅ | ⚠️ `_count` (R5) | ⚠️ |
| `wikidata_sparql_circuit_state` | Gauge | ✅ | ✅ `_state` enum gauge | ✅ |
| `wikidata_sparql_requests_total` | Counter | ✅ | ✅ `_total` | ✅ |
| `wikidata_sparql_request_duration_seconds` | Histogram | ✅ | ✅ `_seconds` | ✅ |
| `wikidata_cache_hits_total` | Counter | ✅ | ✅ `_total` | ✅ |
| `wikidata_cache_misses_total` | Counter | ✅ | ✅ `_total` | ✅ |
| `wikidata_local_dump_hits_total` | Counter | ✅ | ✅ `_total` | ✅ |
| `wikidata_local_dump_misses_total` | Counter | ✅ | ✅ `_total` | ✅ |
| `geo_detect_museum_total` *(W3)* | Counter | ✅ | ✅ `_total` | ✅ (see R4 §3) |
| `nominatim_requests_total` *(W3)* | Counter | ✅ | ✅ `_total` | ✅ (see R4 §3) |
| `nominatim_request_duration_seconds` *(W3)* | Histogram | ✅ | ✅ `_seconds` | ✅ (see R4 §3) |
| `guardrail_judge_degraded_total` *(I-FIX3)* | Counter | ✅ | ✅ `_total` | ✅ (F2 Option A — bare prefix) |
| `llm_cost_anon_bypass_total` *(I-FIX3)* | Counter | ✅ | ✅ `_total` | ✅ (F2 Option A — bare prefix) |
| `llm_cost_user_daily_usd` *(W6)* | Histogram | ✅ | ⚠️ `_usd` amount, not `_seconds` (R3 N/A — monetary, not a duration) | ✅ (F2 Option A — bare prefix; see F6) |

### 2.2 `musaium_`-prefixed metrics (16)

| Metric name | Type | R1 snake | R2/R3 suffix | Verdict |
|---|---|---|---|---|
| `musaium_llm_guard_circuit_breaker_state` | Gauge | ✅ | ✅ `_state` | ✅ |
| `musaium_llm_guard_circuit_breaker_trips_total` | Counter | ✅ | ✅ `_total` | ✅ |
| `musaium_llm_guard_circuit_breaker_skips_total` | Counter | ✅ | ✅ `_total` | ✅ |
| `musaium_llm_guard_scan_duration_seconds` | Histogram | ✅ | ✅ `_seconds` | ✅ |
| `musaium_llm_guard_chaos_injections_total` | Counter | ✅ | ✅ `_total` | ✅ |
| `musaium_guardrail_budget_redis_fallback_total` | Counter | ✅ | ✅ `_total` | ✅ |
| `musaium_llm_cost_circuit_breaker_state` | Gauge | ✅ | ✅ `_state` | ✅ |
| `musaium_llm_cost_circuit_breaker_trips_total` | Counter | ✅ | ✅ `_total` | ✅ |
| `musaium_llm_cost_eur_per_hour` *(W1)* | Gauge | ✅ | ⚠️ `_per_hour` (R6) + non-base unit | ⚠️ |
| `musaium_tenant_rate_limit_rejects_total` | Counter | ✅ | ✅ `_total` | ✅ |
| `musaium_guardrail_decisions_total` | Counter | ✅ | ✅ `_total` | ✅ |
| `musaium_guardrail_category_blocks_total` | Counter | ✅ | ✅ `_total` | ✅ |
| `musaium_guardrail_pii_redacted_total` | Counter | ✅ | ✅ `_total` | ✅ |
| `musaium_rerank_latency_ms` *(W1)* | Histogram | ✅ | ❌ `_ms` not base unit (R3) | ❌ |
| `musaium_rerank_fallback_total` *(W1)* | Counter | ✅ | ✅ `_total` | ✅ |
| `musaium_llm_prompt_cache_hits_total` | Counter | ✅ | ✅ `_total` | ✅ |

---

## 3. Findings

### F1 — `musaium_rerank_latency_ms` violates base-unit rule (R3) — **HARD, highest priority**

W1 (C9.13, 2026-05-18) added a duration histogram named in **milliseconds** with
ms buckets (`[10, 25, 50, 100, 250, 500, 1000, 2500, 5000]`). Prometheus mandates
the base unit **seconds** for all durations; every other duration histogram in the
registry already complies (`*_duration_seconds`, `*_latency_seconds`). This is the
only metric that is *objectively wrong* against a hard Prometheus rule, not just an
internal-consistency issue.

- **Proposed rename:** `musaium_rerank_latency_ms` → `rerank_duration_seconds`
  (drops `musaium_` per F3, switches to base unit). Buckets become
  `[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]`.
- **Dashboards/alerts that would break:** none found referencing `musaium_rerank_*`
  (grep of `infra/grafana/**` + `docs/observability/**` returns 0 hits — the metric
  is freshly scaffolded and not yet on a panel). **Lowest-risk rename in the set.**

### F2 — Split prefix discipline (R4) — **CONSISTENCY, headline issue**

The registry runs **two coexisting conventions**:

- **28 metrics** use a bare subsystem prefix (`http_`, `chat_`, `compare_`,
  `wikidata_`, `llm_cache_`, `geo_`, `nominatim_`, `artwork_`).
- **16 metrics** carry a global `musaium_` application prefix (all added in the
  W1 / scalability / guardrail-fairness / LLM-guard batches).

There is **no ADR** recording a decision to introduce `musaium_`; it was applied
ad-hoc per batch. The bare convention is both the **majority** (28 vs 16) and the
**Prometheus norm** (subsystem prefix; the application name is conventionally
reserved for libraries that ship metrics into a shared registry — not a single-app
backend). The W3 batch (`geo_*`, `nominatim_*`) already followed the bare
convention, *increasing* the inconsistency with the immediately-prior `musaium_`
batch.

- **Recommended target convention (Option A):** **drop `musaium_` everywhere**,
  keep subsystem prefixes. Less churn (16 renames vs 28), aligns with Prometheus
  norm, leaves the HTTP layer correctly bare.
- **Rejected alternative (Option B):** add `musaium_` to the 28 bare metrics. More
  churn, breaks far more dashboards, and over-namespaces a single-service registry.

### F3 — `artwork_embeddings_count` reserved suffix (R5) — **MINOR, grandfathered**

A standalone Gauge named `*_count` shares its suffix with the auto-generated
`_count` series of histograms/summaries. Harmless today (no histogram named
`artwork_embeddings`), but a latent collision. **Recommendation:** rename to
`artwork_embeddings` (the `gauge` type already conveys "current value"). Low
priority — referenced by `visual-compare.json` so it carries dashboard cost.

### F4 — `musaium_llm_cost_eur_per_hour` window-in-name (R6) — **MINOR, accept-with-note**

Encodes a 1h window in the name and uses the non-base unit `eur`. This is a
**deliberate** windowed Gauge sourced from `LlmCostCircuitBreaker.getState()`
(see source comment), not a counter we could `rate()`. Renaming would not improve
correctness and the `eur` "unit" has no Prometheus base form. **Documented as an
accepted deviation; no rename proposed.**

### F5 — snake_case / `_total` discipline (R1, R2) — **PASS**

All 44 metric names are valid lowercase `snake_case`; all 27 counters carry
`_total`; 8 of 9 duration histograms use `_seconds` (the 9th is F1). No camelCase,
no uppercase, no bare counters.

### F6 — `llm_cost_user_daily_usd` is a MONETARY histogram, not base-unit debt (R3 N/A) — **W6, accept-with-note**

WAVE 6 (C4, 2026-05-26) added a labelless histogram `llm_cost_user_daily_usd`
exposing the per-user daily LLM spend distribution (fed once per allowed call from
`LlmCostGuard.assertAllowed`, observing the new daily total returned by the Redis
counter `increment`). It uses a bare `llm_cost_` prefix (F2 Option A) and the
`_usd` suffix is its **base unit for a monetary amount**.

**This is NOT an R3 violation in the F1 sense.** R3 mandates `_seconds` for
*durations*; `llm_cost_user_daily_usd` is a USD amount, which has no `_seconds`
base form. It is grandfathered in both metric-naming sentinels
(`NON_SECONDS_HISTOGRAMS` in `museum-backend/scripts/sentinels/metric-naming.mjs`
and `GRANDFATHERED_HISTOGRAMS` in `scripts/sentinels/metric-naming.mjs`) as a
**legitimate non-duration histogram** — explicitly distinct from F1's
`musaium_rerank_latency_ms`, which IS genuine base-unit debt (a duration mis-united
in ms and expected to be renamed). A future audit must NOT "fix" `_usd` to
`_seconds`. **No rename proposed.**

> **Count note (pre-existing drift, hand-off):** the §2 header (`46 metrics`) and
> the line-12 / line-159 counters (`44`) already disagreed before W6 and were not
> recomputed here to avoid introducing a wrong number (UFR-013). The verified
> source-of-truth count is the sentinel `FROZEN`/`EXPECTED` inventory, now **45**
> pairs. Reconciling the prose counters is a separate doc-hygiene item (M5).

---

## 4. Dashboard / alert reference map (what a rename would break)

Built from grep over `infra/grafana/dashboards/*.json`, `infra/grafana/alerting/*.yml`,
`docs/observability/*`. A rename of any metric below requires editing **every** file
listed for it **in the same PR** (PromQL queries reference the literal name; Grafana
appends `_bucket` / `_count` / `_sum` suffixes for histograms).

| Metric (rename candidates) | Referenced in |
|---|---|
| `musaium_rerank_latency_ms` | *(none — safe to rename now)* |
| `artwork_embeddings_count` | `infra/grafana/dashboards/visual-compare.json` |
| `musaium_guardrail_decisions_total` | `guardrail-fairness.json`, `alerting/llm-cost.yml`*, `infra/grafana/alerting/llm-guard-bias.yml` |
| `musaium_guardrail_category_blocks_total` | `guardrail-fairness.json` |
| `musaium_guardrail_budget_redis_fallback_total` | `alerting/llm-cost.yml` |
| `musaium_llm_cost_circuit_breaker_state` | `alerting/llm-cost.yml` |
| `musaium_llm_guard_circuit_breaker_state` | `alerting/llm-cost.yml`, `infra/grafana/alerting/llm-guard-bias.yml` |
| `musaium_llm_guard_circuit_breaker_skips_total` | `alerting/llm-cost.yml`, `infra/grafana/alerting/llm-guard-bias.yml` |
| `musaium_llm_guard_scan_duration_seconds` | `infra/grafana/alerting/llm-guard-bias.yml` |
| `musaium_llm_cost_eur_per_hour` | *(not renamed — F4)* |
| `musaium_tenant_rate_limit_rejects_total` | *(none found)* |
| `musaium_llm_guard_circuit_breaker_trips_total` | *(none found)* |
| `musaium_llm_guard_chaos_injections_total` | *(none found)* |
| `musaium_guardrail_pii_redacted_total` | *(none found)* |
| `musaium_rerank_fallback_total` | *(none found)* |
| `musaium_llm_prompt_cache_hits_total` | *(none found — T2.3 scaffold)* |

> \* Several dashboard/alert files also reference metric names that are **not** in
> the registry (`musaium_guardrail_smoke_pass_rate`, `musaium_guardrail_cost_usd_total`,
> `musaium_llm_guard_scan_attempts_total`, `chat_websearch_error_rate_high`, …).
> Those are Prometheus **recording rules / alert names**, not registry metrics, and
> are out of scope for this audit. Flagged here only so the rename PR does not
> mistake them for missing registry entries.

---

## 5. Sentinel contract (`scripts/sentinels/metric-naming.mjs`)

The companion sentinel is a **ratchet**, not a rename. It parses
`prometheus-metrics.ts` and enforces:

1. **R1** — every `name:` is `^[a-z][a-z0-9_]*$`.
2. **R2** — every `new Counter` name ends in `_total`.
3. **R3** — every `new Histogram` name ends in `_seconds`, **except** the
   grandfathered `musaium_rerank_latency_ms` (F1, listed explicitly so it cannot
   be relied upon and shows up in the report as known debt).
4. **Inventory freeze** — the exact set of 44 names is pinned. Any addition,
   removal or rename fails the sentinel with an actionable message, forcing the
   eventual rename to be a **deliberate, reviewed** change that updates this
   sentinel + this audit + the dashboards together (this is what "asserts the
   rename plan" means — it makes silent drift impossible).
5. **Prefix ratchet** — the count of `musaium_`-prefixed metrics must not exceed
   the current 16, nudging new metrics toward the target bare convention (F2).

Run: `pnpm sentinel:metric-naming` (exit 0 = pass, 1 = regression).

The sentinel **passes against the current registry** (it locks the status quo);
it does not require any of §6 to be done first.

---

## 6. Follow-up rename plan (DEFERRED — not this batch)

Execute as a **single coordinated PR** that touches the registry, every dashboard/
alert in §4, AND this sentinel's frozen inventory together. Suggested ordering by
risk (lowest first):

| Step | Rename | Dashboards to update | Risk |
|---|---|---|---|
| 1 | `musaium_rerank_latency_ms` → `rerank_duration_seconds` (+ second buckets) | none | **low** |
| 2 | `artwork_embeddings_count` → `artwork_embeddings` | `visual-compare.json` | low |
| 3 | Drop `musaium_` from the 12 remaining prefixed metrics (F2 Option A) | `guardrail-fairness.json`, `alerting/llm-cost.yml`, `llm-guard-bias.yml` | **medium** |

Each step: rename the `name:` in `prometheus-metrics.ts` **and** every PromQL
reference in the same commit, bump the dashboard `schemaVersion`/keep the `uid`
immutable (see CLAUDE.md gotcha), then update the sentinel's frozen set + this
audit's `## 2` tables. `musaium_llm_cost_eur_per_hour` (F4) is **out of scope** of
the rename — it stays as documented accepted deviation.
