# 07 — Tests quality (inline / mock / e2e)
**Date:** 2026-05-12  **Agent:** AGENT-07

## Verdict

- **BE test quality 0-100: 78** — large, structured, real testcontainer e2e; the bulk is high-quality unit + integration with shared factories. Two structural drags: mock-heavy orchestrator tests inflate "tests=3948 passed" without proportional bug-catching power, and the Stryker mutation report shows a kill rate of ~17.6% (873 killed / 4956 mutants) skewed by 2749 Timeouts that are not counted as kills by the in-house gate. Banking-grade hot files are guarded explicitly via `killRatioMin=80%`.
- **FE test quality 0-100: 72** — 219 test files, well-factored helpers, 6 factories covering generated OpenAPI types, no `as Entity` / `.only` / weak-assertion violations. Pyramid is honest (no FE integration tier worth the name — only 1 file in `__tests__/integration/`). 15 Maestro flows in 4 shards is the actual E2E layer.
- **Web test quality 0-100: 70** — 29 Vitest files + 15 Playwright e2e (admin flows + a11y). The Vitest layer is small but targeted (scoped coverage at `src/lib/**`, admin/shared slices). Snapshot tests deliberately replaced by role-query/behaviour tests per ADR-012 — explicit anti-theater discipline visible in code.
- **Pyramid health 0-100: 65** — BE pyramid is INVERTED at the unit/integration boundary: 333 unit but only 29 integration and 20 e2e for a ~25k-symbol codebase. CI baseline cap on "fake integration" tests (11 entries — unit tests living in `tests/integration/` because they mock the infra seam) is enforced via a sentinel, which is rare maturity, BUT the actual integration tier is thin. FE pyramid is essentially `unit + RN-component + Maestro` with no real integration tier — defensible for an Expo app but the gap is real.

**Honest read.** 3948 passing tests is impressive on paper. Closer look: ~30-40% of BE unit tests are mock-heavy orchestrator/router scaffolding where the test verifies the test setup (mock interactions), not behaviour. The Stryker incremental report has more Timeouts (2749) than Killed mutants (873) — that's a signal the test harness is more correctness-of-shape than correctness-of-logic on slow code paths. That said, the team has *exactly* the right defensive scaffolding: ESLint plugin baseline, hot-files Stryker gate, integration-tier sentinel cap, mutation-killers folder reserved + empty, property tests on the right surface (sanitize-prompt-input), `describe.skip` with TODO blocks for known-bypasses. The chaff is real but the wheat is also real, and the scaffolding to prevent regression is in place. Below launch-V1 risk threshold.

## Method

Numbers counted (one-shot greps; not running suites):

| Metric | BE | FE | Web |
|---|---|---|---|
| Test files | 391 | 219 (jest) + 15 (node) | 29 (Vitest) + 15 (Playwright) |
| `it/test(` lines (rough test cases) | 4699 | 2103 | 237 + Playwright |
| Files w/ `jest.mock` / `vi.mock` | 115 | 135 | n/a |
| Inline factory violations outside `/helpers/` | 7 | 0 | 0 |
| `describe.skip` / `it.skip` (non-`shouldRunE2E` gated) | 5 hard skips | 0 | 0 |
| `.only` / `fit` checked in | 0 | 0 | 0 |
| `toBeDefined()` / `toBeTruthy()` / `toBeFalsy()` | 154 occurrences in 65 files | 0 | scattered |
| `as unknown as` / `as any` in test files (excl. helpers) | 170 | 50 | minimal |
| `setTimeout` in tests | 30+ occurrences across ~15 files | 24 | n/a |
| Property-based tests (fast-check) | 1 file (`sanitize-prompt-input.property.test.ts`) | 0 | 0 |
| Snapshot files (.snap) | 0 | 4 | 0 |
| TODO/FIXME in tests | 2 files | 0 | 0 |

