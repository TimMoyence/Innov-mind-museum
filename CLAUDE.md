# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Musaium — an interactive museum assistant mobile app. Visitors photograph artworks or ask questions and get AI-powered contextual responses via LangChain + LLM (OpenAI/Deepseek/Google).

Monorepo with three independent apps:
- **`museum-backend/`** — Node.js 22 + Express 5 + TypeORM + PostgreSQL 16 (pnpm)
- **`museum-frontend/`** — React Native 0.83 + Expo 55 + Expo Router (npm)
- **`museum-web/`** — Next.js 15 + React 19 + Tailwind 4 + Framer Motion (pnpm) — landing page + admin panel

## Progress Tracking

All tracking lives in **`docs/V1_Sprint/`**:
- **`PROGRESS_TRACKER.md`** — checkbox tracker per sprint/item (quick status)
- **`SPRINT_LOG.md`** — detailed technical journal (what, how, why, which files)
- **`MASTER_ROADMAP_V2.md`** — product roadmap (read-only reference)

After completing sprint work, update both PROGRESS_TRACKER and SPRINT_LOG.

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
pnpm build:tokens                # build design tokens → museum-frontend/shared/ui/tokens.generated.ts
```

### CI

GitHub Actions workflows (`.github/workflows/`):
- `ci-cd-backend.yml` — quality gate (tsc + ESLint + tests + OpenAPI validate + audit) → E2E (PR/nightly) → deploy prod (push main) / staging (push staging) with Trivy scan + Sentry release + smoke test
- `ci-cd-web.yml` — quality gate (lint + build + test + audit) → Lighthouse CI (PR) → deploy Docker/GHCR → VPS (push main)
- `ci-cd-mobile.yml` — quality gate (Expo Doctor + OpenAPI sync + audit + i18n + lint + tests) → Maestro E2E (dispatch) → EAS build + store submit (dispatch/tag)
- `_deploy-backend.yml` — reusable deploy workflow (called by ci-cd-backend)
- `deploy-privacy-policy.yml` — privacy policy static page deploy
- `codeql.yml` — CodeQL security analysis (security-extended + security-and-quality)
- `semgrep.yml` — SAST static analysis scanning

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
- Each module exposes a barrel `index.ts` that builds and wires its own dependency graph
- `createApp()` accepts optional overrides for testing (inject mock chatService/healthCheck)
- Routes live in `modules/<name>/**/http/<name>.route.ts`
- TypeORM entities are in `modules/<name>/**/domain/` with `.entity.ts` suffix
- Repository interfaces (ports) in `domain/`, PG implementations (adapters) in `secondary/`

Chat module internals: `chat.service.ts` orchestrates LLM calls via `langchain.orchestrator.ts`, uses sectioned prompts (`llm-sections.ts`), art-topic guardrail, image storage (S3 or local stub), audio transcription.

### Frontend — Feature-driven + Expo Router

```
app/                       # Expo Router file-based routing
├── _layout.tsx            # root layout
├── auth.tsx               # auth screen
├── (tabs)/                # bottom tab navigator (home, conversations)
└── (stack)/               # stack screens (chat session, settings, onboarding, etc.)

features/                  # business logic by domain
├── art-keywords/          # offline art-topic classification (WIP)
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
- API types are auto-generated from backend OpenAPI spec (`npm run generate:openapi-types` → `shared/api/generated/openapi.ts`)
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
- Admin panel uses JWT auth with refresh token interceptor
- i18n via custom dictionary loader (FR/EN)
- Framer Motion for landing page animations
- Recharts for analytics dashboards

## Path Aliases

**Backend:** `@src/*` → `src/*`, `@modules/*` → `src/modules/*`, `@data/*` → `src/data/*`, `@shared/*` → `src/shared/*`

**Frontend:** `@/*` → `./*`

**Web:** `@/*` → `./src/*`

## Environment Setup

1. Copy `.env.local.example` → `.env` in both `museum-backend/` and `museum-frontend/`
2. Backend needs: PostgreSQL (via docker-compose or local), at least one LLM API key (`OPENAI_API_KEY` / `DEEPSEEK_API_KEY` / `GOOGLE_API_KEY`), JWT secrets
3. Frontend needs: `EXPO_PUBLIC_API_BASE_URL` pointing to backend
4. Backend DB exposed on port **5433** (not 5432) when using docker-compose

## Migration Governance

- Always use `node scripts/migration-cli.cjs generate --name=X` to generate migrations — never hand-write migration SQL
- `DB_SYNCHRONIZE` must **never** be `true` in production (hard-coded `false` in `data-source.ts` for prod)
- CI blocks if `DB_SYNCHRONIZE=true` is found in any `.env*` file
- After generating a migration, verify it with `pnpm migration:run` on a clean DB then `node scripts/migration-cli.cjs generate --name=Check` — output should be empty (no schema drift)

## AI Safety

The chat pipeline uses layered defenses:

