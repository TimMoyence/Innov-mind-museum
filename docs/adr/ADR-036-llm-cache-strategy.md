# ADR-036 — LLM cache strategy (single-source consolidation)

- **Status**: Accepted (PR-A merged 2026-05-08 ; PR-B merged 2026-05-08 — single-source consolidation now live)
- **Date**: 2026-05-08
- **Owner**: backend / chat module
- **Scope**: museum-backend chat orchestration — LLM response cache layer
- **Ticket**: ROADMAP_PRODUCT C1.2 (cache audit + activate) ; run `2026-05-08-c1-chat-fast`
- **Supersedes**: N/A (no prior LLM-cache ADR ; original spec deleted 2026-05-03 during roadmap consolidation, recoverable via `git log museum-backend/src/modules/chat/useCase/llm/llm-cache.service.ts`)
- **References**: ADR-001 (SSE streaming deprecated — no cache for stream path) ; ADR-035 (Wikidata KB — distinct concern, NOT this cache)

## Context

Two LLM cache layers cohabit in the chat pipeline as of 2026-05-08, with no documented architectural authority:

- **L1 — `LlmCacheServiceImpl`** (`museum-backend/src/modules/chat/useCase/llm/llm-cache.service.ts`) — use-case-level cache, called by `chat-message.service.ts` BEFORE the orchestrator. Adaptive TTL by `contextClass` (generic 7d / museum-mode 1d / personalized 1h). Prom counters `llm_cache_hits_total{context_class}` + `llm_cache_misses_total{context_class}` already shipped. Public API includes `invalidateMuseum(museumId)`. Key shape: `llm:v3:{contextClass}:{museumId|none}:{userId|anon}:{sha256OfCanonicalInput}` *(v2 au moment de l'ADR ; bumpé v3 le 2026-06-12, `lowDataMode` dans le hash — commit `60b6bcdc`)*.
- **L2 — `CachingChatOrchestrator`** *(historique — fichier `museum-backend/src/modules/chat/adapters/secondary/llm/caching-chat-orchestrator.ts` supprimé en PR-B 2026-05-08, voir §Decision ; l'orchestrateur est désormais instancié direct, `chat-module.ts:698`)* — adapter-level decorator wrapping the `ChatOrchestrator` port, wired in the composition root au moment de l'ADR. Bypass conditions diverge from L1 (image, history>0, text>500 chars, userMemoryBlock present, KB block present, web-search block, PII detection, no museumId). Maintains a Redis sorted-set for popularity-weighted warmup. **No Prom metrics** — only `logger.info` events.

The roadmap previously cited "ADR-035 llm-cache" as the architectural reference. That citation is incorrect: ADR-035 covers the Wikidata Knowledge Base. **No ADR has ever been active for the LLM cache strategy** — this is the first.

Operating consequences of the dual-cache state:

- Hit-rate observability is asymmetric: L1 emits Prom metrics, L2 does not. End-to-end hit-rate reasoning is impossible from `/metrics` alone.
- Bypass conditions diverge, so a request bypassed at L1 may still hit L2 (or vice versa) in non-obvious ways. Ordering of L1 vs L2 lookups is implicit.
- TTL has never been data-tuned. The constants `TTL_GENERIC_S=7d`, `TTL_MUSEUM_MODE_S=1d`, `TTL_PERSONALIZED_S=1h` were chosen by intuition in 2026-04 and never validated against measured hit-rates.
- The L2 popularity ZSET has no documented consumer — code search shows the ZSET is written on store but never read for warmup in production paths.

The roadmap target is **P50 < 3.5s** and **P99 < 6s** (sync chat path, WiFi conditions, alerting on p99 breach). C1 phase 1 must instrument the pipeline end-to-end and deliver a baseline before any data-driven TTL tune (cf. C1.3 runbook in `team-state/2026-05-08-c1-chat-fast/spec.md` §9).

## Decision

**Consolidate to a single LLM cache layer: keep L1 (`LlmCacheServiceImpl`), remove L2 (`CachingChatOrchestrator`).**

The cache is owned by the use-case layer. The adapter layer is plain orchestration. Reasons:

1. L1 already exposes Prom metrics aligned to `context_class` — observable hit-rate from day one.
2. L1 lives behind a port-adapter boundary that is straightforward to test (no need to inject through composition decorators).
3. L1 owns the public invalidation API (`invalidateMuseum`) consumed by the admin module — keeping the cache there keeps the contract local.
4. L2's popularity ZSET has no production consumer ; the warmup it would feed has not been built. Speculation is not a reason to keep dead code (CLAUDE.md "bury dead code" rule, `feedback_bury_dead_code`).
5. Single-source: bypass conditions, TTL, key shape, invalidation, kill-switch all live in one file. Future maintainers read one place, not two.

### Status timeline

This ADR ships in two PRs sequentially because production = staging (no separate staging environment, see `docs/ROADMAP_PRODUCT.md` Phase 1 / `team-state/2026-05-08-c1-chat-fast/spec.md` §10):

- **PR-A — instrumentation only (this PR, 2026-05-08)**: Status = **Proposed**. Adds Prometheus histograms (`chat_phase_duration_seconds`, `chat_request_duration_seconds`, `chat_phase_errors_total`), introduces `ChatPhaseTimer` (RAII Prom + Langfuse span emitter), wires it into STT/TTS adapters and `chat.service.ts`, adds `llm_cache_disabled_bypass` log event for kill-switch observability, and lands integration tests covering pipeline spans + cache invalidation across both museum-scoped context classes. **L2 is NOT removed in PR-A** — it stays in the composition root as-is until PR-B ships.
- **PR-B — L2 removal (separate PR after 24h prod bake of PR-A — fast-tracked 2026-05-08 per user direction)**: Status flips to **Accepted**. Removes `CachingChatOrchestrator` from the composition root (`chat-module.ts:243` no longer wraps the orchestrator), deletes the file and its tests, `grep -rn "CachingChatOrchestrator" museum-backend/src museum-backend/tests` returns zero. Adds fail-open semantics to `LlmCacheServiceImpl.lookup` and `LlmCacheServiceImpl.store` (try/catch + `llm_cache_lookup_failed` / `llm_cache_store_failed` warn logs ; spec R8). The 24h bake gate was overridden by the user — the operational kill-switch (`LLM_CACHE_ENABLED=false`) remains the rollback path.

The two-PR split exists to enable bisect: if cache hit-rate regresses after PR-B merges, the diff to investigate is small and isolated. There is no staging where this could be rehearsed.

### Cache contract (L1, post-PR-B authoritative)

| Concern | Specification |
|---|---|
| Implementation | `LlmCacheServiceImpl` (`museum-backend/src/modules/chat/useCase/llm/llm-cache.service.ts`). |
| Lookup site | `chat-message.service.ts` BEFORE the orchestrator call. |
| Key shape | `llm:v3:{contextClass}:{museumId\|none}:{userId\|anon}:{sha256OfCanonicalInput}`. `museumId` precedes `userId` so `delByPrefix` can target a museum across all users. Bumps : `v1`→`v2` (`d54552beb`, 2026-05-19, folds `voiceMode` + `audioDescriptionMode`) ; `v2`→`v3` (`60b6bcdc`, 2026-06-12, folds `lowDataMode`) — source of truth `llm-cache.service.ts:14` (`KEY_VERSION`) / `:133` (shape). |
| `contextClass` derivation | `classify()` returns `personalized` if `userPreferencesHash` is present, `museum-mode` if `museumContext.museumId` is set, else `generic`. |
| TTL constants | `TTL_GENERIC_S = 7 * 24 * 60 * 60` (7 days), `TTL_MUSEUM_MODE_S = 24 * 60 * 60` (1 day), `TTL_PERSONALIZED_S = 60 * 60` (1 hour). All defined in `llm-cache.service.ts` ; data-driven tuning gated by R11 below. |
| Bypass conditions | Owned by `chat-message.service.ts` calling code (image input, oversize text, PII flag, etc.). The cache itself does not bypass — it always derives a key and looks up. The caller decides whether to call. |
| Invalidation API | `invalidateMuseum(museumId)` issues `delByPrefix` for both `museum-mode` and `personalized` context classes scoped to that `museumId`. Logs `llm_cache_invalidate_museum` (success) or `llm_cache_invalidate_museum_failed` (warn). Called by admin museum update + admin cache purge route. |
| Kill-switch | `LLM_CACHE_ENABLED` environment flag (boolean, default `true`). When `false`, callers (chat-message.service.ts) bypass both lookup and store. Bypass is observable via the `llm_cache_disabled_bypass` log event (PR-A T1.12). |
| Failure semantics | Fail-open. Any exception during lookup or store is caught at the call site (existing pattern in `chat-message.service.ts`) ; the chat request continues without a cached response. The error is logged with structured fields `{layer: 'l1', key, requestId, error}`. The request path never throws because of the cache. |

### Data-driven TTL tuning protocol (R11)

TTL constants are not tuned by intuition. Tune protocol:

1. **Bake**: PR-A + PR-B ship to production. Wait **≥7 consecutive days** of measured hit-rate per `context_class` (firm window, see D12 in `team-state/2026-05-08-c1-chat-fast/spec.md` §11). If daily traffic is below ~100 requests/day, the bake-window verdict is "baseline insufficient" and TTL tune is deferred post-launch — not "tune anyway".
2. **Measure**: extract from Grafana panel `llm_cache_hit_ratio` (computed as `llm_cache_hits_total / (llm_cache_hits_total + llm_cache_misses_total)`, see ROADMAP `C1.1` deliverable). Target floors per `team-state/2026-05-08-c1-chat-fast/spec.md` §5: generic ≥25%, museum-mode ≥10%, personalized ≥2%.
3. **Decide**: if a class is below target, candidates are (a) extend TTL, (b) widen the cache key (less likely — already canonical), (c) accept the floor as a non-issue for this class. If a class hit-rate is suspiciously high (>80%), TTL may be too long for content freshness — consider tightening.
4. **Document**: any TTL change MUST land via a PR that (a) includes a Grafana hit-rate screenshot covering the bake window, (b) diffs the TTL constant in `llm-cache.service.ts`, (c) amends this ADR with an entry under `## Amendments` referencing the new constant value, the prior value, and the data justification. The reviewer agent is mandated to BLOCK any TTL change PR that lacks these three elements (R13 in spec).

### What this ADR does not cover

- **Semantic similarity matching**: `llm-cache.service.ts:24` calls this out as deferred to "G Phase 2". This ADR retains the deferral. The current cache is exact-match only on the canonical input hash.
- **Pre-warm / popularity-driven warmup**: deleted with L2 (PR-B). If post-baseline analysis shows it would help, it returns as a separate ADR with the data justification.
- **Streaming SSE responses**: ADR-001 deprecates the SSE path. No cache participation.
- **Audio / TTS asset cache**: distinct from LLM response cache. `chat-media.service.ts` handles its own audio asset persistence via S3 (`ChatMessage.audioUrl`). Not in scope.
- **Inter-tenant isolation**: ensured by the `museumId` segment in the cache key. There is no shared cache space between museums for `museum-mode` or `personalized` classes. `generic` is shared by design (no museum/user dimension).

## Consequences

**Positive**:
- Single source of truth for cache strategy. Future maintainers read one file (`llm-cache.service.ts`) and one ADR (this).
- Hit-rate observability is uniform across all classes via existing Prom counters. The Grafana dashboard (C1.1, `infra/grafana/dashboards/chat-latency.json`) sources its hit-rate panel from `llm_cache_hits_total` / `llm_cache_misses_total` — same metrics for everyone.
- Kill-switch observability: `llm_cache_disabled_bypass` log event makes the operational state of `LLM_CACHE_ENABLED=false` traceable in logs (Sentry / Loki).
- TTL governance: R11 + R13 prevent tune-by-feel. Any TTL change that lacks a bake screenshot is reviewer-rejected.

**Negative / risks**:
- Removing L2 deletes the popularity ZSET. If a future feature needs popularity-driven pre-warm, it must be rebuilt — but this is acceptable because the ZSET has no production consumer today.
- Bypass logic concentrated in the use-case layer (`chat-message.service.ts`) makes that file slightly larger. Mitigation: existing structure already groups the bypass conditions cleanly.
- Two-PR rollout (PR-A then PR-B) takes ~24h longer to fully ship than a single PR. Acceptable cost: bisect granularity in a no-staging environment.

**Operational**:
- `LLM_CACHE_ENABLED=false` remains the runtime kill-switch. No redeploy needed if managed via secret store.
- Rollback of PR-B is `git revert` + redeploy. The L1 cache is untouched, so cache state is preserved.
- Rollback of PR-A is `git revert` + redeploy. Prom histograms disappear from `/metrics`, but `llm_cache_hits_total` / `llm_cache_misses_total` remain (those existed pre-C1).

## Alternatives considered

- **Keep L2, remove L1**: rejected. L2 has no metrics, no public invalidation API, and the popularity ZSET has no consumer. Dropping L1 would erase the only observable cache layer.
- **Keep both, document the layering**: rejected. Two caches with divergent bypass conditions and no clear ordering is operational debt the team would carry forever. Single-source eliminates a class of bugs.
- **Move L1 into the adapter layer (port wrapper)**: rejected. The cache key uses `userPreferencesHash` and `museumContext` — both are use-case domain concepts, not adapter concepts. Decorating the port would force these through the port interface, leaking abstraction.

## Related

- Spec: `.claude/skills/team/team-state/2026-05-08-c1-chat-fast/spec.md` (R7, R8, R9, R10, R11, R13).
- Design: `.claude/skills/team/team-state/2026-05-08-c1-chat-fast/design.md` §9 D1.
- Code (L1, retained): `museum-backend/src/modules/chat/useCase/llm/llm-cache.service.ts`.
- Code (L2, **removed in PR-B 2026-05-08**): `museum-backend/src/modules/chat/adapters/secondary/llm/caching-chat-orchestrator.ts` — fichier supprimé ; `grep -rn "CachingChatOrchestrator" museum-backend/src` retourne zéro.
- Composition root: PR-B a retiré le wrapper L2 ; l'orchestrateur est désormais instancié direct (`LangChainChatOrchestrator`, `museum-backend/src/modules/chat/chat-module.ts:698`).
- Tests (L1): `museum-backend/tests/unit/chat/llm-cache.service.ts`.
- Integration test (admin invalidation, both context classes — PR-A T1.11): `museum-backend/tests/integration/admin/admin-museum-cache-invalidation.integration.test.ts` (NEW).
- Pipeline spans test (PR-A T1.10): `museum-backend/tests/integration/chat/chat-pipeline-spans.integration.test.ts` (NEW).

## Amendments

> Append-only. Each TTL or contract change records its data justification here. Reviewer enforces R13 — TTL changes without a bake screenshot are blocked.

- _none yet._
