# CLAUDE.md

Guidance for Claude Code (claude.ai/code) in this repo.

## Project Overview

Musaium — interactive museum assistant mobile app. Visitors photograph artworks or ask questions, get AI contextual responses via LangChain + LLM (OpenAI/Deepseek/Google).

Monorepo, three independent apps:
- **`museum-backend/`** — Node.js 22 + Express 5 + TypeORM + PostgreSQL 16 (pnpm)
- **`museum-frontend/`** — React Native 0.83 + Expo 55 + Expo Router (npm)
- **`museum-web/`** — Next.js 15 + React 19 + Tailwind 4 + Framer Motion (pnpm) — landing + admin panel

## Progress Tracking

Active roadmap: **`docs/ROADMAP_V2.md`** (moved from `docs/V1_Sprint/MASTER_ROADMAP_V2.md` during 2026-04-20 enterprise cleanup).

Historical sprint journals archived in **`docs/archive/v1-sprint-2026-04/`**:
- `PROGRESS_TRACKER.md` — checkbox tracker per sprint/item
- `SPRINT_LOG.md` — detailed technical journal
- `*_AUDIT_2026-04-0*.md` — prior audit reports

Post-2026-04-20 tracking: `.claude/tasks/` (task lists) + `team-reports/` (audit outputs) = active sources of truth.

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
| `docs/ROADMAP_V2.md` | 57 KB | Product roadmap reference | Grep by feature name, read only relevant section |
| `docs/archive/v1-sprint-2026-04/PROGRESS_TRACKER.md` | 57 KB | Sprint tracker (archived) | Read latest sprint section only |

Doubt? Use `Grep` w/ specific pattern first, then `Read` relevant block w/ `offset`/`limit`.

## Environment Setup

1. Copy `.env.local.example` → `.env` in both `museum-backend/` and `museum-frontend/`
2. Backend need: PostgreSQL (via docker-compose or local), at least one LLM API key (`OPENAI_API_KEY` / `DEEPSEEK_API_KEY` / `GOOGLE_API_KEY`), JWT secrets
3. Frontend need: `EXPO_PUBLIC_API_BASE_URL` pointing to backend
4. Backend DB exposed on port **5433** (not 5432) when using docker-compose

## Migration Governance

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

This project is indexed by GitNexus as **Innov-mind-museum** (16064 symbols, 27426 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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
