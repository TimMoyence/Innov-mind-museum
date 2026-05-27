# CLAUDE.md

Guidance for Claude Code (claude.ai/code) in this repo.

## Project Overview

Musaium — Compagnon culturel IA voice-first, **dedans ET dehors** : tu photographies une œuvre (en musée) ou un monument/lieu (en ville, ex Pont de Pierre à Bordeaux), tu en discutes avec l'AI, carnet post-visite. V1 inclut aussi des **suggestions de proximité** (« un monument à côté », « un musée pas loin ») sans navigation. AI conversationnel via LangChain + LLM (OpenAI/Deepseek/Google). V1 launch 2026-06-07 (minimum, à reconfirmer). Audience : B2C freemium (cible V1) ; **B2B musée = hypothèse future, aucun musée démarché à ce jour** (les 3 musées Bordeaux dans `seed-museums.ts` sont des données de démo, pas des pilots contractés) ; institutionnel = backlog. **V2 (post-launch sprint juin-août)** = parcours guidé navigué multi-POI (itinéraire GPS + suivi trajet + audio streaming auto entre points) — distinct du monument-photo V1. Re-cadrage NorthStar 2026-05-21 (cf `docs/ROADMAP_PRODUCT.md` NorthStar) après que l'audit a révélé que `features/walk/` n'existe pas et que les claims « 3 pilots contractés / LOI signées » étaient mensongers.

Monorepo, 3 apps indépendantes :
- **`museum-backend/`** — Node.js 22 + Express 5 + TypeORM + PostgreSQL 16 (pnpm)
- **`museum-frontend/`** — React Native 0.83 + Expo 55 + Expo Router (npm)
- **`museum-web/`** — Next.js 15 + React 19 + Tailwind 4 + Framer Motion (pnpm) — landing + admin panel

## Roadmap (vivante, double)

- **`docs/ROADMAP_PRODUCT.md`** — features, OKR Q2-2026, NOW/NEXT/LATER. Coche `[x]` au merge.
- **`docs/ROADMAP_TEAM.md`** — orchestrateur /team v13, OKR cost+quality, T1.x backlog.

Réécrites chaque sprint (4 sem). Snapshots = `git log -- docs/ROADMAP_*.md`. Chaque feature non-triviale passe par `/team` Spec Kit (spec/design/tasks.md), lus en début de cycle, cochés au merge. Index : **`docs/DOCS_INDEX.md`**. Tech debt : **`docs/TECH_DEBT.md`**. Runtime tracking : `.claude/skills/team/team-reports/`.

## Common Commands

### Backend (`cd museum-backend`)

