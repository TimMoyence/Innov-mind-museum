# CLAUDE.md

Guidance for Claude Code (claude.ai/code) in this repo.

## Project Overview

Musaium — interactive museum assistant mobile app. Visitors photograph artworks or ask questions, get AI contextual responses via LangChain + LLM (OpenAI/Deepseek/Google).

Monorepo, three independent apps:
- **`museum-backend/`** — Node.js 22 + Express 5 + TypeORM + PostgreSQL 16 (pnpm)
- **`museum-frontend/`** — React Native 0.83 + Expo 55 + Expo Router (npm)
- **`museum-web/`** — Next.js 15 + React 19 + Tailwind 4 + Framer Motion (pnpm) — landing + admin panel

## Progress Tracking

Active roadmap: **`docs/ROADMAP_ACTIVE.md`** — résumé exécutif, mis à jour à chaque sprint. Index docs : **`docs/DOCS_INDEX.md`**. Plan enterprise courant : **`docs/plans/NL_MASTER_PLAN.md`**.

Historical sprint journals archived in **`docs/archive/v1-sprint-2026-04/`**:
- `PROGRESS_TRACKER.md` — checkbox tracker per sprint/item
- `SPRINT_LOG.md` — detailed technical journal
- `*_AUDIT_2026-04-0*.md` — prior audit reports

V3 review preserved under `docs/archive/roadmaps/V3_REVIEW_AND_PLAN.md`. Older sprint scratch (ROADMAP_V2, walk spec, superpowers plans/specs, one-off audits, legacy team reports) was deleted on 2026-04-30 — see git history if needed.

Post-2026-04-20 tracking: `.claude/tasks/` (task lists) + `.claude/skills/team/team-reports/` (runtime `/team` runs) = active sources of truth.

## Common Commands

### Backend (`cd museum-backend`)

```bash
pnpm install                     # install deps
pnpm dev                         # dev server with nodemon (port 3000)
pnpm lint                        # typecheck (tsc --noEmit)
pnpm test                        # all Jest tests
pnpm test -- --testPathPattern=tests/unit/   # run specific test folder
pnpm test -- -t "test name"      # run single test by name
pnpm test:e2e                    # e2e tests (needs running DB)
pnpm test:contract:openapi       # OpenAPI contract tests
pnpm build                       # compile to dist/
pnpm smoke:api                   # smoke test against running API
node scripts/migration-cli.cjs generate --name=MigrationName  # generate TypeORM migration
pnpm migration:run               # apply pending migrations
pnpm migration:revert            # revert last migration
pnpm openapi:validate            # validate OpenAPI spec
```

> **Manual API testing:** Use `test.http` (REST Client / IntelliJ HTTP format) for manual endpoint checks.

Docker local stack (Postgres + Adminer):
```bash
docker compose -f docker-compose.dev.yml up -d   # DB on localhost:5433, Adminer on :8082
```

### Frontend (`cd museum-frontend`)

```bash
npm install                      # install deps
npm run dev                      # Expo dev server
npm run lint                     # typecheck (tsc --noEmit)
npm test                         # Node.js test runner (compiles to .test-dist/ then runs)
npm run generate:openapi-types   # regenerate API types from backend OpenAPI spec
npm run check:openapi-types      # verify generated types are up to date
```

### Web (`cd museum-web`)

```bash
pnpm install                     # install deps
pnpm dev                         # Next.js dev server (port 3001)
pnpm build                       # production build
pnpm lint                        # ESLint + typecheck (tsc --noEmit)
pnpm test                        # Vitest unit tests
```

### Design System (`cd design-system`)

```bash
pnpm build                       # build design tokens → museum-frontend/shared/ui/tokens.generated.ts + web css
```

### CI

GitHub Actions workflows (`.github/workflows/`):
- `ci-cd-backend.yml` — quality gate (tsc + ESLint + tests + OpenAPI validate + audit) → E2E (PR/nightly) → deploy prod (push main) / staging (push staging) w/ Trivy scan + Sentry release + smoke test
- `ci-cd-web.yml` — quality gate (lint + build + test + audit) → Lighthouse CI (PR) → deploy Docker/GHCR → VPS (push main)
- `ci-cd-mobile.yml` — quality gate (Expo Doctor + OpenAPI sync + audit + i18n + lint + tests + shard-manifest sentinel) → Maestro Android matrix PR (4 shards) + iOS nightly cron → EAS build + store submit (dispatch/tag)
- `_deploy-backend.yml` — reusable deploy workflow (called by ci-cd-backend)
- `deploy-privacy-policy.yml` — privacy policy static page deploy
- `codeql.yml` — CodeQL security analysis (security-extended + security-and-quality)
- `semgrep.yml` — SAST static analysis scanning

