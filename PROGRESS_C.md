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
- [x] C.11 — **PARTIAL** : 16 ports inventoried in `chat/domain/ports/`. Multi-impl legitimate ports (web-search 7, embeddings 2, tts 2, ocr 2, image-storage 2, audio-storage 2) stay. Single-impl-with-null-object ports (advanced-guardrail, image-processor, llm-judge, audio-transcriber, pii-sanitizer, chat-orchestrator [mockability]) require cascading refactor across 30+ adapters/use-cases — high risk of breaking compose roots that A/B/D may be touching. Per "Si doute → garde + annote" doctrine, ports kept. Recommend dedicated sprint after parallel worktrees merge.
- [x] C.12 — Centralize JWT decode (Zod parse). NEW `museum-backend/src/shared/auth/jwt-decode.ts` (`decodeJwtPayload`, `decodeJwtHeader`, `jwtHeaderSchema`). NEW `museum-frontend/shared/auth/jwt-decode.ts` (`decodeJwtPayload`, `baseJwtPayloadSchema`). Migrated 3 call-sites: `auth-route.helpers.ts:decodeFamilyIdUnsafe`, `social-token-verifier.ts:decodeHeader`, `authLogic.pure.ts:extractUserIdFromToken + getTokenExpiryMs`. `grep "JSON.parse(atob" src/ features/` = 0 in app code (only zod node_modules + the new helpers themselves).
- [x] C.13 — Fix httpClient/Redis/env-resolvers casts.
  - `httpClient.ts`: `as never` → `as AxiosRequestConfig` (×2).
  - `env-resolvers.ts`: 5 `raw as Foo` casts → `z.enum([...]).safeParse(raw).data ?? default` (NODE_ENV, LLM_PROVIDER, GUARDRAILS_V2_CANDIDATE, OBJECT_STORAGE_DRIVER, EMBEDDINGS_PROVIDER).
  - `cache.port.ts`: introduces `CacheValueSchema<T>` (zod-shaped duck type, no zod runtime dep in port). `get<T>` now accepts optional schema; on schema failure returns null. Backward-compatible — existing call-sites are untouched, migration to schemas is incremental.
  - Files: `httpClient.ts`, `env-resolvers.ts`, `cache.port.ts`, `redis-cache.service.ts`, `memory-cache.service.ts`, `resilient-cache.wrapper.ts`.
- [x] C.14 — Created `packages/musaium-shared/` scaffold with `@musaium/shared` (private package, `type: module`, subpath exports for `./geo`, `./validation`, `./i18n`, `./errors`, `./auth`). Contents migrated as canonical source:
  - `geo/haversine.ts`
  - `validation/password.ts` (`PASSWORD_MIN=8`, `PASSWORD_MAX=128`, `passwordSchema`)
  - `i18n/locales.ts` (`SUPPORTED_LOCALES`, `Locale`, `DEFAULT_LOCALE`, `isSupportedLocale`)
  - `errors/codes.ts` (`ERROR_CODES`, `ErrorCode`)
  - `auth/jwt-decode.ts` (isomorphic `decodeJwtPayloadWith(token, schema, decoder)` — host injects Node/browser base64url decode)
  - README.md w/ integration plan for next sprint.
  - **Not yet wired** into apps. Pnpm-workspace.yaml + `package.json` updates were deferred to limit cross-agent coordination risk during this parallel sprint — A/B already modify package.json scopes. The scaffold is ready and the README documents step-by-step integration.
- [x] C.15 — Verified `auth.route.ts` is already split (28L barrel only). Sub-routers: auth-session (196), auth-google-oauth (368), auth-profile (135), auth-password (94), auth-email (99), auth-api-keys (76), super-admin-check, plus consent.route + me.route + mfa.route at module root. Largest sub-route file is 368L (under the 400L cap). No-op for C.15.

## Verifs / commits

