# A5 — P0.I.B Stabilité / KR3 (I-OPS1..8 + I-FIX3)

> Agent fresh-context READ-ONLY (UFR-013/UFR-022/UFR-024). Branche `dev` @ HEAD `89852f2a1` (confirmé `git rev-parse HEAD`). Aucun contexte d'un autre agent.
> Date : 2026-05-25.

## ⚠️ CONSTAT MAJEUR — closure doc fantôme (honnêteté UFR-013)

`audit-state/2026-05-25-roadmap-reconstruction/LOT-P0-STABILITY-CLOSURE.md` (committé `0349095c5`, 2026-05-25 15:06) **prétend que I-OPS2/3/4/6/7/8(a-c), I-FIX3, TD-OP-01, I-SEC8 ont été FIXÉS** sur une branche `p0/stability` (worktree `wt-p0-stability`), commits `a3f717cfc` / `e206b453d` / `f29521e23` / `83feb1f0b`, review APPROVED 89-93. **VÉRIFICATION CODE : AUCUN de ces fixes n'est dans `dev` HEAD.**

Preuves de non-merge :
- `git branch -a | grep stability` → **vide** (aucune branche `p0/stability`).
- `git worktree list` → **un seul** worktree (le principal `dev`). Pas de `wt-p0-stability`.
- `git merge-base --is-ancestor <sha> HEAD` pour les 4 SHAs → **tous NOT in HEAD history** (SHAs inconnus de l'arbre).
- `infra/grafana/alerting/api-health.yml` (livrable I-OPS2 claimé) → **n'existe pas** (`ls` 404 ; le dir contient les 5 .yml d'origine, aucun modifié après 2026-05-20).
- Migration `AddOpsStabilityIndexes` (I-OPS7 claimé) → **introuvable** (`ls migrations/ | grep OpsStability` vide).
- `assertPgVectorAvailable` / `pg_available_extension_versions` (I-OPS6 claimé) → **0 hit** dans `museum-backend/src/data/db/`.

La closure doc décrit du travail réel-de-worktree **jamais mergé** (le doc lui-même dit « Worktree wt-p0-stability à merger sur dev APRÈS validation »). Le fichier .md a été committé mais **pas le code**. → Tous les items ci-dessous restent dans l'état d'origine (cohérent avec D4 + Section A « LOT 4 = seul reliquat de dev neuf »). Ne PAS croire la closure doc.

---

### I-OPS1 — VERDICT: PARTIAL (claim composite : moitié mitigée, moitié OPEN)
- Marqueur roadmap actuel : ✅ (flippé ❌→✅ le 2026-05-21 par `dd2763a2a`, rationale « RN mappe release/dist auto »)
- État réel vérifié : claim a 2 volets. (1) `Sentry.init` RN sans `release`/`dist` — `sentry-init.ts:35-47` n'a effectivement aucun champ `release`/`dist` explicite ; MAIS le plugin `@sentry/react-native/expo` est câblé (`app.config.ts:355`) → il auto-stamp release/dist au build EAS (rationale ✅ plausible, non re-prouvée en runtime ici). (2) **« `ci-cd-mobile.yml` zéro Sentry » reste VRAI** : `grep -in sentry .github/workflows/ci-cd-mobile.yml` → **0 hit**. Pas d'upload sourcemaps/release CI dans le pipeline mobile. Le ✅ ne couvre que le volet (1) ; le volet CI-Sentry du texte est non-traité.
- CHECKBOX-FLIP : non (garder ✅ MAIS le texte du claim devrait être amputé du volet « ci-cd-mobile zéro Sentry » ou le ✅ devient mensonger — recommandation : reformuler en « release/dist auto-stamped par plugin Expo ; upload sourcemaps CI à câbler V1.1 »).
- Amélioration/debt : câbler `sentry-expo`/sourcemaps upload dans `ci-cd-mobile.yml` pour symbolication crash-free fiable (P1, non-blocker).