### Maestro mobile E2E (Phase 2)

- 11 flows in `museum-frontend/.maestro/`, sharded 4 ways for PR matrix Android runs (`auth | chat | museum | settings`). Shard manifest at `museum-frontend/.maestro/shards.json`.
- Self-hosted on `macos-latest` GitHub runners — no Maestro Cloud.
- PR pipeline: `prebuild` (cached APK) → 4× `maestro-shard` (parallel) → `maestro-summary` PR comment.
- iOS nightly (03:17 UTC cron) runs the full set sequentially in `maestro-ios-nightly`.
- Backend: docker-compose stack on the runner. V2 will swap to public staging.
- New flow files MUST be added to `shards.json`; the `maestro-shard-manifest.mjs` sentinel in the `quality` job rejects PRs that violate this.
- Helper scripts: `museum-frontend/scripts/maestro-runner-setup.sh` (backend boot), `museum-frontend/scripts/maestro-run-shard.sh` (flow runner). Bats-tested.
- See `docs/superpowers/specs/2026-05-01-phase2-maestro-mobile-pr-design.md` for the full spec.

### Web admin Playwright + a11y (Phase 3)

- 4 admin flow specs in `museum-web/e2e/flows/` (admin-login, users, audit-logs, reports-moderation).
- 6 a11y specs in `museum-web/e2e/a11y/` running real `@axe-core/playwright` against WCAG 2.1 AA: 3 public routes (`/en`, `/en/support`, `/en/privacy`) + 3 admin routes (`/en/admin/login`, `/en/admin`, `/en/admin/users`).
- `globalSetup` registers a fresh admin user via real `/api/auth/register`, promotes role via DB UPDATE, logs in via the real LoginForm, and saves `storageState.json` for reuse across all flow + admin a11y specs.
- PR pipeline: `playwright-pr` job runs Chromium only (~5–7 min wall clock); fails the PR on flow regression or a11y violation.
- Nightly cron (03:23 UTC): `playwright-nightly` job runs the full 3-browser matrix (chromium + firefox + webkit).
- a11y disable-rules baseline at `museum-web/e2e/a11y/_disable-rules.json`. Vitest cap test enforces baseline length ≤ `PHASE_3_DISABLE_RULES_CAP` (currently 0; only shrinks).
- See `docs/superpowers/specs/2026-05-01-phase3-web-admin-playwright-design.md` for the full spec.

### Stryker mutation testing (Phase 4)

- 7 banking-grade hot files registered at `museum-backend/.stryker-hot-files.json` with per-file `killRatioMin` (currently 80%): art-topic-guardrail, cursor-codec, sanitizePromptInput, audit-chain, llm-circuit-breaker, refresh-token.repository.pg, authSession.service.
- `museum-backend/scripts/stryker-hot-files-gate.mjs` parses `reports/mutation/mutation.json` and asserts each hot file ≥ killRatioMin. Exits 0/1/2.
- Pre-commit hook (`.claude/hooks/pre-commit-gate.sh`) runs `pnpm mutation:ci` + `pnpm mutation:gate` ONLY when staged BE files intersect the `mutate:` list. Most commits skip Stryker entirely (0s overhead). First-run cold cache may take ~20–40 min — run `pnpm mutation:warm` overnight to bootstrap.
- CI: `mutation` job in `ci-cd-backend.yml` runs incremental on every push (any branch) + full nightly via cron (03:17 UTC). Stryker incremental cache shared across runs via `actions/cache@v4`.
- Hard-fail policy: a hot file dropping below 80% blocks commit AND CI. Global thresholds: high=85, low=70, break=70.
- See `docs/superpowers/specs/2026-05-01-phase4-stryker-mutation-design.md`.

### Auth e2e completeness (Phase 5)

- 4 e2e files in `museum-backend/tests/e2e/auth-*`:
  - `auth-verify-email.e2e.test.ts` — full token consumption leg via TestEmailService interception (7 cases).
  - `auth-social-login.e2e.test.ts` — Apple + Google ID-token verification with local JWT+JWKS spoof, F3 nonce binding contract, replay/expired/wrong-audience paths (9 cases).
  - `auth-refresh-rate-limit.e2e.test.ts` — exact F1 contract: 30 req/min OK, 31st returns 429 (4 cases).
  - `auth-refresh-rotation.e2e.test.ts` — token rotation, replay-attack family revocation, chained rotations, logout invalidates family (5 cases).
