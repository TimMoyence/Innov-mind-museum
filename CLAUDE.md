# CLAUDE.md

Musaium — compagnon culturel IA voice-first : photo d'une œuvre ou d'un monument, discussion avec l'IA, carnet de visite, suggestions de proximité, guidage même sur réseau faible. Monorepo de trois apps indépendantes :

- `museum-backend/` — Node 22 + Express 5 + TypeORM 0.3 + PostgreSQL 16 (pgvector) + Redis (pnpm)
- `museum-frontend/` — React Native 0.83 + Expo 55 + Expo Router (npm)
- `museum-web/` — Next.js 15 + React 19 + Tailwind 4 (pnpm) : vitrine, B2B, admin

## Commandes

### Backend (`cd museum-backend`)

```bash
pnpm install
pnpm dev                                        # port 3000
pnpm lint                                       # ESLint src + test-discipline + tsc
pnpm test                                       # Jest unit-integration
RUN_INTEGRATION=true pnpm test:integration      # vraie base Postgres (testcontainers)
pnpm test:e2e
pnpm test:contract:openapi
pnpm openapi:validate
node scripts/migration-cli.cjs generate --name=Nom
pnpm migration:run
pnpm migration:revert
```

Stack locale : `docker compose -f docker-compose.dev.yml up -d` (Postgres sur 5433, Redis sur 6379). Copier `.env.example` en `.env`.

### Frontend (`cd museum-frontend`)

```bash
npm install
npm run dev
npm run lint
npm test
npm run generate:openapi-types
npm run check:openapi-types
```

Dev local contre la stack Docker : `npm run env:local && npm run dev:local`.

### Web (`cd museum-web`)

```bash
pnpm install
pnpm dev        # port 3001
pnpm build
pnpm lint
pnpm test
```

### Design system (`cd design-system`)

`pnpm build` génère `museum-frontend/shared/ui/tokens.generated.ts` et le CSS web.

### CI et déploiement

