# CLAUDE.md

Guidance for Claude Code (claude.ai/code) in this repo.

## Project Overview

Musaium — assistant balade culturelle hors-musée et intra-musée, multi-musées, voice-first. Visiteurs photographient les œuvres, parlent à l'AI, suivent des balades guidées multi-points-d'intérêt. AI conversationnel via LangChain + LLM (OpenAI/Deepseek/Google).

Audience : B2C visiteur (freemium) + B2B musée (licence) + institutionnel (subvention).
Launch V1 : 2026-06-01.

Monorepo, three independent apps:
- **`museum-backend/`** — Node.js 22 + Express 5 + TypeORM + PostgreSQL 16 (pnpm)
- **`museum-frontend/`** — React Native 0.83 + Expo 55 + Expo Router (npm)
- **`museum-web/`** — Next.js 15 + React 19 + Tailwind 4 + Framer Motion (pnpm) — landing + admin panel

## Roadmap (vivante, double)

- **`docs/ROADMAP_PRODUCT.md`** — features produit, OKR Q2-2026, NOW/NEXT/LATER. Coche `[x]` au merge.
- **`docs/ROADMAP_TEAM.md`** — orchestrateur /team v13, OKR cost+quality, T1.x backlog.

Réécrites complètement chaque sprint (4 semaines). Snapshots précédents = `git log -- docs/ROADMAP_*.md`. CHAQUE feature non-trivial passe par `/team` Spec Kit (spec.md + design.md + tasks.md). Le dispatcher `/team` lit ces 2 fichiers en début de cycle et coche au merge.

Index docs : **`docs/DOCS_INDEX.md`**. Tech debts ouverts : **`docs/TECH_DEBT.md`**.

Sprint debrief pédagogique 2026-04-30 → 2026-05-05 : **`docs/explications-sprint-2026-05-05/`** (22 fichiers, ~6200 lignes en français).

Post-2026-04-20 runtime tracking : `.claude/tasks/` + `.claude/skills/team/team-reports/`.

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
- `ci-cd-backend.yml` — quality gate (tsc + ESLint + tests + OpenAPI validate + audit) → E2E (PR/nightly) → deploy prod (push main) / staging (push staging) w/ Trivy + Sentry + smoke
- `ci-cd-web.yml` — quality (lint + build + test + audit) → Lighthouse CI (PR) → deploy Docker/GHCR → VPS
- `ci-cd-mobile.yml` — quality (Expo Doctor + OpenAPI sync + audit + i18n + lint + tests + shard-manifest sentinel) → Maestro Android matrix (4 shards) + iOS nightly cron → EAS build + store submit
- `_deploy-backend.yml` — reusable deploy workflow
- `deploy-privacy-policy.yml` — privacy policy static page deploy
- `codeql.yml` — CodeQL security analysis
- `semgrep.yml` — SAST static analysis

Phase history (Maestro / Web a11y / Stryker / Auth e2e / Chaos / Coverage gates) consolidé dans **`docs/PHASE_HISTORY.md`**.

## Architecture

Détail complet par app (BE hexagonal, FE Expo Router, Web Next.js App Router) : **`docs/ARCHITECTURE.md`**.

Résumé :
- **Backend** — hexagonal (domain → useCase → adapters), modules barrel-pattern (admin/auth/museum/review/support) ou composition-root (chat/knowledge-extraction). Import discipline via codemod 2026-05-05 (alias `@modules/*`/`@shared/*`/`@data/*`, no 4-level relative). Minimal-barrel policy.
- **Frontend** — feature-driven sous `features/`, routing Expo Router, types API auto-générés depuis OpenAPI, tokens via `expo-secure-store`.
- **Web** — App Router i18n FR/EN, admin panel JWT + refresh interceptor, Framer Motion landing.

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

Doubt? Use `Grep` w/ specific pattern first, then `Read` relevant block w/ `offset`/`limit`.

## Pièges connus (gotchas opérationnels)

Leçons techniques non évidentes consolidées des sprints précédents. Ajoute ici tout piège qui a fait perdre du temps à un dev / agent — pas les bugs métier, juste les surprises infrastructure.

- **Hook Jest cache parfois flaky** — un ratchet coverage qui plante sans raison apparente est souvent un cache Jest stale. Run `pnpm jest --clearCache` (BE) ou `npm test -- --clearCache` (FE) avant de réinvestiguer. Seen 2026-04-17 SESSION_FINAL leçon 3.
- **`docs/` whitelisted dans .gitignore** — gitignored par défaut, sous-dossiers doivent être whitelistés explicitement (`!docs/<sub>/`). Si `git status` ne voit pas un nouveau sous-dossier dans `docs/`, c'est ça.
- **GitNexus auto-inject `<!-- gitnexus:start -->` dans `AGENTS.md`** — `npx gitnexus analyze` expand ce bloc. Comportement intentionnel, ne pas effacer le marker.
- **TypeORM `.set({ field: undefined })` est silencieusement skip** — `UpdateQueryBuilder` ne génère PAS de `SET field = NULL` quand on passe `undefined`. Use `() => 'NULL'` raw expression. Bug verifyEmail 2026-05.
- **PgBouncer transaction mode interdit `LISTEN/NOTIFY`, session-scoped advisory locks, persistent prepared statements** — Musaium n'utilise rien de ça aujourd'hui (audit ADR-021), mais à vérifier au cas par cas.
- **SWC + TypeORM cross-entity = ReferenceError circular** — fix = wrap les FK avec le type alias `Relation<T>`. Ne pas s'écarter de ce pattern sur les nouvelles entités.

## Environment Setup

