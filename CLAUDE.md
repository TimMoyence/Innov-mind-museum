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

Sprint debrief pédagogique 2026-04-30 → 2026-05-05 : **`docs/_archive/training-2026-05/explications-sprint-2026-05-05/`** (22 fichiers, ~6200 lignes en français, archivé 2026-05-12).

Post-2026-04-20 runtime tracking : `.claude/skills/team/team-reports/`.

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
- `llm-security-promptfoo.yml` — OWASP LLM07 system-prompt-leak adversarial corpus (85 prompts × 8 locales × 10 attack families) against live chat endpoint; fails PR if pass-rate < 95 % (cron Mon 04:00 UTC + PR on chat/guardrail paths). ADR-049.
- `llm-security-garak.yml` — NVIDIA Garak `promptinject` + `xss` + `leakreplay` probes; fails on HIGH/CRITICAL severity (cron Mon 04:00 UTC + PR on chat/guardrail paths). Phase 1.5 will plug into LLMGuard sidecar via custom REST probe. ADR-049.
- `llm-promptfoo-smoke.yml` — non-adversarial daily-art recall smoke (10 reference prompts); fails if recall < 80 % (cron 03:30 UTC daily). Catches over-blocking by guardrail tightening.

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

Auto-generated, massive, or pure data. Reading full wastes tokens, rarely helps.

| File | Size | Why | How to access instead |
|---|---|---|---|
| `museum-frontend/shared/api/generated/openapi.ts` | 83 KB / 3 510 lines | Auto-generated from backend OpenAPI spec | `Grep` for specific type/operation name, or read ±50 lines with `offset`/`limit` |
| `museum-frontend/package-lock.json` / `pnpm-lock.yaml` / `museum-backend/pnpm-lock.yaml` / `museum-web/pnpm-lock.yaml` | multi-MB | Lockfiles | Never read directly — use `pnpm list <pkg>` or `npm ls <pkg>` |
| `museum-backend/src/data/db/migrations/*.ts` (56 files) | ~5 KB each | TypeORM migrations — immutable once run | Read only specific migration relevant to current work |
| `museum-backend/src/modules/daily-art/artworks.data.ts` | 17 KB / 373 lines | Static artwork catalog | Grep for specific artwork ID or title |
| `museum-frontend/shared/ui/tokens.generated.ts` | generated | Design tokens output | Edit `design-system/` source instead |

Doubt? Use `Grep` w/ specific pattern first, then `Read` relevant block w/ `offset`/`limit`.

## Pièges connus (gotchas opérationnels)

Leçons techniques non évidentes consolidées des sprints précédents. Ajoute ici tout piège qui a fait perdre du temps à un dev / agent — pas les bugs métier, juste les surprises infrastructure.

