# Lessons — opossum (v9.0.0)

Audit 2026-05-18.

## 🚨 F1 HIGH : Zero `breaker.shutdown()` anywhere → Stryker/Jest leak
- `WikidataBreakerClient` has no dispose() method. Test file has no afterEach teardown.
- CONCRETE Stryker open-handle gotcha (CLAUDE.md § Stryker).
- **Fix TD-OP-01** : add dispose() + afterEach + wire to app shutdown signal.

## ⚠️ F2 MEDIUM : Missing AbortController + autoRenewAbortController
- 5s timeout rejects opossum promise BUT underlying SPARQL fetch keeps running → upstream resource leak.
- **Fix TD-OP-02** : add `abortController` opt + `autoRenewAbortController:true` + propagate signal to WikidataClient.lookupOrThrow.

## ⚠️ F3 MEDIUM : `group` option missing
- PATTERNS §3 recommends `group:'knowledge-base'` for metrics tagging.
- **Fix TD-OP-03** : add to constructor.

## ⚠️ F4 LOW : `errorFilter` not used (null-as-success inside WikidataClient)
- PATTERNS §3 recommends opossum-visible filter for clarity.

## ⚠️ F6 LOW : `coalesce:false` on idempotent SPARQL reads
- Opportunity to dedup burst on identical artworks.

## ⚠️ OBSERVATION : LLM/Langfuse/Guardrail DON'T use opossum
- LLM = `LLMCircuitBreaker` (bespoke). Cost = `LlmCostCircuitBreaker`. Guardrail = `GuardrailCircuitBreaker`. Langfuse = no breaker.
- If opossum adoption était goal architectural, ces 4 surfaces sont coverage gap. Decision pending.

## ✅ Positives
- volumeThreshold:5, fallback registered, all 7 events wired, prom-client bridge with outcome taxonomy, fire() vs call() correct, Node ≥22 v9 compatible.

---

## Refresh 2026-05-20 — status check

- **F1 (HIGH, OPEN)** : Cross-checked `WikidataBreakerClient` (`src/modules/chat/adapters/secondary/search/wikidata-breaker.ts`) on 2026-05-20 — **still no `dispose()` / `shutdown()` method**. `chat-module.ts:143` instantiates the breaker but lifecycle ends with process exit. Same risk profile as 2026-05-18 (Stryker leak + MaxListenersExceededWarning). TD-OP-01 remains open. Pre-V1 fix should add `dispose()` + wire to express shutdown handler + test `afterEach`.
- **F2 (MEDIUM, OPEN)** : `WikidataBreakerClient` constructor still missing `abortController` + `autoRenewAbortController:true`. The 5s timeout still rejects the opossum promise while the underlying SPARQL fetch keeps running (upstream resource leak under sustained timeouts). TD-OP-02 open.
- **F3 (MEDIUM, FIXED)** : `group: 'knowledge-base'` IS present (`wikidata-breaker.ts:93`). TD-OP-03 closed. PATTERNS.md updated accordingly.
- **F4 (LOW, OPEN)** : `errorFilter` still not used. Acceptable — `WikidataClient.lookupOrThrow` already filters via `WikidataTransientError`, so opossum sees only transient errors. Closing as WONTFIX is defensible ; flag for follow-up if the inner-client error taxonomy ever changes.
- **F6 (LOW, OPEN)** : `coalesce: false`. Idempotent SPARQL reads on the same QID hit Wikidata twice if fired in the same window. Low traffic at V1 ; consider for V2 burst-protection.
- **OBSERVATION (still pending decision)** : `LLMCircuitBreaker` / `LlmCostCircuitBreaker` / `GuardrailCircuitBreaker` remain bespoke (not opossum). Re-confirmed at `src/modules/chat/adapters/secondary/llm/{llm-circuit-breaker.ts,llm-cost-circuit-breaker.ts}` + `src/modules/chat/adapters/secondary/guardrails/guardrail-circuit-breaker.ts`. Two state-machine implementations live in the same module. Strategic decision (opossum-everywhere vs archive-opossum-strategy) STILL pending as of 2026-05-20.

## New finding F7 (INFO, 2026-05-20) — CVE-2025-68613 is NOT opossum

Surfaced in web search for "opossum CVE 2025 2026" but reads as an n8n RCE (CVSS 9.9 CRITICAL, fixed in 1.120.4 / 1.121.1 / 1.122.0). Unrelated. No CVEs exist against `opossum` as of May 2026.

## New finding F8 (INFO, 2026-05-20) — `@types/opossum@^8.1.9` lags `opossum@9.0.0`

Confirmed pin in `museum-backend/package.json:96`. The `wikidata-breaker.ts:123-125` comment already calls out the type-vs-runtime drift (8.x types say `(err)` on the `timeout` callback ; v9 runtime passes `latencyMs`). Not a defect, but worth a comment-anchor for future maintainers : check `node_modules/opossum/lib/circuit.js` when payload shape matters.
