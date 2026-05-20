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

---

## 2026-05-20 — Refresh (lib-doc-curator)

Versions: `langfuse@3.38.20` + `langfuse-langchain@3.38.0` (unchanged; no patch release between 2026-05-18 and 2026-05-20, v3 line frozen post-deprecation). No new CVEs / advisories. Snapshot delta: `snapshot-2026-05-20.md`.

### Status updates on the 2026-05-18 audit

- **LF-V3-01 (observeOpenAI)** → reclassified **MOOT** (cross-ref TECH_DEBT TD-LF-01 disposition 2026-05-20). Musaium has no `OpenAI` SDK client instance to wrap; chat goes through LangChain `ChatOpenAI` (covered via TD-LF-02), TTS/STT use raw `fetch`. The previous "wrap OpenAI client" recommendation was based on an architecture that doesn't exist.
- **LF-V3-02 (CallbackHandler missing)** → **CLOSED 2026-05-18** via `createLangfuseCallbackHandler` (loader `shared/observability/langfuse-langchain.ts`) + `attachLangChainCallback` (`langchain-orchestrator-tracing.ts:21-30`) + `callbacksRef` plumbing in `langchain.orchestrator.ts:170-175 + 427-430`. Verified via grep 2026-05-20.
- **LF-V3-03 (zero promptTokens/completionTokens)** → **AUTO-CLOSED by LF-V3-02 closure**. Snapshot-2026-05-20 §F1 confirms `CallbackHandler.handleLLMEnd` dual-writes `usage` AND `usageDetails` from `AIMessage.usage_metadata` (populated by every modern `ChatOpenAI`/`ChatGoogleGenerativeAI`).
- **LF-V3-04 (`.update({output,metadata})` instead of `.span().end()`)** → still LOW; no fix in 2026-05-20 cycle.
- **LF-V3-05 (no `mask` hook)** → still LOW; deferred.
- **LF-V3-06 (no `on('error')` subscription)** → **CLOSED 2026-05-18** at `langfuse.client.ts:64-68`. Verified.

### ⚠️ LF-V3-09 MEDIUM — TD-20 residual : 4 non-LangChain paths emit 0 generations

`docs/TECH_DEBT.md:231 TD-20` headline ("Langfuse wrap manuel, 0 `lf.generation()`, cost UI = 0") is now PARTIALLY closed (chat path covered by CallbackHandler). The residual scope = 4 LLM-adjacent paths that bypass LangChain :

1. **`modules/chat/useCase/llm/llm-judge-guardrail.ts:135`** — direct `model.withStructuredOutput(JudgeDecisionSchema).invoke(messages, { signal })`. Detached from `withLangfuseTrace` since C9.7 (2026-05-18) for latency. Result : judge calls cost ~$5/day at cap, invisible in Langfuse cost UI.
2. **`modules/chat/adapters/secondary/audio/text-to-speech.openai.ts:29`** — raw `fetch('https://api.openai.com/v1/audio/speech')`. Voice V1 always-on since 2026-04 → every chat answer triggers TTS → real OpenAI bill contributor, $0 in Langfuse.
3. **`modules/chat/adapters/secondary/audio/audio-transcriber.openai.ts:94`** — raw `fetch('https://api.openai.com/v1/audio/transcriptions')`. Same shape as TTS.
4. **`modules/chat/adapters/secondary/guardrails/llm-guard.adapter.ts`** — no langfuse import. Not a cost path (sidecar = fixed monthly), but should emit `lf.event({type:'guardrail.scan'})` for session-view correlation.

**Fix surface** : §9 of PATTERNS.md (D1 design). P1-P5 patches, ~5h total. Tracks TD-20 closure → roadmap target 2026-06-07.

### ⚠️ LF-V3-10 NOTE — D1 "subclass" is overkill for chat path, useful for metadata enrichment

`project_remediation_roadmap_2026-06-07.md` D1 = "Langfuse subclass". Re-reading 2026-05-18 snapshot + 2026-05-20 CallbackHandler source : the chat path does NOT need a subclass to emit cost (`handleLLMEnd` already auto-emits with `usageDetails`). Subclass is justified ONLY for injecting `museumId / tier / requestId` into every LangChain-emitted generation's metadata (LangChain doesn't propagate this scope by default).

Recommended impl (PATTERNS.md §9.2) : **instance-level override** of `handleLLMStart` + `handleChatModelStart` via `handler.handleLLMStart = …` reassignment, NOT `class X extends CallbackHandler` (the latter would force eager import, breaking the Jest+SWC lazy-require pattern that the rest of the langfuse loader follows).

### ⚠️ LF-V3-11 NOTE — Cost UI = 0 has 3 independent root causes

When triaging "cost column shows 0", check IN ORDER (cheapest first) :
1. Generation emitted at all ? (TD-20 residual paths — §LF-V3-09 above).
2. `model` field set on the generation ? (Server matches catalog regex on model name; missing field = no match.)
3. Model in project catalog ? (Custom Deepseek / `gpt-4o-mini-transcribe` need to be added at `Settings → Models`. User-defined models override Langfuse-maintained.)

Don't immediately blame "v3 SDK broken" — the SDK is fine ; the visibility gap is upstream of it.

### ⚠️ LF-V3-12 NOTE — TTS uses CHARACTERS unit, not TOKENS

OpenAI TTS pricing is `$15/1M chars` (`tts-1`) or `$30/1M chars` (`tts-1-hd`). The Langfuse generation MUST be emitted with `usageDetails: { input: <text.length> }` AND `unit: 'CHARACTERS'`. Adding `tts-1` to the Langfuse model catalog with `inputPrice: 0.000015` (per char) makes the cost UI populate.

STT (Whisper / `gpt-4o-mini-transcribe`) is priced per audio SECOND : `$0.006/minute = $0.0001/sec` → catalog `inputPrice: 0.0001` with `unit: 'SECONDS'`. Caveat : the current STT adapter does NOT compute audio duration ; interim option = emit `unit: 'BYTES'` + `metadata: {durationKnown:false}` and rely on the inferred cost path being skipped (still better than no generation).

### ⚠️ LF-V3-13 INFO — Server-side cost ingestion priority

From `langfuse.com/docs/model-usage-and-cost` (2026-05-20 fetch) : **"Ingested usage and cost are prioritised over inferred usage and cost."**. Implication for Anthropic / providers where Musaium would have the actual bill : pass `costDetails: { input: <USD>, output: <USD> }` directly on the generation to override Langfuse's inference. Not relevant today (Musaium = OpenAI + Deepseek + Google), but worth documenting for future provider additions.

### ✅ Positives reaffirmed 2026-05-20

- `langchain-orchestrator-tracing.ts` is a clean reference impl of the "outer manual trace + inner CallbackHandler" pattern (PATTERNS.md §8.1).
- `safeTrace` discipline is universal across the 30+ SDK call sites (zero raw `lf.trace()` outside `safeTrace`).
- Lazy-require pattern in `langfuse.client.ts` + `langfuse-langchain.ts` is consistent — survives the Jest+SWC bootstrap that bit early adopters of the SDK.
- Singleton + `shutdownLangfuse()` in `safeTeardown` chain (`index.ts:286`) ordering verified : AFTER httpServer + BullMQ worker close, before final process exit.

