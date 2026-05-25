# AGG4 — Synthèse domaine STABILITÉ / OPS (I-OPS1-8 + I-FIX3 + closure)

> Agrégation READ-ONLY fresh-context (UFR-013/022). Consolide les feuilles pass-2 `L18`/`L19`/`L20`/`B9b` + contexte pass-1 `A5-iops`/`B9`. **Aucune re-vérif code** — synthèse des verdicts déjà dérivés path:line par les feuilles. Toutes les feuilles convergent sur `dev` @ HEAD `1fb32f5ba` (pass-1 était sur `89852f2a1`, antérieur ; les verdicts sont identiques car LOT 4 jamais mergé entre-temps).

---

## 1. Tableau consolidé I-OPS1-8 + I-FIX3

| Item | Verdict consolidé | Sévérité | Blocker V1 vs P1/scale | Preuve clé (path:line) |
|---|---|---|---|---|
| **I-OPS1** Sentry release/dist mobile | **MAJORITAIREMENT RÉSOLU** (finding partiellement faux) | LOW | **P1** (non-blocker) | `sentry-init.ts:33-48` no release/dist JS **mais** plugin Expo auto-stamp au build (`app.config.ts:354`, `ios/android/sentry.properties:4`, `CI_CD_SECRETS.md:390`). Résiduel : secret EAS `SENTRY_AUTH_TOKEN` non-asserté + sourcemaps CI non-câblées |
| **I-OPS2** Alertes 5xx / backend-up / DB-down / Redis-down | **NON RÉSOLU (❌)** | **HAUTE** | **BLOCKER V1** | `alerting/*.yml` (5 fichiers) : aucune règle 5xx, aucun `up{job=musaium-backend}==0` (seul `node-exporter` a `up==0`, `vps-host.yml:126`), aucun `pg_up`, Redis seulement indirect (`guardrail_budget_redis_fallback`, `llm-cost.yml:166`). `alertmanager.yml` single receiver `telegram-ops`, zéro severity split |
| **I-OPS3** Migrations 2× par deploy | **NON RÉSOLU (❌)** | MOYENNE (conditionnel) | **P1** (atténué par idempotence) | `deploy/Dockerfile.prod:101` CMD `run-migrations.js && index.js` (boot) **+** CI `ci-cd-backend.yml:973` (prod) `:1555` (staging) `migration:run` éphémère pré-restart = double-path. Idempotence TypeORM amortit le nominal ; crash-loop conditionnel sous échec réel + `restart:unless-stopped` |
| **I-OPS4** KR3 p99<5s : timeout LLM/budget/request incohérent + 2 sidecars série | **NON RÉSOLU (❌)** | MOYENNE | **P1** | `env.ts:163` LLM 15s, `:165` budget 25s, `:66` request 20s → budget (25s) > transport (20s) sur chat texte-seul. Sidecars série input 1500+500 + output 1500 = +3500ms. **Nuances honnêtes** : multipart override 35s (`chat-route.helpers.ts:16`), citation roadmap `:118,154` imprécise (réel `:147/182/295`), sidecar LLM-Guard actif seulement si URL set |
| **I-OPS5** Backup : media non-backupé + même bucket que médias | **PARTIAL CONFIRMÉ (⚠️)** | MOYENNE | **P1** (IaC, DR DB fonctionne) | (a) shared-fate bucket : `DB_BACKUP_RESTORE.md:46-47` « NOT a separate bucket ». (b) media non-backupé : pipeline = `pg_dump` only, `media/ # untouched`. (c) clé GPG = doc-mitigée (runbook, pas enforcement). **Caveat** : backup off-site GPG quotidien + drill mensuel EXISTENT (claim « backup absent » était stale) |
| **I-OPS6** pgvector ≥0.7.0 jamais gaté | **NON RÉSOLU (❌)** | MOYENNE (latent) | **P1** (latent si image prod correcte) | `AddArtworkEmbeddings.ts:39` `CREATE EXTENSION vector` sans version-check ; `:53` `halfvec(768)` (FP16, exige ≥0.7.0) ; `:78` HNSW `halfvec_ip_ops`. Sweep `extversion`/`pg_extension` sur `src/**` = 0 hit. « ≥0.7.0 » purement en commentaires (`:9`). Plante/revert silencieux sur pgvector 0.6.x |
| **I-OPS7** Indices manquants | **CONFIRMÉ (❌), 3/3 réels** | BASSE-MOYENNE | **P1/scale** (aucun blocker V1) | (a) `chat_sessions.purged_at`+`updatedAt` non-indexés → cron purge seq-scan (`chat-purge.job.ts:173-179`). (b) `api_keys.user_id` CASCADE FK non-indexé (asymétrie flagrante avec `museum_id` indexé) — le candidat le plus net. (c) `listSessions` sans composite `(userId, updatedAt DESC)` (`chat.repository.typeorm.ts:273-301`). Volumes pre-launch B2C minuscules → impact V1 ≈ nul |
| **I-OPS8** CI gates partiellement théâtre | **CONFIRMÉ (❌), a/b/c/d** | MOYENNE | **P1** (b peut bloquer merge process si required) | (a) `ai-tests` `if: workflow_dispatch` jamais PR (`ci-cd-backend.yml:447-449`). (b) web/mobile `paths:` workflow-level → pending-forever SI required (verdict net dépend branch-protection, non-vérifiable fichier). (c) Expo Doctor `continue-on-error:true` (`ci-cd-mobile.yml:85-87`). (d) zéro CI gate anti-drift migration (seul `check-migration-down.cjs`, ≠ drift). (d-bis) sentinel-mirror required = NON-VÉRIFIABLE par fichier |
| **I-FIX3** Cost-guard cap (pass-1 only) | **NON RÉSOLU (❌)** | MOYENNE-HAUTE | **BLOCKER V1** (surface abus) | (a) STT/TTS non-métrés au cap (flat $0.002/HTTP, pas par sub-call fan-out, `llm-cost-guard.ts:91`). (b) cap fixe $0.002/HTTP. (c) **anon bypass** `llm-cost-guard.ts:103` `if (userId===null)` contourne le cap per-user. (d) judge fail-OPEN post-budget ($5/j, `env.ts:407`). Atténuation : `dailyCapUsd`/kill-switch |

