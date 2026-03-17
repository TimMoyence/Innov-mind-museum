# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MuseumIA — an interactive museum assistant mobile app. Visitors photograph artworks or ask questions and get AI-powered contextual responses via LangChain + LLM (OpenAI/Deepseek/Google).

Monorepo with two independent apps:
- **`museum-backend/`** — Node.js 22 + Express 5 + TypeORM + PostgreSQL 16 (pnpm)
- **`museum-frontend/`** — React Native 0.79 + Expo 53 + Expo Router (npm)

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

### CI

GitHub Actions: `ci-backend.yml` (lint + test), `ci-frontend.yml` (lint + test), `deploy-backend.yml` / `deploy-backend-staging.yml` (Docker build + VPS deploy), `mobile-release.yml` (EAS build + submit).

## Architecture

### Backend — Hexagonal (Ports & Adapters)

```
src/
├── config/env.ts          # all env vars parsed & validated in one place
├── data/db/               # TypeORM data-source + migrations/
├── modules/
│   ├── auth/              # hexagonal: domain → useCase → adapters (primary=HTTP, secondary=PG repos)
│   └── chat/              # hexagonal: domain → application → infrastructure (primary=HTTP, secondary=PG+S3+LangChain)
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
├── auth/                  # login/register, token storage, protected route hook
├── chat/                  # chat session hook, contracts, API calls
├── conversation/          # conversation list/dashboard
├── legal/                 # privacy policy content
└── settings/              # runtime settings

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

## Path Aliases

**Backend:** `@src/*` → `src/*`, `@modules/*` → `src/modules/*`, `@data/*` → `src/data/*`, `@shared/*` → `src/shared/*`

**Frontend:** `@/*` → `./*`

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

## Deployment

- Backend: Docker image → GHCR → VPS OVH (see `docs/DEPLOYMENT_STEP_BY_STEP.md`)
- Mobile: EAS Build → App Store / Google Play (see `docs/MOBILE_INTERNAL_TESTING_FLOW.md`)
- Secrets & CI config documented in `docs/CI_CD_SECRETS.md`
