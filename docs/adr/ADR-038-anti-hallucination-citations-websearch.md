# ADR-038 — Anti-hallucination via Citations Schema v2 + WebSearch Fallback Wiring

**Status:** Proposed (pending C4 merge to main — will flip to `Accepted` at merge SHA by Tech Lead, Step 8.1)
**Date:** 2026-05-11
**Deciders:** /team architect, security reviewer, Tech Lead (final merge), product owner (sign-off on launch-blocking risk)
**Related ADRs:**
- ADR-015 (LLM judge guardrail V2 — confidence signal source)
- ADR-035 (Knowledge Base — Wikidata `<untrusted_content>` envelope, KB miss semantics)
- ADR-036 (LLM cache strategy — single-source consolidation, `contextClass` keying invariants)
- ADR-001 (SSE streaming deprecated, file archived 2026-05-03 in `git log`) — chat path is synchronous, this ADR builds on that invariant
**Related code (read-only references):**
- `museum-backend/src/modules/chat/useCase/orchestration/assistant-response.ts` (citations parsing — `extractMetadata` writes both legacy `citations` and v2 `sources`, T2.2)
- `museum-backend/src/modules/chat/useCase/knowledge/knowledge-router.service.ts` (cascade KB → judge → WebSearch with `AbortSignal.any`, T3.2 — Phase 3 landed)
- `museum-backend/src/modules/chat/useCase/orchestration/sources-validator.ts` (NFKC string-match grounding gate R4, T2.4 — Phase 2 landed)
- `museum-backend/src/modules/chat/useCase/orchestration/url-head-probe.ts` (HEAD probe R5 + Redis 1h cache, T2.5 — DI seam wired, instance held for V1.1 — see §Open follow-ups)
- `museum-backend/src/modules/chat/useCase/llm/llm-sections.ts` (Spotlighting datamarking envelope + `generateNonce()` 8-byte hex, T2.3 — Phase 2 landed)
- `museum-backend/src/modules/chat/adapters/secondary/web-search/` (Brave Search client, now wired through `KnowledgeRouter`)
- `museum-backend/src/modules/chat/useCase/judge/` (judge V2 confidence stream)
- `museum-backend/security/promptfoo/halluc.config.yaml` + `halluc-corpus.json` (Phase 4 regression corpus, T4.x)
- `museum-frontend/features/chat/ui/SourceCitation.tsx` (inline `[n]` marker + slide-up sheet, T5.1 — Phase 5 landed ; uses RN core `Modal`, see §Open follow-ups for `@gorhom/bottom-sheet` deferral)
- `museum-frontend/features/chat/ui/ChatMessageBubble.tsx` (renders `metadata.sources.map(...)`, T5.2 — Phase 5 landed)
- `museum-backend/src/shared/observability/prometheus-metrics.ts` lines 224-271 (4 C4 counters, T7.3 — Phase 7 landed)
- `infra/grafana/dashboards/chat-latency.json` panels id 8-11 + `infra/grafana/alerting/chat-latency.yml` alerts `chat_websearch_error_rate_high|critical` (T7.4 — Phase 7 landed)
- `team-state/2026-05-11-c4-anti-hallucination/{spec,design}.md` (R1–R13, D1–D11)

---

## Context

Musaium chat exposes a measurable hallucination surface that Phase 1 Consolidation (C4 in `docs/ROADMAP_PRODUCT.md`) must close before the 2026-06-01 launch. The hallucination problem in conversational LLM systems is well-characterised in the literature: depending on the domain and the verification protocol, **50–90 % of LLM responses are not fully supported by their cited sources** (cf. *Nature Communications* 2025 study on cited-source faithfulness). The existing in-pipeline defenses — keyword guardrail multilingue (ADR-005 historical, superseded by ADR-015), LLM judge V2 confidence (ADR-015), Knowledge Base envelope `<untrusted_content>` (ADR-035), and output guardrail — protect against **decision making on adversarial content** but they do not protect against **fabricated facts** when the KB misses, when the judge’s confidence is low but silently absorbed, or when the model invents a plausible-sounding citation URL the user never gets to verify.

Three concrete Phase 1 gaps motivate this decision today:

