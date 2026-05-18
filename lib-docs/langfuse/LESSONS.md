# Lessons — langfuse (v3.38.20 DEPRECATED upstream)

Audit 2026-05-18 : **CONFORMANT_v3_with_3_MEDIUM_value_gaps**. Cross-ref TD-LC-01 langchain ChatGoogleGenerativeAI déjà flagué.

## ⚠️ LF-V3-01 MEDIUM : No `observeOpenAI` wrapper → token+cost data MANQUE Langfuse UI
- OpenAI clients (TTS, STT, LLM judge) invoked directly via official `openai` SDK. Langfuse instrumentation manuelle via fail-open trace() spans, NOT observeOpenAI.
- PATTERNS §2 DO : observeOpenAI = recommended path ; manual spans MISS token usage capture + prompt linkage.
- **Fix TD-LF-01** : wrap OpenAI client via observeOpenAI dans `shared/openai/openai.client.ts`.

## ⚠️ LF-V3-02 MEDIUM : No `CallbackHandler` on LangChain `chain.invoke` → internal steps invisibles
- `langchain.orchestrator.ts:115 withLangfuseTrace` wrap chain.invoke manually MAIS ne passe pas `callbacks: [new CallbackHandler({root: trace, updateRoot: true})]`.
- Capture seulement outer wrapper latency — internal LangChain steps (LLM calls, tool calls, retrievers) invisible Langfuse UI.
- **Fix TD-LF-02** : add CallbackHandler via `langfuse-langchain` package.

## ⚠️ LF-V3-03 MEDIUM : Zero `promptTokens/completionTokens` propagated → cost dashboard VIDE
- Sans `.generation({...}).end({usage:{promptTokens, completionTokens, totalTokens}})` OR observeOpenAI auto-instrumentation, cost analytics dashboard empty.
- **Fix TD-LF-03** : couvert par TD-LF-01 + TD-LF-02.

## ⚠️ LF-V3-04 LOW : `trace().update({output,metadata})` au lieu de `.span()/.generation().end()` 
- Duration computed in app code (`latencyMs`) au lieu de native observation .end() timestamp. Loses Langfuse UI native duration.

## ⚠️ LF-V3-05 LOW : No `mask` constructor hook
- PII redaction (sha256 hashing of searchTerm/queryHash) scattered across 4 call sites — should be central mask.

## ⚠️ LF-V3-06 LOW : No `langfuse.on('error', ...)` → silent SDK network failures
- **Fix TD-LF-04** : add `lf.on('error', err => logger.warn(...))` dans `langfuse.client.ts`.

## ⚠️ LF-V3-08 INFO : v3 DEPRECATED — migration v5 TECH_DEBT (TD-LC-01 cross-ref)

## ✅ Positives
- Singleton + fail-open on missing keys
- `shutdownAsync()` wired in graceful shutdown (index.ts:273)
- Defensive env var resolution (LANGFUSE_BASE_URL v5 alias accepted)
- ALL SDK calls wrapped in safeTrace (fail-open per UFR-013)
- Zero v5-import regression