- **Hook Jest cache parfois flaky** — un ratchet coverage qui plante sans raison apparente est souvent un cache Jest stale. Run `pnpm jest --clearCache` (BE) ou `npm test -- --clearCache` (FE) avant de réinvestiguer. Seen 2026-04-17 SESSION_FINAL leçon 3.
- **`@musaium/shared` est un `file:` package, pas un workspace pnpm** — depuis commit `641968ea4` (revert workspace → file:), les 3 apps déclarent `"@musaium/shared": "file:../packages/musaium-shared"` mais le repo n'a PAS de `pnpm-workspace.yaml` à la racine. Conséquence : après `git pull` d'un commit qui touche `packages/musaium-shared/` ou un manifest d'app, `pnpm install` / `npm install` DOIT être relancé dans CHAQUE app concernée pour rematérialiser `node_modules/@musaium/shared`. Sinon `pnpm build` échoue sur `Module not found: @musaium/shared/observability`. Garde-fous (2026-05-14) : `pnpm bootstrap` (root) ré-installe les 3 apps en séquence ; `scripts/sentinels/workspace-links.mjs` détecte les symlinks cassés (exit 1 + fix command) ; hook husky `post-merge` warn automatiquement après `git pull` ; pre-commit Gate 6 bloque si le diff staged touche `packages/**` ou `museum-*/package.json` avec symlinks cassés.
- **`docs/` whitelisted dans .gitignore** — gitignored par défaut, sous-dossiers doivent être whitelistés explicitement (`!docs/<sub>/`). Si `git status` ne voit pas un nouveau sous-dossier dans `docs/`, c'est ça.
- **GitNexus auto-inject `<!-- gitnexus:start -->` block — CLAUDE.md only depuis 2026-05-15** — par défaut upstream `npx gitnexus analyze` écrivait le bloc dans CLAUDE.md ET AGENTS.md (~1500 tokens dupliqués). Le flag upstream `--skip-agents-md` skippe MALHEUREUSEMENT les 2 fichiers (vérifié `ai-context.js:250-263`). Fix-at-source : `scripts/patch-gitnexus.sh` Patch B retire au sed/perl les 4 lignes qui écrivent AGENTS.md du binaire global tout en gardant celles pour CLAUDE.md. Idempotent (check si patch déjà appliqué). Re-lancer le script après tout `npm install -g gitnexus` / `npm update -g gitnexus` — sinon la version fraîche du binaire re-injectera AGENTS.md à chaque `analyze`.
- **GitNexus skills installent en nested par défaut (Patch A)** — le binaire upstream installe à `.claude/skills/gitnexus/gitnexus-X/SKILL.md` (deux niveaux), or Claude Code skill loader ne recurse pas → skills jamais chargés. `scripts/patch-gitnexus.sh` Patch A réécrit le binaire global pour pointer top-level. Re-lancer après tout `npm install -g gitnexus` / `npm update -g gitnexus`.
- **TypeORM `.set({ field: undefined })` est silencieusement skip** — `UpdateQueryBuilder` ne génère PAS de `SET field = NULL` quand on passe `undefined`. **Affecte aussi `repo.update(criteria, partialEntity)` qui forwarde vers `EntityManager.update` → `createQueryBuilder().update().set()`** — même code path interne. Use `() => 'NULL'` raw expression. Bug verifyEmail 2026-05 (commit `9d1e971a5`). Audit F8 2026-05-13 a trouvé 3 sites résiduels (`consumeResetTokenAndUpdatePassword`, `consumeEmailChangeToken`, `updatePassword`) patched 2026-05-14. ESLint rule `musaium-test-discipline/no-typeorm-set-undefined` détecte les régressions (Pattern A `.set({})` + Pattern B `repo.update(_, {})`, scope `src/**/*.repository*.ts` + `src/**/*.repo.ts`).
- **PgBouncer transaction mode interdit `LISTEN/NOTIFY`, session-scoped advisory locks, persistent prepared statements** — Musaium n'utilise rien de ça aujourd'hui (audit ADR-021), mais à vérifier au cas par cas.
- **SWC + TypeORM cross-entity = ReferenceError circular** — fix = wrap les FK avec le type alias `Relation<T>`. Ne pas s'écarter de ce pattern sur les nouvelles entités.
- **LLM response cache = `LlmCacheServiceImpl` only (ADR-036)** — un seul layer, use-case-level. Ne PAS réintroduire de décorateur adapter-level (`CachingChatOrchestrator` supprimé 2026-05-08 PR-B). Cache key shape = `llm:v1:{contextClass}:{museumId|none}:{userId|anon}:{sha256}`. TTL tune = data-driven only, ≥7j bake + ADR-036 amendment requis (R11/R13).
- **Prometheus `static_configs.targets` n'expand PAS `${VAR}`** — seul `external_labels` accepte `${VAR}` (avec `--enable-feature=expand-external-labels`). Pour différencier prod/dev, on monte 2 fichiers distincts : `infra/grafana/prometheus.yml` (target `backend:3000` pour prod, scp'd via CI vers `/srv/museum/obs/`) et `infra/grafana/prometheus.local.yml` (target `host.docker.internal:3000` pour le local stack `infra/grafana/docker-compose*.yml`). Ne pas tenter de paramétrer le target via env — c'est silencieusement ignoré.
- **pgvector `halfvec(N)` nécessite l'extension installée ET disponible côté Postgres prod** — `CREATE EXTENSION IF NOT EXISTS vector;` doit pointer une version pgvector ≥ 0.7.0 (`halfvec` n'existe pas en 0.6.x). La migration C3 (`artwork_embeddings.vector halfvec(768)`) revert au premier `pnpm migration:run` sinon. Vérifier avec `\dx vector` avant le déploiement. `halfvec` n'est PAS un alias de `vector` — type FP16 distinct, l'index IVFFlat doit être créé avec `vector_cosine_ops` côté pgvector ≥ 0.7.0 sinon erreur "operator class does not exist". Seen 2026-05-10 ADR-037.
- **SigLIP ONNX preprocessing utilise `normalize` à `[-1, 1]`, PAS la moyenne ImageNet** — différent de ResNet/CLIP/DINOv2. Si tu portes du code de pré-traitement depuis un projet CLIP, NE PAS appliquer `mean=[0.485, 0.456, 0.406]` / `std=[0.229, 0.224, 0.225]` : SigLIP attend `(pixel / 127.5) - 1.0`. Erreur silencieuse — l'encoder produit des vecteurs valides mais avec un recall catastrophique (≪ 0.85 fixture, NFR violé). Référence : `museum-backend/src/modules/chat/adapters/secondary/embeddings/siglip-onnx.adapter.ts`. Seen 2026-05-10 ADR-037.
- **nginx `proxy_pass $variable` ignore les `rewrite` du même bloc** — forme literal `proxy_pass http://...` applique `rewrite` normalement, mais forme variable `proxy_pass $upstream` les ignore SILENCIEUSEMENT. Fix : embed l'URI dans la variable (`set $auth_upstream http://museum-backend:3000/api/auth/super-admin-check;`), pas juste le host. Le 404 produit transite en 500 client via `auth_request` → ressemble à un bug backend (~30min debug perdues sur le Grafana iframe path 2026-05-10). Réf `infra/nginx/conf.d/grafana.conf` (commit `c3bc30c75`).
- **CI workflow `pnpm dev` / `pnpm migration:run` exige services dédiés** — `pnpm dev` boot BullMQ eager (audit-cron, chat-purge-cron, museum-enrichment-queue) → `services:` DOIT inclure `redis:7-alpine` ; sinon retry `ECONNREFUSED 127.0.0.1:6379` indéfini, /api/health timeout ~60s. `pnpm migration:run` exécute `CREATE EXTENSION vector` (migration C3 `halfvec(768)`) → image Postgres MUST être `pgvector/pgvector:pg16`, pas `postgres:16-alpine`. Health probe URL = `/api/health` (apiRouter monté à `/api` dans `museum-backend/src/app.ts:233`), JAMAIS `/health` (404 forever, masque la vraie cause Redis). Mirror le `services:` block de `ci-cd-backend.yml` / `ci-cd-promptfoo.yml`. Seen PR #255 commit `310347ee`.
- **`process.env.X` typed différemment local vs GitHub Actions (museum-frontend)** — local résout via Expo `metro-require` ambient (`Dict<string>`), `process.env.X ?? 'default'` est `string`. CI résout en `any` (Expo ambient unreachable du lint pass) → fire `no-unsafe-*`. AUCUN wrap simple ne survit `eslint --fix` ET les 2 gates : drop wrap → CI red `no-unsafe-*` ; `String(...)` → local red `no-unnecessary-type-conversion` ; cast + disable → CI red `reportUnusedDisableDirectives` ; `as string` → autoremoved par `eslint --fix` au prochain push. Solution : helper canonical `readEnvString` exporté depuis `museum-frontend/shared/lib/env.ts`. Implémentation : `typeof value !== 'string' ? undefined : value.trim() || undefined`. Predicate `typeof`, ESLint ne peut PAS autofix away, narrows `any` → `string` côté CI. Aucun impact `as-any` ratchet. **Toujours importer** `import { readEnvString } from '@/shared/lib/env'` — jamais de def locale (`typeofString` / `trimOrUndefined` / `readEnvString` locaux unifiés par l'audit 2026-05-16 T1.9). Réf commit `681eef19` (helper original), audit-360-s1 T1.9 (unification).
- **RTL : RN logical-side props obligatoires (museum-frontend)** — sous `features/`, `shared/ui/`, layout DOIT utiliser `marginStart`/`marginEnd` (pas `marginLeft`/`Right`), `paddingStart`/`paddingEnd`, `start`/`end` positionnel, `borderStartWidth/Color` / `borderEndWidth/Color`. Pour `textAlign` : `'auto'` uniquement (`'start'`/`'end'` NE sont PAS dans les types RN, utilise `writingDirection`). Exclusions à NE PAS codemod : `hitSlop` (auto-mirroré RN ≥0.65), MapLibre `camera.fitBounds({padding:...})` (vendor API), `Confetti.tsx` spawn random, `alignSelf: 'flex-start'|'flex-end'` (déjà flex-aware). Tests parité : `__tests__/rtl/_rtl-style-audit.ts` helper + 3 sample tests (`home`, `chat-session`, `discover`). Audit F10 2026-05-14 — 28 sites migrés, EN 301 549 §9.1.3.2 (Meaningful Sequence) durci pour AR.
- **Pas d'emoji unicode dans museum-frontend (PNG + Ionicons only)** — visuels = PNG via `require('../../assets/images/...')` cast `ImageSourcePropType` (visuels brandés, hero, slides) OU Ionicons via `@expo/vector-icons` (affordances UI : `camera-outline`, `mic-outline`, etc.). JAMAIS d'emoji unicode dans screens, buttons, copy, slides — rendu inconsistant cross-platform + non accessible + ne matche pas l'identité visuelle. PNG asset pas prêt → bloque l'impl, jamais de placeholder emoji. ast-grep rule `tools/ast-grep-rules/no-unicode-emoji-in-screen.yml` enforce.
- **Stryker `forceExit:false` révèle les open handles que `pnpm test` cache** — la config Stryker partagée (`museum-backend/stryker/config.mjs`) impose `forceExit:false` (CRITICAL — nécessaire pour le hot-reload multi-mutant). Or les tests admin/auth/chat qui passent par `createRouteTestApp()` → `createApp()` mount `apiRouter` qui instancie eagerly `BullmqMuseumEnrichmentQueueAdapter` quand `EXTRACTION_WORKER_ENABLED=true` (default `unit-integration` project). Cette ctor ouvre une connexion ioredis TCP jamais `.unref()`. Sous `pnpm test` (forceExit:true), masqué ; sous Stryker, Jest worker hang sur le TCPWRAP → **100 % mutant timeout** (run admin 2026-05-15 : 168/168 timed out, 0 killed). Diag = `pnpm jest --detectOpenHandles --testPathPattern=<scope>`. Fix sans toucher source : (a) créer `tests/helpers/<scope>/jest-env.setup.ts` pinning `EXTRACTION_WORKER_ENABLED=false` + `CACHE_ENABLED=false` (mirror pattern e2e), (b) passer dans `defineConfig` via `setupFiles:[...]` + `extraTestPathIgnorePatterns:[...]` (knobs ajoutés 2026-05-16) pour skip les tests inconciliables avec le pin (`tests/unit/routes/museum-enrichment.route.test.ts` 404 sous pin ; `tests/unit/shared/redis-cache-service.test.ts:240` ouvre son propre ioredis). Tests skip OK tant qu'ils ne couvrent aucun mutant du `mutate:` scope (Stryker perTest les router pas). Note critique : le repo a un problème de discipline plus large (`jest --forceExit=false` full unit-integration = **845 fails / 102 suites** — TECH_DEBT candidate). Réf commit `cefa480f`, recap `docs/_archive/training-2026-05/stryker-night-2026-05-15.md` § Follow-up 2026-05-16. Seen 2026-05-15.
- **Stryker classifie souvent un vrai kill comme `Timeout` quand les tests laissent des open handles** — quand un test détecte un mutant (assertion fail), le Jest worker doit terminer pour passer au mutant suivant. S'il y a des handles ouverts (BullMQ/ioredis surtout), le worker hang jusqu'au `timeoutMS=5000` et Stryker marque `Timeout` au lieu de `Killed`. **Le kill est réel, seul le label est faux** — les 2 catégories alimentent le score positivement donc la métrique reste fiable. Validation 5-sample admin 2026-05-16 : 5/5 mutants Timeout = vrais kills (1 à 8 tests fail chacun). Conséquence : ne pas chasser les Timeouts comme s'ils étaient des fausses victoires — c'est le SYMPTÔME du leak de handles ci-dessus, pas un signal d'absence de kill. Diag : sample N mutants `Timeout` via `jq` sur `reports/mutation/mutation.json`, applique chaque mutant à la main au source, run les tests qui les couvrent (champ `coveredBy` dans le rapport) → si fail = vrai kill. Seen 2026-05-16 ea37f88a.
- **iOS build chain = Xcode Cloud (pas EAS), Pods/ committés** — XCloud ne run PAS `pod install` au build time, utilise `museum-frontend/ios/Pods/` directement. **(a)** `ios/Pods/` MUST rester committé (gitignoré par défaut mais tracké via `git add -f`). **(b)** Après tout `npx expo prebuild --clean`, ré-appliquer le patch `Podfile post_install` fmt-consteval (Xcode 26+ Apple Clang regression) — sub `__apple_build_version__ < 14000029L` → `__apple_build_version__` dans `Pods/fmt/include/fmt/base.h` (`chmod 0644` avant write, lecture seule par défaut). **(c)** Même `post_install` injecte `ENTRY_FILE="node_modules/expo-router/entry.js"` dans le EXUpdates script phase (SDK 55 Metro 404 sur extension-stripped path) + supprime la copie `MapLibre.xcframework-ios.signature` du `BUILT_PRODUCTS_DIR` (Archive Copy Signatures NSCocoaErrorDomain 516). **(d)** Toute nouvelle native dep (`expo-*`/`react-native-*`) → `cd museum-frontend/ios && pod install` + `git add -f ios/Pods/...` + vérifier `Podfile.lock` + `ExpoModulesProvider.swift` régénéré. PR #258 (commit `303a8cded`) shipped `expo-web-browser` sans `pod install` → TestFlight 1.2.2 (87) crash SIGABRT launch sur tous iPhones (Sentry 119145904 + 119145905), hotfix `f7ec92f7` (88). Défense en profondeur : lazy `require()` sur native modules non-critiques (réf `features/auth/infrastructure/socialAuthProviders.ts:loadWebBrowser`) + global error handler downgrade fatal→non-fatal en release (`shared/observability/global-error-handler.ts`).
- **Mutating middleware ordering** — quand un middleware MUTATE state (counter, audit, quota), il DOIT s'exécuter APRÈS les validators qui peuvent short-circuit (Zod 400). Sinon : counter inflation sur requests invalides. Pattern alternatif = reserve+commit (verify in middleware, increment dans handler après succès). Exemple historique : R1 §3.3 D3 (corrigé 2026-05-16 par ultrareview F1, cf. `docs/roadmap-night/specs/F1.md`).
- **RN Modal persistent host state reset** — quand un `<Modal>` RN est hosté en permanence (parent renders unconditionally), `visible=false` masque la chrome native mais NE démonte PAS le subtree React. Les `useState` slots persistent — stale email/consent/banner sur reopen. Pattern : `useEffect(reset, [visible])` reset les slots sur transition close. GDPR Art. 7 enforcement : consent inheritance interdit entre opens. Exemple : `museum-frontend/features/paywall/ui/QuotaUpsellModal.tsx` (R1 corrective 2026-05-16 par ultrareview F2, cf. `docs/roadmap-night/specs/F2.md`).
- **ISO wire / Intl FE format doctrine** — backend emit dates en ISO 8601 UTC. Frontend formate via `Intl.DateTimeFormat(locale, { dateStyle, timeStyle })`. JAMAIS interpolation raw `{isoString}` dans UI text. Anti-pattern : `<Text>Resets on {resetAt}</Text>` → users voient `2026-06-01T00:00:00.000Z`. Wrap dans `useMemo` keyed `[isoValue, locale]` ; try/catch fallback raw ISO (surface BE drift à QA). Exemple : `museum-frontend/features/paywall/ui/QuotaUpsellModal.tsx` (R1 corrective 2026-05-16 par ultrareview F3, cf. `docs/roadmap-night/specs/F3.md`).
- **Renovate `config:best-practices` preset force-pins devDeps même avec `rangeStrategy: replace`** — le preset auto-applique `:pinAllExceptPeerDependencies` qui pin tout devDep sans demander. Fix = ajouter `:preserveSemverRanges` aux `extends` OU drop `config:best-practices`. Ajouter aussi `museum-frontend/ios/Pods/**` à `ignorePaths` sinon Renovate scanne le `.gitlab-ci.yml` du vendor libdav1d et propose des bumps absurdes. Lesson 2026-05-15 PR #267 (commit `c141f609` + `968cd5ae`).
- **Stryker `DryRunExecutor` hang sur initial test run quand des worktrees concurrents tournent** — symptômes : 4× consecutive 5-min default timeouts, pas de `mutation.json` écrit. Diff avec un dry-run success 2m20s = CPU/disk contention de worktrees concurrents (12 worktrees stales × 1-2GB chaque). Diag : monitor disk pressure avant Stryker ; cleanup `.git/worktrees/agent-*` stales. Seen 2026-05-16 audit-360 S3 Phase 4 BLOCKED.
- **Audit chain `pg_advisory_xact_lock(GLOBAL_KEY)` cluster-wide mutex cap INSERT throughput à 50-200/s** — non-obvious pour quiconque lit `audit.repository.pg.ts`. Le per-row hash chain force serialization. La lock est **transaction-scoped** donc PgBouncer transaction-mode compatible. Pour scale 100k MAU, refonte Merkle batch (ADR-054) requise. Seen audit 2026-05-12 §arch-triple.
- **Sentry+OTel Node SDK v2 coexistence** — `skipOpenTelemetrySetup: true` + `getDefaultIntegrationsWithoutPerformance()` est REQUIS sinon Sentry tracing collide avec custom OTel NodeSDK. Aussi : `tracePropagationTargets` doit être explicite (`['^https://api.musaium\\.com/']`) sinon trace tree BE↔FE split silencieux car aucun `SentryPropagator` registered. ADR-045 documente l'extraction `@musaium/shared/observability` deferred. Cf. TD-20.
- **TTS cache key MUST include `voice`** — pattern : toute cache key dérivée d'un paramètre user-tweakable DOIT inclure ce paramètre dans la clé. `tts:<messageId>` est un correctness bug — user change voice setting → stale audio. Generalisable au-delà du TTS : tout paramètre qui influence l'output et que l'user peut tweak doit faire partie de la cache key. Cf. TD-23 + ROADMAP_PRODUCT C9.12c.

## Environment Setup

1. Copy `.env.example` → `.env` in `museum-backend/`, and `.env.local.example` → `.env` in `museum-frontend/`
2. Backend need: PostgreSQL (via docker-compose or local), at least one LLM API key (`OPENAI_API_KEY` / `DEEPSEEK_API_KEY` / `GOOGLE_API_KEY`), JWT secrets
3. Frontend need: `EXPO_PUBLIC_API_BASE_URL` pointing to backend
4. Backend DB exposed on port **5433** (not 5432) when using docker-compose

## Hook bypass interdit (UFR-020)

**BYPASS HOOK INTERDIT.** Aucune forme de contournement n'est tolérée :

- `git commit --no-verify` ❌
- `git commit -n` ❌
- `git push --no-verify` ❌
- `SKIP_PRE_COMMIT=1` / `SKIP_PRE_PUSH=1` env-var ❌
- `git -c core.hookspath=/dev/null ...` ❌

**Pourquoi** — les hooks pre-commit (< 5s) + pre-push (~30s-2min) sont le shift-left de Musaium : ils catchent les régressions AVANT la CI (15 min) et AVANT main. Un bypass annule cette valeur, pousse du rouge en CI, et finit chez l'utilisateur. La doctrine : préférer 2 min local à 15 min CI rouge.

**Enforcement code** : `.claude/settings.json` + `.claude/settings.local.json` `permissions.deny` rules + `.github/workflows/sentinel-mirror.yml` qui re-run tous les gates côté serveur et fail la PR si le bypass passe quand même.

**Si un hook bloque légitimement** (faux positif, env local cassé) : fix le hook ou la condition, ne le bypass JAMAIS. Si pression deadline, escalade Tech Lead.

## Honesty + truth-telling (UFR-013)

**Non-negotiable.** Applies to every response, every agent report. Twinned with the machine-readable `UFR-013` rule in `.claude/agents/shared/user-feedback-rules.json` (consumed by /team agents) — this section is the prose canonical; the JSON is the structural rule.

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

Chat pipeline use layered defenses (defense-in-depth, ADR-015 amendment 2026-05-14 — dual V2 layers running in parallel):

1. **V1 keyword guardrail** (`art-topic-guardrail.ts`) — fast keyword pre-filter for insults, off-topic, injection, external actions. ~5ms, synchronous. Runs first.
2. **Structural prompt isolation** — system instructions + section prompts placed BEFORE user content in LLM message array. Boundary marker `[END OF SYSTEM INSTRUCTIONS]` separates system from user input.
3. **Input sanitization** — user-controlled fields (`location`, `locale`) sanitized (Unicode normalization, zero-width char stripping, truncation) before prompt inclusion via `sanitizePromptInput()`.
4. **V2 LLM Guard sidecar** (`llm-guard.adapter.ts`) — ProtectAI Python sidecar (self-hosted, free), scans for prompt-injection / PII / toxicity / bias. Fail-CLOSED contract (ADR-047). Activates when `GUARDRAILS_V2_LLM_GUARD_URL` set. 1500ms timeout + circuit breaker.
5. **V2 LLM judge** (`llm-judge-guardrail.ts`) — OpenAI-as-judge structured output with confidence score on uncertain V1 allows (msg ≥ 50 chars). Activates when `LLM_GUARDRAIL_BUDGET_CENTS_PER_DAY > 0`. $5/day cap, 500ms timeout, fail-OPEN to V1 decision on timeout/error.
6. **Output guardrail** — same keyword approach on LLM output to catch leaks.

The 2 V2 layers were previously mutually exclusive via `GUARDRAILS_V2_CANDIDATE` flag; that flag was retired 2026-05-14 (ADR-015) so they now run together.

When modifying chat pipeline:
- Never inject user-controlled fields directly into system prompts
- Keep message ordering: `[SystemMessage(system), SystemMessage(section), ...history, HumanMessage(user)]`
- Guardrail in `chat.service.ts` = single source of truth for content filtering — no duplicate checks elsewhere
- V2 layers are independent — disabling one MUST NOT touch the other's config

### Voice V1 (2026-04)

Pipeline classique STT → LLM → TTS, **toujours actif** (feature flags retirés).

- **STT** : `gpt-4o-mini-transcribe` (env `LLM_AUDIO_TRANSCRIPTION_MODEL`), même `OPENAI_API_KEY`.
- **LLM** : LangChain orchestrator multi-provider.
- **TTS** : `gpt-4o-mini-tts` (env `TTS_MODEL`), voix `alloy` par défaut. Audio MP3 buffer + persisté S3 (`ChatMessage.audioUrl`).
- **Guardrails** : appliqués au texte intermédiaire (transcrit + réponse LLM).
- **SSE streaming** : @deprecated. ADR-001 supprimée 2026-05-03 ; recover via `git log -- docs/adr/ADR-001-sse-streaming-deprecated.md`.
- **Realtime WebRTC** : reporté V1.1.

Spec complète : `docs/AI_VOICE.md`.

## Test Discipline — DRY Factories

**Tests MUST use shared factories. Inline object creation forbidden.**

Source de vérité = quick reference ci-dessous + les fichiers `tests/helpers/**/*.fixtures.ts` (BE) / `__tests__/helpers/factories/*.ts` (FE). Voir aussi [`docs/TEST_FACTORIES.md`](docs/TEST_FACTORIES.md).

Quick reference :
- BE factories : `museum-backend/tests/helpers/<module>/<entity>.fixtures.ts`
- FE factories : `museum-frontend/__tests__/helpers/factories/<entity>.factories.ts`
- Pattern : `makeUser()` / `makeUser({ field: value })` — never inline `{ id, email, … } as User`
- ESLint plugin `eslint-plugin-musaium-test-discipline` blocks new violations ; baseline at `tools/eslint-plugin-musaium-test-discipline/baselines/no-inline-test-entities.json` cannot grow.

## ESLint Discipline

**`eslint-disable` = last resort, not first reflex.**

Source de vérité = quick reference ci-dessous + per-rule decision tree au moment du PR. Voir aussi [`docs/LINT_DISCIPLINE.md`](docs/LINT_DISCIPLINE.md).

Quick reference :
- Read rule docs → fix code (90% of cases) → only disable if false positive in this context, no alternative, `-- reason` comment
- Any new `eslint-disable` in PR must include `Justification: ≥20 chars` + `Approved-by: <reviewer/SHA>` paragraphs
- Pre-approved categories (cf. `docs/LINT_DISCIPLINE.md`) are the only ones not requiring per-PR justification

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

This project is indexed by GitNexus as **Innov-mind-museum** (31029 symbols, 48341 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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
