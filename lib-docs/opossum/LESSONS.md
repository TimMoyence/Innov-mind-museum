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