Modules sampled in depth: `tests/unit/chat/langchain-orchestrator.test.ts`, `tests/unit/chat/orchestrator-router-threading.spec.ts`, `tests/unit/chat/user-memory-entity.test.ts`, `tests/unit/security/prompt-injection.test.ts`, `tests/unit/chat/chat-media-tts-voice.test.ts`, `tests/e2e/golden-paths.e2e.test.ts`, `tests/helpers/e2e/e2e-app-harness.ts`, `tests/contract/openapi/openapi-response.contract.test.ts`, `tests/integration/chat/chat-citations.integration.test.ts`, `tests/integration/_smoke/integration-tier-baseline-cap.test.ts`, `tests/unit/review/review-repository.test.ts`, `museum-frontend/__tests__/helpers/factories/auth.factories.ts`, `museum-frontend/jest.config.js`, `museum-web/src/__tests__/snapshots/component-snapshots.test.tsx`, `tools/eslint-plugin-musaium-test-discipline/src/rules/no-inline-test-entities.ts`.

## Pyramid distribution

- **BE**: U=333 / I=29 / E=20 / C=5 / AI-live=4 (gated via `RUN_AI_TESTS`)
  - Ratio U:I:E ≈ 333:29:20 ≈ **17:1.5:1** — heavy on unit, integration tier is thin, e2e tier is the right size.
  - Caveat: 11 of the 29 "integration" files are flagged in `.integration-tier-baseline.json` as mock-mode-only (cross-module use-case orchestration with infra seam stubbed). Subtracting those, the *real* integration tier is only ~18 files.
  - E2E uses Postgres testcontainer + synthetic LLM stub + real DataSource + 34 migrations. `RUN_E2E=true` gate. AI tier exists for real-LLM smoke (`RUN_AI_TESTS=true`).

- **FE**: U/component=219 (Jest+RN testing) / `__tests__/integration/` = 1 (cert-pinning) / Node-runner=15 (pure-logic) / Maestro E2E = 15 flows in 4 shards (auth, chat, museum, settings) + iOS nightly cron.
  - The "4 shards" CLAUDE.md mentions matches `museum-frontend/.maestro/shards.json` exactly.

- **Web**: U=29 (Vitest, jsdom) / E2E=15 (Playwright, split a11y + flows for admin). Coverage scope is narrowed to `src/lib/**` and admin/shared components — Phase 0 cosmetic-test purge per ADR-012.

- **Target healthy ratio**: 70/20/10 is the textbook split for a backend with real infra. Musaium BE is at ~88/8/4. The gap is felt mostly in the integration tier — many cross-module wiring tests live in unit/ with mocked seams. For pre-launch V1 with single-dev velocity this is acceptable; post-launch the integration tier should absorb 10-15 of the "fat unit tests" (orchestrator-walk-section.test.ts at 218 lines / 4 it() blocks, langchain-orchestrator-branches.test.ts at 499 lines / 20 it() blocks).

## Inline factory ratchet

- **Baseline file**: `tools/eslint-plugin-musaium-test-discipline/baselines/no-inline-test-entities.json`
- **Baseline value**: `{ "baseline": [] }` — **zero recorded violations**
- **Current violations found**: **7** in BE tests (grep `as User|as ChatMessage|as ChatSession` outside `/helpers/`)
- **Diff**: +7 vs baseline, but the rule's `entities` default list is `User, ChatMessage, ChatSession, Review, SupportTicket, MuseumEntity, AuditEvent` and the violations match — they should be caught. Either the ESLint rule isn't being run in CI, or `as unknown as User` patterns (5 of the 7) escape the AST pattern that only catches direct `as User`. Inspection of `src/rules/no-inline-test-entities.ts` line 168 confirms: the rule requires `typeName.name` to be a plain Identifier — the `as unknown as User` chain passes through a `TSAsExpression` wrapping another `TSAsExpression`, missing the entity-name check.

**Verdict**: rule is honest about its 0-baseline but has a small AST blind spot. The 7 violations are not "growth" — most predate the rule and exploit the `as unknown as X` escape hatch.

**New violations (file:line + severity)**:

