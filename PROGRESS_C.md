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
- [ ] C.4 — Fix `Promise<any>` ocr-service.ts
- [ ] C.5 — Express augmentation cleanup
- [ ] C.6 — Remove dead `nemo`/`prompt-armor` branches
- [ ] C.7 — Replace LLMCircuitBreaker with opossum
- [ ] C.8 — Replace Semaphore with p-limit
- [ ] C.9 — Remove 14 *_ENABLED flags
- [ ] C.10 — Reunify chat-module*.ts
- [ ] C.11 — Reduce null-object ports
- [ ] C.12 — Centralize JWT decode (Zod parse)
- [ ] C.13 — Fix httpClient/Redis/env-resolvers casts
- [ ] C.14 — Create packages/musaium-shared/ workspace
- [ ] C.15 — Split auth.route.ts (if monolithic)

## Verifs / commits

(populated as actions complete)

## Coordinations

- Need B to install `p-limit` (or install myself when B done).
- D must rebase tests after C.5/C.7/C.8/C.10/C.11/C.14 changes — list per-action below.
