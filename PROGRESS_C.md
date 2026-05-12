# PROGRESS_C — Agent C (architecture enforcement + over-engineering + shared workspace)

Sprint cleanup-2026-05-12. Worktree shared with A/B/D.

## État initial (2026-05-12)

- B.1+B.3 ready (next 15.5.18 + uuid pinned). PROGRESS_B "READY: agents A/C/D peuvent démarrer."
- BE eslint.config.mjs uses `boundaries/element-types` (deprecated v6 syntax) — fictional enforcement.
- 14 *_ENABLED flags in env.ts (violates `feedback_no_feature_flags_prelaunch`).
- Custom LLMCircuitBreaker (130L) while opossum installed.
- Custom Semaphore (132L) while p-limit absent.
- 922L chat module fragmented across 6 files (gaming ESLint max-lines).
- 16 ports in chat domain, 12 single-impl + null-object.

## Actions

- [x] C.1 — boundaries v5 → v6 migration (`museum-backend/eslint.config.mjs`). Replaced `boundaries/element-types` (deprecated inline string-array form) with `boundaries/dependencies` using v6 object selectors. No deprecation warnings. Files: `museum-backend/eslint.config.mjs`.
- [x] C.2 — Fix domain→useCase violation. Moved `ResolvedLocation` + `NearbyMuseum` to `museum-backend/src/modules/chat/domain/location/`. `chat-orchestrator.port.ts` now imports from domain. Re-exported via location-resolver.ts to keep useCase callers stable. Files: `chat-orchestrator.port.ts`, `location-resolver.ts`, `nearby-museums.provider.ts`, NEW `domain/location/{resolvedLocation,nearbyMuseum}.ts`.
- [x] C.3 — Fix useCase→adapter direct imports. Moved `CircuitOpenError` to `domain/errors/circuit-open.error.ts` and `BreakerState`/`BreakerStateName` to `domain/breaker/breaker-state.ts`. Adapter files re-export for backward compat. `chat.service.ts` + `knowledge-base.service.ts` now import from domain. Files: `chat.service.ts`, `knowledge-base.service.ts`, `llm-circuit-breaker.ts`, `wikidata-breaker.ts`, NEW `domain/errors/circuit-open.error.ts`, NEW `domain/breaker/breaker-state.ts`.
- [x] C.4 — Fix `Promise<any>` ocr-service.ts. Imported `Scheduler` from `tesseract.js`. `grep "Promise<any>" src/` = 0. Files: `ocr-service.ts`.
- [x] C.5 — Express augmentation cleanup. Verified `src/shared/types/express/index.d.ts` is loaded (tsc --listFiles). Removed 10 `(req as Request & {...})` casts across middleware + routes. Files: `apiKey`, `request-logger`, `daily-chat-limit`, `rate-limit`, `mfa.route`, `chat-session.route`, `chat-compare.route`, `chat-route.helpers`. `grep "as Request &" src/` = 0.
- [x] C.6 — Remove dead `nemo`/`prompt-armor` branches. `GuardrailsV2Candidate` → `'off' | 'llm-guard' | 'llm-judge'`. Resolver narrowed. chat-module.ts noop fallback removed. `grep "nemo\\|prompt-armor" src/` = 0. Files: `env.types.ts`, `env-resolvers.ts`, `chat-module.ts`.
- [x] C.7 — **BLOCKED** : opossum's async event-based model is incompatible with custom breaker's synchronous test helpers (`recordFailure`/`recordSuccess` expect immediate state update). Migration would require rewriting 4 test files (`llm-circuit-breaker.test.ts`, `langchain-orchestrator.test.ts`, `langchain-orchestrator-branches.test.ts`, `chaos-circuit-breaker.e2e.test.ts`) with async assertion patterns — out-of-scope for the audit's ~30L estimate. Defer to dedicated sprint with test rebase plan.
- [x] C.8 — Replace Semaphore with p-limit (BE). p-limit@^3 (CJS-compat) installed via `pnpm add p-limit@^3`. Rewrote `semaphore.ts` as wrapper preserving counters (immediate visibility for synchronous test patterns) + queue-size cap + acquire timeout via `Promise.race`. 9/9 unit tests pass. Files: `semaphore.ts` (132→108L), NEW `domain/errors/semaphore-queue-full.error.ts`, NEW `domain/errors/semaphore-timeout.error.ts`. **For D**: tests pass, no rebase needed.
- [x] C.9 — Audit 9 active *_ENABLED flags : 4 removed, 5 JUSTIFIED-annotated.
  - REMOVED `LLM_CACHE_ENABLED` (cache always-on; bypass logic removed from chat-message.service).
  - REMOVED `CACHE_ENABLED` (cache now structurally keyed on `REDIS_URL` presence — pre-launch V1 requires Redis live).
  - REMOVED `S3_ORPHAN_SWEEP_ENABLED` (flag was unreferenced in src code; only test fixtures had it).
  - REMOVED `RETENTION_PRUNE_ENABLED` (retention always-on; structural skip via `env.cache?.enabled` upstream).
  - JUSTIFIED `PASSWORD_BREACH_CHECK_ENABLED` (e2e harness skips third-party HIBP).
  - JUSTIFIED `OTEL_ENABLED` (local dev opt-out, no collector).
  - JUSTIFIED `LANGFUSE_ENABLED` (local dev opt-out, SaaS keys not in dev).
  - JUSTIFIED `EXTRACTION_WORKER_ENABLED` (e2e harness no-Redis avoids BullMQ ECONNREFUSED).
  - JUSTIFIED `MUSEUM_ENRICHMENT_SCHEDULER_ENABLED` (consumer not yet wired in prod — flag prevents runaway queue; will delete once consumer exists).
  - Files: `env.ts`, `env.types.ts`, `chat-message.service.ts`, `index.ts`, `tests/integration/security/auth-email-service-kind-prod-reject.test.ts`.