| File:Line | Snippet | Severity | Why | Fix |
|---|---|---|---|---|
| `tests/unit/chat/chat-media-tts-voice.test.ts:33` | `} as ChatSession['user']` | P2 | Casting an object literal as an entity's property type — fine in spirit (only `ttsVoice` field needs override) but bypasses the factory | Extend `makeSessionUser()` to accept `ttsVoice` override |
| `tests/unit/chat/user-memory-prompt.test.ts:24` | `}) as UserMemory` | P2 | `UserMemory` not in the default entities list, but is an entity | Add `UserMemory` to plugin defaults + create `makeUserMemory()` factory in `tests/helpers/chat/userMemory.fixtures.ts` (already exists — use it) |
| `tests/unit/auth/export-user-data.test.ts:108,199` | `} as unknown as UserConsent` | P2 | Double-cast escape hatch — `UserConsent` not in entities list | Add `UserConsent` + factory |
| `tests/unit/routes/chat-memory.route.test.ts:26` | `}) as unknown as UserMemoryService` | P2 | Service stub, not entity — not a real violation | OK (service mock) |
| `tests/integration/chat/user-memory-personalization.integration.test.ts:95` | `user: { id: args.userId } as User` | P1 | Direct `as User` — should be caught by current rule, suggests ESLint isn't running these files | Use `makeUser({ id })` from `tests/helpers/auth/user.fixtures.ts` |
| `tests/integration/chat/user-memory-recent-sessions.integration.test.ts:72` | `user: { id: args.userId } as User` | P1 | Same as above | Same fix |

## P0 — Critical test issues

None observed. No checked-in `.only`, no `expect(true).toBe(true)`, no clearly fake tests. The Stryker score is the closest to P0 (see "Mutation score" section) but the gate is calibrated to the in-house definition of "killed", which excludes Timeouts — those timeouts are *probably* infinite-loop mutants the suite is detecting, so the real kill power is higher than the raw 17.6% suggests. Still warrants attention.

## P1 — Important

### P1.1 — Mock-heavy orchestrator tests inflate test count without proportional signal

**Files**: `tests/unit/chat/langchain-orchestrator.test.ts` (312 lines / 6 jest.mock blocks), `tests/unit/chat/langchain-orchestrator-branches.test.ts` (499 lines / 6 jest.mock / 20 it blocks), `tests/unit/chat/orchestrator-walk-section.test.ts` (218 lines / 6 jest.mock / 4 it blocks), `tests/unit/chat/orchestrator-router-threading.spec.ts` (similar), `tests/unit/chat/orchestrator-structured-output.test.ts` (similar).

**Severity**: P1.

**Why**: These tests mock `@src/config/env`, `@shared/logger`, `@shared/observability/sentry`, `@sentry/node`, `@langchain/openai`, `@langchain/google-genai` — six modules each — then feed a fake `{ invoke, stream }` shape into the orchestrator. The behaviour under test reduces to "if I pass message X to a fake model that returns Y, does the orchestrator emit Y?" — which the orchestrator does by construction. The Spotlighting envelope ordering check is real and worth keeping, but most of the cases overlap with `tests/integration/chat/knowledge-router.integration.test.ts` and `tests/integration/chat/chat-citations.integration.test.ts`, which exercise the same logic via `buildChatTestService` with a less mock-heavy seam.

**Fix**: Audit each it() block. If the assertion only verifies the orchestrator passes data through, delete. If it pins boundary behaviour (fallback when model=null, circuit-breaker open, timeout handling), keep. Target: 20→8 it() blocks in `langchain-orchestrator-branches.test.ts` while keeping mutation kill power.

### P1.2 — Stryker timeout dominance suggests slow-path mutation noise

**File**: `museum-backend/reports/stryker-incremental.json`

```
Timeout:    3171 (64% of all mutants)
Killed:      896 (18%)
NoCoverage:  481 (10%)
Ignored:     441 (9%)
RuntimeError: 10 (0.2%)
Survived:      0 in incremental snapshot (recent run: 259)
```

Recent `reports/mutation/mutation.json`:
```
Timeout: 2749,  Killed: 873,  NoCoverage: 522,  Ignored: 374,  Survived: 259
```

**Severity**: P1.