- TestEmailService activated by `AUTH_EMAIL_SERVICE_KIND=test` env var. Production env rejects 'test' loud (sentinel in `config/env.ts`).
- Social JWT+JWKS spoof helper at `tests/helpers/auth/social-jwt-spoof.ts` boots a local HTTP JWKS server + signs RS256 ID tokens — exercises the real verifier code path, not a mock.
- See `docs/superpowers/specs/2026-05-01-phase5-auth-e2e-design.md`.

### Chaos resilience (Phase 6)

- 4 chaos e2e files in `museum-backend/tests/e2e/chaos-*`:
  - `chaos-redis-down.e2e.test.ts` — `BrokenRedisCache` injects ECONNREFUSED on every cache op; chat continues degraded (7 cases).
  - `chaos-llm-provider.e2e.test.ts` — `StubLLMOrchestrator` throws configurable errors; assertions on fallback OR 503 (no 500 leak), no provider-name leak (5 cases).
  - `chaos-circuit-breaker.e2e.test.ts` — CLOSED → OPEN → HALF_OPEN transitions, 503 on open, env-var-driven breaker tuning for fast deterministic tests (6 cases).
  - `chaos-bullmq-worker.e2e.test.ts` — knowledge-extraction worker offline; sync chat API unaffected (6 cases).
- Chaos helpers at `museum-backend/tests/helpers/chaos/` (`broken-redis-cache.ts` + `stub-llm-orchestrator.ts` + README).
- Harness gains 3 options: `cacheService`, `chatOrchestratorOverride`, `startKnowledgeExtractionWorker`. Defaults preserve existing behavior.
- Banking-grade contract: dependency failure → graceful degradation → no 500/stack-trace leak → no provider-name leak.
- See `docs/superpowers/specs/2026-05-01-phase6-chaos-resilience-design.md`.

### Factory locations + shape-match rule (Phase 7)

Test factories live by convention:
- BE: `museum-backend/tests/helpers/<module>/<entity>.fixtures.ts` (e.g., `tests/helpers/auth/user.fixtures.ts`).
- FE: `museum-frontend/__tests__/helpers/factories/<entity>.factories.ts` (e.g., `__tests__/helpers/factories/auth.factories.ts`).

To add a new entity factory:
1. Create the file at the convention path.
2. Export `make<Entity>(overrides?: Partial<E>): E` returning a complete entity with sensible defaults.
3. The `} as Entity` cast lives ONLY in the helper file — test files import the factory.
4. Update `tools/eslint-plugin-musaium-test-discipline/src/rules/no-inline-test-entities.ts` `DEFAULT_SHAPE_SIGNATURES` to add the entity's signature so shape-match catches inline-anti-patterns.

Shape-match detection (Phase 7 extension to the no-inline-test-entities rule):
- Enabled via `detectShapeMatch: true` in BE + FE eslint configs.
- Fires on object literals matching ANY entity's signature prop set, even without a cast or annotation.
- Default signatures: User=[id,email,passwordHash], ChatMessage=[id,sessionId,role,text], ChatSession=[id,userId,locale,museumMode], Review=[id,rating,comment], SupportTicket=[id,userId,subject,description,status], MuseumEntity=[id,name,city,country], AuditEvent=[id,actorId,action,targetId].
- Exemptions: helper paths, factory call arguments (`makeUser({...})`), objects already covered by the 3 existing rule paths (cast / type-assertion / annotated declarator).

Phase 0 grandfather baseline shrunk to 0 in Phase 7. The cap test (`tools/eslint-plugin-musaium-test-discipline/tests/baseline-cap.test.ts`) enforces `PHASE_0_CAP = 0` — any future `as Entity` outside helpers triggers immediate gate fail.

See `docs/superpowers/specs/2026-05-01-phase7-factory-migration-design.md`.

### Coverage uplift gates (Phase 8 + Phase 9 close)

