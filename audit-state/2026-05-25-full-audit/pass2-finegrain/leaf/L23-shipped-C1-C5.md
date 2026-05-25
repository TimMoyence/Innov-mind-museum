# L23 — Fine-grain re-audit: P0.F shipped clusters C1–C5

- **Agent**: fresh-context READ-ONLY (UFR-022), zero prior-agent state.
- **Branch/HEAD**: `dev` @ `1fb32f5bafc5ada0b97e7ce10af39d02834df8af`.
- **Method**: every "shipped" re-derived from scratch, confirmed by `path:line`. No trust in prior audits. `Vérifié` = read code / ran grep myself. `Supposé` = inferred, not confirmed.

---

## VERDICT TABLE

| Cluster | Verdict | Confidence |
|---|---|---|
| C1.2 LLM cache | **SHIPPED-CONFIRMED** | Vérifié |
| C2.x image enrichment | **SHIPPED-CONFIRMED** | Vérifié |
| C3.1 SigLIP normalize | **SHIPPED-CONFIRMED** | Vérifié |
| C3.2 pgvector halfvec | **SHIPPED-CONFIRMED** | Vérifié |
| C3.4 chat-compare 5-stages + CompareResult | **SHIPPED-CONFIRMED** | Vérifié |
| **C3.5 `useCompareImage` hook** | **ORPHAN (confirmed)** | Vérifié |
| **C3.7 `fallbackVisualThreshold` score-floor** | **DEAD (confirmed)** | Vérifié |
| C4.1 KnowledgeRouter cascade | **SHIPPED-CONFIRMED** | Vérifié |
| **C4.3 promptfoo halluc assertions** | **PARTIAL — DEAD-ON-ARRIVAL within eval** | Vérifié |
| C4.4 citation Zod sources[] v2 | **SHIPPED-CONFIRMED** | Vérifié |
| C5.x Wikidata KB cluster | **SHIPPED-CONFIRMED** | Vérifié |

---

## C1.2 — LLM cache wired — SHIPPED-CONFIRMED

- v2 key + fail-open: `museum-backend/src/modules/chat/useCase/llm/llm-cache.service.ts`
  - `KEY_VERSION = 'v2'` (`:14`), key shape `llm:v2:{contextClass}:{museumId|none}:{userId|anon}:{sha256}` (`:130`).
  - `lookup` fail-open → hit=false on cache exception (`:51-73`); `store` fail-open (`:75-90`).
  - Canonical input folds `voiceMode`/`audioDescriptionMode` truthy-only (`:152-157`) + `currentArtworkKey` (I-FIX2, `:164-166`).
- Prom counters DEFINED + REGISTERED: `museum-backend/src/shared/observability/prometheus-metrics.ts:38` (`llm_cache_hits_total`) + `:45` (`llm_cache_misses_total`), both `registers:[registry]`.
- Counters INCREMENTED on hit/miss: `llm-cache.service.ts:64,68,70`.
- WIRED into chat pipeline: `museum-backend/src/modules/chat/useCase/message/chat-message.service.ts` — `tryLlmCacheLookup` calls `llmCache.lookup` (`:329`), `tryLlmCacheStore` calls `llmCache.store` (`:357`), invoked in main flow (`:299`). `computeKey` stamps the exact key for feedback purge (`:328,356`).
- Grafana panel `id:4`: `infra/grafana/dashboards/chat-latency.json:146-148` title "LLM cache hit-rate by context_class", PromQL `rate(llm_cache_hits_total{context_class=...})/(...)` for generic/museum-mode/personalized (`:162,167,172`).

VERDICT: fully wired end-to-end. Claim accurate.

## C2.x — image enrichment — SHIPPED-CONFIRMED