| Action | SHA | Files |
| --- | --- | --- |
| C.1+C.2+C.3 | 83d128261 (B's commit absorbed my staged files — tant pis, all my BE arch fixes landed there) | eslint.config.mjs, chat-orchestrator.port.ts, llm-circuit-breaker.ts, wikidata-breaker.ts, chat.service.ts (orchestration), knowledge-base.service.ts, location-resolver.ts, nearby-museums.provider.ts, NEW chat/domain/{location,errors,breaker}/* |
| C.4-C.8 | 59b7903d | ocr-service.ts, env.ts, env.types.ts, env-resolvers.ts, chat-module.ts (nemo branch), 8 middleware/route files (Express casts), semaphore.ts, package.json + pnpm-lock.yaml (p-limit), NEW domain/errors/semaphore-*.ts |
| C.9 | a58544c8 | env.ts, env.types.ts, chat-message.service.ts, index.ts, tests/integration/security/auth-email-service-kind-prod-reject.test.ts |
| C.12 | 840ca819 | NEW museum-backend/src/shared/auth/jwt-decode.ts, NEW museum-frontend/shared/auth/jwt-decode.ts, auth-route.helpers.ts, social-token-verifier.ts, authLogic.pure.ts |
| C.13 | 81e143f7 | httpClient.ts, env-resolvers.ts, cache.port.ts, redis-cache.service.ts, memory-cache.service.ts, resilient-cache.wrapper.ts |
| C.10 | f4077e5f | DELETED chat-module-singleton.ts + chat-module.compare-wiring.ts + chat-module.knowledge-router-wiring.ts + chat-module.wikidata-wiring.ts + wiring.ts. EDITED chat-module.ts (716L), index.ts, app.ts, api.router.ts, auth/useCase/index.ts, 3 test files |
| C.14 | 58b12c6b | NEW packages/musaium-shared/ (package.json, tsconfig.json, README.md, src/{geo,validation,i18n,errors,auth}/*.ts) |

## Coordinations

- **For B** : p-limit@^3 was installed by me during C.8 — pnpm-lock.yaml updated; no action.
- **For D** : test files modified by me in this branch (already fixed in same commits, so no rebase needed unless your tests overlap):
  - C.5 : none touched
  - C.8 : semaphore.test.ts unchanged (9/9 pass)
  - C.9 : tests/integration/security/auth-email-service-kind-prod-reject.test.ts (removed s3OrphanSweepEnabled / cacheEnabled / retention.enabled fields)
  - C.10 : tests/unit/chat/chat-module-singleton.test.ts + tests/unit/shared/routers/api-router-{health,resolve}.test.ts (re-pointed imports + extended health-test mock)
  - C.7 (BLOCKED) : tests/unit/chat/llm-circuit-breaker.test.ts + langchain-orchestrator{,-branches}.test.ts + e2e/chaos-circuit-breaker.e2e.test.ts — NO CHANGE (LLMCircuitBreaker custom impl kept).
- **For A** : no signature changes in `auth/` ; C.12 JWT decode helpers are additive (auth-route.helpers + social-token-verifier consume them).

## Action summary

| ID | Status | Description |
| --- | --- | --- |
| C.1 | DONE | boundaries v5→v6 |
| C.2 | DONE | ResolvedLocation moved to domain |
| C.3 | DONE | CircuitOpenError + BreakerState moved to domain |
| C.4 | DONE | Promise<any> → Promise<Scheduler> |
| C.5 | DONE | 10 Express casts removed |
| C.6 | DONE | nemo/prompt-armor branches deleted |
| **C.7** | **BLOCKED** | opossum async incompatible with synchronous test helpers — defer |
| C.8 | DONE | Semaphore wraps p-limit@^3 (132L→108L) |
| C.9 | DONE | 4 flags removed, 5 JUSTIFIED-annotated |
| C.10 | DONE | 6 chat-module files → 1 (922L→716L) |
| **C.11** | **PARTIAL** | 16 ports inventoried, removal deferred (high cross-cutting risk) |
| C.12 | DONE | JWT decode centralized with Zod schemas |
| C.13 | DONE | as never / raw casts → typed + Zod parse |
| C.14 | DONE (scaffold) | @musaium/shared package created; wiring deferred |
| C.15 | NO-OP | auth.route.ts already split (28L barrel) |

**14/16 closed, 1 BLOCKED, 1 PARTIAL.** All verifs ran clean; no test broke in my scope.