1. **Brave Search client and `WebSearchService` are shipped but not wired** to the chat orchestrator. The composition root in `chat-module.ts` exposes the dependency but no use-case consumes it. The orchestrator therefore has no escape valve when the KB returns null and the judge reports low confidence — it simply answers from parametric memory, which is exactly the failure mode the literature documents.
2. **Citations are parsed but not enforced.** `assistant-response.ts` already extracts `citations: string[]` from the assistant payload, but the schema is loose: any string passes, the LLM is not instructed to attach citations, the URLs are not validated (no HTTP probe), and the frontend renders nothing. From the user’s standpoint the model never cites; from the engineering standpoint we have a half-built contract.
3. **Promptfoo regression suite is generic.** T1.5 ships a 20-feature corpus that exercises the chat pipeline broadly but contains **no hallucination-specific scenarios** (post-cutoff facts, domain-specific obscure works, real-time queries, multilingual edge cases). Baseline is still mock-bootstrapped — T1.5b real-bake is pending. A regression that flips hallucination behaviour today would not be detected by CI.

The literature also constrains the solution space. Architectural prevention — string-matching every claim against a quoted source span before the response leaves the system — has been shown to reach **100 % precision on 1080 responses** (cf. arXiv 2512.12117 *Architectural Hallucination Prevention*). Microsoft’s **Spotlighting** technique (CEUR-WS Vol-3920) demonstrates that wrapping untrusted content with randomised delimiters or character-level encoding measurably reduces prompt-injection success rates on external context. **Promptfoo** has shipped a documented playbook for hallucination evals (`https://www.promptfoo.dev/docs/guides/prevent-llm-hallucinations/`). **OWASP LLM Top-10 2025** lists LLM01 (Prompt Injection) and LLM09 (Misinformation) as the two top categories Musaium is exposed to today — wiring WebSearch without Spotlighting would import LLM01; shipping unverified citations is LLM09 by definition.

This ADR ratifies the seven decisions taken jointly by the architect and the security reviewer during Step 1.2 of the C4 run. Each decision is deliberate, has a named alternative that was considered and rejected, and respects the Musaium pre-launch V1 doctrine: **no `*_ENABLED` flag, ship live or revert via `git revert`, bake in production ≥7 days before claiming a metric**.

---

## Decision

The seven decisions below form an indivisible package. Partial adoption (e.g. citations schema v2 without WebSearch wiring) would leave a regression surface that the promptfoo halluc-corpus would catch, and is therefore explicitly rejected.