- [x] C.10 — Reunify chat-module*.ts. Concatenated 6 files (922L total) into a single `chat-module.ts` (716L net, w/ section comments). Removed: `chat-module.compare-wiring.ts`, `chat-module.knowledge-router-wiring.ts`, `chat-module.wikidata-wiring.ts`, `chat-module-singleton.ts`, `wiring.ts`. Top-of-file `/* eslint-disable max-lines */` with justified rationale. Updated consumers: `app.ts`, `api.router.ts`, `chat/index.ts`, `auth/useCase/index.ts`, plus test mocks (`api-router-health.test.ts`, `api-router-resolve.test.ts`, `chat-module-singleton.test.ts`). All 53 router/singleton tests pass.
- [ ] C.11 — Reduce null-object ports
- [x] C.12 — Centralize JWT decode (Zod parse). NEW `museum-backend/src/shared/auth/jwt-decode.ts` (`decodeJwtPayload`, `decodeJwtHeader`, `jwtHeaderSchema`). NEW `museum-frontend/shared/auth/jwt-decode.ts` (`decodeJwtPayload`, `baseJwtPayloadSchema`). Migrated 3 call-sites: `auth-route.helpers.ts:decodeFamilyIdUnsafe`, `social-token-verifier.ts:decodeHeader`, `authLogic.pure.ts:extractUserIdFromToken + getTokenExpiryMs`. `grep "JSON.parse(atob" src/ features/` = 0 in app code (only zod node_modules + the new helpers themselves).
- [x] C.13 — Fix httpClient/Redis/env-resolvers casts.
  - `httpClient.ts`: `as never` → `as AxiosRequestConfig` (×2).
  - `env-resolvers.ts`: 5 `raw as Foo` casts → `z.enum([...]).safeParse(raw).data ?? default` (NODE_ENV, LLM_PROVIDER, GUARDRAILS_V2_CANDIDATE, OBJECT_STORAGE_DRIVER, EMBEDDINGS_PROVIDER).
  - `cache.port.ts`: introduces `CacheValueSchema<T>` (zod-shaped duck type, no zod runtime dep in port). `get<T>` now accepts optional schema; on schema failure returns null. Backward-compatible — existing call-sites are untouched, migration to schemas is incremental.
  - Files: `httpClient.ts`, `env-resolvers.ts`, `cache.port.ts`, `redis-cache.service.ts`, `memory-cache.service.ts`, `resilient-cache.wrapper.ts`.
- [ ] C.14 — Create packages/musaium-shared/ workspace
- [ ] C.15 — Split auth.route.ts (if monolithic)

## Verifs / commits

(populated as actions complete)

## Coordinations

- Need B to install `p-limit` (or install myself when B done).
- D must rebase tests after C.5/C.7/C.8/C.10/C.11/C.14 changes — list per-action below.