- BE thresholds: 90 / 78 / 85 / 90 (statements / branches / functions / lines), enforced in `museum-backend/jest.config.ts`. Default actuals 90.27 / 79.31 / 85.80 / 90.69 (rises to 91.41 / 81.04 / 87.45 / 91.84 with `RUN_INTEGRATION=true`).
- FE thresholds: 91 / 78 / 80 / 91, enforced in `museum-frontend/jest.config.js`. Phase 9 Sprint 9.3 actuals 91.92 / 78.39 / 81.44 / 92.14 (over the original 90 / 80 / 80 / 90 long-term target on every metric except branches, where the 78 floor is intentional — see ADR-007).
- Web Vitest: unchanged at 70 / 60 / 70 / 70 (Phase 8 Q5=a — Playwright + a11y + Lighthouse cover web; Vitest uplift deferred).
- Pre-commit gate (`.claude/hooks/pre-commit-gate.sh`) runs `pnpm run test:coverage` (BE) + `npm run test:coverage` (FE) ONLY when staged files include source under `museum-backend/src/` or `museum-frontend/{src,features,shared,app}/`. Most commits skip (0s overhead).
- Escape hatch: `SKIP_COVERAGE_GATE=1 git commit ...` for fast local iteration; CI still enforces unconditionally.
- CI hard-fail: `ci-cd-backend.yml` (`quality` job) runs `pnpm run test:coverage`; `ci-cd-mobile.yml` (`quality` job) runs `npm run test:coverage`. Threshold miss blocks the PR.
- Branches threshold deliberately stays at 78 BE / 78 FE — Phase 0 challenger pushback + ADR-007. The Phase 4 Stryker mutation kill ratio (≥ 80% on hot files) is the banking-grade signal; aggressive branches uplift forces cosmetic test patterns.
- Jest config note: `coveragePathIgnorePatterns` is project-scoped in Jest 29 with `projects:`, so the patterns are wired into `sharedProjectOptions` in `jest.config.ts` and re-applied per project. A top-level-only declaration is silently ignored (Phase 8 Group B fixed this).
- BE `test:coverage` script pins `--testTimeout=30000` to absorb the slowdown coverage instrumentation introduces on supertest-driven HTTP route tests (preexisting "socket hang up" flakes). Phase 10 follow-up: investigate `swc-jest` swap to drop this hack.
- Phase 9 deferred to Phase 10: (1) bullmq-enrichment-scheduler.adapter.ts integration test (needs Redis testcontainer harness extension); (2) 6 `it.skip` entries in `chat-repository-typeorm.integration.test.ts` (cursor pagination + MessageFeedback upsert path); (3) HTTP-route flake root-cause; (4) Web Vitest uplift if real value vs Playwright.
- Stats summary (2026-05-02): 3782 BE tests + 1966 FE tests = 5748 total; +47 BE / +300 FE delivered across Phase 9 Sprints 9.1-9.4 (≈350 new tests in one session via 7 parallel subagent runs).
- See `docs/superpowers/specs/2026-05-01-phase8-coverage-uplift-design.md`.

## Architecture

### Backend — Hexagonal (Ports & Adapters)

```
src/
├── config/env.ts          # all env vars parsed & validated in one place
├── data/db/               # TypeORM data-source + migrations/
├── modules/
│   ├── admin/             # hexagonal: admin dashboard, RBAC, analytics, audit logs
│   ├── auth/              # hexagonal: domain → useCase → adapters (primary=HTTP, secondary=PG repos)
│   ├── chat/              # hexagonal: domain → useCase → adapters (primary=HTTP, secondary=PG+S3+LangChain)
│   ├── daily-art/         # simplified: flat structure (static artwork rotation)
│   ├── museum/            # hexagonal: museum directory, geo search, multi-tenancy
│   ├── knowledge-extraction/ # hexagonal: scrape→classify→store pipeline (BullMQ)
│   ├── review/            # hexagonal: public reviews, moderation
│   └── support/           # hexagonal: ticket system, contact form
├── shared/                # cross-cutting: errors, logger, routers, validation, domain types
├── helpers/               # middleware (error handler, rate limit, request ID/logger), swagger setup
├── app.ts                 # Express app factory (middleware chain + router mount)
└── index.ts               # entrypoint (DB init → app.listen)
```

Key patterns:
- Each module expose barrel `index.ts`, builds + wires own dependency graph
- `createApp()` accept optional overrides for testing (inject mock chatService/healthCheck)
- Routes live in `modules/<name>/**/http/<name>.route.ts`
- TypeORM entities in `modules/<name>/**/domain/`, `.entity.ts` suffix
- Repository interfaces (ports) in `domain/`, PG implementations (adapters) in `secondary/`

Chat module internals: `chat.service.ts` orchestrate LLM calls via `langchain.orchestrator.ts`, use sectioned prompts (`llm-sections.ts`), art-topic guardrail, image storage (S3 or local stub), audio transcription.

### Frontend — Feature-driven + Expo Router