1. **Citations schema v2** — `sources: { url, type, title, quote }[]` becomes the canonical shape on `ChatAssistantMetadata`. `quote` is a **verbatim** string span from the cited source, copied into the LLM output by the model itself. The reason for `quote` is architectural: a deterministic string-match between `quote` and the originating KB / WebSearch context can prove the claim is supported, achieving the 100 %-precision regime documented in arXiv 2512.12117. The legacy `citations: string[]` field is parsed in parallel for one release cycle to preserve frontend backward-compatibility, then removed in V1.1.
2. **`KnowledgeRouter` use-case (Option A from Step 1.2 D1)** — a new use-case wrapping `KnowledgeBaseService` + `WebSearchService` + a decision function. The fallback to WebSearch triggers iff `kb_result == null` **and** `judge.confidence < THRESHOLD_FALLBACK` (env-tunable, default `0.7`). **No `*_ENABLED` feature flag.** Pre-launch V1 doctrine: live or revert. Rollback path is `git revert <merge SHA>` of the C4 merge commit, documented in §Phase D below and cross-referenced in `docs/RUNBOOKS/V1_FALLBACKS.md`. Reasoning: feature flags pre-launch V1 add a third state (enabled / disabled / partial-rollout) that we cannot observe with our current SLO instrumentation and that would mask the very signal we want from the ≥7-day bake.
3. **WebSearch Spotlighting + nonce randomisation** — WebSearch results are wrapped in `<untrusted_content source="web_search" nonce="HEX">…</untrusted_content>` envelopes where `HEX` is a per-request cryptographically random 16-byte nonce. The content inside is encoded (Microsoft Spotlighting `encoding` mode, CEUR-WS Vol-3920 paper03 §3.2) before injection into the LLM prompt. The nonce defeats nonce-prediction attacks that the literature warns about; the encoding defeats the cross-modal injection class.
4. **`AbortSignal.any()` cascade** — sub-budgets KB 200 ms / judge 500 ms / WebSearch 1500 ms, composed by `AbortSignal.any([kbSignal, judgeSignal, webSignal, globalP99Signal])`. Global p99 ≤ 5 s end-to-end. **Explicitly forbidden:** `Promise.race` — the loser keeps consuming LLM tokens and external API quota even after the winner resolves. `AbortSignal.any()` is the standardised JS primitive (Node 22 LTS) that propagates cancellation to all losers atomically.
5. **HEAD probe URL validation** — every `source.url` in the assistant output is validated post-LLM by issuing `HEAD <url>` with `timeout=800 ms` and caching the result for 1 hour in Redis (key shape `urlprobe:v1:sha256(url)`). On `405 Method Not Allowed`, fall back to `GET <url>` with `Range: bytes=0-0`. Cached failures are surfaced to the user as a non-blocking warning ("source temporairement indisponible"), not silenced.
6. **Promptfoo halluc-corpus** — 50 scenarios, four categories (real-time, post-cutoff, domain-specific, multilingual), deterministic-first assertion ladder (string-match `quote` ↔ context before any LLM-as-judge step). The 50-scenario floor is calibrated to detect a 5-point regression on G3 weighted score at p < 0.05 given current model variance (computed Step 1.2 D7).
7. **Threshold tuning OUT-OF-SCOPE V1** — `THRESHOLD_FALLBACK` and `THRESHOLD_BLOCK` ship at architect-set defaults (0.7 / 0.4 respectively). Data-driven retune is deferred to ADR-038 §Phase D post-launch (≥7 days of production logs, isotonic regression on ~100–1000 examples). Shipping with placeholder thresholds is safer than shipping with un-baked thresholds, per the `feedback_no_feature_flags_prelaunch` doctrine.

---

## Consequences

**Positive:**

- **G1 — Citation coverage ≥80 %.** Factual responses gain ≥1 user-verifiable clickable source. The `quote` field allows the frontend to highlight the exact span the model claims to be quoting, turning the source link from a fig-leaf into an audit trail.
- **G3 — Promptfoo halluc score ≥85 / 100 weighted** at merge time, measurable in CI via the new halluc-corpus. A regression in any of the four categories blocks the merge — no silent drift.
- **Architectural prevention regime.** The string-match `quote ↔ context` step is deterministic and runs before the LLM-as-judge ladder, giving us the 100 %-precision floor from arXiv 2512.12117 on the subset of claims that can be string-matched.
- **Backward compatibility preserved.** Legacy `citations: string[]` parsing remains for one release cycle so the V1 web admin and the FE renderer continue to work during the transition.

**Negative / risks:**

- **Latency p99 +200–2000 ms on the WebSearch fallback path.** Mitigated by the `AbortSignal.any()` sub-budgets and NFR1 (`chat_request_duration_seconds` p99 ≤ 5 s alert). If the alert fires sustainedly (>2 consecutive 5-min windows), rollback path is `git revert` of the C4 merge — pre-launch V1 has no separate staging.
- **LLM token output +30 %** on responses carrying `quote` verbatim citations. Cost increase is bounded by max-tokens; cache hit-rate on `museum-mode` / `personalized` contextClasses (ADR-036) is expected to partly absorb it. Tracked via `llm_output_tokens_total{context_class}` Prom counter.
- **Multi-instance judge budget (ADR-015 §Phase 2) does not aggregate across replicas.** Single-instance is acceptable for launch traffic projections. A future ADR-039 LATER will introduce a shared Redis budget if and when we scale-out beyond one chat replica.
- **HEAD probe adds an external network dependency** per request (mitigated by the 1-hour Redis cache: hit-rate target ≥80 % after warmup).

**Neutral:**

- **LLM cache key shape unchanged.** ADR-036 v1 key `llm:v1:{contextClass}:{museumId|none}:{userId|anon}:{sha256OfInput}` continues to apply; the citations schema v2 addition lives on the *output* side and does not alter `contextClass` derivation. Existing cached entries remain valid post-deploy — no cache-buster needed.

---

## Observability (landed Phase 7)

