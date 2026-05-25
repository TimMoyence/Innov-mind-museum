# DOMAINE 4 — LOT 4 : Stabilité / observabilité @ `dev`

> Agent fresh-context read-only (UFR-013/UFR-024). Toutes les preuves lues via Read/Grep sur la branche `dev` (confirmée `git branch --show-current` = `dev`). Aucune branche dédiée LOT 4 → vérification sur `dev`. TD-20 hors scope (mergé 2026-05-21).
> Date : 2026-05-25.

---

- **I-OPS2** — Verdict: OPEN
  - Preuve: `infra/grafana/alerting/*.yml` — les 18 alertes existantes (`grep -E "alert:"`) couvrent disque/RAM/CPU VPS (`vps-host.yml`), latence chat p99 (`chat-latency.yml`, `chat-stages-latency.yml`), coût LLM/cache/breaker (`llm-cost.yml`), Wikidata (`wikidata-resilience.yml`). AUCUNE alerte sur : (a) taux 5xx API HTTP (aucun `http_requests_total{status=~"5.."}`), (b) backend down — seul `up{job="node-exporter"} == 0` existe (`vps-host.yml:126`, c'est l'exporter, PAS le backend), (c) Postgres/DB down (aucun `pg_up`/postgres dans les rules), (d) Redis down direct (seulement l'indirect `guardrail_budget_redis_fail_closed` via métrique de fallback `llm-cost.yml:166`, pas un probe `redis_up==0`). Severity routing : les labels `severity: warning|critical` existent sur les rules chat (`chat-latency.yml:18,85`) MAIS `alertmanager.yml:9-21` route TOUT vers un seul receiver `telegram-ops` — `inhibit_rules: []` (ligne 24), pas de routing par severity vers des canaux distincts.
  - Ref vérifiée: dev
  - Action roadmap: ❌ reste P0 — gaps réels : alertes API-5xx / backend-up / DB-down / Redis-up-direct absentes ; routing single-channel (pas de severity split). Criticité launch : MOYENNE-HAUTE (un backend down ou DB down n'alerte pas l'oncall directement, seul l'effet indirect via latence/budget peut paginer).
  - Confiance: haute

- **I-OPS3** — Verdict: OPEN
  - Preuve: `museum-backend/deploy/Dockerfile.prod:101` — `CMD ["sh", "-c", "node dist/src/data/db/run-migrations.js && node dist/src/index.js"]` lance les migrations à CHAQUE boot du conteneur. Le workflow de déploiement `ci-cd-backend.yml:948-953` les lance DÉJÀ dans un conteneur éphémère AVANT le restart (`docker compose run --rm ... migration:run`), puis `ci-cd-backend.yml:969` fait `docker compose up -d backend` → le conteneur re-run migrations au boot = DOUBLE RUN structurel à chaque deploy. Nuance honnêteté : `run-migrations.ts:11` utilise `AppDataSource.runMigrations()` qui est idempotent (n'applique que les migrations *pending*, trackées en table `migrations`) → le 2e run est un no-op si tout est appliqué, donc PAS de crash-loop garanti. MAIS : (a) `restart: unless-stopped` (compose prod ligne 97) signifie que tout restart de conteneur (OOM, reboot VPS) re-lance les migrations au boot ; (b) si une migration échoue, `run-migrations.ts:20` set `process.exitCode=1` → le `&&` court-circuite → app ne démarre pas → restart-loop. Le "crash-loop" du claim est donc CONDITIONNEL (échec migration), pas inconditionnel, mais le double-run est réel et confirmé.
  - Ref vérifiée: dev
  - Action roadmap: ⚠️ reste P0 atténué — double-run confirmé ; crash-loop conditionnel (pas systématique grâce à l'idempotence TypeORM). Fix propre = retirer migrations du CMD boot (laisser CI/deploy seul) OU guarder. Criticité launch : MOYENNE (idempotence amortit, mais migration ratée = restart-loop opaque).
  - Confiance: haute

- **I-OPS4** — Verdict: OPEN
  - Preuve: `museum-backend/src/config/env.ts` — `requestTimeoutMs=20000` (ligne 66), `LLM_TIMEOUT_MS=15000` (ligne 163, PAS 10s comme dit le claim), `LLM_TIMEOUT_SUMMARY_MS=10000` (ligne 164), `LLM_TOTAL_BUDGET_MS=25000` (ligne 165), `LLM_RETRIES=1` (ligne 166). Les deux sidecars guardrail V2 tournent EN SÉRIE dans `guardrail-evaluation.service.ts` : `await evaluateGuardrailProvider(...)` (ligne 147, LLM-Guard sidecar, timeout `GUARDRAILS_V2_TIMEOUT_MS=1500` env:402) PUIS `await runLlmJudge(...)` (ligne 182, timeout `LLM_GUARDRAIL_JUDGE_TIMEOUT_MS=500` env:408) — soit jusqu'à ~2000ms ajoutés en série AVANT même l'appel LLM. Incohérence confirmée : `totalBudgetMs=25000` (budget LLM seul) > `requestTimeoutMs=20000` ; et 20000 - 2000 (guardrails série) = 18000ms restants < budget LLM 25000ms. Le client peut donc voir un timeout HTTP (20s) avant que le budget LLM (25s) ne s'épuise.
  - Ref vérifiée: dev
  - Action roadmap: ⚠️ reste P0 — incohérence budget réelle (LLM totalBudget 25s + guardrails série 2s > REQUEST_TIMEOUT 20s). Le claim doc surestime ("10s×2") : valeurs réelles 15s LLM + cap 25s. Texte roadmap à corriger sur les chiffres, mais l'incohérence tient. Criticité launch : MOYENNE.
  - Confiance: haute

- **I-OPS5** — Verdict: PARTIAL
  - Preuve: `docs/DB_BACKUP_RESTORE.md` — (a) uploads/media NON backupés : ligne 61 `media/ # untouched, existing app uploads` + le workflow `db-backup-daily.yml:1` ne fait que `pg_dump` (DB only), aucun dump des fichiers media S3. CONFIRMÉ OUVERT. (b) backups MÊME bucket que media (SPOF) : `DB_BACKUP_RESTORE.md:46-47` "Backups land in the existing media S3 bucket (`S3_BUCKET`) under prefix `backups/daily/`. No second bucket is provisioned" + `db-backup-daily.yml:6` "Reuses the existing media S3 bucket — NOT a separate bucket". CONFIRMÉ OUVERT (perte du bucket = perte DB+media). (c) rotation/perte clé GPG : MITIGÉ — le doc documente maintenant le seeding (lignes 89-110), copie offline obligatoire (Yubikey/paper/USB ligne 109-110) et "The CI-scoped copy must NEVER be the only existing copy". Donc le "GPG key loss = DR morte" du claim est désormais documenté/atténué. Lifecycle/rétention aussi documenté (lignes 64-74).
  - Ref vérifiée: dev
  - Action roadmap: ⚠️ PARTIAL — clé GPG = doc OK (NEEDS-OPS-HUMAN pour l'exécution réelle de la copie offline) ; restent 2 gaps structurels : media non-backupé + bucket unique (SPOF). Criticité launch : BASSE-MOYENNE (DR DB fonctionne ; perte media = dégradation, perte bucket entier = catastrophe mais peu probable hors compromission). Hors-code majoritaire (IaC/ops bucket).
  - Confiance: haute

- **I-OPS6** — Verdict: OPEN
  - Preuve: `museum-backend/src/data/db/migrations/1778406339944-AddArtworkEmbeddings.ts:39` — `CREATE EXTENSION IF NOT EXISTS vector` SANS aucun version guard (`SELECT extversion ... >= '0.7.0'`). La migration crée immédiatement `embedding halfvec(768)` (ligne 53) et un index `halfvec_ip_ops` (ligne 78), types FP16 qui exigent pgvector ≥ 0.7.0 (le commentaire ligne 9 le note explicitement). Sur un Postgres avec pgvector 0.6.x, `CREATE EXTENSION` réussit (installe 0.6.x), puis `halfvec(768)` ligne 53 échoue "type halfvec does not exist" → migration revert au 1er `migration:run`. Correspond exactement au gotcha CLAUDE.md / ADR-037.
  - Ref vérifiée: dev
  - Action roadmap: ❌ reste P0 — aucun guard de version pgvector. Criticité launch : MOYENNE (dépend de la version pgvector réellement installée en prod ; le gotcha CLAUDE.md indique que `pgvector/pgvector:pg16` est requis — si l'image est correcte, latent ; sinon migration plante).
  - Confiance: haute

- **I-OPS7** — Verdict: OPEN
  - Preuve: 3 sous-claims, tous confirmés OUVERTS sur les migrations `dev` :
    (a) `api_keys.user_id` — `CreateApiKeysTable.ts:15` ajoute la FK `user_id` avec `ON DELETE CASCADE` mais SEUL un index `IDX_api_keys_museum_id` existe (`CreateMuseumsAndTenantFKs.ts:49`) ; aucun index sur `user_id` → seq scan à chaque delete user (CASCADE sur FK non indexée).
    (b) `chat_sessions.purged_at` — colonne ajoutée par `AddChatSessionPurgedAt.ts:28` SANS index ; aucun `CREATE INDEX ... purged_at` dans tout `migrations/*.ts` → le cron de purge quotidien seq-scan.
    (c) composite listSessions — `chat.repository.typeorm.ts:273-301` fait `WHERE session."userId" = :userId ORDER BY session.updatedAt DESC, session.id DESC` (keyset sur `(updatedAt,id)`). Seul un index mono-colonne `IDX_chat_sessions_userId` existe (`AddCriticalChatIndexesP0.ts:37`) ; aucun composite `(userId, updatedAt, id)` → Postgres filtre via l'index userId puis trie en mémoire.
    Note : `AddCriticalChatIndexesP0.ts` (FK sessionId/userId/messageId) et `AddP1FKAndTokenIndexes.ts` (museumId/assigned_to/sender_id/reset_token/email_change_token) NE couvrent AUCUN des 3 indices ci-dessus.
  - Ref vérifiée: dev
  - Action roadmap: ❌ reste P0 — 3 indices manquants confirmés. Criticité launch : BASSE-MOYENNE à faible volume (V1 ~1100 MAU) ; devient HAUTE à scale (CASCADE delete + purge cron + pagination sessions). Path:line repo (`:265` du claim) re-localisé à `chat.repository.typeorm.ts:273` (méthode listSessions déplacée vers `adapters/secondary/persistence/`).
  - Confiance: haute

- **I-OPS8** — Verdict: PARTIAL
  - Preuve: 4 sous-claims, 3 confirmés + 1 non-vérifiable :
    (a) ai-tests `workflow_dispatch` only — CONFIRMÉ : `ci-cd-backend.yml:447-449` job `ai-tests` avec `if: github.event_name == 'workflow_dispatch'` → `pnpm run test:ai` (ligne 477) ne tourne JAMAIS sur PR/push. Théâtre confirmé. (Nuance : les promptfoo workflows `ci-cd-promptfoo.yml:5` et `llm-security-promptfoo.yml:37` tournent BIEN sur `pull_request` avec paths-filter ; donc tout l'AI n'est pas dispatch-only, mais le job `ai-tests`/`test:ai` BE l'est.)
    (b) expo-doctor `continue-on-error` — CONFIRMÉ : `ci-cd-mobile.yml:85-87` `npx expo-doctor` + `continue-on-error: true` → échec n'échoue pas le build.
    (c) pas de gate anti-drift migration — CONFIRMÉ : aucun `migration:generate Check` / schema-drift check dans `.github/workflows/*.yml` (grep vide), alors que MIGRATION_GOVERNANCE (CLAUDE.md) prescrit "generate Check → empty" mais ne l'enforce PAS en CI.
    (d) sentinel-mirror absent des required-checks — NON VÉRIFIABLE par fichier : `sentinel-mirror.yml:1` tourne sur `push + pull_request + workflow_dispatch` (le workflow existe et s'exécute sur PR). Le statut "required check" est un réglage branch-protection GitHub (hors repo) ; `gh api .../branches/main/protection/required_status_checks` → 404 (pas de protection required-checks configurée OU token sans droit). Ne peut être affirmé/réfuté par code.
  - Ref vérifiée: dev
  - Action roadmap: ⚠️ reste P0 sur (a)(b)(c) — gates théâtre confirmés (ai-tests jamais sur PR, expo-doctor non-bloquant, pas de gate drift migration). Sous-claim (d) à escalader Tim (config branch-protection, NEEDS-OPS-HUMAN). Criticité launch : MOYENNE.
  - Confiance: haute (sauf sous-claim d : moyenne — réglage GH non lisible par fichier, 404 suggère faiblement aucune protection).

- **I-FIX3** — Verdict: OPEN
  - Preuve: `museum-backend/src/shared/llm-cost-guard/llm-cost-guard.ts` + `llm-cost-guard.middleware.ts`, 4 sous-claims tous confirmés :
    (a) STT/TTS non-métrés au cap : le guard est un MIDDLEWARE HTTP (`llm-cost-guard.middleware.ts:50` `RequestHandler`) qui charge UN flat `FLAT_COST_PER_CALL_USD = 0.002` par requête HTTP (`middleware:14,70`), pas par sub-call. STT+LLM+enrichment+TTS d'une même requête = 1 seule charge $0.002. Le TTS adapter (`text-to-speech.openai.ts`) ouvre des Langfuse `generation` cost-attribution (observabilité, lignes 80,106,134) mais NE touche PAS le counter du guard.
    (b) cap fixe $0.002/HTTP pas par fan-out : `llm-cost-guard.ts:90-91` docstring "worst-case (safety net, not metering — conservative flat $0.002/call acceptable)". CONFIRMÉ.
    (c) anon bypass : `llm-cost-guard.ts:103-105` `if (userId === null) return;` — anon contourne totalement le cap per-user (seul kill-switch s'applique, volume = HTTP rate-limit). `middleware:67` met `userId=null` pour les anonymes. CONFIRMÉ.
    (d) judge $5/jour fail-OPEN : `env.ts:407` `LLM_GUARDRAIL_BUDGET_CENTS_PER_DAY=500` ($5/jour) ; `llm-judge-guardrail.ts:5-7,112,117` = SEC FAIL-OPEN — sur budget épuisé / timeout / schema / throw, retourne `null` → fallback keyword V1. À ~1100 MAU le budget s'épuise vite → fenêtre fail-OPEN sur le judge.
  - Ref vérifiée: dev
  - Action roadmap: ❌ reste P0 — les 4 sous-claims vrais. Criticité launch : MOYENNE-HAUTE (anon bypass + flat-per-HTTP + judge fail-OPEN post-budget = surface d'abus coût/contournement guardrail à volume). Note : `dailyCapUsd`/kill-switch existent (atténuation partielle).
  - Confiance: haute

- **TD-OP-01** — Verdict: OPEN
  - Preuve: `museum-backend/src/modules/chat/adapters/secondary/search/wikidata-breaker.ts:69` classe `WikidataBreakerClient` crée `new CircuitBreaker(...)` (ligne 84, `import CircuitBreaker from 'opossum'` ligne 1). La surface de la classe (grep méthodes) = `getState`, `isRateLimit`, `recordOutcome`, `observeDuration`, `setCircuitStateGauge` — AUCUN `shutdown()`/`dispose()`/`close()`. Opossum retient un `setInterval` de rolling-stats à libérer via `breaker.shutdown()` (open-handle leak Stryker). Le graceful-shutdown `index.ts:262-278` draine embeddings/langfuse/OTel/KE/enrichment-scheduler/audit-cron mais PAS le wikidata breaker ; aucun `.shutdown()` appelé sur lui nulle part. Correspond à TECH_DEBT.md:1041.
  - Ref vérifiée: dev
  - Action roadmap: ❌ reste OUVERT 🚨 — leak de handle confirmé (pas de dispose/shutdown). Criticité launch : BASSE (impact = Stryker/test open-handle + très lent leak en prod, pas un blocker fonctionnel V1) mais doit rester tracké.
  - Confiance: haute

- **I-SEC11** — Verdict: DEFERRED-V1.1
  - Preuve: `museum-backend/src/modules/chat/useCase/orchestration/message-commit.ts:28` `urlHeadProbe?: UrlHeadProbe` (optionnel) ; le probe R5 SSRF est gaté `if (metadata.sources && ... && urlHeadProbe)` (ligne 49) → skip silencieux quand undefined (commentaire ligne 24-26 "left undefined at V1 root; V1.1 rollout after baking. NFR8: undefined → skip silently"). VÉRIFICATION D'ACTIVATION : `new UrlHeadProbe` n'est instancié NULLE PART en code non-test (grep vide hors tests) ; le composition root `chat-module.ts` ne référence pas `urlHeadProbe` du tout. La dep est juste threadée (chat.service:137 → chat-message.service:218 → message-commit:40), toujours `undefined`. Donc R5 ne tourne JAMAIS au V1 : latent, pas régressé en live.
  - Ref vérifiée: dev
  - Action roadmap: ⚠️ DEFERRED-V1.1 confirmé latent/non-activé (pas de wiring au composition root, jamais instancié). Reste reporté V1.1 ; non-blocker launch. Criticité launch : nulle (code dormant).
  - Confiance: haute

---

## Comptage par verdict (11 items)

| Verdict | Items | Compte |
|---|---|---|
| OPEN | I-OPS2, I-OPS3, I-OPS4, I-OPS6, I-OPS7, I-FIX3, TD-OP-01 | 7 |
| PARTIAL | I-OPS5, I-OPS8 | 2 |
| DEFERRED-V1.1 | I-SEC11 | 1 |
| FALSE-CLAIM | (aucun) | 0 |
| (sous-claim NEEDS-OPS-HUMAN) | I-OPS5 (exéc copie GPG offline + IaC bucket), I-OPS8(d) (branch-protection required-checks) | — |

Aucune branche dédiée LOT 4 → tout vérifié sur `dev`. Aucun item DONE-DEV : LOT 4 n'a pas été démarré comme chantier dédié (cohérent avec Section A).

## Claims doc inexacts à corriger (UFR-024)

- **I-OPS4** : le claim "LLM 10s×2 (total 25s)" est inexact — `LLM_TIMEOUT_MS=15000` (pas 10s) ; le total budget 25s vient de `LLM_TOTAL_BUDGET_MS=25000`. L'incohérence (budget > REQUEST_TIMEOUT + guardrails série) tient, mais les chiffres du texte doivent être corrigés.
- **I-OPS3** : "crash-loop" présenté comme certain → en réalité CONDITIONNEL (idempotence `AppDataSource.runMigrations()` amortit le double-run ; crash-loop seulement si une migration échoue). Double-run réel, crash-loop pas systématique.
- **I-OPS5** : la partie "perte clé GPG = DR morte" est désormais ATTÉNUÉE par le doc (rotation/seeding/copie offline documentés lignes 89-110) — le claim était valide à l'audit mais le doc a évolué.
- **I-OPS7** : path:line `chat.repository.typeorm.ts:265` re-localisé à `:273` (méthode `listSessions`, fichier déplacé sous `adapters/secondary/persistence/`).
- **I-OPS8(d)** : "sentinel-mirror absent des required-checks" non-vérifiable par fichier (réglage GitHub branch-protection) — ne pas affirmer FALSE/OPEN sans accès à la config GH.