```bash
pnpm install                     # install deps
pnpm dev                         # dev server with nodemon (port 3000)
pnpm lint                        # ESLint + lint:test-discipline + tsc --noEmit
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
npm run lint                     # ESLint + tsc --noEmit
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
- `deploy-privacy-policy.yml` — privacy policy static page deploy
- `codeql.yml` — CodeQL security analysis
- `semgrep.yml` — SAST static analysis
- `llm-security-promptfoo.yml` — OWASP LLM07 system-prompt-leak adversarial corpus (85 prompts × 8 locales × 10 attack families) vs live chat ; fails PR si pass-rate < 95 % (cron Mon 04:00 UTC + PR sur chat/guardrail). ADR-049.
- ~~`llm-security-garak.yml`~~ **Supprimé 2026-05-17** — coût réel ~$120/mois vs $2 estimé. Deferred V2.1 (fast-path target sans full orchestrator). Cf. ADR-049 amendment.
- `llm-promptfoo-smoke.yml` — non-adversarial daily-art recall smoke (10 prompts) ; fails si recall < 80 % (cron 03:30 UTC daily). Catches over-blocking par guardrail tightening.

Phase history (Maestro / Web a11y / Stryker / Auth e2e / Chaos / Coverage gates) consolidé dans **`docs/PHASE_HISTORY.md`**.

## Architecture

> Architecture détaillée : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

Résumé :
- **Backend** — hexagonal (domain → useCase → adapters), modules barrel-pattern (admin/auth/museum/review/support) ou composition-root (chat/knowledge-extraction). Import discipline via codemod 2026-05-05 (alias `@modules/*`/`@shared/*`/`@data/*`, no 4-level relative). Minimal-barrel policy.
- **Frontend** — feature-driven sous `features/`, routing Expo Router, types API auto-générés depuis OpenAPI, tokens via `expo-secure-store`.
- **Web** — App Router i18n FR/EN, admin panel JWT + refresh interceptor, Framer Motion landing.

## Path Aliases

**Backend:** `@src/*` → `src/*`, `@modules/*` → `src/modules/*`, `@data/*` → `src/data/*`, `@shared/*` → `src/shared/*`

**Frontend:** `@/*` → `./*`

**Web:** `@/*` → `./src/*`

## Token Discipline — Files NOT to Read in full

Auto-generated/massive/pure-data. Reading full wastes tokens.

| File | Size | Why | How to access instead |
|---|---|---|---|
| `museum-frontend/shared/api/generated/openapi.ts` | ~115 KB / ~4 800 lines | Auto-generated from backend OpenAPI spec | `Grep` for specific type/operation name, or read ±50 lines with `offset`/`limit` |
| `museum-frontend/package-lock.json` / `pnpm-lock.yaml` / `museum-backend/pnpm-lock.yaml` / `museum-web/pnpm-lock.yaml` | multi-MB | Lockfiles | Never read directly — use `pnpm list <pkg>` or `npm ls <pkg>` |
| `museum-backend/src/data/db/migrations/*.ts` (~64 files) | ~5 KB each | TypeORM migrations — immutable once run | Read only specific migration relevant to current work |
| `museum-backend/src/modules/daily-art/adapters/secondary/catalog/artworks.data.ts` | 17 KB / 373 lines | Static artwork catalog | Grep for specific artwork ID or title |
| `museum-frontend/shared/ui/tokens.generated.ts` | generated | Design tokens output | Edit `design-system/` source instead |

Doubt? Use `Grep` w/ specific pattern first, then `Read` relevant block w/ `offset`/`limit`.

## Pièges connus (gotchas opérationnels)

Surprises infrastructure (pas les bugs métier) qui ont fait perdre du temps. Ajoute tout nouveau piège ici.

- **Hook Jest cache flaky** — ratchet coverage qui plante sans raison = souvent cache Jest stale. Run `pnpm jest --clearCache` (BE) / `npm test -- --clearCache` (FE) avant d'investiguer.
- **`@musaium/shared` = `file:` package, pas workspace pnpm** (commit `641968ea4`) — pas de `pnpm-workspace.yaml` root. Après `git pull` touchant `packages/musaium-shared/` ou un manifest d'app, re-run `pnpm/npm install` dans CHAQUE app concernée, sinon `pnpm build` échoue `Module not found: @musaium/shared/observability`. Garde-fous : `pnpm bootstrap` (root), `scripts/sentinels/workspace-links.mjs` (détecte symlinks cassés), husky `post-merge` warn, pre-commit Gate 6 bloque si diff touche `packages/**`/`museum-*/package.json` avec symlinks cassés.
- **`docs/` whitelisted dans .gitignore** — gitignored par défaut, sous-dossiers à whitelister explicitement (`!docs/<sub>/`). `git status` ne voit pas un nouveau sous-dossier dans `docs/` → c'est ça.
- **GitNexus auto-inject le bloc dans CLAUDE.md + AGENTS.md ; on veut CLAUDE.md only** — flag `--skip-agents-md` skippe les 2. Fix : `scripts/patch-gitnexus.sh` Patch B retire les lignes AGENTS.md du binaire global, garde CLAUDE.md (idempotent). Re-lancer après tout `npm install/update -g gitnexus`.
- **GitNexus skills installent nested (`.claude/skills/gitnexus/gitnexus-X/`) → jamais chargés** — `scripts/patch-gitnexus.sh` Patch A réécrit le binaire pour pointer top-level. Re-lancer après tout `npm install/update -g gitnexus`.
- **TypeORM `.set({ field: undefined })` silencieusement skip** — pas de `SET field = NULL`. Affecte aussi `repo.update(criteria, partialEntity)` (même code path). Use `() => 'NULL'`. Bug verifyEmail `9d1e971a5`. ESLint `musaium-test-discipline/no-typeorm-set-undefined` (Pattern A `.set({})` + B `repo.update(_, {})`, scope `*.repository*.ts`/`*.repo.ts`).
- **LLM response cache = `LlmCacheServiceImpl` only (ADR-036)** — un seul layer use-case-level. Ne PAS réintroduire de décorateur adapter-level (`CachingChatOrchestrator` supprimé). Cache key = `llm:v2:{contextClass}:{museumId|none}:{userId|anon}:{sha256}` (bumpé `v1` → `v2` par commit `d54552beb` 2026-05-19 quand `voiceMode` + `audioDescriptionMode` ont été inclus dans la key — invalide l'ancien namespace ; doc CLAUDE.md restait stale jusqu'au P0 lot fix 2026-05-22 / TD-DOC-WAVEC-01). Source de vérité : `museum-backend/src/modules/chat/useCase/llm/llm-cache.service.ts:103`. TTL tune = data-driven, ≥7j bake + ADR-036 amendment.
- **pgvector `halfvec(N)` exige extension ≥ 0.7.0 côté Postgres prod** (`halfvec` absent en 0.6.x ; pas un alias de `vector`, type FP16 distinct). Migration C3 (`artwork_embeddings.vector halfvec(768)`) revert au 1er `migration:run` sinon. Vérifier `\dx vector`. Index IVFFlat avec `vector_cosine_ops` sinon "operator class does not exist". ADR-037.
- Pièges moins fréquents (PgBouncer, SWC Relation, Prometheus var, SigLIP normalize, nginx proxy_pass var) → [docs/GOTCHAS_ARCHIVE.md](docs/GOTCHAS_ARCHIVE.md).
- **CI `pnpm dev` / `migration:run` exigent services dédiés** — `pnpm dev` boot BullMQ eager → `services:` DOIT inclure `redis:7-alpine` (sinon `ECONNREFUSED 6379`, /api/health timeout). `migration:run` fait `CREATE EXTENSION vector` → image Postgres MUST être `pgvector/pgvector:pg16`. Health probe = `/api/health` (apiRouter monté `/api`), JAMAIS `/health` (404, masque la cause Redis). Mirror `services:` de `ci-cd-backend.yml`/`ci-cd-promptfoo.yml`. PR #255.
- **`process.env.X` typed local vs CI diff (museum-frontend)** — local Expo ambient = `string`, CI = `any` → `no-unsafe-*`. Aucun wrap simple ne survit `eslint --fix` + les 2 gates. Solution : **toujours** `import { readEnvString } from '@/shared/lib/env'` (predicate `typeof`, narrows `any`→`string`, non-autofixable). Jamais de def locale. Réf `681eef19`, audit T1.9.
- **RTL : RN logical-side props obligatoires (museum-frontend)** — sous `features/`, `shared/ui/` : `marginStart/End` (pas `Left/Right`), `paddingStart/End`, `start/end` positionnel, `borderStart/EndWidth/Color`. `textAlign` : `'auto'` only (`'start'/'end'` pas dans types RN → use `writingDirection`). NE PAS codemod : `hitSlop` (auto-mirroré), MapLibre `fitBounds({padding})`, `Confetti.tsx`, `alignSelf:'flex-start'|'flex-end'`. Tests : `__tests__/rtl/_rtl-style-audit.ts`. Audit F10, EN 301 549 §9.1.3.2.
- **Pas d'emoji unicode dans museum-frontend (PNG + Ionicons only)** — visuels = PNG `require(...)` cast `ImageSourcePropType` ; affordances UI = Ionicons `@expo/vector-icons`. JAMAIS d'emoji unicode (rendu inconsistant + non accessible + off-brand). PNG pas prêt → bloque l'impl, jamais de placeholder emoji. ast-grep `tools/ast-grep-rules/no-unicode-emoji-in-screen.yml`.
- **Stryker `forceExit:false` (config CRITICAL) révèle les open handles que `pnpm test` cache** — tests admin/auth/chat via `createRouteTestApp()`→`createApp()` instancient eagerly `BullmqMuseumEnrichmentQueueAdapter` (si `EXTRACTION_WORKER_ENABLED=true`) → ioredis TCP jamais `.unref()` → Jest worker hang → 100% mutant timeout. Diag `pnpm jest --detectOpenHandles --testPathPattern=<scope>`. Fix : (a) `tests/helpers/<scope>/jest-env.setup.ts` pin `EXTRACTION_WORKER_ENABLED=false`+`CACHE_ENABLED=false`, (b) `defineConfig` `setupFiles:[...]`+`extraTestPathIgnorePatterns:[...]` pour skip tests inconciliables avec le pin. Note : full unit-integration `--forceExit=false` = 845 fails/102 suites (TECH_DEBT). Réf `cefa480f`.
- **Stryker label `Timeout` = souvent vrai kill** — quand un test détecte un mutant mais a des open handles (BullMQ/ioredis), le worker hang jusqu'au `timeoutMS=5000` → label `Timeout` au lieu de `Killed`. Le kill est réel, les 2 catégories scorent positif → métrique fiable. Ne pas chasser les Timeouts comme fausses victoires (c'est le symptôme du leak ci-dessus). Diag : sample mutants Timeout via `jq` sur `reports/mutation/mutation.json`, applique au source, run les tests `coveredBy` → fail = vrai kill.
- **iOS build = Xcode Cloud (pas EAS), Pods/ committés** — XCloud ne run PAS `pod install`. **(a)** `ios/Pods/` MUST rester committé (`git add -f`). **(b)** Après `expo prebuild --clean`, ré-appliquer patch `Podfile post_install` fmt-consteval (`__apple_build_version__ < 14000029L` → `__apple_build_version__` dans `Pods/fmt/include/fmt/base.h`, `chmod 0644` avant write). **(c)** Même `post_install` injecte `ENTRY_FILE="node_modules/expo-router/entry.js"` (SDK 55 Metro 404) + supprime copie `MapLibre.xcframework-ios.signature` du `BUILT_PRODUCTS_DIR` (NSCocoaErrorDomain 516). **(d)** Nouvelle native dep → `pod install` + `git add -f ios/Pods/...` + vérifier `Podfile.lock` + `ExpoModulesProvider.swift`. PR #258 a shipped `expo-web-browser` sans `pod install` → crash SIGABRT TestFlight, hotfix `f7ec92f7`. Défense : lazy `require()` sur native modules non-critiques + global error handler downgrade fatal→non-fatal en release.
- **Mutating middleware ordering** — middleware qui MUTATE state (counter/audit/quota) DOIT s'exécuter APRÈS les validators short-circuit (Zod 400), sinon counter inflation sur requests invalides. Alternative : reserve+commit. Réf ultrareview F1 (spec via `git log`).
- **RN Modal persistent host state reset** — `<Modal>` hosté en permanence : `visible=false` masque mais NE démonte PAS le subtree → `useState` slots persistent (stale email/consent). Pattern : `useEffect(reset, [visible])`. GDPR Art. 7 : consent inheritance interdit. Ex `features/paywall/ui/QuotaUpsellModal.tsx` (ultrareview F2).
- **ISO wire / Intl FE format** — BE emit ISO 8601 UTC ; FE formate via `Intl.DateTimeFormat(locale, {dateStyle,timeStyle})`. JAMAIS d'interpolation raw `{isoString}` (users voient `2026-06-01T00:00:00.000Z`). Wrap `useMemo` keyed `[isoValue, locale]` ; try/catch fallback raw ISO. Ex `QuotaUpsellModal.tsx` (ultrareview F3).
- **Renovate `config:best-practices` force-pin devDeps même avec `rangeStrategy: replace`** (auto-applique `:pinAllExceptPeerDependencies`). Fix : ajouter `:preserveSemverRanges` OU drop `config:best-practices`. Ajouter aussi `museum-frontend/ios/Pods/**` à `ignorePaths` (sinon scanne le `.gitlab-ci.yml` du vendor libdav1d). PR #267.
- **Stryker `DryRunExecutor` hang sur initial test run quand worktrees concurrents tournent** — symptôme : timeouts 5-min consécutifs, pas de `mutation.json`. Cause = CPU/disk contention (worktrees stales × 1-2GB). Diag : monitor disk + cleanup `.git/worktrees/agent-*` stales.
- **Audit chain `pg_advisory_xact_lock(GLOBAL_KEY)` cap INSERT à 50-200/s** — per-row hash chain force serialization (`audit.repository.pg.ts`). Lock transaction-scoped → PgBouncer txn-mode compatible. Scale 100k MAU → refonte Merkle batch (ADR-054).
- **Sentry+OTel Node SDK v2** — `skipOpenTelemetrySetup: true` + `getDefaultIntegrationsWithoutPerformance()` REQUIS (sinon collide avec custom OTel NodeSDK). `tracePropagationTargets` explicite (`['^https://api.musaium\\.com/']`). Corrélation BE↔FE = middleware header-based `trace-propagation.middleware.ts`, **PAS** un SDK bridge `@sentry/opentelemetry` (ne PAS câbler `SentryPropagator`/etc). État-cible définitif (ADR-045, TD-SN-01 STALE-BY-DESIGN).
- **TTS cache key MUST include `voice`** — généralisable : toute cache key dérivée d'un param user-tweakable DOIT inclure ce param. `tts:<messageId>` seul = stale audio quand user change voice. Cf. TD-23.
- **CORS allowedHeaders contient déjà `sentry-trace` + `baggage` (`museum-backend/src/app.ts`)** — distributed tracing. Ne PAS les retirer (sinon `sentry-trace` stripped au preflight, bridge FE↔BE cassé silencieusement). Middleware `trace-propagation.middleware.ts` (`tracePropagationMiddleware`) monté `app.ts` (commit `f687b600`). Réf `docs/observability/DISTRIBUTED_TRACING.md` §5.
- **`infra/grafana/dashboards/*.json` UID immutable** — renommer le fichier mais GARDER l'`uid:` historique (sinon liens permanents + annotations/alerts `/d/<uid>` → 404). Pareil pour panels `id:` numérotés (deep-link `&viewPanel=<id>`). Ex `chat-stages-latency.json`.
- **PGP key `museum-web/public/.well-known/pgp-key.txt` = placeholder** — token `PGP_KEY_PLACEHOLDER_DO_NOT_SHIP`. Deploy pipeline DOIT gate sur l'absence de ce token avant prod (sinon PGP publiée vide → signal "vendor négligent"). Génération : `docs/operations/PGP_KEY_GENERATION.md`.
- **`museum-web/src/lib/api.ts` expose `apiGet/Post/Patch/Put/Delete`** — CSRF géré centralement : lit le cookie `csrf_token` (non-HttpOnly) → header `X-CSRF-Token` sur les méthodes state-changing + `credentials:'include'` (auth via cookie HttpOnly `access_token`). NE PAS ré-implémenter un wrapper `fetch` local par page : utiliser ces helpers. `apiPut` ajouté (`api.ts:233`) — l'ancienne note « apiPut n'existe pas » était stale (corrigée 2026-05-27). Réf `admin/museums/[id]/branding/page.tsx`.
- **`SAVEPOINT` dans une migration crash sous `runMigrations({transaction:'none'})`** — l'integration harness (`tests/helpers/integration/integration-harness.ts`) run les migrations HORS transaction → `SAVEPOINT can only be used in transaction blocks` → **kill TOUTES les suites integration**. Fix : guarder par `if (queryRunner.isTransactionActive)`. Réf migration `AddMuseumGeofence.ts`.
- **Retirer un pin `@types/*` d'un `pnpm.overrides` ne suffit PAS à le bumper** — si le `@types` parent déclare une range qui matche déjà la version pinnée, pnpm garde le lockfile. Forcer : déclarer le sous-paquet en `devDependencies` directe avec la range cible (ex `@types/express-serve-static-core: ^5.1.1`), puis re-résoudre. Réf `museum-backend/package.json`. TD-11.
- **Auth tokens device-bound (museum-frontend)** — `authTokenStore.ts` passe `keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY` à `expo-secure-store` (device-bound, non-backup-migratable) : un refresh token ne migre pas vers un autre appareil via une sauvegarde iCloud/Google. Ne pas relâcher ce flag sans revue sécurité.
- **MFA = web-admin-only en V1 (museum-frontend)** — la surface MFA mobile user-facing (écrans enrôlement/challenge/banner, route `mfa-enroll`, client `mfaApi`, hook screen-capture, flow Maestro) a été **retirée** (décision produit 2026-05-26, UFR-016, cf. ADR-017 Withdrawn-for-V1). `authService.login()` gère `mfaRequired` gracieusement (AppError `Forbidden`/`MFA_WEB_ONLY` → message i18n `error.auth.mfa_web_only`, jamais le token brut `MFA_REQUIRED`). L'enforcement backend (ADR-014) + l'admin web restent actifs. Aucun écran mobile n'affiche plus de secret TOTP.

## Environment Setup

1. Copy `.env.example` → `.env` in `museum-backend/`. Backend need: PostgreSQL (via docker-compose or local), at least one LLM API key (`OPENAI_API_KEY` / `DEEPSEEK_API_KEY` / `GOOGLE_API_KEY`), JWT secrets.
2. Backend DB exposed on port **5433** (not 5432) when using docker-compose.
3. Frontend mobile local dev : **voir [`museum-frontend/RUN_LOCAL.md`](museum-frontend/RUN_LOCAL.md)** (3-file template pattern `.env` / `.env.local-dev` / `.env.prod-test` + `npm run dev:local` qui pre-flight le Docker stack). Quickstart : `cd museum-frontend && npm run env:local && npm run dev:local`.

## Hook bypass interdit (UFR-020)

**BYPASS HOOK INTERDIT** — aucune forme tolérée : `git commit --no-verify` / `-n` ❌, `git push --no-verify` ❌, `SKIP_PRE_COMMIT=1`/`SKIP_PRE_PUSH=1` ❌, `git -c core.hookspath=/dev/null` ❌.

**Pourquoi** — les hooks pre-commit (<5s) + pre-push (~30s-2min) catchent les régressions AVANT la CI (15 min) et AVANT main. Doctrine : 2 min local > 15 min CI rouge.

**Enforcement** : `.claude/settings.json` + `settings.local.json` `permissions.deny` + `.github/workflows/sentinel-mirror.yml` (re-run tous les gates serveur, fail la PR si bypass passe).

**Si un hook bloque légitimement** (faux positif, env cassé) : fix le hook/la condition, JAMAIS de bypass. Pression deadline → escalade Tech Lead.

## Post-feature test coverage (UFR-021)

**Tout écran user-facing nouveau/modifié DOIT shipper avec ≥1 Maestro flow exerçant son happy path critique.** Les tests Jest composant ne suffisent PAS (ils peuvent mocker l'interaction même qui casse).

**Pourquoi** — Bug DOB-2026-05-17 : regex `^\d{4}-\d{2}-\d{2}$` rejette les `DD/MM/YYYY` FR → bouton signup disabled. Test Jest mockait l'input → vert. Régression shippée TestFlight, hotfix. Fausse confiance.

**Scope** : `museum-frontend/app/**/*.tsx` (routes Expo, sauf `_*.tsx`/`+*.tsx`/`_styles/`) + `features/**/ui/*Screen.tsx`. Out of scope : sub-composants présentationnels, modales dans un écran déjà couvert, routes dev-only.

**Compte comme coverage** : un `.maestro/*.yaml` référençant (a) un `testID` literal de la source, (b) le route path Expo (`/auth`, `/chat/:sessionId`), ou (c) magic comment `# screen: <Name>` en en-tête du flow. Le flow DOIT tap-through le happy path (submit/CTA/nav) — "s'affiche sans crasher" ne compte PAS.

**Opt-out** : `// e2e-skip: <raison ≥30 chars>` en haut de la source. Valide : "dev-only debug route", "covered transitively by parent flow X", "third-party native screen". Invalide : "TODO", "low priority", "P2 backlog".

**Enforcement** : `pnpm sentinel:screen-test-coverage` avant push (fail = ajoute flow OU `// e2e-skip:`). `.maestro/coverage-baseline.json` grandfathers les écrans pré-UFR-021 — **JAMAIS de nouvelle entrée**, removals only (si écran rendu out-of-scope, retire du baseline même commit). Phase 2 (post-validation) : pre-push gate + CI mirror.

Specs : [`docs/TESTING_DISCIPLINE_PROPOSAL.md`](docs/TESTING_DISCIPLINE_PROPOSAL.md), [`docs/TEST_COVERAGE_INVENTORY.md`](docs/TEST_COVERAGE_INVENTORY.md), [`docs/TESTING_PHASE2_PLAN.md`](docs/TESTING_PHASE2_PLAN.md).

## Fresh-context 5-phase workflow (UFR-022)

**Non-negotiable.** S'applique à TOUTE modif code applicatif + tests, via `/team` OU session classique. Twinné avec `UFR-022` dans `.claude/agents/shared/user-feedback-rules.json`.

**Pourquoi** — agent qui voit les artefacts d'une phase précédente devient rubber stamp ou prend des raccourcis ("inline pour efficacité tokens"). Agent qui teste son propre code rend les tests verts en touchant le test. Fresh-context + frozen-test ferment ces 2 raccourcis structurellement.

**Les 5 phases obligatoires :**

1. **Spec** — `architect.md` fresh spawn. Output `team-state/<RUN_ID>/spec.md` (EARS + NFR + glossary + stakeholders + acceptance criteria). Pas de code/design.
2. **Plan** — `architect.md` fresh spawn (2e invocation, **zero memory phase 1**, lit spec.md disque). Output `design.md` + `tasks.md`. `tasks.md` contient `## Multi-cycle progress` pour features long-running ; archivé `team-state/multi-cycle-features/<slug>/` (exempté pruning >30j).
3. **Red** — `editor.md` fresh spawn. Produit tests qui **FAIL** (prouve absence feature/présence bug). `pnpm test` exit ≠ 0 = success. Output tests + `red-test-manifest.json` `{path: sha256}`.
4. **Green** — `editor.md` fresh spawn (zero memory phase 3, lit diff red disque). Produit code qui rend tests verts. **FROZEN-TEST byte-for-byte** : hook `post-edit-green-test-freeze.sh` re-hash chaque test, mismatch sha256 = exit 1 STOP. Test buggé suspecté → émet `BLOCK-TEST-WRONG <file>:<line> <reason>` SANS toucher → re-spawn fresh phase 3.
5. **Review** — `reviewer.md` fresh spawn. Verdict APPROVED | CHANGES_REQUESTED | BLOCK + JSON.

**Mécaniques fresh-context :**
- Chaque phase = un appel `Agent` tool depuis l'orchestrateur.
- Input agent = path artefacts read-only précédents + brief ≤200 tokens + path output. **Pas de résumé**, pas de `SendMessage` continuation.
- System prompt fresh : "Si tu vois un message d'une autre phase du même RUN_ID, émets `BLOCK-CONTEXT-LEAK` et refuse." Dispatcher re-spawn proprement.
- Brief integrity : chaque brief sha256 → agent retourne `BRIEF-ACK: <sha256>` en preamble. Mismatch = BLOCK.

**Obligation lib-docs (red/green/reviewer) :**
- Tout agent touchant/reviewant du code DOIT consulter `lib-docs/<lib>/PATTERNS.md` + `LESSONS.md` pour chaque lib importée.
- Cache stale (>14j OU version drift package.json OU manquant) → refresh forcé via **doc-fetcher** + **doc-curator** (fresh agents).
- WebSearch fail (offline/404/rate-limit) → WARN + use stale + tag rapport (pas de BLOCK).
- Verifier hook `pre-phase-doc-reference-check.sh` vérifie `libDocsConsulted[]` couvre les libs importées.
- Reviewer DOIT citer `PATTERNS.md:<line>` quand code dévie → CHANGES_REQUESTED.

**Layout `lib-docs/` (repo root) :**
```
lib-docs/
├── INDEX.json          # TRACKED — manifest {lib → {version, fetched, snapshotSha256, patternsSha256, sourceUrls, warnings}}
├── README.md           # TRACKED — structure doc
├── .gitignore          # TRACKED — ignore snapshots/PATTERNS.md/sources.json/VERSION
└── <lib>/
    ├── LESSONS.md      # TRACKED — human-edited gotchas (jamais touché par agents)
    ├── VERSION         # UNTRACKED — regenerable from INDEX.json
    ├── snapshot-*.md   # UNTRACKED — raw WebFetch dump (5-10 pages)
    ├── sources.json    # UNTRACKED — fetcher metadata
    └── PATTERNS.md     # UNTRACKED — curated by doc-curator, ~200-500 lignes
```

**Reviewer rejection loop = ILLIMITÉ.** Zero cap, zero warning, zero mention. Re-spawn fresh à la phase pointée (`spec`/`plan`/`red`/`green`). Cap 2 corrective loops s'applique UNIQUEMENT aux fails de hooks intra-phase (lint/tsc/test dans la même phase éditeur).

**Mode unique `/team`.** Plus de selector micro/standard/enterprise. Plus de keywords bypass Spec Kit (`typo`, `dep bump`). Plus de modes `chore`/`hotfix`/`audit`/`mockup` séparés. UN pipeline pour toute modif code applicatif. Audit dans le pipeline (security + verifier toujours). Cost gate = telemetry pure (plus de seuil $20/$50).

**Exemption auto** : si `git diff --name-only` ∩ `{museum-backend/src/**, museum-frontend/{app,features,shared,components}/**, museum-web/src/**, tests/}` vide → pipeline skippé, run direct Step 9 finalize. Append STORY.md "skipped — pure-doc edit".

**Verrouillage anti-bypass** : `red-test-manifest.json` sha256 chain + hook `post-edit-green-test-freeze.sh` ; `libDocsConsulted[]` proof dans output JSON red/green/reviewer ; `BRIEF-ACK: <sha256>` preamble ; `BLOCK-CONTEXT-LEAK` self-defense dans system prompt.

**Anti-patterns — REJET immédiat :**
- "Inline pour efficacité tokens" → fresh-context obligatoire.
- "Le test était faux, je l'ai corrigé" → BLOCK-TEST-WRONG sans toucher OU re-fresh phase 3.
- "J'ai utilisé mon training pour ce pattern" → consulter `PATTERNS.md`, sinon BLOCK.
- "Cap 2 boucles atteint" appliqué au reviewer → cap 2 = hook failures intra-phase only. Reviewer = illimité.

Specs : [`docs/superpowers/specs/2026-05-18-ufr-022-fresh-context-five-phases-design.md`](docs/superpowers/specs/2026-05-18-ufr-022-fresh-context-five-phases-design.md).

## Honesty + truth-telling (UFR-013)

**Non-negotiable.** Every response, every agent report. Twinné avec `UFR-013` dans `.claude/agents/shared/user-feedback-rules.json`.

**FORBIDDEN** : lying/fabricating any fact/number/citation/path/line/function/output/test result/source ; claiming verification without verifying ; simulating certainty when uncertain ; hiding/minimizing failures (test/build/lint) ; denying a mistake after it's pointed out ; pretense/sycophancy.

**REQUIRED** : state truth even uncomfortable ; verify before answering (`Read`/`Grep` for code, `WebSearch`/`WebFetch` external) ; "I don't know" valid ; report failures verbatim ; correct prior wrong claims explicitly ; distinguish "code says X" (verified) vs "I expect X" (not verified) vs "general knowledge" (may be stale).

**Verification ladder (cheapest → strongest)** : memory < `Read` < `Grep`/`gitnexus_query` < run command (report exit + output) < `WebSearch`/`WebFetch` (cite URL). High-cost claims (security, breaking change, "safe to deploy") → step 4-5 mandatory.

**Anti-patterns** : "all tests pass" sans run ≠ "I ran `pnpm test` — output: …" ; "this is fixed" sans verif ≠ "I made the change, want me to run tests?" ; silent skip ≠ "smoke test failed: `<exact error>`. Stopping."

## Migration Governance

See [`docs/MIGRATION_GOVERNANCE.md`](docs/MIGRATION_GOVERNANCE.md) for full rules. Quick reference:

- Always use `node scripts/migration-cli.cjs generate --name=X` to generate migrations — never hand-write SQL
- `DB_SYNCHRONIZE` must **never** be `true` in production (hard-coded `false` in `data-source.ts` for prod)
- CI blocks if `DB_SYNCHRONIZE=true` found in any `.env*` file
- After generating migration, verify w/ `pnpm migration:run` on clean DB then `node scripts/migration-cli.cjs generate --name=Check` — output should be empty (no schema drift)

## AI Safety

Chat pipeline = defense-in-depth (ADR-015 amendment, dual V2 layers parallel) :

1. **V1 keyword guardrail** (`art-topic-guardrail.ts`) — keyword pre-filter (insults/off-topic/injection/external actions). ~5ms sync. Runs first.
2. **Structural prompt isolation** — system + section prompts AVANT user content dans LLM message array. Boundary marker `[END OF SYSTEM INSTRUCTIONS]`.
3. **Input sanitization** — fields user-controlled (`location`, `locale`) → Unicode normalize + zero-width strip + truncate via `sanitizePromptInput()`.
4. **V2 LLM Guard sidecar** (`llm-guard.adapter.ts`) — ProtectAI Python sidecar (self-hosted free), scan prompt-injection/PII/toxicity/bias. Fail-CLOSED (ADR-047). Active si `GUARDRAILS_V2_LLM_GUARD_URL` set. 1500ms timeout + circuit breaker.
5. **V2 LLM judge** (`llm-judge-guardrail.ts`) — OpenAI-as-judge structured output sur V1 allows incertains (msg ≥50 chars). Active si `LLM_GUARDRAIL_BUDGET_CENTS_PER_DAY > 0`. $5/day cap, 500ms timeout, fail-OPEN vers V1 sur timeout/error.
6. **Output guardrail** — keyword approach sur LLM output (catch leaks).

Les 2 V2 layers étaient mutually exclusive via `GUARDRAILS_V2_CANDIDATE` ; flag retiré 2026-05-14 (ADR-015) → run together.

Modifiant le chat pipeline :
- Jamais injecter user-controlled fields dans system prompts.
- Garder ordering : `[SystemMessage(system), SystemMessage(section), ...history, HumanMessage(user)]`.
- Guardrail dans `chat.service.ts` = single source of truth (pas de duplicate ailleurs).
- V2 layers indépendants — disable one MUST NOT toucher l'autre.

### Voice V1 (2026-04)

Pipeline STT → LLM → TTS, **toujours actif** (flags retirés). Guardrails sur texte intermédiaire (transcrit + LLM response). Realtime WebRTC reporté V1.1. Spec (modèles/env/coûts/latences) : [`docs/AI_VOICE.md`](docs/AI_VOICE.md).

## Test Discipline — DRY Factories

**Tests MUST use shared factories. Inline object creation forbidden.** Voir [`docs/TEST_FACTORIES.md`](docs/TEST_FACTORIES.md).

- BE : `museum-backend/tests/helpers/<module>/<entity>.fixtures.ts`
- FE : `museum-frontend/__tests__/helpers/factories/<entity>.factories.ts`
- Pattern : `makeUser()` / `makeUser({ field: value })` — never inline `{ id, email, … } as User`
- ESLint `eslint-plugin-musaium-test-discipline` block les nouvelles violations ; baseline `tools/eslint-plugin-musaium-test-discipline/baselines/no-inline-test-entities.json` ne peut grandir.

## ESLint Discipline

**`eslint-disable` = last resort.** Voir [`docs/LINT_DISCIPLINE.md`](docs/LINT_DISCIPLINE.md).

- Read rule docs → fix code (90 % des cas) → disable uniquement si false positive, pas d'alternative, `-- reason` comment.
- Nouveau `eslint-disable` en PR : `Justification: ≥20 chars` + `Approved-by: <reviewer/SHA>`.
- Pre-approved categories (cf. doc) = seules exemptées de justif PR.

## Team reports lifecycle

2 locations pour `/team` artefacts — **pas des duplicats** :

| Path | Role | Writer |
|---|---|---|
| `.claude/skills/team/team-reports/` | **Runtime active** — `/team` écrit ici. `working/<date>-<slug>/` (ephemeral) + closed runs ≤30j. | `/team` runs |
| `/team-reports/` (repo root) | **Archive read-only** — audits/brainstorms/externes. Git-ignored ; seul `README.md` versionné. | Promotion manuelle ~30j |

Agents MUST write to `.claude/skills/team/team-reports/`. `working/` = disposable. Promotion runtime → archive manuelle.

## Deployment

- Backend : Docker image → GHCR → VPS OVH (see `docs/OPS_DEPLOYMENT.md`)
- Mobile : EAS Build → App Store / Google Play (see `docs/MOBILE_INTERNAL_TESTING_FLOW.md`)
- Secrets + CI config : `docs/CI_CD_SECRETS.md`

## Dependency Monitoring

### TypeORM
TypeORM docs repo archived March 2026. v1.0 planned H1 2026 w/ breaking changes. Current : works, migration not urgent, monitor releases. Alternatives for future : Drizzle (S-tier 2026), Prisma 7, Kysely.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Innov-mind-museum** (32242 symbols, 51687 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