**Why**: 64% Timeout means the per-mutant Jest run is exceeding `timeoutMS: 10000`. The Stryker config comment claims "1693 timeouts at 4% wasted 14h" was *fixed* by dropping to 10s; the live data says timeouts are still the dominant outcome. The hot-files gate (`scripts/stryker-hot-files-gate.mjs`) counts Timeout in the denominator but NOT the numerator — so each timeout is a *missed kill*. The standard Stryker convention is that a timeout = killed (mutant caused an infinite loop, tests detected it via timeout). This gate is more conservative.

If the gate is meaningful, it's understating kill power. If timeouts are real test-hangs (infinite loops in mutants OR slow tests fighting a 10s budget), then the suite has a perf problem masked as a quality problem.

**Fix**:
1. Spot-check 5 random Timeout mutants — if they're genuinely killed by timeout, change the gate `killRatio` denominator/numerator to include Timeout as killed (standard Stryker convention).
2. If they're actually slow tests under load, raise `timeoutMS` to 20000 for the integration-adjacent files OR shrink the mutation scope further.

### P1.3 — `describe.skip('TypeOrmArtKeywordRepository.upsert (atomic)')` — silent skip

**File**: `tests/unit/chat/art-keyword-repo-atomic-upsert.test.ts:17`

**Severity**: P1.

**Why**: Hard `describe.skip()` (not env-gated like the e2e files). Test exists to verify atomic UPSERT — important for concurrent writes. Currently zero coverage. Comment says "Skipped by default — needs a live TEST_DATABASE_URL" but no CI job sets it.

**Fix**: Move to `tests/integration/chat/` and gate via `shouldRunIntegration` pattern; or run it under `pnpm test:integration` (which spins testcontainer). Either way, hook it into the CI pipeline.

### P1.4 — Migration tests gated by `describe.skip` with same shape

**Files**:
- `tests/unit/data/db/migrations/AddCriticalChatIndexesP0.spec.ts:22`
- `tests/unit/data/db/migrations/AddP1FKAndTokenIndexes.spec.ts:25`

**Severity**: P1.

Same pattern: skipped by default, requires `TEST_DATABASE_URL`, never runs in CI. The migration round-trip is partially covered by `tests/integration/db/migration-round-trip.test.ts`, so risk is bounded — but these tests have ratcheted assertions on specific indexes the round-trip doesn't check.

**Fix**: Move to integration tier and run under `pnpm test:integration`.

### P1.5 — Two integration tests violate `as User` plugin rule

`tests/integration/chat/user-memory-personalization.integration.test.ts:95` and `user-memory-recent-sessions.integration.test.ts:72` use direct `user: { id: ... } as User`. The ESLint plugin SHOULD catch this (pattern A in the rule). Suggests either:
- ESLint isn't lint-checking `tests/integration/`
- The plugin AST rule has a blind spot for this exact context

**Fix**: Verify ESLint `--ext` and `--ignore-pattern` config covers `tests/integration/**`. Replace with `makeUser({ id: args.userId })`.

## P2 — Minor / cosmetic

### P2.1 — 154 `toBeDefined()` / `toBeTruthy()` / `toBeFalsy()` calls

**Severity**: P2.

`toBeDefined()` is a weaker assertion than `toBe(expectedValue)` or `toMatchObject({...})`. Most occurrences are after richer assertions on the same value (e.g., `expect(col).toBeDefined(); expect(col?.options.name).toBe('foo')` — the first line is redundant once the second runs because the chained `?.` would null-propagate to `undefined !== 'foo'`).

**Specific theater example**: `tests/unit/chat/user-memory-entity.test.ts` — 2 it() blocks testing TypeORM decorator metadata for `languagePreference` and `sessionDurationP90Minutes` columns:

```ts
it('declares languagePreference column', () => {
  const cols = getMetadataArgsStorage().columns.filter((c) => c.target === UserMemory);
  const col = cols.find((c) => c.propertyName === 'languagePreference');
  expect(col).toBeDefined();
  expect(col?.options.name).toBe('language_preference');
  expect(col?.options.type).toBe('varchar');
  expect(col?.options.nullable).toBe(true);
});
```

This is testing TypeORM's `@Column` decorator, not application code. The column will exist iff someone wrote `@Column(...)` — which is what the test reads. Tautological.