- File: `museum-backend/src/modules/chat/useCase/image/image-enrichment.service.ts` (380 LOC).
- **Promise.all fan-out**: per-(term×source) tasks pushed (`:117-129`), awaited `await Promise.all(tasks)` (`:130`).
- **Wikimedia + Musaium clients exist**: `adapters/secondary/search/wikimedia-commons.client.ts` + `musaium-catalogue.client.ts`. Both registered as sources (`:121,124`).
- **Zod v2**: citation + suggested-image schemas in `useCase/llm/llm-sections/main-assistant-output.schema.ts` — `suggestedImageSchema` (`:76`), `citationSourceEmissionSchema` (`:59`), `mainAssistantOutputSchema` (`:93`). NOTE: the source clients themselves use TS types (not Zod) — the Zod validation lives at the LLM-output boundary, which is the correct contract surface.
- **Prom**: `chat_enrichment_source_calls_total` + `chat_enrichment_source_latency_seconds` (prometheus-metrics.ts:82,89); incremented/observed in `fetchSourcePhotos` (`image-enrichment.service.ts:253-254`).
- **Langfuse**: per-source span create/update (`:214-259`) via `getLangfuse()` + `safeTrace`.
- WIRED into pipeline: `useCase/enrichment/enrichment-fetcher.ts:127,132` calls `imageEnrichment.enrich(...)`; injected via `orchestration/prepare-message.pipeline.ts:434` + `orchestration/chat.service.ts:143`.

VERDICT: all 5 sub-claims (fan-out, Wikimedia, catalogue, Zod, Prom, Langfuse) confirmed.

## C3.1 — SigLIP ONNX normalize — SHIPPED-CONFIRMED

- `museum-backend/src/modules/chat/adapters/secondary/embeddings/image-preprocess.ts:17-22`: `SIGLIP_MEAN = 0.5`, `SIGLIP_STD = 0.5`, normalise `((x/255)-0.5)/0.5` → range [-1,1]. Explicit NOT-ImageNet comment. Adapter: `siglip-onnx.adapter.ts` (same dir, comments at `:7-8`).

## C3.2 — pgvector halfvec — SHIPPED-CONFIRMED

- Migration `museum-backend/src/data/db/migrations/1778406339944-AddArtworkEmbeddings.ts`:
  - `embedding halfvec(768) NOT NULL` (`:53`).
  - HNSW index `USING hnsw ("embedding" halfvec_ip_ops) WITH (m=16, ef_construction=64)` (`:78`).
- museum_id scope: migration `1778622760826-AddMuseumIdScopeToArtworkEmbeddings.ts` adds nullable `museum_id` FK (`:55-59`) + btree `IDX_artwork_embeddings_museum_id` (`:69`). Tenant predicate `museum_id IS NULL OR museum_id = $1` documented.
- ⚠️ Cross-ref: I-OPS6 (separate finding) — no pgvector ≥0.7.0 version gate in migration; out of scope for this leaf but reaffirmed.

## C3.4 — chat-compare 5-stages + CompareResult — SHIPPED-CONFIRMED

- `museum-backend/src/modules/chat/useCase/visual-similarity/similarity.service.ts`:
  - `compare(input): Promise<CompareResult>` (`:237`).
  - Stages instrumented via `compareDurationSeconds.observe({stage})`: `cache` (`:377`), `encode` (`:405`), `search` (`:269`), `enrich` (`:297`), `fusion` (`:455`), plus `total` rollups. 5 functional stages + total.
  - `CompareResult` type: `domain/visual-similarity/compare-result.types.ts:86`.
- Route: `adapters/primary/http/routes/chat-compare.route.ts` (227 LOC), Zod schemas `schemas/compare.schemas.ts`.
- i18n FE keys present (8-locale test `__tests__/shared/locales/c3-compare-keys.test.ts`).

## C3.5 — `useCompareImage` hook — ORPHAN (CONFIRMED) ⚠️

- Hook DEFINED + exported: `museum-frontend/features/chat/application/useCompareImage.ts:70` (`export const useCompareImage`), delegates to `imageComparisonApi.compare` (`:80`).
- **ZERO production caller.** Importers of `useCompareImage` across `app/`, `features/`, `components/`, `shared/` (excluding `__tests__`): only the hook file itself + the API infra file it imports. No screen/component invokes `.mutate()`.
- The compare UI carousel `ImageCompareCarousel` IS rendered in `museum-frontend/features/chat/ui/ChatMessageBubble.tsx:276-278`, but reads from `message.metadata?.compareResults`.
- **`metadata.compareResults` is NEVER WRITTEN in FE production code** — grep for assignment (`compareResults[:=]`) returns nothing; only read (`ChatMessageBubble.tsx:276`) + typed (`chatSessionLogic.pure.ts:88`).
- BE side: `compareResults` is only produced as the RESPONSE BODY of the dedicated `/chat/compare` endpoint (`useCase/visual-similarity/compare.use-case.ts:134`). It is NOT injected into chat-message stream metadata. So nothing populates the carousel's data source in the normal chat flow.