```
app/                       # Expo Router file-based routing
├── _layout.tsx            # root layout
├── auth.tsx               # auth screen
├── (tabs)/                # bottom tab navigator (home, conversations)
└── (stack)/               # stack screens (chat session, settings, onboarding, etc.)

features/                  # business logic by domain
├── art-keywords/          # offline art-topic classification (live, synced at launch + 24h stale)
├── auth/                  # login/register, token storage, protected route hook
├── chat/                  # chat session hook, contracts, API calls, streaming, TTS
├── conversation/          # conversation list/dashboard
├── daily-art/             # daily artwork card, saved artworks
├── legal/                 # privacy policy, terms of service content
├── museum/                # museum directory, map view, geolocation
├── onboarding/            # first-launch carousel
├── review/                # public reviews, star rating
├── settings/              # runtime settings, theme, security, compliance
└── support/               # ticket system, contact form

shared/                    # cross-feature utilities
├── api/                   # Axios client, generated OpenAPI types
├── config/                # app configuration
├── infrastructure/        # platform-level concerns
├── lib/                   # utility functions
├── types/                 # shared TypeScript types
└── ui/                    # reusable UI components
```

Key patterns:
- API types auto-generated from backend OpenAPI spec (`npm run generate:openapi-types` → `shared/api/generated/openapi.ts`)
- Auth tokens stored via `expo-secure-store`
- App variants (development/preview/production) configured in `app.config.ts` via `APP_VARIANT` / `EAS_BUILD_PROFILE`

### Web — Next.js 15 (App Router)

```
src/
├── app/[locale]/          # i18n routing (FR/EN)
│   ├── page.tsx           # landing page (6 animated sections)
│   ├── support/           # FAQ + contact form
│   ├── privacy/           # GDPR privacy policy
│   └── admin/             # admin panel (dashboard, users, analytics, tickets, reports)
├── components/            # shared React components
├── hooks/                 # custom hooks (auth, API)
├── lib/                   # utilities, API client, i18n config
└── styles/                # global CSS + Tailwind config
```

Key patterns:
- Admin panel use JWT auth w/ refresh token interceptor
- i18n via custom dictionary loader (FR/EN)
- Framer Motion for landing page animations
- Recharts for analytics dashboards

## Path Aliases

**Backend:** `@src/*` → `src/*`, `@modules/*` → `src/modules/*`, `@data/*` → `src/data/*`, `@shared/*` → `src/shared/*`

**Frontend:** `@/*` → `./*`

**Web:** `@/*` → `./src/*`

## Token Discipline — Files NOT to Read in full

Auto-generated, massive, or pure data. Reading full wastes tokens, rarely helps.

| File | Size | Why | How to access instead |
|---|---|---|---|
| `museum-frontend/shared/api/generated/openapi.ts` | 83 KB / 3 510 lines | Auto-generated from backend OpenAPI spec | `Grep` for specific type/operation name, or read ±50 lines with `offset`/`limit` |
| `museum-frontend/package-lock.json` / `pnpm-lock.yaml` / `museum-backend/pnpm-lock.yaml` / `museum-web/pnpm-lock.yaml` | multi-MB | Lockfiles | Never read directly — use `pnpm list <pkg>` or `npm ls <pkg>` |
| `museum-backend/src/data/db/migrations/*.ts` (34 files) | ~5 KB each, 172 KB total | TypeORM migrations — immutable once run | Read only specific migration relevant to current work |
| `museum-backend/src/modules/daily-art/artworks.data.ts` | 17 KB / 373 lines | Static artwork catalog | Grep for specific artwork ID or title |
| `museum-frontend/shared/ui/tokens.generated.ts` | generated | Design tokens output | Edit `design-system/` source instead |
| `docs/archive/v1-sprint-2026-04/SPRINT_LOG.md` | 169 KB | Historical journal (archived) | Read w/ offset for specific date range, never full |
| `docs/archive/v1-sprint-2026-04/PROGRESS_TRACKER.md` | 57 KB | Sprint tracker (archived) | Read latest sprint section only |

Doubt? Use `Grep` w/ specific pattern first, then `Read` relevant block w/ `offset`/`limit`.

## Environment Setup

1. Copy `.env.local.example` → `.env` in both `museum-backend/` and `museum-frontend/`
2. Backend need: PostgreSQL (via docker-compose or local), at least one LLM API key (`OPENAI_API_KEY` / `DEEPSEEK_API_KEY` / `GOOGLE_API_KEY`), JWT secrets
3. Frontend need: `EXPO_PUBLIC_API_BASE_URL` pointing to backend
4. Backend DB exposed on port **5433** (not 5432) when using docker-compose

## Honesty + truth-telling (UFR-013)

**Non-negotiable.** Applies to every response, every agent report, every claim of fact, number, or source.

### FORBIDDEN

