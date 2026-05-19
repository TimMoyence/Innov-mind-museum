---
runId: 2026-05-17-w3-geo-walk-intra
mode: feature
pipeline: enterprise
completedAt: 2026-05-18T00:00:00Z
durationMs: 86400000
correctiveLoops: 1
costUSD: 2.2134
tags:
  - feature
  - enterprise
  - mission
  - features
  - clusters
---

# Lesson — 2026-05-17-w3-geo-walk-intra

## Trigger

- input: user mission (8 features, 4 clusters A/B/C/D, deadline 2026-05-20 EOD for test weekend 2026-05-23/24)
- output: spec.md (148 lines, 23 EARS R1-R23, 6 open questions all NON-BLOCK)
- APC: MISS, cold plan (fingerprint 8bf8fc58...)
- decisions:
  - hybrid PostGIS-or-JSONB single migration auto-detecting extension (D1)
  - confidence model: 1.0 geofence-hit, else max(0, 1-distance/500), rounded 2 dec (D2)
  - QR scheme `musaium://museum/<uuid>/artwork/<uuid>?room=<uuid>` UUID v4 (D3)
  - refactor `useProactiveMuseumSuggestion` (don't create new hook — UFR-016 reuse) (D4)
  - W1.6b SigLIP DEFERRED — only `artwork_knowledge.roomId` column prep this run (D5)
- open questions handed to user:
  - Q1 (non-block): pilot museum geofence coords TBD — editor pings before T1.2 seed migration
  - Q2 (non-block, mitigated): PostGIS availability on prod VPS — hybrid migration auto-detects
  - Q3-Q6: editor judgement / external logistics / no decision needed

## What worked

- scope: READ-ONLY verification of BE+FE editor outputs (3 editor spawns). Ran all gates with `;` (no short-circuit). No edits, no git mutations.
- preface: STORY.md has implement sections #1 (Phase 1+2 BE) and #2 (Phase 3+4 FE), then a security audit section. **No implement #3 section was appended** by the Phase 5+6 editor — but Phase 5 work IS present in the worktree (chat-session route patch, update-session-context use-case + Zod schema, scripts/generate-qr-cartels.cjs, fixtures/pilot-artworks.csv, .maestro/chat-cartel-deeplink.yaml, llm-prompt-builder `[CURRENT ARTWORK]` section, prepare-message.pipeline resolveCurrentArtwork, sanitizeCartelCode parseMusaiumDeeplink). The security agent appears to have audited Phase 5 in place of an editor-side narrative — STORY.md append-only integrity is OK (no prior section rewritten) but PHASE 5 NARRATIVE IS MISSING.

### BE verification

| Gate | Result |
|---|---|
| `pnpm lint` | PASS (eslint --max-warnings=0 + lint:test-discipline + tsc --noEmit all clean). |
| `pnpm openapi:validate` | PASS — 76 paths, 85 operations, Musaium API v1.1.1. |
| `pnpm test:contract:openapi` | PASS — 2 tests / 1 suite green. |
| `pnpm test` | **FAIL** — 442 suites total: 431 pass, 11 fail, 15 skipped. Test counts 5598 pass, 101 fail, 2 todo, 99 skipped. Two distinct root causes (see breakdown below). |

**BE test failures — root cause analysis (2 clusters):**

1. **CLUSTER A (8 integration suites) — SAVEPOINT migration regression (NEW, W3-caused).**
   - `tests/integration/_smoke/integration-harness.smoke.test.ts`, `tests/integration/db/migration-round-trip.test.ts`, `tests/integration/db/migrations/add-artwork-embeddings.test.ts`, `tests/integration/db/migrations/add-user-tier.test.ts`, `tests/integration/security/auth-email-service-kind-prod-reject.test.ts`, `tests/integration/chat/visual-similarity/{catalog-ingest,artwork-embedding-repository}.test.ts`, `tests/integration/chat/wikidata-kb-dump-repository.test.ts`.
   - Verbatim error: `QueryFailedError: SAVEPOINT can only be used in transaction blocks` at `1779051738966-AddMuseumGeofence.ts:36` → `await queryRunner.query('SAVEPOINT postgis_probe')`.
   - Diagnosis: integration harness calls `runMigrations({ transaction: 'none' })` (`tests/helpers/integration/integration-harness.ts:71`). Each migration is therefore NOT wrapped in an outer Postgres transaction. The W3 migration assumes a wrapping per-migration transaction exists when it issues `SAVEPOINT`. With `transaction: 'none'`, there is no outer transaction → Postgres rejects `SAVEPOINT` with the error above. Editor #1's "gotcha" note covers 25P02 inside-transaction, but missed the no-transaction case entirely. **This is a real W3 regression that blocks every integration test that uses the harness, not just the W3 migration's own test.**
   - Fix sketch (for editor #4 corrective loop): wrap the SAVEPOINT block in a runtime check `if (queryRunner.isTransactionActive) … else await queryRunner.startTransaction()` + `commitTransaction()`; OR set `transaction = false` on the migration class + use a try/catch around `CREATE EXTENSION` without SAVEPOINT (since with no outer txn, `CREATE EXTENSION` failure cannot poison anything). The latter matches the simpler design.D1 path.

2. **CLUSTER B (2 unit suites) — chat-module mock missing `getUpdateSessionContextUseCase` (NEW, W3-caused).**
   - `tests/unit/shared/routers/api-router-health.test.ts` + `tests/unit/shared/routers/api-router-resolve.test.ts`.
   - Verbatim error: `TypeError: (0 , _chatmodule.getUpdateSessionContextUseCase) is not a function` at `buildApp (tests/unit/shared/routers/api-router-health.test.ts:311)` → `api.router.ts:363` calls `getUpdateSessionContextUseCase()`.
   - Diagnosis: `src/shared/routers/api.router.ts:22,363` imports + invokes `getUpdateSessionContextUseCase` from `@modules/chat/chat-module`. `chat-module.ts:872` does export it (verified). But the Jest mock in the two failing test files (`jest.mock('@modules/chat/chat-module', ...)` at api-router-health.test.ts:198-230, same shape mirrored in api-router-resolve.test.ts) does NOT declare `getUpdateSessionContextUseCase` among its mocked exports. Result: the SUT calls `_chatmodule.getUpdateSessionContextUseCase(...)` which evaluates to `undefined` → TypeError. **The editor that added Phase 5 routing forgot to extend these two unit-test mocks.**
   - Fix sketch: add `getUpdateSessionContextUseCase: () => undefined,` (or stub use-case return) to the chat-module mock objects in both test files.

### FE verification

| Gate | Result |
|---|---|
| `npm run lint` | PASS (eslint --max-warnings=0 + tsc --noEmit clean). |
| `npm test` | **WARN** — 272 suites total: 271 pass, 1 fail. 2901 tests: 2899 pass, 2 fail. The 2 failures are in `__tests__/app/onboarding.test.tsx` (`Done on slide 3` and `Done on slide 4`) — `mockMarkOnboardingComplete` expected to be called once but received 0 calls. **Pre-existing failures, unrelated to W3** — file is unchanged in `git status` and was added/fixed in start commit `6c39e9365 fix(mobile): unblock signup form + clean route warnings + guard onboarding API`. Verifier did NOT touch them. |
| `npm run check:openapi-types` | **FAIL** — `git diff --exit-code` on `shared/api/generated/openapi.ts` after regen returned exit 1. Regen ADDS `/api/chat/sessions/{id}/context` path, `/api/museums/detect-museum` path, `UpdateSessionContextRequest`, `UpdateSessionContextResponse`, `MuseumDetectionResult` schemas, plus the `updateSessionContext` + `detectMuseum` operations interface — none of which were in the committed FE openapi.ts file. **The committed FE OpenAPI types are out of sync with the BE openapi.json**: the editor who regenerated after Phase 2 must have done it before Phase 5 BE additions (or regen never ran for Phase 5). Verifier did not commit the regen — re-run `npm run generate:openapi-types` then commit. |

### Spec ↔ implementation alignment (R1-R23 EARS)

Spot-checked all 23 requirements against worktree files:

| R | Status | Evidence |
|---|---|---|
| R1 | PASS | `museum.route.ts` has `GET /detect-museum` (verified by grep `detect-museum` in openapi.json + 200-response contract test). |
| R2 | PASS | `detect-museum.useCase.test.ts` (created) covers geofence-hit confidence=1.0 (per editor #1 STORY claim, file present). |
| R3 | PASS | Same useCase test covers 5 confidence buckets (0/100/200/250/500/600m per design D2). |
| R4 | PASS | Same useCase test covers far-away null path. |
| R5 | PASS | `detect-museum.route.test.ts` 400 + `schemas.test.ts` (9 cases NaN/range/missing). |
| R6 | PASS | `nominatim-langfuse-span.test.ts` exists, 5 cases (hit/miss/error/cached + histogram). |
| R7 | PASS | Same span test asserts Prom counter. |
| R8 | **PARTIAL FAIL** | Migration exists and is hybrid as designed, but the SAVEPOINT idiom breaks under `transaction: 'none'` — fails CI integration runs. |
| R9 | PASS | `MuseumRepositoryPg.findByCoords` exists w/ dual path; unit test in `museum-repository.test.ts`. |
| R10 | PASS | Route mounts 30/min byUserId limiter; `detect-museum.route.test.ts` asserts 429. |
| R11-R14 | PASS | `useStartConversation.autoDetect.test.ts` covers; `useDetectMuseum.test.tsx` covers; ProactiveMuseumBanner has confirm-sheet for (0.5,0.8]; picker fallback wired. |
| R15-R18 | PASS | `MuseumPickerScreen.test.tsx` (7 cases), `favourites.test.ts` (11 cases), i18n FR=EN parity (9 keys per editor #2 report). |
| R19 | PASS | `parseMusaiumDeeplink` in `sanitizeCartelCode.ts`, UUID v4 regex, tests extended; FE `chatApi.metadata.setContext` exists. |
| R20 | PASS | BE Zod `updateSessionContextSchema` mirrors UUID v4 regex (`chat-session.schemas.ts:157` per security audit). |
| R21 | PASS | `scripts/generate-qr-cartels.cjs` exists (5.9 KB), `fixtures/pilot-artworks.csv` present (460 B). Manual visual PDF check NOT performed by verifier (out of scope tooling). |
| R22 | PASS | `llm-prompt-builder.ts` emits `[CURRENT ARTWORK]` before `[END OF SYSTEM INSTRUCTIONS]`; `prepare-message.pipeline.ts:resolveCurrentArtwork` plumbs `currentArtwork`; unit test in `tests/unit/chat/llm-prompt-builder.test.ts` (modified). |
| R23 | DEFERRED (intentional, per spec) | No findArtworkByImage scaffolding — correct per design D5. |

**EARS unmet: R8 (migration SAVEPOINT regression — fails CI even though BE-side test against pgvector image happens to pass per editor #1).**

### Scope verification vs design §2

git status touches **64 files** (85 lines, both modified + untracked + new). Spot check against design §2 module touch list:

| Surprise | Status |
|---|---|
| `chat.route.ts` modified | EXPECTED — wires `update-session-context.useCase` (T5.3 implicit). |
| `chat-message.service.ts` modified (+4 lines) | EXPECTED — adds `currentArtwork` plumb-through (T5.4 wiring). |
| `chat.service.ts` modified (+8 lines) | EXPECTED — same as above. |
| `prepare-message.pipeline.ts` modified (+53 lines `resolveCurrentArtwork`) | EXPECTED — T5.4 data flow (resolves artwork_knowledge row before LLM prompt). Design §2 only mentioned `llm-prompt-builder.ts` but the data-flow has to go SOMEWHERE; this is the lightest landing site. WARN-MINOR. |
| `chat-orchestrator.port.ts` modified (+14 lines) | EXPECTED — type extension for `currentArtwork`. |
| `chat.repository.typeorm.ts` modified | EXPECTED — `updateSessionContext` repo method (T5.3). |
| `chat.repository.interface.ts` modified | EXPECTED — port for above. |
| `artwork-knowledge-repo.port.ts` + `typeorm-artwork-knowledge.repo.ts` modified | EXPECTED — used by resolveCurrentArtwork. |
| `app/(stack)/chat/[sessionId].tsx` modified | EXPECTED — wires deeplink scan to chatApi.setContext. |
| `bottom-sheet-router/routes.ts` modified | EXPECTED — picker fallback nav. |
| `museum-frontend/shared/lib/dateOfBirth.ts:71` (`String(year)` cast) | UNRELATED out-of-scope micro-edit; editor #1 self-flagged as UFR-006 exception. WARN. |
| `CLAUDE.md` + `docs/ROADMAP_PRODUCT.md` modified | EXPECTED for T6.1 roadmap tick — but verifier did NOT verify content matches doctrine. |

Surprise modules > 3 outside design? NO. All "surprises" are direct consequences of T5.3/T5.4 wiring (LLM prompt section needs upstream pipeline plumbing) or self-flagged micro-edits. PASS (with minor WARN).

### STORY.md append-only

PASS — prior implement #1 + implement #2 + security sections intact. **Editor #3 (Phase 5+6) narrative MISSING** — STORY.md jumps from implement #2 → security audit without an editor #3 phase log. WARN, not FAIL — work IS in the tree and was audited, but provenance + decisions for Phase 5 are not captured in the run log. Recommend the editor #3 spawn append a retrospective section before merge.

### Verdict

**FAIL** — corrective loop required. Two NEW W3-caused regressions block green CI:
1. SAVEPOINT migration kills 8 integration test suites (R8 partial fail).
2. chat-module mock missing breaks 2 api-router unit suites.
3. FE openapi.ts committed in stale state vs BE openapi.json (npm check fails).

Corrective workload estimate (solo dev): 30-60 min.

## What failed

- scope: 5-axes review of full W3 worktree (BE + FE + migrations + OpenAPI + tests + i18n + script). Fresh context — read spec/design/tasks/STORY + ~20 implementation files end-to-end. No editor work-product in system prompt.
- verdict: **APPROVED** — weightedMean 90.2, zero blockers, two important non-blocking findings (open as TECH_DEBT).

### Scores

| Axis | Score |
|---|---|
| Spec ↔ implementation alignment (R1-R23) | 92 |
| KISS / DRY / hexagonal | 85 |
| Security | 92 |
| Test discipline | 92 |
| Honesty / discipline (UFR-013) | 90 |

**Weighted mean: 90.2** → APPROVED (≥ 85).

### Gates

| Gate | Verdict | Evidence |
|---|---|---|
| a11y | PASS | Every Pressable in `MuseumPickerScreen.tsx` + `ProactiveMuseumBanner.tsx` has `accessibilityRole` + `accessibilityLabel`. Confirm sheet has `accessibilityRole="alert"`. Dismiss has `hitSlop={12}`. |
| Design system | PASS | New components import `radius`, `semantic`, `space` from `@/shared/ui/tokens` + `useTheme()`. No hardcoded hex. |
| Security grep | PASS | `[CURRENT ARTWORK]` placed BEFORE `[END OF SYSTEM INSTRUCTIONS]` (`llm-prompt-builder.ts:163-171`). Title sanitised via `sanitizePromptInput`. UUID v4 regex defence-in-depth (FE parser + BE Zod). Rate limiter added on PATCH context (MED-1 fix). No raw lat/lng in logs — `round3()` everywhere. |
| KISS / DRY / hexagonal | PASS (minor) | Domain pure, use-cases pure, adapters thin. One minor inefficiency in `DetectMuseumUseCase.execute` (double `findAll`) — flagged IMP-1, deferrable. |

### Findings

**Blocker (0):** none.

**Important (2, non-blocking):**
- **IMP-1** `DetectMuseumUseCase.execute()` calls `findAll` twice on the haversine path (`detect-museum.useCase.ts:73-79`). `findNearbyMuseums` returns `{name, distance}` without ids, forcing a second `findAll` to recover `museumId`. Fix: extend `NearbyMuseum` return shape with `id`. Defer post-launch.
- **IMP-2** PostGIS path UNTESTED against live `postgis/postgis:16` image. Dev / CI only exercise the JSONB fallback (pgvector image lacks postgis). Spec Q2 still open. Run `pnpm migration:run` against a one-shot postgis container before prod merge, or document in deploy runbook.

**Minor (4):**
- **MIN-1** Module-level `cachedGeofenceMode` singleton has no invalidation. Service restart required after a post-deploy geofence migration. Document in docstring or 30s TTL.
- **MIN-2** Pilot geofence seed migration was a no-op in dev (slugs absent). Re-coordination with W4 worktree needed once slugs land.
- **MIN-3** Editor #3 STORY section reconstructed retrospectively by editor #4 (UFR-013 honesty flagged). Future runs need a dispatcher post-edit hook enforcing STORY append.
- **MIN-4** GitNexus `detect_changes` never invoked per CLAUDE.md doctrine. Run `npx gitnexus analyze` post-merge to re-index W3 symbols.

**Nice-to-have (2):**
- **NTH-1** Extend `sanitizePromptInput` to neutralize `[END OF SYSTEM INSTRUCTIONS]` substring or strip `[`/`]`. Audit LOW-1 — TECH_DEBT.
- **NTH-2** `geoDetectMuseumTotal.labels('miss').inc()` on exception conflates "no match" with "throw". Add an `'error'` label or parallel error counter.

### EARS coverage spot-check

| R | Status |
|---|---|
| R1-R10 (Cluster A — BE Geo) | PASS — route + schema + use-case + repo + migration + observability all in place; 12 use-case tests + 5 route tests + 9 schema tests + 5 nominatim span tests. |
| R11-R14 (Cluster B — FE Geo) | PASS — `useDetectMuseum` + `useStartConversation.autoDetect` (opt-in flag preserves backward compat) + ProactiveMuseumBanner confirm-sheet for (0.5, 0.8] band + picker fallback wired. |
| R15-R18 (Cluster C — FE Walk UX) | PASS — MuseumPickerScreen with search/favourites/nearby (7 tests), favourites CRUD (11 tests), 9 i18n keys FR=EN parity verified via flat-key diff. |
| R19-R22 (Cluster D — Intra-musée QR) | PASS — `parseMusaiumDeeplink` UUID v4 strict + BE Zod mirror, `[CURRENT ARTWORK]` block w/ counter-marker + sanitised title, `resolveCurrentArtwork` plumbed via `prepare-message.pipeline`, `setSessionContext` API + use case + rate-limited PATCH route. QR script + fixture present. |
| R23 (SigLIP image-position) | DEFERRED — correct per design D5; no scaffolding shipped (UFR-016). `artwork_knowledge.roomId` column shipped as bridge. |

### Test discipline

- BE: 5699/5800 tests pass (99 skipped, 2 todo, 0 W3 failures). All W3 unit tests use shared factories (`makeMuseum`, `makeMuseumRepo` from `tests/helpers/museum/museum.fixtures`). Zero new inline `as Museum` / `as ChatSession` casts in production or test code (only one pre-existing comment in `museum-repository.test.ts:15` referencing past practice).
- FE: 2899/2901 tests pass (2 pre-existing onboarding failures unrelated to W3, file unchanged in run).
- 44+ new BE tests across detect-useCase / route / schemas / nominatim-span. 86+ new FE tests across museum/chat/onboarding.

### Lint discipline

Zero new `eslint-disable` directives in W3 code without an `Approved-by:` justification paragraph. The only pre-existing exempt comments (sanitizeCartelCode.ts:46 `no-control-regex`, llm-prompt-builder.ts:252 `prefer-nullish-coalescing`, useLocation.ts cancellation guards) all have prior justification.

### Honesty discipline

- Editor #4 explicitly flagged 3 verification skips: didn't run `pnpm migration:run` on clean DB (proved via 22 passing integration suites instead), didn't run `pnpm openapi:validate` after FE regen (BE openapi.json untouched), didn't touch 2 pre-existing FE onboarding failures. All defensible.
- Editor #3 STORY section reconstructed retrospectively by editor #4 — honestly flagged. Future runs should enforce STORY append via dispatcher post-hook.
- Verifier section reports verbatim failures + counts. No "all tests pass" sycophancy.

### Caveats noted (per dispatcher brief)

- PostGIS path live-test deferred — JSONB fallback is the deployed branch in dev / CI (IMP-2).
- Pilot museum slugs absent (MIN-2) — coordinate with W4 worktree.
- Editor #3 STORY missing → reconstructed retrospectively (MIN-3 + provenance gap acknowledged).
- GitNexus index stale (MIN-4) — run `npx gitnexus analyze` post-merge.

### Verdict justification

W3 ships a complete vertical slice (8 features × 4 clusters) with strong test coverage, security-audit-clean code, hexagonal discipline preserved, FR=EN i18n parity, no emoji unicode in mobile, RTL-safe layout (no `marginLeft`/`marginRight` in new FE), and full observability (3 Langfuse spans + 4 Prom metrics). Two important findings are deferable TECH_DEBT (efficiency improvement + deploy-time verification step), four minor items are documentation / process tweaks. Zero blockers. Weighted mean 90.2 ≥ 85 → **APPROVED** for merge before 2026-05-20 EOD friends&family deadline.

Reviewer recommends:
1. Open TECH_DEBT entries for IMP-1 + NTH-1 + NTH-2.
2. Add deploy-runbook step "run pnpm migration:run against postgis/postgis:16 container before VPS deploy" (IMP-2).
3. Run `npx gitnexus analyze` post-merge.
4. Coordinate with W4 to ensure pilot slugs land before friends&family weekend.

## Surprises

- scope: Phase 1 (T1.1 → T1.14) + Phase 2 (T2.1 → T2.2) — BE Geo Foundation + wiring. All 16 tasks complete.
- migrations created (4) :
  - `1779051738966-AddMuseumGeofence.ts` — hybrid PostGIS/JSONB w/ SAVEPOINT probe ; falls back to JSONB on `CREATE EXTENSION postgis` failure (25P02 poisoning fix). Dev DB resolved to `jsonb-bbox` (pgvector image lacks PostGIS).
  - `1779051850000-SeedPilotMuseumGeofences.ts` — backfills approximate polygons for `louvre`/`orsay`/`quai-branly`. All 3 slugs absent in current DB → SKIPPED with `console.warn` (per task spec). TODO: re-run once W4 seeds them.
  - `1779051900000-AddChatSessionCurrentRoomAndArtwork.ts` — `current_room` + `current_artwork_id` uuid nullable.
  - `1779051950000-AddArtworkKnowledgeRoomId.ts` — `room_id` uuid nullable (W1.6b prep).
- code added :
  - `museum-detection-result.ts` value-object.
  - `IMuseumRepository.findByCoords` interface method + `MuseumRepositoryPg.findByCoords` (bootstrap-cached PostGIS / JSONB-bbox dual path) + `_resetGeofenceModeCacheForTests` seam.
  - `DetectMuseumUseCase` w/ `computeConfidence` helper, Langfuse span `geo.detect_museum`, Prom counter `geo_detect_museum_total{outcome}`.
  - `detectMuseumQuerySchema` Zod (lat -90..90, lng -180..180, both required, `z.coerce`).
  - `GET /api/museums/detect-museum` route ; mounted BEFORE `/:idOrSlug` ; 30/min rate-limit `byUserId` ; auth-required.
  - Nominatim Langfuse spans (`geo.nominatim.reverse`) on live + cached paths ; Prom counter `nominatim_requests_total{outcome}` + histogram `nominatim_request_duration_seconds`. Coords logged at 3-dec precision (UFR-013/GDPR).
  - OpenAPI spec: `/api/museums/detect-museum` path + `MuseumDetectionResult` schema. `pnpm openapi:validate` PASS, contract tests PASS.
  - Composition root: `detectMuseumUseCase` instantiated in `museum/useCase/index.ts`, exported via `museum/index.ts`, wired in `api.router.ts` deps.
  - FE OpenAPI types regenerated via `npm run generate:openapi-types` — adds `/api/museums/detect-museum` path + `MuseumDetectionResult` schema to `museum-frontend/shared/api/generated/openapi.ts`.
- entity updates :
  - `Museum.geofenceBbox` (`@Column jsonb select: false`). `geofence` (geometry) intentionally NOT modelled — read via raw `dataSource.query()` only, declaring it would cause TypeORM drift on JSONB-mode environments.
  - `ChatSession.currentRoom` + `currentArtworkId` (uuid nullable).
  - `ArtworkKnowledge.roomId` (uuid optional).
- tests added (44 new tests, all pass) :
  - `museum-repository.test.ts` +6 cases (postgis/jsonb/absent/cache).
  - `detect-museum.useCase.test.ts` 12 cases (confidence formula 5 buckets + geofence precedence + miss + counter assertions).
  - `schemas.test.ts` 9 cases (lat/lng range + missing).
  - `detect-museum.route.test.ts` 5 cases (401/400/200/429).
  - `nominatim-langfuse-span.test.ts` 5 cases (hit/miss/error/cached span + histogram).
- existing test factories updated : `inMemoryMuseumRepository.findByCoords` (jsonb-bbox mirror), `makeMuseumRepo({findByCoords:jest.fn})`, `makeMockDataSource({query:jest.fn})`. No inline test entities.
- verify-clean status : `node scripts/migration-cli.cjs generate --name=Check` → output contains ONLY pre-existing schema drift (totp_secrets constraints, artwork_embeddings.embedding halfvec→text, IDX_users_deleted_at, CHK_users_tier). **ZERO references to our 4 new migrations or entity changes.** Pre-existing drift is independent tech debt.
- hooks run: 4 lint hooks (1 fail w/ pre-existing FE dateOfBirth.ts warning, fixed minimally w/ `String(year)`, then PASS) ; 4 typecheck hooks all PASS.
- one out-of-scope micro-edit: `museum-frontend/shared/lib/dateOfBirth.ts:71` — `${year}` → `${String(year)}` to clear a pre-existing `@typescript-eslint/restrict-template-expressions` warning that blocked the FE lint gate after our `openapi.ts` regen put the file in the dirty diff. UFR-006 exception documented.
- gotcha discovered : `CREATE EXTENSION` inside per-migration transaction wraps fails with Postgres 25P02 "current transaction is aborted" on the next statement. Fix = wrap probe in `SAVEPOINT postgis_probe` + `ROLLBACK TO SAVEPOINT` on catch. Avoided `public readonly transaction = false` to keep the ALTER TABLE atomic.
- editor verdict : COMPLETED ; ready for FE editor spawn for Phase 3+ (FE geo consume + Walk UX + intra-musée QR).


> **Note:** Editor #3 forgot to append this section at the time. Reconstructed by editor #4 from `git diff` and STORY.md verifier section. Provenance for Phase 5 + 6 work landed in the worktree without a narrative.

- scope: Phase 5 (T5.1 → T5.4 — Cluster D intra-musée QR + chat session context) + Phase 6 (T6.x roadmap tick + final wiring).
- BE files added/modified for Phase 5:
  - `museum-backend/src/modules/chat/useCase/session/update-session-context.useCase.ts` (NEW — `UpdateSessionContextUseCase`, ownership-asserted via `ensureSessionAccess`, repo `updateSessionContext` with hasOwnProperty filter forwarded from route).
  - `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-session.route.ts` (+`buildUpdateSessionContextHandler`, +PATCH `/sessions/:id/context` route guarded by `isAuthenticated` + `validateBody`).
  - `museum-backend/src/modules/chat/adapters/primary/http/schemas/chat-session.schemas.ts` (+`updateSessionContextSchema` Zod strict — UUID v4 regex for `currentArtworkId` + `currentRoom`).
  - `museum-backend/src/modules/chat/adapters/primary/http/routes/chat.route.ts` (wire `updateSessionContextUseCase` into `createSessionRouter`).
  - `museum-backend/src/modules/chat/chat-module.ts` (+`getUpdateSessionContextUseCase()` factory at line 872 + composition root wiring).
  - `museum-backend/src/shared/routers/api.router.ts` (+import + call `getUpdateSessionContextUseCase()` at line 363, threaded into chat router deps).
  - `museum-backend/src/modules/chat/data/repositories/chat.repository.typeorm.ts` + interface (+`updateSessionContext` repo method).
  - `museum-backend/src/modules/chat/useCase/orchestration/prepare-message.pipeline.ts` (+`resolveCurrentArtwork` helper — loads `artwork_knowledge` row by id when `currentArtworkId` set on session).
  - `museum-backend/src/modules/chat/useCase/orchestration/chat-orchestrator.port.ts` (+`currentArtwork` field on prompt context).
  - `museum-backend/src/modules/chat/useCase/llm/llm-prompt-builder.ts` (+`[CURRENT ARTWORK]` block before `[END OF SYSTEM INSTRUCTIONS]` marker — title/roomId sanitised via `sanitizePromptInput`).
  - `museum-backend/src/modules/knowledge-extraction/data/repositories/typeorm-artwork-knowledge.repo.ts` + port (+findById method for `resolveCurrentArtwork`).
  - `museum-backend/openapi/openapi.json` (+`/api/chat/sessions/{id}/context` path + `UpdateSessionContextRequest/Response` + `updateSessionContext` operation).
  - `museum-backend/scripts/generate-qr-cartels.cjs` (NEW — CLI script that reads `fixtures/pilot-artworks.csv`, generates `musaium://museum/<uuid>/artwork/<uuid>?room=<uuid>` deeplinks as QR PNGs in a PDF — devDeps `qrcode` + `pdfkit`).
  - `museum-backend/fixtures/pilot-artworks.csv` (NEW — pilot cartel seed, 460 B).
- FE files added/modified for Phase 5:
  - `museum-frontend/features/chat/infrastructure/sanitizeCartelCode.ts` (+`parseMusaiumDeeplink` — strict UUID v4 regex, length cap 256, only `room` query param, rejects javascript:/data:/http: schemes).
  - `museum-frontend/features/chat/infrastructure/chatApi.ts` (+`metadata.setContext` method calling PATCH `/sessions/:id/context`).
  - `museum-frontend/features/chat/ui/CartelScannerSheetContent.tsx` (+deeplink scan handler — invokes setContext + bottom-sheet route nav).
  - `museum-frontend/app/(stack)/chat/[sessionId].tsx` (wires deeplink scan → chatApi.setContext).
  - `museum-frontend/shared/bottom-sheet-router/routes.ts` (cartel-scanner detected-artwork route).
  - `.maestro/chat-cartel-deeplink.yaml` (NEW — Maestro e2e flow for deeplink scan).
- Phase 6: `CLAUDE.md` + `docs/ROADMAP_PRODUCT.md` ticked W3 items at top of the file.
- gotchas inherited / discovered:
  - The `[CURRENT ARTWORK]` block sits BEFORE `[END OF SYSTEM INSTRUCTIONS]` so the LLM treats it as trusted context.
  - `sanitizePromptInput` does NOT strip `[`/`]` chars; mitigated by the counter-marker `[END OF CURRENT ARTWORK]` and length cap 200 (audit LOW-1, deferred to TECH_DEBT).
  - `parseMusaiumDeeplink` mirrors BE Zod regex exactly — defence in depth at the wire.
- gaps left by editor #3 (caught by verifier 2026-05-18T00:55):
  - did NOT add `getUpdateSessionContextUseCase` to the 2 api-router jest mocks (`api-router-health.test.ts` + `api-router-resolve.test.ts`) → 2 unit suites failed.
  - did NOT regenerate FE `openapi.ts` after adding the PATCH path to `openapi.json` → `npm run check:openapi-types` failed.
  - the `SAVEPOINT postgis_probe` idiom in `1779051738966-AddMuseumGeofence.ts` (introduced by editor #1) crashes under `runMigrations({ transaction: 'none' })` — 8 integration suites failed. Editor #3 inherited this gotcha, did not catch it.
  - did NOT add rate-limiter to PATCH /sessions/:id/context (security MED-1).
  - did NOT append this STORY.md section (UFR-013 provenance gap).
- editor #3 verdict (retroactively assessed): PARTIAL — Phase 5 + 6 features ship but 4 gaps need corrective spawn.

## Action items

_no data captured_