**Fix**: Delete `tests/unit/chat/user-memory-entity.test.ts` (or replace with a migration round-trip integration test that asserts the column exists in the actual schema after migrate).

### P2.2 — 170 `as unknown as` / `as any` casts in test files (excl. helpers)

**Severity**: P2.

Type-erasing the test seam is a smell — the cast often hides interface drift. Worst offenders: `orchestrator: orchestrator as any` in `tests/helpers/e2e/e2e-app-harness.ts:302` (acknowledged with FIXME-style comment), 50 in `museum-frontend/__tests__/`.

**Fix**: Each `as any` should be either a `Partial<X> & X` factory call or a narrowed `Pick<X, 'methodUnderTest'>`. Not blocking for launch.

### P2.3 — 24+ tests using real `setTimeout` for delays

**Severity**: P2.

Examples: `tests/unit/middleware/apiKey.test.ts:313` (`await new Promise((resolve) => setTimeout(resolve, 10))`), `tests/unit/auth/password-breach-check.test.ts:289,319`, `tests/unit/chat/wikidata-breaker.test.ts:35,87,94,106,122,252,312`. Mixed pattern: some files use `jest.useFakeTimers()` correctly (image-enrichment-service.test.ts), others rely on real 10ms-200ms waits.

10ms real waits are usually fine on dev machines and flake under CI load. The 200ms waits in `wikidata-breaker.test.ts` and `langchain-orchestrator-branches.test.ts:193,378` (60s timer in test) are noisier.

**Fix**: Convert remaining real-wait tests to `jest.useFakeTimers()`. The wikidata-breaker file is the priority — its tests target circuit-breaker timing transitions which are exactly what fake timers are for.

### P2.4 — 5 FE snapshot files

`museum-frontend/__tests__/features/chat/ui/__snapshots__/*.snap` — 4 files totalling 527 lines. Component-shape snapshots for `ImageCarousel*` / `ImageCompare*` components. CLAUDE.md and ADR-012 say the project explicitly moved away from snapshot tests (Web tests `src/__tests__/snapshots/component-snapshots.test.tsx` is actually role-query tests with the snapshot path repurposed).

The 4 RN snapshots are the only remnants. Low risk because the components are stable visual primitives, but they're rubber-stamp tests by definition.

**Fix**: Replace with role-query assertions (a11yLabel + structural assertions), consistent with the rest of the FE suite.

### P2.5 — `web-search-service.test.ts` and similar use real timers with `new Promise(r => setTimeout(r, this.delay))` patterns

Same as P2.3 but specifically in service-level tests where the delay is the actual test value (LLM judge timeout, web search timeout). These are mocking the wait in a way that adds 5-200ms to every test run. Cumulative cost across the suite.

**Fix**: `jest.useFakeTimers()` + `jest.advanceTimersByTime()` per test.

## Mock abuse

### Concrete examples

**Example A — `tests/unit/shared/routers/api-router-resolve.test.ts`** (186 lines / 18 jest.mock blocks):

```ts
jest.mock('@shared/logger/logger', ...);
jest.mock('@src/config/env', ...);
jest.mock('...bullmq-museum-enrichment-queue.adapter', ...);
jest.mock('@modules/museum', ...);
jest.mock('...museum.route', ...);
jest.mock('...admin-ke.route', ...);
jest.mock('...admin.route', ...);
jest.mock('...cache-purge.route', ...);
// + 10 more
```

The test verifies one boolean short-circuit: `if (env.extractionWorkerEnabled === false) skip BullmqAdapter construction`. To assert this, the test mocks every neighbouring module so the import graph doesn't blow up.

This isn't *wrong* — the alternative (load the real composition root) would pull half the app — but it illustrates a recurring problem: composition-root logic is hard to test in isolation without bulk mocking. The 11-entry integration-tier baseline cap exists precisely to absorb this.

**Severity**: P2 (the test is honest, the cost is acknowledged in the baseline).

**Example B — orchestrator family** (5 files, ~1500 lines combined, 30+ jest.mock blocks each):