1. **Input guardrail** (`art-topic-guardrail.ts`) — keyword-based pre-filter for insults, off-topic, injection, external actions. Runs before LLM call.
2. **Structural prompt isolation** — system instructions and section prompts are placed BEFORE user content in the LLM message array. Boundary marker `[END OF SYSTEM INSTRUCTIONS]` separates system from user input.
3. **Input sanitization** — user-controlled fields (`location`, `locale`) are sanitized (Unicode normalization, zero-width char stripping, truncation) before prompt inclusion via `sanitizePromptInput()`.
4. **Output guardrail** — same keyword approach on LLM output to catch leaks.

When modifying the chat pipeline:
- Never inject user-controlled fields directly into system prompts
- Keep message ordering: `[SystemMessage(system), SystemMessage(section), ...history, HumanMessage(user)]`
- The guardrail in `chat.service.ts` is the single source of truth for content filtering — do not add duplicate checks elsewhere

## Test Discipline — DRY Factories

**Tests MUST use shared factories. Inline object creation is forbidden.**

### Principle

Every test entity (User, ChatMessage, ChatSession, etc.) MUST be created via a shared factory function in `tests/helpers/`. No test file should define its own `makeUser()`, `makeMessage()`, or `makeSession()` inline.

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

1. **New entity?** → Create a factory in `tests/helpers/<module>/<entity>.fixtures.ts` FIRST
2. **Need a mock repo?** → Check if an in-memory repo exists in `tests/helpers/`. If not, create one.
3. **Override pattern**: `makeEntity({ field: value })` — factory provides sensible defaults, test overrides only what matters
4. **Frontend**: Use `test-utils.tsx` for shared mocks. Create factories in `__tests__/helpers/` for data objects.
5. **Never** duplicate `jest.mock()` calls that already exist in `test-utils.tsx`

### Anti-patterns to avoid

| Don't do this | Do this instead |
|---|---|
| `const user = { id: 1, email: '...', ... } as User` inline | `const user = makeUser()` or `makeUser({ email: 'custom@test.com' })` |
| `const msg = { id: 'x', role: 'user', text: '...' } as ChatMessage` inline | `const msg = makeMessage({ text: 'my text' })` |
| Local `makeUser()` in each test file | Import from `tests/helpers/auth/user.fixtures.ts` |
| Copy-paste mock repo in each test | Create shared in-memory repo in `tests/helpers/` |
| `jest.mock('@sentry/react-native')` in each test | Import `test-utils.tsx` which already mocks it |

## ESLint Discipline

**`eslint-disable` is a last resort, not a first reflex.** If ESLint flags code, the rule exists for a reason — find the proper fix before reaching for a disable comment.

### Decision tree

1. **Understand the rule** — read the ESLint docs for the rule. What problem does it prevent?
2. **Fix the code** — refactor to satisfy the rule. This is the correct path 90% of the time.
3. **Only disable if ALL of these are true:**
   - The rule is a false positive for this specific context (e.g., `require()` for RN image assets, `||` for intentional empty-string-as-falsy)
   - No alternative code structure satisfies both the rule and the intent
   - A `-- reason` comment explains WHY the disable is necessary

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

These are the ONLY categories where `eslint-disable` is acceptable in this project:
- `prefer-nullish-coalescing` when intentionally treating empty string as falsy (`||` vs `??`)
- `no-unnecessary-condition` at trust boundaries (JWT payloads, raw DB rows, external API data)
- `require-await` on no-op implementations of async interfaces (null-object pattern)
- `no-unnecessary-type-parameters` on generic interface APIs where `T` constrains input
- `no-require-imports` for React Native `require()` asset pattern and OpenTelemetry conditional loading
- `no-control-regex` in input sanitization code
- `sonarjs/hashing` for non-cryptographic checksums (S3 Content-MD5)
- `sonarjs/pseudo-random` for jitter/backoff, not security
- `react-hooks/refs` for React Native `Animated.Value` / `PanResponder` refs read once at creation (e.g. `useRef(new Animated.Value(0)).current`)
- `no-namespace` for Express `declare global { namespace Express }` Request augmentation — the standard pattern required by `@types/express`
- `max-lines-per-function` on TypeORM migration files — single atomic `up()` cannot be split

## Deployment

- Backend: Docker image → GHCR → VPS OVH (see `docs/DEPLOYMENT_STEP_BY_STEP.md`)
- Mobile: EAS Build → App Store / Google Play (see `docs/MOBILE_INTERNAL_TESTING_FLOW.md`)
- Secrets & CI config documented in `docs/CI_CD_SECRETS.md`

## Dependency Monitoring

### TypeORM
TypeORM docs repo archived March 2026. v1.0 planned H1 2026 with breaking changes.
Current assessment: works, migration not urgent, but monitor releases.
Alternatives for future: Drizzle (S-tier 2026), Prisma 7, Kysely.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

See [AGENTS.md](AGENTS.md) for full GitNexus configuration, tools, and workflows.
<!-- gitnexus:end -->