VERDICT: C3.5 is a genuine ORPHAN. Hook + carousel + skeleton + tests all exist, but the wire from "user sends image in chat" → "compareResults rendered" is severed: no caller invokes the hook, and `metadata.compareResults` is never populated. Matches roadmap V1.0.x backlog item. NOT shipped as a working user feature.

## C3.7 — `fallbackVisualThreshold` score-floor — DEAD (CONFIRMED) ⚠️

- DEFINED: `museum-backend/src/config/env.types.ts:413` (`fallbackVisualThreshold: number`).
- PARSED: `museum-backend/src/config/env.ts:345` (`toNumber(process.env.VISUAL_FALLBACK_VISUAL_THRESHOLD, 0.4)`).
- **ZERO read site.** `grep fallbackVisualThreshold museum-backend/src` excluding the type def + parse line returns NOTHING. Not passed in the `VisualSimilarityService` wiring (`chat-module.ts:270-287` passes `wVisual`/`wMeta`/`topN`/`topK` only — `fallbackVisualThreshold` absent).
- The similarity service emits `no_visual_neighbor` ONLY when the kNN result set is empty (`similarity.service.ts:279`), never applies a min-score floor. A low-similarity neighbor (score below 0.4) is returned without gating.

VERDICT: parsed-but-never-read dead config. No score-floor gate exists. Matches roadmap V1.0.x backlog. Risk: post-seed, kNN returns arbitrary-quality nearest neighbor with no floor.

## C4.1 — KnowledgeRouter cascade — SHIPPED-CONFIRMED

- `museum-backend/src/modules/chat/useCase/knowledge/knowledge-router.service.ts`:
  - KB → judge → WebSearch cascade documented + implemented (`:2-3`).
  - Per-leg budgets via `AbortSignal.any` (NOT `Promise.race`) — `buildLegSignal` (`:91-93`) composes `AbortSignal.timeout(legBudgetMs)` with parent signal; explicit "loser leak" avoidance comment (`:87-88`). KB leg (no native signal) enforced via budget wrapper (`:145-151`).
  - Confidence cutoff above which WebSearch skipped (default 0.7, `:63`).

## C4.3 — promptfoo halluc assertions — PARTIAL / DEAD-ON-ARRIVAL within eval ⚠️

This is the most consequential finding. The CI workflow + corpus + assertion module ALL exist, but the two custom assertion FUNCTIONS are never wired into the promptfoo eval against the corpus.

- Assertion functions DEFINED + EXPORTED: `museum-backend/security/promptfoo/lib/halluc-assertions.ts` — `quoteInFacts` (`:180`), `citeRealUrl` (`:235`), `extractSources` (`:143`). Docstring itself hedges: "surfaced to Promptfoo via the `javascript` assertion type **(or invoked directly from the unit test)**" (`:4-5`).
- Corpus assertion types (merged `halluc-corpus.json`, 60 entries): ONLY `icontains-any` (60×), `not-contains` (5×), `not-icontains` (43×). **ZERO `type:javascript`. ZERO references to `quoteInFacts`/`citeRealUrl`/`halluc-assertions` in corpus or any `*.partial.json`** (grep count = 0).
- Config `halluc.config.yaml` `defaultTest.assert` = only 3 `not-contains`/`not-icontains` system-boundary-leak guards (`:69-74`). No javascript assertion, no `file://...halluc-assertions`.
- CI `.github/workflows/ci-cd-backend.yml` `halluc-eval` job:
  - `:531-537` runs `halluc-assertions` **Jest unit tests** (exercises the functions in ISOLATION against synthetic fixtures).
  - `:542-564` runs `promptfoo eval -c halluc.config.yaml` against the corpus — which contains NO javascript assertion referencing the module.
  - The gate (`:571-600`) diffs the report's weighted score vs `team-promptfoo/halluc-baseline.json` (drift > 5pts fail).