Already covered in P1.1. Same pattern: mock 6 modules to test message-array ordering. High mock-to-assertion ratio.

**Example C — repository tests** (`tests/unit/review/review-repository.test.ts`):

Healthy pattern. Uses `makeMockTypeOrmRepo()` + `makeMockQb()` + `makeMockDataSource()` helpers, then asserts SQL builder calls. Mocks are abstracted to one line, the test verifies repository contracts. **This is what the rest of the unit tier should look like.**

### Drift risk

Mocks of TypeORM `Repository<T>`, `QueryBuilder<T>`, `DataSource` etc. are centralized in `tests/helpers/shared/mock-deps.ts` and `mock-query-builder.ts` — good. Mocks of LangChain `ChatOpenAI`, `ChatGoogleGenerativeAI` are scattered across orchestrator tests with hand-written `{ invoke, stream }` shapes — if LangChain rev-bumps and changes the shape (likely — LangChain has had `.invoke()` → `.invokeWithMetadata()` churn before), these tests pass while the prod code breaks. **Drift risk: medium-high in orchestrator family.**

**Fix**: Centralize `makeFakeChatModel()` in `tests/helpers/chat/service-mocks.fixtures.ts` (already exists — extend it). Then a LangChain bump only touches one file.

## E2E discipline

### What `pnpm test:e2e` actually runs

`RUN_E2E=true jest --selectProjects=e2e --testPathPattern=tests/e2e/` → 20 e2e test files. Harness in `tests/helpers/e2e/e2e-app-harness.ts`:

- **Real Postgres** via `startPostgresTestContainer` (testcontainer, fresh DB per run, auto-cleanup)
- **34 migrations applied** on boot (auto-discovered, sorted by filename timestamp)
- **Synthetic ChatOrchestrator** — fake `{ generate, generateStream }` returning `'Synthetic assistant response for e2e'`. **LLM is mocked.**
- **Synthetic AudioTranscriber** — returns fixed string
- **Local image storage** (filesystem)
- **Resilient cache wrapper** wired with optional injected cache (chaos tests use `BrokenRedisCache`)

**Verdict**: e2e is "everything except the LLM and audio transcription", which is the right cut for deterministic CI. The actual LLM path is exercised in `tests/ai/` under `RUN_AI_TESTS=true` (gated, not on every push).

CI workflow `ci-cd-backend.yml`: e2e runs on PR + nightly (verified via `--testPathPattern=tests/e2e/`).

### Negative-path coverage (sampled)

Sample 5 routes from openapi-response contract test:

| Route | 2xx tests | 4xx tests |
|---|---|---|
| `/api/auth/register` | 201 | 400 ✓ |
| `/api/auth/login` | 200 | 400 + 401 ✓ |
| `/api/auth/refresh` | 200 | 400 + 401 ✓ |
| `/api/auth/account` | 200 | 401 + 404 ✓ |
| `/api/users/me/export` | 200 | 401 + 429 ✓ |

Contract response file has **45 2xx + 37 4xx tests** — every spec'd route has at least one negative-path test. **Good.**

E2E negative-path: 50 `.toBe(2xx)` vs 24 `.toBe(4xx)` assertions across `tests/contract/ + tests/e2e/ + tests/integration/`. Ratio ~2:1 — biased toward happy path but not absent.

### Maestro coverage matrix

`museum-frontend/.maestro/shards.json` defines 4 shards:
- **auth** (3 flows): auth-flow, auth-persistence, onboarding-flow
- **chat** (5 flows): chat-flow, chat-history-pagination, museum-chat-flow, chat-compare, audio-recording-flow
- **museum** (2 flows): museum-search-geo, navigation-flow
- **settings** (3 flows): settings-flow, settings-locale-switch, support-ticket-create

Total: **13 flows in shards + 2 ungrouped** (helpers/quick-login + config) = 15 yaml files. CLAUDE.md "4 shards" claim ✓ verified.

iOS runs `all` shards as nightly cron. The 3 yaml files under `museum-frontend/maestro/` (not `.maestro/`) are screen-capture utilities, not E2E flows.

## Stryker mutation score