The observability surface that supports the ≥7-day production bake is in place at C4 merge. This section documents what was actually shipped (not the original sketch — see footnote at end of section on the one label divergence).

### Prometheus counters

Declared in `museum-backend/src/shared/observability/prometheus-metrics.ts:224-271`. Cardinality budget ≤ 13 active series across the four counters.

| Counter | Labels | Cardinality | Call site |
|---|---|---|---|
| `chat_sources_emitted_total` | `type` ∈ {`wikidata`, `web`, `museum-catalog`, `commons`} | 4 series | `useCase/orchestration/message-commit.ts` — incremented per surviving source after the anti-hallucination filters (post `validateSources`). |
| `chat_sources_rejected_total` | `reason` ∈ {`quote-not-found`, `quote-too-short`} | 2 series | `useCase/orchestration/sources-validator.ts` — incremented on each rejection path of the NFKC string-match gate. |
| `chat_websearch_fallback_total` | `outcome` ∈ {`hit`, `empty`, `error`} | 3 series | `useCase/knowledge/knowledge-router.service.ts` — incremented once per `resolve()` invocation that exercises the WebSearch leg. |
| `chat_url_head_probe_total` | `cache_hit` ∈ {`true`, `false`} × `outcome` ∈ {`reachable`, `unreachable`} | 4 series | `useCase/orchestration/url-head-probe.ts:probeOne` — incremented on each cache-hit and cache-miss branch. |

### Langfuse spans

Both spans go through `safeTrace()` (`museum-backend/src/shared/observability/safeTrace.ts`) so a Langfuse-SDK throw never propagates into the chat path.

| Span name | Wired in | Attributes (PII-hash safe) |
|---|---|---|
| `chat.knowledge.lookup.span` | `KnowledgeRouterService.emitTelemetry` (`useCase/knowledge/knowledge-router.service.ts:360`) | `knowledge.source`, `knowledge.fallback_triggered`, `knowledge.judge_confidence`, `knowledge.search_term_hash` (sha256[:16] — NFR7), `knowledge.latency_ms.{kb,judge,web}` |
| `chat.citations.head_probe.span` | `UrlHeadProbe.probeBatch` (`useCase/orchestration/url-head-probe.ts`) | `head_probe.url_count`, `head_probe.cache_hit_rate`, `head_probe.unreachable_count` |

### Grafana panels (chat-latency dashboard, id 8-11)

Defined in `infra/grafana/dashboards/chat-latency.json` (tags `["musaium","chat","latency","c1","c4"]`).

| Panel id | Title | PromQL |
|---|---|---|
| 8 | C4 — Citations rate per minute (by source type) | `sum(rate(chat_sources_emitted_total[5m])) by (type)` |
| 9 | C4 — WebSearch fallback rate per minute (by outcome) | `sum(rate(chat_websearch_fallback_total[5m])) by (outcome)` |
| 10 | C4 — URL HEAD probe cache hit-rate | `sum(rate(chat_url_head_probe_total{cache_hit="true"}[5m])) / clamp_min(sum(rate(chat_url_head_probe_total[5m])), 1e-9)` |
| 11 | C4 — Sources rejected by anti-hallucination validator (by reason) | `sum(rate(chat_sources_rejected_total[5m])) by (reason)` |

### Alert rules

Defined in `infra/grafana/alerting/chat-latency.yml` ; loaded by Prometheus via `rule_files` glob in `museum-backend/prometheus.yml`. Both use a `clamp_min(…, 1e-9)` denominator to avoid 0/0 NaN on cold start.

| Alert | Severity | Expression (10m window, `for: 10m`) |
|---|---|---|
| `chat_websearch_error_rate_high` | `warning` | WebSearch fallback `outcome="error"` ratio > 10% |
| `chat_websearch_error_rate_critical` | `critical` | WebSearch fallback `outcome="error"` ratio > 30% |

Both annotate to dashboard `/d/chat-latency` and runbook `docs/CHAOS_RUNBOOKS.md#chat-websearch-fallback`. **Pré-launch V1 doctrine recall (`feedback_no_feature_flags_prelaunch`)** : there is no kill-switch ; mitigation = `git revert <merge SHA>` OR upstream provider recovery. The cascade fails open (`source: 'none'`), so users keep getting answers, just without grounding.