- Lying or fabricating any fact, number, citation, file path, line number, function name, command output, test result, or external source.
- Claiming to have verified something without actually running the verification.
- Simulating certainty when you are uncertain (e.g. "this works" when you haven't tested it).
- Hiding or minimizing a failure (test failure, build error, type error, regression).
- Denying a mistake after it is pointed out, or trying to retroactively reframe it.
- Pretense or sycophancy ("great question", "you're absolutely right") when it adds no information.

### REQUIRED

- State the truth as it is, even when uncomfortable.
- When in doubt, **verify before answering**: `WebSearch` / `WebFetch` for external facts; `Read` / `Grep` for code claims; run the command and report the actual output.
- Say "I don't know" or "I haven't verified that" explicitly when you don't or haven't.
- Report failures (test, build, lint, smoke check) immediately and accurately. Do not soften the language. Quote the error verbatim.
- When you detect a previous claim was wrong, correct it in the next message — name the claim, name the correction.
- Distinguish "the code says X" (verified by reading) from "I expect X" (not verified) from "X is generally true" (general knowledge, may be stale).

### Verification ladder (cheapest → strongest)

1. Memory / general knowledge — lowest confidence. Mark as such if used.
2. `Read` the file in question.
3. `Grep` / `gitnexus_query` to confirm a claim crosses the codebase consistently.
4. Run the command (`pnpm test`, `pnpm tsc --noEmit`, `pnpm lint`, smoke script). Report the exit code and the relevant lines of output.
5. `WebSearch` / `WebFetch` for external facts (library APIs, RFCs, CVEs, product changelogs). Cite the URL in the response.

When the cost of being wrong is high (security claim, breaking change claim, "this is safe to deploy"), climb to step 4 or 5 before answering.

### Anti-patterns

| Don't say | Say instead |
|---|---|
| "This is fixed." (no verification run) | "I made the change. I have not yet run the tests; want me to?" |
| "All tests pass." (didn't actually run) | "I ran `pnpm test` — output: `Tests: 3700 passed`. Pasted above." |
| "The library supports X." (from memory) | "Per the docs at `<URL>` (just fetched), the library supports X via `Y`." |
| "You're right, sorry, fixing now." (when you weren't actually wrong) | "Let me re-check — the code at `path/to/file.ts:42` actually does Z, which matches the original behavior. I think the disagreement is about W; can you confirm?" |
| Silent skip of a failing check | "The smoke test failed: `<exact error>`. Stopping here so we can debug." |

## Migration Governance

See [`docs/MIGRATION_GOVERNANCE.md`](docs/MIGRATION_GOVERNANCE.md) for the full rules. Quick reference:

- Always use `node scripts/migration-cli.cjs generate --name=X` to generate migrations — never hand-write migration SQL
- `DB_SYNCHRONIZE` must **never** be `true` in production (hard-coded `false` in `data-source.ts` for prod)
- CI blocks if `DB_SYNCHRONIZE=true` found in any `.env*` file
- After generating migration, verify w/ `pnpm migration:run` on clean DB then `node scripts/migration-cli.cjs generate --name=Check` — output should be empty (no schema drift)

## AI Safety

Chat pipeline use layered defenses:

1. **Input guardrail** (`art-topic-guardrail.ts`) — keyword-based pre-filter for insults, off-topic, injection, external actions. Runs before LLM call.
2. **Structural prompt isolation** — system instructions + section prompts placed BEFORE user content in LLM message array. Boundary marker `[END OF SYSTEM INSTRUCTIONS]` separates system from user input.
3. **Input sanitization** — user-controlled fields (`location`, `locale`) sanitized (Unicode normalization, zero-width char stripping, truncation) before prompt inclusion via `sanitizePromptInput()`.
4. **Output guardrail** — same keyword approach on LLM output to catch leaks.

When modifying chat pipeline:
- Never inject user-controlled fields directly into system prompts
- Keep message ordering: `[SystemMessage(system), SystemMessage(section), ...history, HumanMessage(user)]`
- Guardrail in `chat.service.ts` = single source of truth for content filtering — no duplicate checks elsewhere

### Voice V1 (2026-04)

Pipeline classique STT → LLM → TTS, **toujours actif** (feature flags `FEATURE_FLAG_VOICE_MODE` et `TTS_ENABLED` retirés).

- **STT** : `gpt-4o-mini-transcribe` (env `LLM_AUDIO_TRANSCRIPTION_MODEL`), même `OPENAI_API_KEY`. Pas de "clé Whisper" séparée.
- **LLM** : LangChain orchestrator multi-provider (cf. existant).
- **TTS** : `gpt-4o-mini-tts` (env `TTS_MODEL`), voix `alloy` par défaut. Audio MP3 retourné en buffer + persisté S3 (`ChatMessage.audioUrl`) pour replay offline.
- **Guardrails** : appliqués au texte intermédiaire (transcrit + réponse LLM) — voix hérite gratuitement sécurité chat texte.
- **SSE streaming** : @deprecated, voir `docs/adr/ADR-001-sse-streaming-deprecated.md`.
- **Realtime WebRTC** : reporté V1.1 — réévaluation après mesure latence terrain pipeline V1.

Spec complète : `docs/AI_VOICE.md`.

## Test Discipline — DRY Factories

**Tests MUST use shared factories. Inline object creation forbidden.**

### Principle

Every test entity (User, ChatMessage, ChatSession, etc.) MUST be created via shared factory function in `tests/helpers/`. No test file should define own `makeUser()`, `makeMessage()`, or `makeSession()` inline.

### Existing factories (use them)

| Factory | Location | Creates |
|---------|----------|---------|
| `makeUser(overrides?)` | `tests/helpers/auth/user.fixtures.ts` | `User` entity with defaults |
| `makeToken(overrides?)` | `tests/helpers/auth/token.helpers.ts` | JWT access token |
| `adminToken()` / `visitorToken()` | `tests/helpers/auth/token.helpers.ts` | Role-specific tokens |
| `makeMessage(overrides?)` | `tests/helpers/chat/message.fixtures.ts` | `ChatMessage` entity |
| `makeSession(overrides?)` | `tests/helpers/chat/message.fixtures.ts` | `ChatSession` entity |
| `buildChatTestService()` | `tests/helpers/chat/chatTestApp.ts` | Full ChatService with in-memory deps |
| `createRouteTestApp()` | `tests/helpers/http/route-test-setup.ts` | Express test app |
| `createE2EHarness()` | `tests/helpers/e2e/e2e-app-harness.ts` | Full E2E environment |

### Rules

1. **New entity?** → Create factory in `tests/helpers/<module>/<entity>.fixtures.ts` FIRST
2. **Need mock repo?** → Check if in-memory repo exists in `tests/helpers/`. If not, create one.
3. **Override pattern**: `makeEntity({ field: value })` — factory provides sensible defaults, test overrides only what matters
4. **Frontend**: Use `test-utils.tsx` for shared mocks. Create factories in `__tests__/helpers/` for data objects.
5. **Never** duplicate `jest.mock()` calls already exist in `test-utils.tsx`

### Anti-patterns to avoid

| Don't do this | Do this instead |
|---|---|
| `const user = { id: 1, email: '...', ... } as User` inline | `const user = makeUser()` or `makeUser({ email: 'custom@test.com' })` |
| `const msg = { id: 'x', role: 'user', text: '...' } as ChatMessage` inline | `const msg = makeMessage({ text: 'my text' })` |
| Local `makeUser()` in each test file | Import from `tests/helpers/auth/user.fixtures.ts` |
| Copy-paste mock repo in each test | Create shared in-memory repo in `tests/helpers/` |
| `jest.mock('@sentry/react-native')` in each test | Import `test-utils.tsx` which already mocks it |

### Tier classification rule (ADR-012)

A test file lives in `tests/integration/` **iff** it imports `tests/helpers/e2e/postgres-testcontainer.ts` (or a sibling Redis/S3 helper) or instantiates a TypeORM `DataSource` against a real testcontainer. Anything else belongs in `tests/unit/`. See `docs/adr/ADR-012-test-pyramid-taxonomy.md`.

### Factory enforcement (ESLint)

The workspace plugin `eslint-plugin-musaium-test-discipline` rejects new test files that inline-construct `User`, `ChatMessage`, `ChatSession`, `Review`, or `SupportTicket` objects. Use the factories in `tests/helpers/<module>/<entity>.fixtures.ts` (BE) or `__tests__/helpers/factories/` (FE). The grandfather baseline at `tools/eslint-plugin-musaium-test-discipline/baselines/no-inline-test-entities.json` lists files exempted at Phase 0; Phase 7 reduces this list as files are migrated. **The baseline length cannot grow** — a CI test enforces the cap.

## ESLint Discipline

**`eslint-disable` = last resort, not first reflex.** If ESLint flags code, rule exists for reason — find proper fix before reaching for disable comment.

### Decision tree

1. **Understand rule** — read ESLint docs for rule. What problem does it prevent?
2. **Fix code** — refactor to satisfy rule. Correct path 90% of time.
3. **Only disable if ALL true:**
   - Rule = false positive for this specific context (e.g., `require()` for RN image assets, `||` for intentional empty-string-as-falsy)
   - No alternative code structure satisfies both rule + intent
   - `-- reason` comment explains WHY disable necessary

### Common anti-patterns to avoid

| Don't do this | Do this instead |
|---|---|
| `eslint-disable complexity` on a 60-line function | Extract helper functions to reduce cyclomatic complexity |
| `eslint-disable max-lines-per-function` repeatedly | Split the function or extract sub-routines |
| `eslint-disable max-params` with 7+ params | Use an options object: `fn(id, options: { ... })` |
| `eslint-disable react/display-name` on `memo()` | `memo(function ComponentName() { ... })` |
| `eslint-disable @typescript-eslint/no-misused-promises` | `onPress={() => { void handleAsync() }}` |
| `eslint-disable @typescript-eslint/no-explicit-any` | Use `unknown` and narrow with type guards |
| `eslint-disable max-lines` at file level | Split the file into focused modules |
| `eslint-disable @typescript-eslint/prefer-optional-chain` | Use `foo?.bar` instead of `foo && foo.bar` |

### Justified disable patterns (reference)

ONLY categories where `eslint-disable` acceptable in this project:
- `prefer-nullish-coalescing` when intentionally treating empty string as falsy (`||` vs `??`)
- `no-unnecessary-condition` at trust boundaries (JWT payloads, raw DB rows, external API data)
- `require-await` on no-op implementations of async interfaces (null-object pattern)
- `no-unnecessary-type-parameters` on generic interface APIs where `T` constrains input
- `no-require-imports` for React Native `require()` asset pattern + OpenTelemetry conditional loading
- `no-control-regex` in input sanitization code
- `sonarjs/hashing` for non-cryptographic checksums (S3 Content-MD5)
- `sonarjs/pseudo-random` for jitter/backoff, not security
- `react-hooks/refs` for React Native `Animated.Value` / `PanResponder` refs read once at creation (e.g. `useRef(new Animated.Value(0)).current`)
- `no-namespace` for Express `declare global { namespace Express }` Request augmentation — standard pattern required by `@types/express`
- `max-lines-per-function` on TypeORM migration files — single atomic `up()` can't be split

### `eslint-disable` PR-validation hard rule (Phase 0)

Any new `eslint-disable` (line, block, or file-level) added to a PR must include BOTH a `Justification:` paragraph (≥20 chars) AND an `Approved-by:` paragraph (reviewer username or commit SHA) in the same comment body, e.g.:

```ts
// eslint-disable-next-line some-rule -- Justification: trust-boundary unmarshalling, narrowed via type guard at L42. Approved-by: tim@2026-04-30
```

The custom rule `musaium-test-discipline/no-undisabled-test-discipline-disable` machine-enforces this for the test-discipline rules specifically. Reviewers MUST reject PRs that add an undocumented disable to any rule, even rules outside the test-discipline namespace. Pre-approved categories listed earlier in this section remain the only ones that don't require a per-PR justification — anything outside them is treated as a one-off exception requiring explicit reviewer agreement before merge.

## Team reports lifecycle

Two locations for `/team` skill artefacts — **not duplicates**, different roles:

| Path | Role | Writer |
|---|---|---|
| `.claude/skills/team/team-reports/` | **Runtime active** — `/team` skill writes here. Contains `working/<date>-<slug>/` scratch pads (ephemeral) + recently-closed runs (≤30 days). | `/team` skill runs |
| `/team-reports/` (repo root) | **Archive read-only** — closed audits, brainstorms, external reports. Git-ignored by default; only `README.md` versioned. | Manual promotion from runtime after ~30 days |

Rules:
- Agents MUST write to `.claude/skills/team/team-reports/`, never `/team-reports/`.
- Report in `working/` = disposable; graduate out of `working/` when sprint closes.
- Promotion runtime → archive manual for now. Future `scripts/archive-team-reports.sh` may automate.

## Deployment

- Backend: Docker image → GHCR → VPS OVH (see `docs/OPS_DEPLOYMENT.md`)
- Mobile: EAS Build → App Store / Google Play (see `docs/MOBILE_INTERNAL_TESTING_FLOW.md`)
- Secrets + CI config documented in `docs/CI_CD_SECRETS.md`

## Dependency Monitoring

### TypeORM
TypeORM docs repo archived March 2026. v1.0 planned H1 2026 w/ breaking changes.
Current assessment: works, migration not urgent, but monitor releases.
Alternatives for future: Drizzle (S-tier 2026), Prisma 7, Kysely.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Innov-mind-museum** (18112 symbols, 30560 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Innov-mind-museum/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Innov-mind-museum/clusters` | All functional areas |
| `gitnexus://repo/Innov-mind-museum/processes` | All execution flows |
| `gitnexus://repo/Innov-mind-museum/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