**Latest report** (`museum-backend/reports/mutation/mutation.json`):

| Status | Count | % of total |
|---|---|---|
| Killed | 873 | 17.7% |
| Survived | 259 | 5.2% |
| Timeout | 2749 | 55.6% |
| NoCoverage | 522 | 10.6% |
| Ignored | 374 | 7.6% |
| RuntimeError | 9 | 0.2% |
| **Total mutants** | **4786** | |

**Strict kill ratio** (gate definition `killed / (killed+survived+nocoverage+timeout)`): 873 / 4403 = **19.8%**

**Standard Stryker kill ratio** (counting Timeout as killed): (873+2749) / 4403 = **82.3%**

**Mutation score in CI**:
- Push/PR: incremental Stryker via `pnpm mutation:ci` (only affected mutants re-run)
- Nightly: full `pnpm mutation` cron
- **Hot-files gate**: `scripts/stryker-hot-files-gate.mjs` enforces `killRatioMin: 80%` on 8 banking-grade files (art-topic-guardrail, cursor-codec, sanitize-prompt-input, audit-chain, llm-circuit-breaker, refresh-token.repository.pg, authSession.service, session-issuer.service).

**Verdict**: The gate is *strict* (excludes Timeout from kills) and *narrow* (only 8 files). This is defensible — those 8 files are exactly the right banking-grade surface (auth + audit + pagination + sanitization + circuit breaker). On those files, 80% kill rate is meaningful.

On the global score: with Timeouts counted as kills (standard convention), the suite kills 82% of all mutants — that's good. Without (gate convention), it's 20% — that's poor. The truth is somewhere in between because some Timeouts genuinely are infinite-loop kills (test-hangs the mutant caused) and some are slow-path mutants where the test ran for 10s without making a meaningful assertion.

**Fix**:
1. Sample 20 random Timeout mutants from the report. If >70% are genuine infinite-loop kills, change the gate to count Timeout as killed.
2. Expand hot-files registry post-launch (priority: csrf middleware, JWT signing, RBAC enforcement).

## Flaky test markers

- **`flaky` / `FLAKY` / `intermittent` in test code**: 0 hits in source comments. Either no flaky tests, or they're not commented as such.
- **`jest.retryTimes` / `retry` config**: 0 hits in jest.config.* and stryker configs. No automatic retry.
- **`setTimeout` real-wait usage**: 24+ files. Highest risk: `wikidata-breaker.test.ts` (7 real-wait usages), `langchain-orchestrator-branches.test.ts` (60s timers in 2 tests).
- **`globalTeardown` set to reap leaked testcontainer instances**: `tests/helpers/e2e/jest-global-teardown.ts` — explicitly handles "museum-ia-e2e-*" / "museum-ia-redis-*" reaping. This means the team has seen container leaks before, which is the most common e2e flake source.
- **`forceExit: true` in jest.config.ts** with comment "safety net for integration tests that touch transitively-loaded modules holding background sockets". Same signal: handle-leak history.

**Verdict**: No actively-marked flaky tests, but defensive scaffolding (forceExit + globalTeardown reaper) suggests the team has hit flake issues before and patched them. The real-`setTimeout` usage in `wikidata-breaker.test.ts` and `password-breach-check.test.ts` is the most likely flake source going forward.

## Cross-cutting smells

1. **"Integration" directory contains unit tests with mocked seams** (11 files). Acknowledged + capped via sentinel, but the naming is misleading. New devs will mistake them for real integration coverage.
2. **Mock-of-Sentry pattern repeated in every test that touches observability** (~30 files). Could be one global `jest.setup.ts` line.
3. **`tests/perf/k6/` and `tests/load/`** — k6 scripts not run in CI. Useful only if a human runs them. Pre-launch is the moment to either pin them in CI (even as advisory) or delete them as dead.
4. **`tests/mutation-killers/` is reserved but empty** — README documents discipline ("only put pure mutation-defense tests here"). Empty directory is the right outcome: it means no test was written *only* to kill a mutant. Healthy.
5. **`tests/ai/` (4 files) tests real LLMs**. Cost: every CI run with `RUN_AI_TESTS=true` makes 4-8 LLM calls. Not on every push — gated. Right pattern.
6. **`test.http` (CLAUDE.md mentions for manual API testing)** — not a regression test, just a tool. Doesn't count toward coverage. Acknowledged as such in CLAUDE.md.
7. **Date-coupled tests**: 25 files use `new Date()` without `jest.useFakeTimers`. Most use it inside factory call where the value is then asserted via `expect(...).toBeInstanceOf(Date)` etc. — fine. A few (TBD which) compare against literal `2026-XX-XX` timestamps which will rot post-launch — not investigated exhaustively here (budget).

