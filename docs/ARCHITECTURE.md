# Architecture — Backend / Frontend / Web

> Layout + key patterns per app. Originally inline in `CLAUDE.md`, extracted 2026-05-07.

## Backend — Hexagonal (Ports & Adapters)

Layout post backend hexagonal cleanup (run `2026-05-03-backend-arch-cleanup`, 8 commits, 2026-05-04). Every module follows the same canonical 3-layer subgrouping: **domain → useCase → adapters**. Inside each layer, files are subgrouped by **aggregate** / **capability** / **category**.

```
src/
├── config/env.ts                       # all env vars parsed & validated in one place
├── data/db/                            # TypeORM data-source + migrations/
├── modules/<module>/
│   ├── domain/
│   │   ├── <aggregate>/                # entities + repository interface per aggregate (e.g. session/, message/, user/)
│   │   ├── ports/                      # outbound port interfaces consumed by the useCase layer
│   │   └── <module>.types.ts           # cross-aggregate shared types (kept top-level)
│   ├── useCase/
│   │   ├── <capability>/               # one folder per capability (e.g. orchestration/, session/, llm/, guardrail/)
│   │   └── index.ts                    # OPTIONAL barrel — only when module has no composition root
│   ├── adapters/
│   │   ├── primary/http/
│   │   │   ├── routes/                 # Router factories (ONE per Express endpoint group)
│   │   │   ├── schemas/                # zod request/response schemas
│   │   │   ├── helpers/                # cookies, sse, route-utility plumbing
│   │   │   └── <module>.contracts.ts   # public DTOs (kept flat at primary/http/ root)
│   │   └── secondary/
│   │       ├── pg/                     # TypeORM repositories
│   │       ├── notifier/, social/, search/, storage/, audio/, image/, pii/, llm/, guardrails/, …
│   │       └── …                       # category by external concern, NEVER a flat dump
│   ├── jobs/                           # BullMQ workers / cron registrars (composition layer; relative imports OK)
│   ├── <module>-module.ts              # composition root (chat, knowledge-extraction): wire DI graph
│   ├── wiring.ts                       # lazy runtime accessors (request-time getters)
│   └── index.ts                        # public lifecycle barrel (build + teardown API)
├── shared/                             # cross-cutting: errors, logger, routers, validation, domain types
├── helpers/                            # middleware (error handler, rate limit, request ID/logger), swagger setup
├── app.ts                              # Express app factory (middleware chain + router mount)
└── index.ts                            # entrypoint (DB init → app.listen)
```

Modules + composition pattern:
- **admin / auth / museum / review / support** — barrel pattern. `useCase/index.ts` re-exports the public application services.
- **chat / knowledge-extraction** — composition-root pattern. `<module>-module.ts` builds the DI graph; `useCase/index.ts` is intentionally absent (composition root replaces it).
- **daily-art** — hexagonal scaffold normalized at Phase 0bis. Tiny module (1 use case, 1 catalog), still follows the same skeleton for repo coherence.

Key patterns:
- TypeORM entities in `modules/<name>/domain/<aggregate>/`, `.entity.ts` suffix.
- Repository interfaces (ports) live with their aggregate (e.g. `domain/session/chat.repository.interface.ts`); cross-aggregate ports in `domain/ports/`.
- PG implementations in `adapters/secondary/pg/`. External services in `adapters/secondary/<category>/` (search/, storage/, llm/, audio/, image/, etc.).
- Routes live in `modules/<name>/adapters/primary/http/routes/<name>.route.ts` and import the matching schemas from `…/schemas/` and helpers from `…/helpers/`.
- DTOs (`<module>.contracts.ts`) stay at `adapters/primary/http/` root — they are the public surface, not infra.
- `createApp()` accept optional overrides for testing (inject mock chatService/healthCheck).

### Import discipline (enforced via codemod 2026-05-05)

Single rule across the BE codebase, applied uniformly by `eslint --fix` + a one-shot codemod:
- **Same directory** → `from './<sibling>'` (relative).
- **Cross-directory within same top-level module** → `from '@modules/<module>/<layer>/<sub>/<file>'` (alias).
- **Cross-module / shared / data** → `from '@modules/<other>/...' | '@shared/...' | '@data/...'`.
- 4-level relative paths (`'../../../../X'`) are forbidden — always alias.
- Self-aliases that resolve to the same directory as the importer are forbidden — use `'./X'` instead.
- Composition layer files (`<module>-module.ts`, `wiring.ts`, `jobs/*`) are exempt and may use relative paths to their `adapters/` dependencies.

### Barrel-file policy (2026 perf evidence)

Atlassian reported [+75% faster builds](https://www.atlassian.com/blog/atlassian-engineering/faster-builds-when-removing-barrel-files) by removing internal barrel files. The repo follows a **minimal-barrel** policy:
- The single `<module>/index.ts` barrel is the module's public API surface (lifecycle + factories). Keep it.
- `<module>/useCase/index.ts` is barrel-only for the barrel-pattern modules (admin/auth/museum/review/support). Composition-root modules (chat/KE) do not have one.
- Do NOT introduce new internal barrels (e.g. `domain/<aggregate>/index.ts`, `adapters/secondary/<category>/index.ts`). Direct imports keep build/test cold-start fast.

Chat module internals: `chat.service.ts` (under `useCase/orchestration/`) orchestrates LLM calls via `langchain.orchestrator.ts` (under `adapters/secondary/llm/`), uses sectioned prompts (`useCase/llm/llm-sections.ts`), art-topic guardrail (`useCase/guardrail/`), image storage S3-or-stub (`adapters/secondary/storage/`), audio transcription + TTS (`adapters/secondary/audio/`).

## Frontend — Feature-driven + Expo Router

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

## Web — Next.js 15 (App Router)

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