VERDICT: the workflow EXISTS and gates on corpus drift, and the assertion functions ARE unit-tested. BUT `quoteInFacts`/`citeRealUrl` are **never executed against actual LLM outputs in the promptfoo eval** — they are not wired via `type:javascript`. The eval's anti-hallucination protection for those two checks is dead-on-arrival; only the unit test (synthetic fixtures) covers them. Roadmap's own ⚠️ warning (P0.B19) is accurate and confirmed.

## C4.4 — citation enforce Zod sources[] v2 — SHIPPED-CONFIRMED

- BE Zod schema `citationSourceEmissionSchema` v2 `{url, type∈{wikidata,web,museum-catalog,commons}, title, quote, confidence?:nullable}`: `main-assistant-output.schema.ts:59-74`. Exactly matches claim `{url,type,title,quote,confidence?}`.
- FE `SourceCitation.tsx` + `CitationChip.tsx` + `CitationChips.tsx` exist (`museum-frontend/features/chat/ui/`), use Ionicons.
- WIRED (not orphan, unlike C3.5): rendered in `ChatMessageBubble.tsx:137-140` from `message.metadata?.sources` (`:99`); `sources?: CitationSource[]` typed `chatSessionLogic.pure.ts:94`.

## C5.x — Wikidata KB cluster — SHIPPED-CONFIRMED

- **Opossum breaker (C5.1)**: `adapters/secondary/search/wikidata-breaker.ts:1` `import CircuitBreaker from 'opossum'`, breaker instance (`:70`), `errorThresholdPercentage` config, Prom bridge `wikidata_sparql_circuit_state` (`:65`).
- **WriteThrough (C5.3)**: `adapters/secondary/search/wikidata-write-through.provider.ts:22` — fire-and-forget UPSERT of real matches only (`persistAsync` → `dumpRepo.upsert`, `:43`).
- **Local dump (C5.x)**: entity `domain/wikidata-kb-dump.entity.ts`, repo `adapters/secondary/persistence/wikidata-kb-dump.repository.typeorm.ts`, migration `1778504875210-AddWikidataKbDump.ts`. Canon seed `DEFAULT_CANON_TERMS` = **48 terms** × `DEFAULT_CANON_LANGUAGES = ['en','fr']` (`useCase/knowledge/seed-kb-canon.ts:64,132`). Matches "48-50 canonical works × en+fr".
- **Alerts (C5 6.4)**: `infra/grafana/alerting/wikidata-resilience.yml` = **4 alerts** (`WikidataBreakerOpenSustained`, `WikidataSparqlErrorRateHigh`, `WikidataSparqlLatencyP95High`, `WikidataLocalDumpHotPath`). Matches "4 alerts".
- **Dashboard**: `infra/grafana/dashboards/wikidata-resilience.json` — 6 data panels (circuit state, request outcomes, SPARQL latency p50/p95/p99, KB cache hit rate, local-dump fallback rate, breaker source) + text rows. Claim "5-panel" ≈ accurate (6 data panels).
- **Cascade wiring**: `chat-module.ts:151-161` — `new WikidataBreakerClient(...)` → `new WikidataWriteThroughProvider(breaker, dumpRepo)` → `kbProvider`, `breakerState` exposed.

VERDICT: all 4 sub-claims (breaker, WriteThrough, dump, alerts+dashboard) confirmed.

---

## Summary of deviations from roadmap "shipped" claims

- **C3.5**: roadmap correctly flags as orphan (V1.0.x backlog). CONFIRMED orphan — hook has zero caller, `metadata.compareResults` never populated FE.
- **C3.7**: roadmap correctly flags as dead (V1.0.x backlog). CONFIRMED dead — `fallbackVisualThreshold` parsed, never read, no score floor.
- **C4.3**: roadmap correctly flags ⚠️ (P0.B19). CONFIRMED dead-on-arrival — `quoteInFacts`/`citeRealUrl` never wired via `type:javascript` into the corpus eval; only unit-tested on synthetic fixtures.
- C1.2, C2.x, C3.1, C3.2, C3.4 (endpoint), C4.1, C4.4, C5.x: all genuinely shipped + wired. No false-positive "shipped" claim detected in this perimeter.