### I-OPS2 — VERDICT: OPEN
- Marqueur roadmap actuel : ❌
- État réel vérifié : 18 alertes existent (`grep alert: infra/grafana/alerting/*.yml`) couvrant disque/RAM/CPU/node-exporter (`vps-host.yml`), latence chat p99 (`chat-latency.yml`, `chat-stages-latency.yml`), coût LLM/cache/breaker (`llm-cost.yml`), Wikidata (`wikidata-resilience.yml`). **Manquent toujours** : (a) taux 5xx API — `http_requests_total{status=~"5.."}` n'apparaît QUE dans un *dashboard* (`dashboards/visual-compare.json:142`), **aucune `alert:`** ; (b) backend-down — seul `up{job="node-exporter"}==0` (`vps-host.yml:125`, c'est l'exporter, pas l'app `up{job="musaium-backend"}`) ; (c) Postgres-down — aucun `pg_up` ; (d) Redis-down direct — seulement l'indirect `guardrail_budget_redis_fail_closed` (`llm-cost.yml:166`). Routing : `alertmanager.yml` route TOUT vers un seul receiver `telegram-ops`, `inhibit_rules: []`, **aucun severity split** (les labels `severity` existent sur les rules mais ne routent vers rien de distinct).
- CHECKBOX-FLIP : non (reste ❌)
- Amélioration/debt : ajouter alertes 5xx + `up{job=musaium-backend}==0` ; severity routing critical/warning. Criticité launch MOYENNE-HAUTE (un backend/DB down ne page pas directement l'oncall).

### I-OPS3 — VERDICT: OPEN
- Marqueur roadmap actuel : ❌
- État réel vérifié : `museum-backend/deploy/Dockerfile.prod:101` = `CMD ["sh","-c","node dist/src/data/db/run-migrations.js && node dist/src/index.js"]` — migrations relancées à CHAQUE boot conteneur. Le deploy CI (`ci-cd-backend.yml`) lance déjà `migration:run` dans un conteneur éphémère AVANT le `up -d backend` → **double-run structurel** confirmé. Nuance D4 maintenue : `runMigrations()` idempotent (n'applique que les *pending*) → 2e run = no-op nominal ; crash-loop **conditionnel** (échec migration réel + `restart:unless-stopped`).
- CHECKBOX-FLIP : non (reste ❌)
- Amélioration/debt : retirer migrations du CMD boot (single-path CI/deploy) OU guarder. Note runbook DR : DB fraîche hors-CI nécessitera un `run-migrations.js` manuel. Criticité MOYENNE.

### I-OPS4 — VERDICT: OPEN
- Marqueur roadmap actuel : ❌ (chiffres déjà corrigés par D4 dans le texte)
- État réel vérifié : `env.ts:66` `REQUEST_TIMEOUT_MS=20000` ; `:163` `LLM_TIMEOUT_MS=15000` ; `:165` `LLM_TOTAL_BUDGET_MS=25000` ; `:166` `LLM_RETRIES=1`. Incohérence réelle confirmée : budget LLM seul (25s) > REQUEST_TIMEOUT HTTP (20s) ; + 2 sidecars guardrail V2 en série (~2000ms : LLM-Guard 1500ms input + judge 500ms) AVANT l'appel LLM → 20000 − 2000 = 18000ms < 25000ms budget → le client peut timeout HTTP avant épuisement du budget LLM. Le texte roadmap a déjà corrigé les chiffres (plus de « 10s×2 »).
- CHECKBOX-FLIP : non (reste ❌)
- Amélioration/debt : aligner `REQUEST_TIMEOUT_MS` ≥ budget LLM + marge guardrails (la closure-doc fantôme proposait ~29s pour le chemin texte-only ; non mergé). Criticité MOYENNE.

### I-OPS5 — VERDICT: PARTIAL (dont OPS-HUMAN)
- Marqueur roadmap actuel : ⚠️ (PARTIAL, déjà annoté D4)
- État réel vérifié : (a) clé GPG = doc-mitigée (`DB_BACKUP_RESTORE.md` rotation/seeding/copie offline documentés) — OPS-HUMAN pour l'exécution réelle de la copie offline. (b) **media/uploads non-backupé** — `db-backup-daily.yml` ne fait que `pg_dump`, aucun dump S3 média → OUVERT. (c) **backups + médias dans le MÊME bucket** (`DB_BACKUP_RESTORE.md:46-47` « Reuses the existing media S3 bucket — NOT a separate bucket ») → shared-fate SPOF OUVERT. Majoritairement IaC/ops.
- CHECKBOX-FLIP : non (reste ⚠️)
- Amélioration/debt : second bucket dédié backups (`S3_BACKUP_BUCKET`) + sync média cross-region. OPS-HUMAN (provisioning bucket). Criticité BASSE-MOYENNE (DR DB OK ; perte bucket entier = catastrophe peu probable).

### I-OPS6 — VERDICT: OPEN
- Marqueur roadmap actuel : ❌
- État réel vérifié : `1778406339944-AddArtworkEmbeddings.ts:39` `CREATE EXTENSION IF NOT EXISTS vector` SANS aucun guard de version (`pg_available_extension_versions ≥ '0.7.0'`) ; `:53` `embedding halfvec(768) NOT NULL` (type FP16, exige pgvector ≥0.7.0). Sur Postgres pgvector 0.6.x → `CREATE EXTENSION` réussit puis `halfvec` ligne 53 échoue « type halfvec does not exist » → revert au 1er `migration:run`. Correspond au gotcha CLAUDE.md/ADR-037. Aucun `assertPgVectorAvailable` ajouté (closure-doc fantôme non mergée).
- CHECKBOX-FLIP : non (reste ❌)
- Amélioration/debt : pré-flight version-check dans `run-migrations.ts` (sans éditer la migration appliquée). Criticité MOYENNE (latent si image prod = `pgvector/pgvector:pg16` correcte ; plante sinon).

### I-OPS7 — VERDICT: OPEN
- Marqueur roadmap actuel : ❌
- État réel vérifié : 3 sous-claims confirmés sur les migrations `dev` :
  (a) `api_keys.user_id` FK `ON DELETE CASCADE` (`CreateApiKeysTable.ts:15`) **sans index** — aucun `CREATE INDEX` sur `user_id` dans tout `migrations/*.ts` (seq-scan au delete user CASCADE).
  (b) `chat_sessions.purged_at` (`AddChatSessionPurgedAt.ts:28`) **sans index** — `grep CREATE INDEX ... purged_at` = vide → cron purge quotidien seq-scan.
  (c) `listSessions` (`chat.repository.typeorm.ts` — méthode déplacée sous `adapters/secondary/persistence/`) ordonne `userId = :userId ORDER BY updatedAt DESC, id DESC` mais seul l'index mono-colonne `IDX_chat_sessions_userId` existe (`AddCriticalChatIndexesP0.ts:37`) ; **pas de composite `(userId, updatedAt, id)`** → tri en mémoire.
- CHECKBOX-FLIP : non (reste ❌)
- Amélioration/debt : migration `CREATE INDEX CONCURRENTLY` pour les 3 (api_keys.user_id, composite chat_sessions, partiel purged_at). Criticité BASSE-MOYENNE à V1 (~1100 MAU), HAUTE à scale.

### I-OPS8 — VERDICT: PARTIAL (a/b/c OPEN ; d NOT-VERIFIABLE)
- Marqueur roadmap actuel : ❌
- État réel vérifié :
  (a) `ci-cd-backend.yml:447` job `ai-tests` avec `if: github.event_name == 'workflow_dispatch'` (`:449`) → `pnpm run test:ai` (`:477`) ne tourne **jamais** sur PR/push. CONFIRMÉ (théâtre). Nuance : les promptfoo workflows tournent bien sur `pull_request`, mais le job `ai-tests`/`test:ai` BE est dispatch-only.
  (b) `ci-cd-mobile.yml:86-87` `npx expo-doctor` + `continue-on-error: true` → échec non-bloquant. CONFIRMÉ.
  (c) aucun gate anti-drift migration (`grep migration-drift|generate.*Check|schema.*drift .github/workflows/` = vide) ; **pas non plus d'`actionlint`** câblé. CONFIRMÉ.
  (d) « sentinel-mirror absent des required-checks » = **NOT-VERIFIABLE-BY-CODE** (réglage branch-protection GitHub, hors repo). `sentinel-mirror.yml` tourne bien sur PR, mais le statut « required » est un réglage Settings → à confirmer via `gh api .../branches/main/protection/required_status_checks`. **OPS-HUMAN.**
- CHECKBOX-FLIP : non (reste ❌)
- Amélioration/debt : ai-tests sur PR + paths-filter, expo-doctor bloquant, job migration-drift (`pgvector/pgvector:pg16`, generate Check → assert vide), actionlint. Criticité MOYENNE.

### I-FIX3 — VERDICT: OPEN
- Marqueur roadmap actuel : ❌
- État réel vérifié : 4 sous-claims confirmés. (a) STT/TTS non-métrés au cap : le guard est un middleware HTTP qui charge un flat (`llm-cost-guard.ts:91` docstring « not metering — conservative flat $0.002/call acceptable ») par requête, pas par sub-call fan-out (STT+LLM+TTS = 1 charge). (b) cap fixe $0.002/HTTP confirmé. (c) anon bypass — `llm-cost-guard.ts:103` `if (userId === null) {` → contourne le cap per-user. (d) judge fail-OPEN — `env.ts:407` `LLM_GUARDRAIL_BUDGET_CENTS_PER_DAY=500` ($5/j) ; `llm-judge-guardrail.ts:121/131/209 return null` → fail-open vers V1 keyword (`:225` « null → fail-open »). Budget s'épuise vite à volume → fenêtre fail-OPEN.
- CHECKBOX-FLIP : non (reste ❌)
- Amélioration/debt : metering route-keyed (fan-out audio/tts/messages/describe), anon rendu bruyant, métrique `judge_degraded`. Atténuation existante : `dailyCapUsd`/kill-switch. Criticité MOYENNE-HAUTE (anon bypass + flat-per-HTTP + judge fail-OPEN post-budget).

---

## Comptage par verdict (9 items)

| Verdict | Items | Compte |
|---|---|---|
| OPEN | I-OPS2, I-OPS3, I-OPS4, I-OPS6, I-OPS7, I-FIX3 | 6 |
| PARTIAL | I-OPS1, I-OPS5, I-OPS8 | 3 |
| DONE | (aucun) | 0 |
| FALSE-CLAIM | (aucun item ; mais closure-doc `LOT-P0-STABILITY-CLOSURE.md` = fixes NON MERGÉS) | — |
| NOT-VERIFIABLE / OPS-HUMAN (sous-claims) | I-OPS8(d) branch-protection ; I-OPS5(a) copie GPG offline + (b)(c) bucket IaC | — |

## CHECKBOX-FLIPS recommandés
- **Aucun flip de marqueur** (tous restent ❌/⚠️/✅ tels quels au HEAD — rien n'a été mergé depuis D4).
- **I-OPS1 (✅) à reformuler** : le ✅ ne couvre que le volet release/dist (auto-stamp plugin Expo `app.config.ts:355`) ; le volet « `ci-cd-mobile.yml` zéro Sentry » du texte du claim reste VRAI (0 hit grep) → soit amputer le texte, soit le ✅ est partiellement mensonger.

## Blockers V1 vs P1/scale
- **Vrais candidats blocker V1 (MOYENNE-HAUTE)** : I-OPS2 (backend/DB down ne page pas), I-FIX3 (anon bypass + judge fail-OPEN = surface abus coût/guardrail).
- **Atténué / conditionnel (MOYENNE)** : I-OPS3 (double-run, crash-loop conditionnel), I-OPS4 (incohérence budget timeout), I-OPS6 (latent si image pgvector correcte), I-OPS8 (gates théâtre).
- **P1/scale, pas blocker V1** : I-OPS7 (indices — BASSE à 1100 MAU), I-OPS5 (DR DB fonctionne ; média/bucket = IaC), I-OPS1 (sourcemaps CI).

## Top 3 améliorations / debt
1. Alertes app-level 5xx + `up{job=musaium-backend}==0` + severity routing (I-OPS2) — couvre backend/DB-down (DB transitif via /api/health).
2. Metering route-keyed du cost-guard + fermeture anon bypass (I-FIX3) — surface d'abus la plus exploitable à volume.
3. Single-path migrations (retirer du CMD boot) + guard pgvector ≥0.7.0 dans `run-migrations.ts` (I-OPS3 + I-OPS6) — déterminisme deploy.