**Comptage** : 6 OPEN (I-OPS2/3/4/6/7 + I-FIX3) · 3 PARTIAL (I-OPS1/5/8) · 0 DONE · closure-doc = CLAIM CREUX.

---

## 2. Point d'honnêteté — `LOT-P0-STABILITY-CLOSURE.md` = CLAIM CREUX confirmé

Les deux passes convergent **sans ambiguïté** : la closure-doc (`audit-state/2026-05-25-roadmap-reconstruction/LOT-P0-STABILITY-CLOSURE.md`, committée `0349095c5`) prétend I-OPS2/3/4/6/7/8 + I-FIX3 + I-SEC8 + TD-OP-01 FIXÉS sur branche `p0/stability` (worktree `wt-p0-stability`) via 4 commits. **Le code n'est PAS sur `dev`.**

| Commit claim | Objet | Existe (object store) | Ancêtre de `dev` HEAD | `git branch --contains` |
|---|---|---|---|---|
| `a3f717cfc` | I-SEC8 | OUI | **NON** | NONE (orphan) |
| `e206b453d` | I-FIX3 | OUI | **NON** | NONE (orphan) |
| `f29521e23` | I-OPS4/6/7, TD-OP-01 | OUI | **NON** | NONE (orphan) |
| `83feb1f0b` | I-OPS2/3/8 | OUI | **NON** | NONE (orphan) |

- Branche `p0/stability` introuvable (locale + remote). Worktree `wt-p0-stability` supprimé → commits = **objets dangling dans AUCUN ref**.
- Preuves négatives sur l'arbre `dev` : `infra/grafana/alerting/api-health.yml` (claim) **absent** ; `Dockerfile.prod:101` CMD double-run **inchangé** ; routing severity Alertmanager **absent** ; `assertPgVectorAvailable` **absent** ; migration `AddOpsStabilityIndexes` **introuvable**.