## Recommendations

**Pre-launch (≤ 2 weeks)**:
1. **Fix 7 inline-entity violations** — 5 are direct `as User` (rule should already catch them; verify ESLint coverage). Mechanical fix using existing factories.
2. **Sample 20 Stryker Timeout mutants**, determine if they're real kills. Adjust `killRatioMin` gate accordingly. If they're kills, the project's mutation score jumps from "alarming" to "excellent" without code change — a free win.
3. **Delete `tests/unit/chat/user-memory-entity.test.ts`** — testing TypeORM decorators is tautology. Replace with a single assertion in the existing migration round-trip test if the column existence is load-bearing.

**Post-launch (≤ 1 month)**:
4. **Replace `setTimeout` real-waits with `jest.useFakeTimers()`** in `wikidata-breaker.test.ts`, `password-breach-check.test.ts`, `langchain-orchestrator-branches.test.ts` (60s timers). Reduces flake risk in CI under load.
5. **Centralize `makeFakeChatModel()`** in `tests/helpers/chat/service-mocks.fixtures.ts` to mitigate LangChain interface-drift risk across 5 orchestrator tests.
6. **Move 2 hard-skipped migration tests** (`AddCriticalChatIndexesP0.spec.ts`, `AddP1FKAndTokenIndexes.spec.ts`) and `art-keyword-repo-atomic-upsert.test.ts` to `tests/integration/` + gate via `RUN_INTEGRATION=true`. They're currently writing test code that runs nowhere.
7. **Audit orchestrator family for redundancy** — target reducing `langchain-orchestrator-branches.test.ts` (499 lines / 20 it) by 30% while preserving Stryker kill power on `langchain.orchestrator.ts`.

**Strategic (post-revenue)**:
8. Build the real integration tier. The current 11 baseline-capped "fake integration" tests are honest about being unit-flavoured, but the actual integration tier is thin (~18 real ones for a backend with 23k symbols). Goal: 40-50 real integration tests covering cross-module flows with real Postgres + real BullMQ.
9. Add property-based tests for cursor-codec (currently relies on a unit-test matrix) and audit-chain (chain integrity invariant is a property the SUT must enforce — fast-check is the right tool).
10. Web Playwright suite (15 specs) — extend to public landing flows + i18n FR/EN coverage, not just admin.

---

**5-line summary:**
1. BE quality 78 / FE quality 72 / Web quality 70 — all above launch threshold, none are testing theater.
2. Pyramid 65 — BE is unit-heavy with thin integration tier; FE pyramid is honest (unit + RN-component + Maestro); Web pyramid is small but targeted.
3. Pyramid verdict: NOT a healthy textbook pyramid, but acceptable for solo-dev pre-launch V1 given the scaffolding (ESLint baseline + Stryker hot-files gate + integration-tier sentinel cap) prevents drift; post-launch the integration tier MUST absorb 10-15 of the fat unit tests.
4. Worst test file: `museum-backend/tests/unit/chat/langchain-orchestrator-branches.test.ts` — 499 lines, 6 jest.mock blocks, 20 it() that test mock interactions more than orchestrator behaviour; significantly overlaps with `tests/integration/chat/knowledge-router.integration.test.ts`.
5. One test that should NOT have been written: `museum-backend/tests/unit/chat/user-memory-entity.test.ts` — 2 it() blocks reading TypeORM `getMetadataArgsStorage()` to verify `@Column` decorator metadata; this tests the ORM, not the application, and will pass forever regardless of whether the migration actually creates the column in production.