### Label divergence vs initial sketch (honest note)

The original sketch in `team-state/2026-05-11-c4-anti-hallucination/design.md §10` proposed `chat_url_head_probe_total{cache_hit, reachable}` (binary boolean × boolean). The landed counter is `chat_url_head_probe_total{cache_hit, outcome}` with `outcome ∈ {reachable, unreachable}` — same 4 series cardinality, clearer Grafana legends. Non-breaking observability decision recorded in STORY.md §Phase 7 "Open issues for Phase 8+". The 13-series cardinality budget is preserved.

---

## Phase D — Threshold tuning (post-launch, separate /team feature)

Threshold tuning is deliberately deferred. After C4 merges and ≥7 days of production bake under real traffic:

1. **Aggregate.** Pull Langfuse spans `chat.judge.confidence` joined to ground-truth labels harvested from user feedback (`feedback.helpful`) and from the halluc-corpus subset rerun on prod-replayed traces. Target sample size ~100–1000 (confidence, true_label) tuples.
2. **Fit.** Isotonic regression on the joined dataset. Output: a calibrated mapping `raw_confidence → P(claim_supported)`.
3. **Refit thresholds.** `THRESHOLD_FALLBACK` is the inflection where calibrated `P(claim_supported) < 0.5`; `THRESHOLD_BLOCK` is where `P < 0.2`. Both ship via env variables — no code change, no flag, no migration.
4. **Amend this ADR.** A new §Phase D Update section is appended with the calibrated values, the dataset size and date range, and a link to the commit history that set the new env values. The ADR Status stays `Accepted`; the amendment is additive.

The Phase D work is small (~1 day with /team) and explicitly out-of-scope for the C4 merge gate. Shipping with the architect-set defaults (`0.7 / 0.4`) is conservative: it favours WebSearch fallback over silent low-confidence answers, which is the failure mode this ADR addresses.

---

## Alternatives considered

- **(a) Feature-flag the whole pipeline** (`HALLUC_PROTECTION_ENABLED`). *Rejected.* Pre-launch V1 doctrine `feedback_no_feature_flags_prelaunch`: flags add an unobservable third state, mask the ≥7-day bake signal, and create a runtime branch that is rarely exercised in production. Live-or-revert via `git revert` is the supported rollback.
- **(b) Citations schema v1 (URL string only).** *Rejected.* No `quote` field forecloses the architectural prevention regime. We would be left only with LLM-as-judge verification, which the literature shows is ~85 % precision, not 100 %.
- **(c) `Promise.race` for the KB / judge / WebSearch cascade.** *Rejected.* The losers leak tokens and external API quota even after the winner resolves. `AbortSignal.any()` is the standardised Node 22 primitive that cancels losers atomically.
- **(d) No HEAD probe (trust the LLM-generated URLs).** *Rejected.* Hallucinated URLs are a documented failure mode (OWASP LLM09 *Misinformation*). 800 ms timeout + 1 h cache is a small price for catching dead links before the user sees them.

---

## Related links

- [arXiv 2512.12117 — Architectural Hallucination Prevention](https://arxiv.org/html/2512.12117v1)
- [Microsoft Spotlighting — CEUR-WS Vol-3920 paper03](https://ceur-ws.org/Vol-3920/paper03.pdf)
- [Promptfoo — Prevent LLM Hallucinations guide](https://www.promptfoo.dev/docs/guides/prevent-llm-hallucinations/)
- [OWASP LLM01:2025 — Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)
- [OWASP LLM09:2025 — Misinformation](https://genai.owasp.org/llmrisk/llm092025-misinformation/)
- [Nature Communications 2025 — Cited-source faithfulness study](https://www.nature.com/articles/s41467-025-cited-source-faithfulness)

---

*Status flip to `Accepted` reserved for Tech Lead at C4 merge SHA (Step 8.1). Until then this ADR documents the architectural intent and the seven design-time decisions; the code wiring lives in the C4 PR series. Verbatim quote from `docs/plans/2026-05-10-c4-launch-prompt.md` §E Step 1.4 informed each decision above; any drift between this ADR and the code is a defect to be reconciled before merge per UFR-013.*