**VERDICT** : travail réellement codé (commits valides, sujets cohérents) mais **jamais mergé**. Pour V1 (ship depuis `dev`/`main`), tous les items du LOT 4 restent **NON RÉSOLUS**. La roadmap `docs/ROADMAP_PRODUCT.md:87` est déjà honnête (« AUCUN code sur dev … LOT 4 reste NON DÉMARRÉ ») — la closure-doc la contredit. **Action** : merger les 4 commits orphelins (à récupérer avant GC) OU retirer le claim de closure. Hors-périmètre note : LOT 1 sécu (#293) / LOT 2 GDPR (#294) / LOT 3 feature-gates (#295) SONT bien mergés ; seul LOT 4 stabilité est l'orphelin.

---

## 3. NOUVEAUX findings pass-2 (vs pass-1 A5)

La pass-2 fine-grain (L18-20 + B9b) confirme la pass-1 et ajoute des précisions matérielles :

1. **Smoke account = login permanent en PROD** (NOUVEAU, B9b §1.2) — `ci-cd-backend.yml:1014-1021` seed `seed-smoke-account.js` contre la **DB de prod à chaque deploy, sans teardown**. Le session DELETE renvoie `{deleted:false}` (session a des messages, `smoke-api.cjs:606-628`) → row non hard-deleted, reapée seulement à 6 mois par chat-purge. Prod accumule 1 user smoke + trickle de sessions. Acceptable (visitor-scoped, creds = secret bcrypt cost 12) MAIS = vrai compte login-able guardé seulement par `PROD_SMOKE_TEST_PASSWORD`. Reco : rotation comme cred prod + teardown post-smoke. **LOW (bounded by purge + least-priv)**.

2. **`verification_token: undefined` = no-op silencieux** (NOUVEAU détail, B9b §1.1) — `seed-smoke-account.ts:155-160` : le commentaire « anti-poison » est **FAUX**. `repo.update(criteria, {verification_token: undefined, reset_token: undefined, ...})` → TypeORM `.set()` filtre les `undefined` → **aucun `SET = NULL` émis**. Exactement le gotcha documenté CLAUDE.md (bug `9d1e971a5`). Pattern correct existe 4 dirs plus loin (`user.repository.pg.ts:77,116` `() => 'NULL'`). **ESLint blind** : `no-typeorm-set-undefined` scope `*.repository*.ts`/`*.repo.ts` → ne scanne pas `scripts/`. **Untested** : la regression spec couvre seulement les consents, pas les token-columns. Exploitabilité LOW (colonnes jamais set en pratique ; `reset_token` reachable mais lui-même secret). Sévérité **MEDIUM (correctness/honesty)**. Fix : `() => 'NULL'` + widen ESLint `filePatterns` à `scripts/` + assertion regression.

3. **Indices manquants — 3/3 confirmés migration-by-migration** (CONFIRMÉ + raffiné, L20) — pass-1 disait « 3 sous-claims » ; pass-2 re-dérive chaque index réel par lecture exhaustive des migrations. Le plus défendable comme vrai oubli = (b) `api_keys.user_id` (asymétrie : `museum_id` EST indexé `IDX_api_keys_museum_id`, `user_id` non). Tous P1/scale.

4. **CI gates théâtre — mécanisme pending-forever précisé** (CONFIRMÉ + raffiné, L20) — pass-2 distingue : **backend** utilise le pattern SÛR (trigger sans `paths:`, job `changes` dorny/paths-filter, skip=success) ; **web/mobile** utilisent `paths:` workflow-level → si PR ne touche pas leurs paths, workflow ne démarre jamais → required-check reste « Expected/Pending » indéfiniment. Aucun `merge_group:` (mitigation classique) nulle part. Verdict net dépend de branch-protection (non-vérifiable fichier).

5. **I-OPS4 — 2 nuances honnêtes non doc'd par roadmap** (NOUVEAU, L19) — (a) `extendTimeoutForUpload` ré-arme `res.setTimeout(budget+10s)=35s` sur multipart (`chat-route.helpers.ts:16`) → l'incohérence 20s<25s ne tient QUE pour le chat texte-seul. (b) citation roadmap `:118,154` imprécise (vrais call-sites `:147/182/295`, valeurs `env.ts:402/408`). (c) sidecar LLM-Guard actif seulement si `GUARDRAILS_V2_LLM_GUARD_URL` set ; sinon seul le judge (500ms) s'ajoute.

6. **Verdicts B9 OK confirmés sécu-side (B9b)** — dev-stack volume reclaim SAFE (prod unreachable, named/data volumes immunes) ; bake-key dev-only (forge = self-harm, pas une frontière sécu) ; Gate 4 repair sans bypass (aligné husky Gate 16) ; ai-tests coverage removal légitime (full threshold intact via `coverage-merge`). Notes LOW : `SKIP_COVERAGE_GATE=1` escape local préexistant (CI-mirrored) ; it()-count ratchet contournable via `it.skip`/empty (self-documented).

---

## 4. Debt priorisée — vrais blockers launch vs P1/scale

### Blockers V1 réels (à traiter AVANT launch)

- **I-OPS2 — alertes app-level (HAUTE).** Un crash backend / crash-loop / pic 5xx / DB-down / Redis-down ne page **personne** directement. C'est le trou d'observabilité le plus matériel. 5xx + `up{job=musaium-backend}==0` faisables avec les métriques/blackbox déjà scrapées (pg_up/redis_up = exporters IaC, optionnel V1). Fix codé dans orphan `83feb1f0b` → à merger/re-coder.
- **I-FIX3 — cost-guard cap (MOYENNE-HAUTE).** Anon bypass (`userId===null` contourne le cap) + flat $0.002/HTTP non-fan-out + judge fail-OPEN post-budget = surface d'abus coût/guardrail la plus exploitable à volume. Fix codé dans orphan `e206b453d`.

### P1 / scale (post-launch ou conditionnel)

| Priorité | Item | Raison |
|---|---|---|
| P1 | **I-OPS3** migrations single-path | Crash-loop conditionnel seulement (idempotence amortit le nominal). Fix : CMD app-only + migrations CI-only |
| P1 | **I-OPS6** garde pgvector ≥0.7.0 | Latent si image prod = `pgvector/pgvector:pg16` correcte ; preflight `extversion` fail-fast dans `run-migrations.ts` |
| P1 | **I-OPS4** alignement timeout | `REQUEST_TIMEOUT_MS` ≥ budget LLM+marge (chemin texte) ; KR3 p99<5s intenable hors cache (admis) |
| P1 | **B9b smoke account** | Rotation `PROD_SMOKE_TEST_PASSWORD` + teardown post-smoke |
| P1 | **B9b seed-smoke no-op** | `() => 'NULL'` + widen ESLint `scripts/` + assertion regression |
| P1/scale | **I-OPS7** indices (3) | Volumes pre-launch minuscules ; `CREATE INDEX CONCURRENTLY` (api_keys.user_id le plus net) |
| P1/scale | **I-OPS5** bucket/media backup | DR DB fonctionne ; 2e bucket + sync média = IaC/ops |
| P1 | **I-OPS8** gates théâtre | ai-tests sur PR, expo-doctor bloquant, job migration-drift, actionlint ; vérifier required-checks branch-protection |
| P1 | **I-OPS1** sourcemaps CI | Vérifier secret EAS `SENTRY_AUTH_TOKEN` provisionné ; ré-aligner marqueur roadmap `:243`↔`:71` |

### Top 5 actions

1. **I-OPS2** : alertes 5xx + `up{job=musaium-backend}==0` + severity routing (couvre DB transitif via /api/health). **BLOCKER V1.**
2. **I-FIX3** : fermer anon bypass + metering route-keyed du cost-guard + métrique `judge_degraded`. **BLOCKER V1.**
3. **I-OPS3 + I-OPS6** : single-path migrations (retirer du CMD boot) + preflight garde pgvector ≥0.7.0 — déterminisme deploy.
4. **B9b** : fix `() => 'NULL'` seed-smoke (gotcha + honnêteté) + rotation/teardown du compte smoke prod permanent.
5. **Honnêteté closure** : merger les 4 commits orphelins du LOT 4 OU retirer le claim de `LOT-P0-STABILITY-CLOSURE.md` ; aligner avec `ROADMAP_PRODUCT.md:87` (déjà honnête).

---

## Méthode & réserves

- Synthèse pure des feuilles pass-2 (verdicts déjà path:line-vérifiés par L18/19/20/B9b). Aucune re-vérif code en pass-2 agrégation.
- Réserve honnête héritée des feuilles : valeurs = **défauts code** ; `.env` prod non-lisible → toute surcharge env prod non-vérifiée. I-OPS8(d-bis) branch-protection + I-OPS5(a) copie GPG offline + (b)(c) bucket = NON-VÉRIFIABLE par fichier / OPS-HUMAN.
- Convergence pass-1↔pass-2 totale : aucun verdict ne diverge ; pass-2 ajoute uniquement de la précision (smoke prod permanent, mécanisme pending-forever, nuances I-OPS4, no-op untested).