- `ci-cd-backend.yml` — qualité, tests, intégration, e2e, ai-tests, dérive de migrations, déploiement prod (GHCR → VPS, Trivy, Sentry, smoke, rollback automatique, installation des crons VPS).
- `ci-cd-web.yml` — qualité, Playwright, Lighthouse, déploiement.
- `ci-cd-mobile.yml` — qualité, Maestro Android (smoke en PR, suite complète nocturne), EAS build et soumission. `node scripts/nightly-status.mjs` donne le dernier résultat Maestro complet.
- `codeql.yml`, `recall-e2e.yml`, `deploy-privacy-policy.yml` (style de carte hors ligne sur GitHub Pages, jusqu'à la sortie du build qui lit musaium.com).
- VPS : `museum-backend/deploy/docker-compose.prod.yml` (backend, museum-web, db, redis) derrière le nginx du conteneur `reverse-proxy-nginx-1` (`deploy/nginx/site.conf.prod`). Crons dans `deploy/vps/` : sauvegarde chiffrée quotidienne, renouvellement certbot, `restore-check.sh` pour rejouer le dernier dump. Secrets des crons : `/srv/museum/backup.env`.

## Alias

Backend `@src/*`, `@modules/*`, `@data/*`, `@shared/*` ; frontend `@/*` → `./*` ; web `@/*` → `./src/*`.

## Fichiers à ne pas lire en entier

`museum-frontend/shared/api/generated/openapi.ts` (généré, chercher par nom), les lockfiles, `museum-backend/src/data/db/migrations/*` (lire la seule migration utile), `museum-backend/src/modules/daily-art/adapters/secondary/catalog/artworks.data.ts`, `museum-frontend/shared/ui/tokens.generated.ts`.

## Règles du dépôt

- Hooks jamais contournés : ni `--no-verify`, ni `-n`, ni `SKIP_PRE_COMMIT`/`SKIP_PRE_PUSH`, ni `core.hooksPath`. Un hook qui bloque à tort se corrige.
- Tout écran user-facing nouveau ou modifié (`museum-frontend/app/**/*.tsx`, `features/**/ui/*Screen.tsx`) livre un flow `.maestro/*.yaml` qui parcourt son chemin critique ; `pnpm sentinel:screen-test-coverage` le vérifie au pre-push et en CI. `.maestro/coverage-baseline.json` ne grandit jamais.
- Migrations générées par `migration-cli`, jamais réécrites une fois jouées. `tests/integration/db/raz-schema-drift.test.ts` exige zéro dérive entités ↔ migrations.
- Tests : factories partagées (`tests/helpers/<module>/<entity>.fixtures.ts`, `__tests__/helpers/factories/`), jamais d'entité inline.
- Chat : `[SystemMessage(system), SystemMessage(section), ...history, HumanMessage(user)]`, aucun champ utilisateur dans un prompt système ; email, téléphone, IBAN et carte sont masqués par `maskPersonalData` avant tout appel LLM ; garde-fou = mots-clés V1 + juge LLM + filtre de sortie, dans `chat.service.ts` seulement.

## Pièges connus

- Cache Jest périmé : `pnpm jest --clearCache` (BE) / `npm test -- --clearCache` (FE) avant d'enquêter.
- `@musaium/shared` est un paquet `file:` (pas de workspace) : après un changement de `packages/musaium-shared`, reconstruire son `dist` (`tsc -p packages/musaium-shared`) puis réinstaller chaque app (`pnpm bootstrap`).
- GitNexus réinjecte son bloc dans CLAUDE.md et AGENTS.md, et installe ses skills dans `.claude/skills/gitnexus/` : `scripts/patch-gitnexus.sh` corrige le binaire global, à relancer après chaque mise à jour de gitnexus. AGENTS.md est ignoré par git.
- TypeORM `.set({ champ: undefined })` et `repo.update(_, { champ: undefined })` n'écrivent pas NULL : utiliser `() => 'NULL'`.
- TypeORM `dataSource.query()` : SELECT et INSERT…RETURNING rendent `rows[]`, UPDATE/DELETE…RETURNING rendent `[rows[], count]`.
- `ON CONFLICT (…)` exige une contrainte unique réelle : sans elle Postgres rejette l'insert.
- pgvector ≥ 0.7.0 requis pour `halfvec(768)` ; index HNSW `halfvec_ip_ops`, déclaré `synchronize: false` dans l'entité car TypeORM ne sait pas le représenter.
- Un FK sans relation se déclare par `@ForeignKey(() => Cible, { name, onDelete })`, sinon le générateur de migrations propose de le supprimer.
- Cache LLM : `LlmCacheServiceImpl` seul, clé `llm:v4:{contextClass}:{museumId|none}:{userId|anon}:{sha256}` (`llm-cache.service.ts` `KEY_VERSION`). Toute clé de cache dérivée d'un réglage utilisateur inclut ce réglage (TTS : la voix). Une réponse `degraded` (repli d'un LLM en échec) ne se met jamais en cache.
- CI : `pnpm dev` démarre BullMQ, il faut le service `redis:7-alpine` ; `migration:run` crée l'extension vector, image `pgvector/pgvector:pg16` ; santé sur `/api/health`, jamais `/health`.
- Toute queue BullMQ avec un `add()` a son `new Worker()` démarré au boot (`startEnrichmentWorker()` dans `src/index.ts`).
- Un middleware qui incrémente un compteur ou un quota passe après les validateurs qui court-circuitent (Zod 400).
- `SAVEPOINT` dans une migration casse le harnais d'intégration (`transaction: 'none'`) : garder par `queryRunner.isTransactionActive`.
- Verrou `pg_advisory_xact_lock` de la chaîne d'audit : 50 à 200 INSERT/s maximum.
- Sentry + OTel : `skipOpenTelemetrySetup: true` et `getDefaultIntegrationsWithoutPerformance()` ; corrélation par en-têtes (`trace-propagation.middleware.ts`), jamais `@sentry/opentelemetry`. CORS garde `sentry-trace` et `baggage`.
- Frontend `process.env.X` : toujours `readEnvString` de `@/shared/lib/env`.
- Frontend RTL : `marginStart/End`, `paddingStart/End`, `start/end`, `borderStart/End*` ; `textAlign: 'auto'` seulement. Ne pas toucher `hitSlop`, `fitBounds({padding})`, `Confetti.tsx`, `alignSelf`.
- Frontend : aucun emoji unicode, visuels en PNG `require(...)` et icônes Ionicons.
- Frontend : un conteneur coloré s'espace par `padding` + `gap`, jamais par la `margin` verticale d'un enfant.
- Frontend : un `<Modal>` monté en permanence garde son état ; le réinitialiser par `useEffect(reset, [visible])`.
- Dates : le backend émet de l'ISO 8601 UTC, le front formate par `Intl.DateTimeFormat`, jamais d'ISO brut à l'écran.
- NetInfo `isConnectionExpensive` mesure le coût (metered), pas la lenteur : `resolveDataMode` (`DataModeProvider.tsx`) n'utilise que disponibilité, étiquette 2g/3g et le moteur de qualité passif ; metered ne gouverne que prefetch et compression d'upload.
- Jetons d'auth mobiles `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (`authTokenStore.ts`) : ne pas relâcher.
- iOS = Xcode Cloud : `ios/Pods/` reste committé ; après `expo prebuild --clean`, réappliquer le `post_install` du Podfile (fmt consteval, `ENTRY_FILE`, signature MapLibre) ; toute dépendance native passe par `pod install` + `git add -f ios/Pods/...`.
- CVE frontend : `overrides` ciblés, jamais `npm audit fix` (doublons de modules natifs, `expo-doctor` rouge).
- Renovate `config:best-practices` épingle les devDeps malgré `rangeStrategy: replace` : `:preserveSemverRanges` ; `museum-frontend/ios/Pods/**` reste dans `ignorePaths`.
- Retirer un `@types/*` des `pnpm.overrides` ne le monte pas : le déclarer en devDependency directe avec la plage voulue.
- promptfoo ≥ 0.121 rend `output` en chaîne : parser dans le consommateur (`typeof output === 'string' ? JSON.parse(output) : output`) et épingler la version.
- Stryker (`pnpm mutation`, local) : `forceExit: false` révèle les handles ioredis ouverts ; un `Timeout` est en général un vrai kill.
- `museum-web/src/lib/api.ts` (`apiGet/Post/Patch/Put/Delete`) gère CSRF et cookies : pas de `fetch` local par page.
- `museum-web/public/.well-known/pgp-key.txt` est la vraie clé ; `wellknown-placeholder-free.mjs` bloque tout retour d'un placeholder au déploiement.
- TypeORM 1.0 est sorti, le dépôt reste en 0.3.x : migration à planifier après le lancement.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Innov-mind-museum** (28573 symbols, 78133 relationships, 757 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact before editing.** Use `impact({target: "symbolName", direction: "upstream"})` or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .`; report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- MUST warn on HIGH/CRITICAL `risk` pre-edit; never use `riskSharedAxes` to waive a HIGH/CRITICAL `risk` warning. Compare File/symbol: MCP File omits axes; Graph-RAG expands File.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- **MUST use `query({search_query: "concept"})` for concepts/flows, `context({name: "symbolName"})` for a named symbol, or `impact` for blast radius, on read-only callers, dependencies, imports, or execution flow.** Graph first; text search only for empty/`UNKNOWN`/literals.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/Innov-mind-museum/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Innov-mind-museum/clusters` | All functional areas |
| `gitnexus://repo/Innov-mind-museum/processes` | All execution flows |
| `gitnexus://repo/Innov-mind-museum/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |
| Work in the Application area (482 symbols) | `.claude/skills/gitnexus-area-application/SKILL.md` |
| Work in the Chat area (340 symbols) | `.claude/skills/gitnexus-area-chat/SKILL.md` |
| Work in the Llm area (312 symbols) | `.claude/skills/gitnexus-area-llm/SKILL.md` |
| Work in the Ui area (284 symbols) | `.claude/skills/gitnexus-area-ui/SKILL.md` |
| Work in the Migrations area (211 symbols) | `.claude/skills/gitnexus-area-migrations/SKILL.md` |
| Work in the Infrastructure area (162 symbols) | `.claude/skills/gitnexus-area-infrastructure/SKILL.md` |
| Work in the Pg area (156 symbols) | `.claude/skills/gitnexus-area-pg/SKILL.md` |
| Work in the Middleware area (138 symbols) | `.claude/skills/gitnexus-area-middleware/SKILL.md` |
| Work in the Scripts area (132 symbols) | `.claude/skills/gitnexus-area-scripts/SKILL.md` |
| Work in the Routes area (125 symbols) | `.claude/skills/gitnexus-area-routes/SKILL.md` |
| Work in the Guardrail area (118 symbols) | `.claude/skills/gitnexus-area-guardrail/SKILL.md` |
| Work in the Auth area (115 symbols) | `.claude/skills/gitnexus-area-auth/SKILL.md` |
| Work in the Session area (82 symbols) | `.claude/skills/gitnexus-area-session/SKILL.md` |
| Work in the Admin area (69 symbols) | `.claude/skills/gitnexus-area-admin/SKILL.md` |
| Work in the Visual-similarity area (68 symbols) | `.claude/skills/gitnexus-area-visual-similarity/SKILL.md` |
| Work in the Http area (59 symbols) | `.claude/skills/gitnexus-area-http/SKILL.md` |
| Work in the Museum area (57 symbols) | `.claude/skills/gitnexus-area-museum/SKILL.md` |
| Work in the Search area (55 symbols) | `.claude/skills/gitnexus-area-search/SKILL.md` |
| Work in the Rules area (55 symbols) | `.claude/skills/gitnexus-area-rules/SKILL.md` |
| Work in the E2e area (51 symbols) | `.claude/skills/gitnexus-area-e2e/SKILL.md` |

<!-- gitnexus:end -->