1. Copy `.env.local.example` → `.env` in both `museum-backend/` and `museum-frontend/`
2. Backend need: PostgreSQL (via docker-compose or local), at least one LLM API key (`OPENAI_API_KEY` / `DEEPSEEK_API_KEY` / `GOOGLE_API_KEY`), JWT secrets
3. Frontend need: `EXPO_PUBLIC_API_BASE_URL` pointing to backend
4. Backend DB exposed on port **5433** (not 5432) when using docker-compose

## Honesty + truth-telling (UFR-013)

**Non-negotiable.** Applies to every response, every agent report.

**FORBIDDEN :** lying or fabricating any fact / number / citation / file path / line / function / command output / test result / source ; claiming verification without verifying ; simulating certainty when uncertain ; hiding or minimizing failures (test/build/lint) ; denying a mistake after it's pointed out ; pretense or sycophancy.

**REQUIRED :** state truth as it is, even uncomfortable ; verify before answering (`Read`/`Grep` for code, `WebSearch`/`WebFetch` for external) ; "I don't know" valid ; report failures verbatim ; correct prior wrong claims explicitly ; distinguish "code says X" (verified) vs "I expect X" (not verified) vs "general knowledge" (may be stale).

**Verification ladder (cheapest → strongest) :** memory < `Read` file < `Grep`/`gitnexus_query` < run command (report exit code + output) < `WebSearch`/`WebFetch` (cite URL).

When cost of being wrong is high (security claim, breaking change, "safe to deploy") → climb to step 4 or 5 before answering.

**Anti-patterns key :** "all tests pass" without running ≠ "I ran `pnpm test` — output: …" ; "this is fixed" without verification ≠ "I made the change, want me to run tests?" ; silent skip of failing check ≠ "smoke test failed: `<exact error>`. Stopping."

## Migration Governance

See [`docs/MIGRATION_GOVERNANCE.md`](docs/MIGRATION_GOVERNANCE.md) for full rules. Quick reference:

- Always use `node scripts/migration-cli.cjs generate --name=X` to generate migrations — never hand-write SQL
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

Pipeline classique STT → LLM → TTS, **toujours actif** (feature flags retirés).

- **STT** : `gpt-4o-mini-transcribe` (env `LLM_AUDIO_TRANSCRIPTION_MODEL`), même `OPENAI_API_KEY`.
- **LLM** : LangChain orchestrator multi-provider.
- **TTS** : `gpt-4o-mini-tts` (env `TTS_MODEL`), voix `alloy` par défaut. Audio MP3 buffer + persisté S3 (`ChatMessage.audioUrl`).
- **Guardrails** : appliqués au texte intermédiaire (transcrit + réponse LLM).
- **SSE streaming** : @deprecated, voir `docs/adr/ADR-001-sse-streaming-deprecated.md`.
- **Realtime WebRTC** : reporté V1.1.

Spec complète : `docs/AI_VOICE.md`.

## Test Discipline — DRY Factories

**Tests MUST use shared factories. Inline object creation forbidden.**

Détail complet (factories existantes, rules, anti-patterns, tier classification ADR-012, ESLint enforcement) : **`docs/TEST_FACTORIES.md`**.

Quick reference :
- BE factories : `museum-backend/tests/helpers/<module>/<entity>.fixtures.ts`
- FE factories : `museum-frontend/__tests__/helpers/factories/<entity>.factories.ts`
- Pattern : `makeUser()` / `makeUser({ field: value })` — never inline `{ id, email, … } as User`
- ESLint plugin `eslint-plugin-musaium-test-discipline` blocks new violations ; baseline at `tools/eslint-plugin-musaium-test-discipline/baselines/no-inline-test-entities.json` cannot grow.

## ESLint Discipline

**`eslint-disable` = last resort, not first reflex.**

Détail (decision tree, common anti-patterns, justified disable patterns whitelist, PR-validation hard rule) : **`docs/LINT_DISCIPLINE.md`**.

Quick reference :
- Read rule docs → fix code (90% of cases) → only disable if false positive in this context, no alternative, `-- reason` comment
- Any new `eslint-disable` in PR must include `Justification: ≥20 chars` + `Approved-by: <reviewer/SHA>` paragraphs
- Pre-approved categories listed in `docs/LINT_DISCIPLINE.md` are the only ones not requiring per-PR justification

## Team reports lifecycle

Two locations for `/team` skill artefacts — **not duplicates**:

| Path | Role | Writer |
|---|---|---|
| `.claude/skills/team/team-reports/` | **Runtime active** — `/team` skill writes here. Contains `working/<date>-<slug>/` (ephemeral) + recently-closed runs (≤30 days). | `/team` skill runs |
| `/team-reports/` (repo root) | **Archive read-only** — closed audits, brainstorms, external reports. Git-ignored ; only `README.md` versioned. | Manual promotion ~30 days |

Rules :
- Agents MUST write to `.claude/skills/team/team-reports/`, never `/team-reports/`.
- Report in `working/` = disposable.
- Promotion runtime → archive manual for now.

## Deployment

- Backend : Docker image → GHCR → VPS OVH (see `docs/OPS_DEPLOYMENT.md`)
- Mobile : EAS Build → App Store / Google Play (see `docs/MOBILE_INTERNAL_TESTING_FLOW.md`)
- Secrets + CI config : `docs/CI_CD_SECRETS.md`

## Dependency Monitoring

### TypeORM
TypeORM docs repo archived March 2026. v1.0 planned H1 2026 w/ breaking changes. Current : works, migration not urgent, monitor releases. Alternatives for future : Drizzle (S-tier 2026), Prisma 7, Kysely.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Innov-mind-museum** (19228 symbols, 32233 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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
