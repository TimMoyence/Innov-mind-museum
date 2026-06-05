# Audit CI/CD — Musaium (23 workflows `.github/workflows/`)

Date: 2026-05-31 — branche `dev`. Toutes les affirmations ci-dessous sont vérifiées par lecture des `.yml` (cf. `fichier:job`/`fichier:ligne`).

## 1. Topologie : gate-bloquant vs informatif (cron)

### Gates BLOQUANTS (s'exécutent sur PR / push, `exit 1` réel)

| Workflow:job | Trigger | Ce qu'il bloque |
|---|---|---|
| `ci-cd-backend.yml:quality` | PR + push main/staging (gaté par `changes` paths-filter) | tsc (`typecheck`), ESLint (`lint`), **Trivy fs HIGH/CRITICAL `exit-code:1`** (ligne 99-108), OpenAPI validate + contract test, migration `down()` présent, promtool alert rules, `test:scripts` harness, DB_SYNCHRONIZE guard, actionlint |
| `ci-cd-backend.yml:test-coverage` + `coverage-merge` | idem | 4 shards Jest unit-integration + **seuil 88/74/86/89** via `nyc check-coverage` (ligne 344-346). Service `redis:7-alpine` requis (ligne 244-253) |
| `ci-cd-backend.yml:integration` | PR + push (needs quality+coverage) | suite integration real-PG (testcontainer). Service redis présent (ligne 368-377) |
| `ci-cd-backend.yml:e2e` | **PR + schedule uniquement** (ligne 489) | suite e2e Postgres testcontainer |
| `ci-cd-backend.yml:migration-drift` | PR backend (ligne 580) | schema-drift TypeORM ; image `pgvector/pgvector:pg16` pinnée par digest (ligne 594) — respecte le gotcha pgvector |
| `ci-cd-web.yml:quality` | PR + push main | Trivy fs, `check:openapi-types`, lint, build, **`pnpm test`** (vitest), web-cookies + canonical-domain sentinels |
| `ci-cd-web.yml:playwright-pr` | PR + push | e2e Chromium |
| `ci-cd-mobile.yml:quality` | PR + push main | Expo Doctor (n'est plus `continue-on-error` — R10), OpenAPI sync, `npm audit --audit-level=high`, i18n, no-unicode-emoji, **maestro-shard-manifest sentinel**, lint, typecheck, `test:coverage` |
| `sentinel-mirror.yml:mirror` | **push `**` (toutes branches)** + PR main/staging | ~25 sentinelles re-jouées serveur (anti-bypass UFR-020) |
| `codeql.yml` | PR + push main | CodeQL SAST |
| `semgrep.yml` | **PR uniquement** (+cron) | `semgrep --error` OWASP top-ten (ligne 49) |
| `ci-cd-openapi-diff.yml:oasdiff` | PR si `openapi.json` change | **`exit 1` sur breaking change** (ligne 100-103) |
| `ci-cd-llm-guard.yml` | PR + push main/staging | build image LLM-Guard + Trivy `exit-code:1` + smoke `/health` |
| `team-quality-regression.yml` | PR + cron | `exit 1` si axe qualité chute >5pts vs baseline (ligne 86-88) — mais real-mode dépend de `OPENAI_API_KEY` |

### Gates PR-CONDITIONNELS (paths-filtered, advisory ou tolérants)

- `ci-cd-backend.yml:ai-tests` — **`continue-on-error:true`** (ligne 570) : ADVISORY, pas un gate dur (live OpenAA non-déterministe). Honnête sur sa nature dans le commentaire (ligne 559-568).
- `llm-security-promptfoo.yml:promptfoo-leak` — PR si chat/llm change : gate **≥95% pass-rate** (ligne 229) ; le run promptfoo lui-même est `continue-on-error` puis un step Python décide (pattern correct).
- `ci-cd-promptfoo.yml` — PR si chat change : `exit 1` (ligne 108).
- `artwork-image-liveness.yml` — `pull_request` mais **aucun `exit 1`/`::error` trouvé** : effectivement informatif même sur PR.

### Informatifs / cron-only (jamais sur le chemin de merge)

`llm-promptfoo-smoke.yml` (recall ≥80%, cron 03:30), `breach-72h-timer.yml` (cron 09:00), `audit-chain-nightly.yml` (cron 03:30), `db-backup-daily.yml` (cron 02:00), `db-backup-monthly-restore-drill.yml` (cron 1er du mois), `tls-cert-monitor.yml` (horaire), `tls-renewal.yml` (Lun/Jeu), `redis-rotation-reminder.yml` (trimestriel), `ci-cd-backend.yml:halluc-eval` (nightly + Lun real-mode). `cosign-sign-image.yml` / `cosign-verify-deploy.yml` = `workflow_call` réutilisables (le deploy-prod inline sa propre version, ces deux fichiers semblent orphelins/legacy). `deploy-privacy-policy.yml` = push-deploy statique.

## 2. Anti-bypass UFR-020 : le sentinel-mirror re-run-t-il vraiment les gates serveur ?

**OUI, vérifié.** `sentinel-mirror.yml` tourne sur `push: ['**']` (ligne 16-17) + PR main/staging. Il re-installe les 3 apps puis re-joue gitleaks full-repo, env-policy, as-any-ratchet, les 3 tsc (BE/FE/web), openapi-sync, migration-revertibility, cache-key-parity, idor-smoke, guardrails-ratchet, sentry-scrubber, fe-version-sync, metric-naming, compose-parity, **husky-lfs-integrity (P23, UFR-020)**, roadmap-claim-resolves, subprocessor-ledger, web-domain-canonical, doc-last-verified, ai-tests-count, ast-grep P14. Failure → `exit 1` explicite (ligne 188) avec message « bypass attempt or genuine regression ».

**Réserve** : l'efficacité anti-bypass dépend de la **branch protection GitHub** (required status checks) — non vérifiable depuis le repo. Le header du fichier (ligne 11-12) le dit explicitement : « A failure here MUST block PR merge — add this workflow's job names to the required status checks ». Si la branch protection n'est pas configurée côté GitHub, le sentinel-mirror tourne mais ne **bloque** rien. C'est un claim à vérifier (settings repo).

## 3. Couverture deploy : Trivy / cosign / Sentry / smoke / rollback

`ci-cd-backend.yml:deploy-prod` (push main, ligne 847) est le plus mûr du repo :
1. Build image → **Trivy image scan CRITICAL/HIGH `exit-code:1`** (ligne 903-911) — gate dur.
2. Push GHCR → **cosign sign keyless + SLSA L3 attestation + cosign verify + `gh attestation verify` pré-déploiement** (ligne 951-1007) — banking-grade supply-chain gate AVANT tout SSH.
3. Sentry release + sourcemaps (gaté `HAS_SENTRY_TOKEN`, ligne 1010-1030).
4. Migrations via `run-migrations.js` ephemeral container AVANT restart (zero-downtime, ligne 1146).
5. Healthcheck `/api/health` (20 tentatives, ligne 1169) — respecte le gotcha `/api/health` (pas `/health`).
6. **Smoke account ÉPHÉMÈRE** (create avec mdp random → smoke-api.cjs → cleanup `if:always()`, ligne 1386-1452).
7. **Auto-rollback** sur échec deploy OU smoke (ligne 1454-1466) + Sentry notify + `exit 1` final.

Web deploy (`ci-cd-web.yml:deploy`) : Trivy `exit-code:1`, **PGP placeholder gate** (ligne ~378, COMP-01), cosign+SBOM, healthcheck, **smoke fonctionnel** (landing SSR + sitemap + static assets + /api/health round-trip, ligne 494-529).

## 4. Maestro : matrix 4 shards + iOS cron — EST-CE UN GATE ?

**NON, ce n'est PAS un gate de merge.** `ci-cd-mobile.yml:maestro-shard` a `if: github.event_name == 'schedule' || workflow_dispatch` (ligne 250) — **les shards Maestro ne tournent JAMAIS sur PR**. Matrix = `[auth, chat, museum, settings]` sur `macos-latest` (avec native Postgres car pas de Docker sur macos M1, ligne 45). `maestro-ios-nightly` = cron. Donc UFR-021 (« tout écran user-facing → ≥1 flow Maestro ») est garanti au niveau **sentinelle de couverture statique** (`maestro-shard-manifest` dans quality, ligne 90 ; et `sentinel:screen-test-coverage` côté pre-push) mais l'**exécution réelle des flows est nightly only** — une régression e2e mobile n'est attrapée qu'à J+1, pas au merge. C'est cohérent avec le coût macos-latest mais c'est un trou de timing assumé.

## 5. Trous / risques identifiés

- **TROU MAJEUR : `deploy-prod` ne `needs` QUE `[quality, coverage-merge]`** (ligne 848) — PAS `integration` ni `e2e`. Sur push `main`, `e2e` ne tourne même pas (`if: PR || schedule`, ligne 489) et `integration` n'est pas dans la chaîne de dépendance du deploy. Donc **un merge sur main peut déployer en prod sans que la suite integration/e2e ait gardé ce SHA** (elles ont tourné sur la PR, mais un push direct main ou un squash divergent les contourne). Le smoke post-deploy + auto-rollback compensent partiellement, mais c'est un raccourci.
- **Mutation testing désactivé** : `ci-cd-backend.yml:mutation` a `if: false` (ligne 411, Stryker cache-first deferré). Documenté honnêtement mais = 0 gate mutation actuellement.
- **No-staging V1 (prod=stage)** : compensé correctement par (a) Trivy+cosign+smoke+auto-rollback en deploy-prod, (b) `deploy-staging` existe mais n'est atteint que sur push `staging` (ligne 1558). Le bake ≥7j en prod est une discipline humaine, pas un gate CI. Acceptable pour solo-dev pré-launch mais le filet = le smoke éphémère + rollback, pas une vraie pré-prod.
- **`cosign-sign-image.yml` / `cosign-verify-deploy.yml`** (`workflow_call`) semblent **orphelins** : deploy-prod inline sa propre logique cosign (ligne 941-1008). À vérifier : sont-ils encore appelés quelque part ou dead code ?
- **`ai-tests` advisory** : honnête mais signifie qu'une régression guardrail/chat factuelle ne bloque pas la PR (seul promptfoo ≥95% bloque, et lui aussi tolère 4 leaks/85).
- **Dépendance branch-protection non vérifiable** : tout le modèle « gate bloquant » repose sur la config required-checks GitHub (hors repo).

## 6. Cohérence services (redis + pgvector — gotcha CI)

**Conforme.** `redis:7-alpine` présent dans `test-coverage` (ligne 244), `integration` (ligne 368), commentaires explicites renvoyant à CLAUDE.md §Pièges. `migration-drift` utilise `pgvector/pgvector:pg16` pinné par digest (ligne 594) « must match deploy/docker-compose.prod.yml » → respecte le gotcha `halfvec(768)`. Healthchecks tous sur `/api/health`. Cohérent avec la doctrine.

## Verdict

Pipeline **mature et honnête dans ses commentaires** (chaque `continue-on-error` / `if:false` est justifié inline, pas de gate-theatre caché — R10 a justement supprimé l'Expo Doctor theatre). Supply-chain deploy-prod = niveau enterprise (Trivy+SLSA+cosign+SBOM+smoke éphémère+auto-rollback). Faiblesses : (1) deploy-prod ne dépend pas d'integration/e2e, (2) Maestro nightly-only donc pas un gate de merge mobile, (3) mutation off, (4) dépendance non-auditée à la branch-protection GitHub.
