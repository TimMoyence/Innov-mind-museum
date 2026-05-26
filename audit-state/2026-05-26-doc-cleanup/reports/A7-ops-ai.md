# A7 — Audit Ops/AI docs (lot 16 fichiers)

**Date :** 2026-05-26  
**Auditeur :** Claude Code (read-only)  
**Périmètre :** docs/OPS_DEPLOYMENT.md · docs/OPS_INCIDENT_LLM_GUARD.md · docs/DB_BACKUP_RESTORE.md · docs/RELEASE_CHECKLIST.md · docs/STORE_SUBMISSION_GUIDE.md · docs/MOBILE_INTERNAL_TESTING_FLOW.md · docs/GOOGLE_PLAY_DATA_SAFETY.md · docs/AI_SAFETY.md · docs/AI_VOICE.md · docs/AI_VISUAL_SIMILARITY.md · docs/GDPR_ART22_SCOPE.md · docs/SECURITY.md · docs/SLO.md · docs/UPTIME_MONITORING.md · docs/CAPACITY_PLAN.md · docs/CHAOS_RUNBOOKS.md

---

## Tableau des états

| Fichier | État | Confiance | Preuve (doc → code) | Action |
|---------|------|-----------|---------------------|--------|
| OPS_DEPLOYMENT.md | À MODIFIER | HIGH | §5 référence `.env.local.example` et `.env.staging.example` backend — seuls `.env.example` et `.env.production.example` existent (`ls museum-backend/.env*.example`). §17 "pre-deploy boot-sequence check" valide (`src/instrumentation.ts` contient les log markers). Scripts/workflows référencés tous présents (`rollback.sh`, `smoke-api.cjs`, `count-applied-migrations.cjs`, `check-migration-down.cjs`). Grafana/Prometheus/OBS section cohérente avec `deploy/docker-compose.prod.yml` et `infra/grafana/`. | Corriger noms fichiers env §5 (backend) : `.env.example` → `.env` (pas `.env.local.example`). |
| OPS_INCIDENT_LLM_GUARD.md | À MODIFIER | HIGH | Triage §2 : `jq '.llmGuardCircuitBreaker'` (lignes 23, 107) — field réel est `.checks.llmGuard` (`api.router.ts:112, 166`). Reste du document : adapters, log events, Prometheus metrics, audit SQL — tous vérifiés présents. | Corriger les 2 jq paths : `.llmGuardCircuitBreaker` → `.checks.llmGuard` et `.llmGuardCircuitBreaker.state` → `.checks.llmGuard.state`. |
| DB_BACKUP_RESTORE.md | OK | HIGH | GHA workflows `db-backup-daily.yml` + `db-backup-monthly-restore-drill.yml` existent et utilisent pg_dump/gpg/s5cmd comme décrit. `deploy/scripts/pg-backup-local.sh` existe. `docs/incidents/BREACH_PLAYBOOK.md` existe. Section "Legacy VPS cron" correctement marquée DEPRECATED. | Aucune. |
| RELEASE_CHECKLIST.md | À MODIFIER | HIGH | **3 problèmes** : (1) §5.1.A dit "version complète de la section 2.1.D ci-dessus" — aucune section "2.1.D" n'existe dans le document (référence dangling depuis sprint précédent). (2) §3.3 Feature flags liste `FEATURE_FLAG_VOICE_MODE`, `FEATURE_FLAG_USER_MEMORY`, `FEATURE_FLAG_MULTI_TENANCY` etc. — ces vars n'existent pas dans `src/config/env.ts` ni `src/shared/config/env.ts` (grep global vide). Le `.env` live contient `FEATURE_FLAG_VOICE_MODE=true` mais le code ne lit pas ces vars. (3) §11 `tests/perf/k6/auth-flow.k6.js` existe bien (`museum-backend/tests/perf/k6/auth-flow.k6.js`). | Supprimer §3.3 entièrement (feature flags fantômes). Remplacer "section 2.1.D ci-dessus" §5.1.A par le contenu inline ou une référence à §2.1. |
| STORE_SUBMISSION_GUIDE.md | OK | HIGH | `docs/store-listing/{appstore-metadata.json,googleplay-metadata.json,feature-graphic.html}` existent. `museum-frontend/maestro/screenshots.yaml` existe. Xcode Cloud chain note présente. Play URLs status (App Store live, Google Play "coming soon") cohérent avec `LandingDownloadCTA.tsx`. EAS profiles `internal`/`production` / CI workflow cohérents. | Aucune. |
| MOBILE_INTERNAL_TESTING_FLOW.md | OK | HIGH | Trigger `workflow_dispatch` uniquement pour builds EAS confirmé par le bloc `on:` de `ci-cd-mobile.yml`. Profiles `internal`/`preview`/`production` cohérents avec `eas.json`. Secrets listés corrects. | Aucune. |
| GOOGLE_PLAY_DATA_SAFETY.md | OK | MEDIUM | NSPrivacyTracking: false vérifié `app.config.ts:181`. Collecte email/name/photo/audio/location cohérente avec le code. Subprocessors (Sentry, OpenAI, Brevo) confirmés dans le code. Audit date 2026-03-23 — vieil audit mais données structurelles stables (pas de nouvelles collectes majeures visibles). | Aucune. Confidence MEDIUM car date de l'audit = mars 2026, à refaire avant soumission store si collecte a changé. |
| AI_SAFETY.md | À MODIFIER | HIGH | **1 erreur confirmée :** §10 CI gates cite `llm-security-garak.yml` comme gate actif (`nightly + on guardrail-touching PR`) — fichier SUPPRIMÉ 2026-05-17 (`ls .github/workflows/llm-security-garak.yml` → absent). CLAUDE.md confirme la suppression. Les 5 layers guardrail (L1-L5), les adapters (`art-topic-guardrail.ts`, `llm-guard.adapter.ts`, `llm-judge-guardrail.ts`, `presidio.adapter.ts`), le port `guardrail-provider.port.ts`, les métriques Prometheus (`prometheus-metrics.ts:215`), les audit kinds — tous vérifiés présents. Presidio derrière `PRESIDIO_ENABLED` confirmé. LlamaPromptGuard "scaffolded but not yet wired" — aucun fichier `llama-prompt-guard*.ts` trouvé = adapter non scaffoldé (confidence LOW sur ce claim). | §10 : supprimer la ligne garak ou la marquer ~~supprimé 2026-05-17 (ADR-049 amendment)~~ comme le fait CLAUDE.md. Vérifier claim "LlamaPromptGuard scaffolded". |
| AI_VOICE.md | À MODIFIER | HIGH | Pipeline STT→LLM→TTS, composants backend/FE, schema DB `chat_messages` — tous vérifiés présents et cohérents. `useTextToSpeech.ts` a bien le cache `expo-file-system` (la ligne "TODO J2: cache local expo-file-system" du doc est résolue — le code implémente le cache). `useOfflineAudio.ts` toujours absent (doc dit "à créer J2"). S3/DB audioUrl reuse ("V1.1") : `chat-media.service.ts` gère la persistance mais la logique de réutilisation du cache S3/DB n'est pas implémentée (cohérent avec le "futur V1.1" du doc). | Mettre à jour la mention "TODO J2: cache local expo-file-system" sur `useTextToSpeech` → cache implémenté. `useOfflineAudio.ts` reste absent : confirmer si c'est intentionnel post-J2 ou oublié. |
| AI_VISUAL_SIMILARITY.md | OK | HIGH | `similarity.service.ts`, `compare.use-case.ts`, tous les fichiers cités existent. `scripts/catalog-ingest.ts` présent. `museum-frontend/.maestro/chat-compare.yaml` présent. Dashboard `infra/grafana/dashboards/visual-compare.json` présent. Sentry alerts T9.5 documentées mais non encore créées (le doc le note comme un "TODO avant observable") — cohérent. | Aucune. |
| GDPR_ART22_SCOPE.md | À MODIFIER | MEDIUM | Doc §5 dit "Phase 1 will ship the `GET /api/chat/messages/:id/explanation` endpoint preemptively" (présenté comme futur). Réalité : endpoint déjà livré V1 (`chat-module.ts:126, 739, 926`, `explanation.controller.ts`, `get-message-explanation.use-case.ts` — git log `c59cabc6b`). | Mettre à jour la phrase "Phase 1 will ship…" → endpoint livré en V1 (commit c59cabc6b). |
| SECURITY.md | OK | HIGH | `src/shared/security/pseudonym.ts` existe. `src/modules/auth/adapters/secondary/redis/redis-access-token-denylist.ts` existe. `admin-export.repository.pg.ts` existe. `env.production-validation.ts` validant le salt — présent. Doctrine de rotation correcte. | Aucune. |
| SLO.md | OK | MEDIUM | `DataSourceRouter` + `DB_REPLICA_URL` existent dans `data-source-router.ts`/`env.ts`. Burn rate tiers (P0/P1/P2) cohérents avec la stack. Métriques référencées présentes dans `prometheus-metrics.ts`. | Aucune. Confidence MEDIUM : les SLO targets ne sont pas validées par des tests — c'est un doc de design pas un test. |
| UPTIME_MONITORING.md | À MODIFIER | HIGH | Domaines `<prod-domain>` et `<staging-domain>` sont des placeholders (lignes 10, 18) alors que le vrai domaine est `api.musaium.com` (cité partout ailleurs dans les runbooks). Health response body attendue cohérente avec `api.router.ts`. | Remplacer `<prod-domain>` par `api.musaium.com` et `<staging-domain>` par le domaine staging réel (ou supprimer la section staging si pas encore live selon memory `project_no_staging_v1.md`). |
| CAPACITY_PLAN.md | OK | LOW | Doc marqué "Draft (design)" lui-même. `DataSourceRouter` + `DB_REPLICA_URL` existent. k6 tests présents dans `museum-backend/tests/perf/k6/`. Chiffres d'ordre de grandeur. | Aucune. Confidence LOW sur les chiffres eux-mêmes — c'est un plan prévisionnel, pas une mesure. |
| CHAOS_RUNBOOKS.md | À MODIFIER | HIGH | `DataSourceRouter` référencé — existe. Mais §1 dit "deploy the kill-switch `RATE_LIMIT_FAIL_OPEN=true`" — la var réelle est `RATE_LIMIT_FAIL_CLOSED` (`env.ts:198`). ADR-011 confirme : l'escape hatch est `RATE_LIMIT_FAIL_CLOSED=false` (désactiver le fail-closed), pas une variable `FAIL_OPEN`. | Corriger §1 : `RATE_LIMIT_FAIL_OPEN=true` → `RATE_LIMIT_FAIL_CLOSED=false` (per `env.ts:198` et ADR-011). |

---

## Findings notables

### F1 — OPS_INCIDENT_LLM_GUARD : jq path invalide en prod (BLOQUANT on-call)

Les deux commandes de triage immédiat (§2 lignes 23, 107) utilisent `jq '.llmGuardCircuitBreaker'` et `jq '.llmGuardCircuitBreaker.state'`. Le vrai field dans la réponse `/api/health` est `.checks.llmGuard` (`api.router.ts:112, 166`). Un SRE qui suit ce runbook à 03:00 obtient `null` et peut croire le circuit breaker absent ou invisible alors que l'API répond correctement. **Correction requise avant launch.**

**Code truth :** `api.router.ts:112` → `payload.checks.llmGuard = params.checks.llmGuard`

---

### F2 — AI_SAFETY.md §10 : CI gate garak fantôme

`llm-security-garak.yml` est cité comme gate actif ("nightly + on guardrail-touching PR") alors qu'il a été supprimé le 2026-05-17 (ADR-049 amendment, coût réel ~$120/mois). Tous les workflows listés dans `.github/workflows/` ont été vérifiés — le fichier est absent. Risque : une PR qui touche les guardrails est soumise avec l'impression que garak l'a validée. Suppression = déféré V2.1 selon CLAUDE.md.

---

### F3 — RELEASE_CHECKLIST §3.3 : feature flags fantômes

La section conseille d'activer `FEATURE_FLAG_VOICE_MODE`, `FEATURE_FLAG_USER_MEMORY`, `FEATURE_FLAG_MULTI_TENANCY` etc. Ces variables n'existent pas dans `src/config/env.ts` (grep global vide). La voice pipeline est always-on (TTS_ENABLED retiré 2026-04, `env.ts:218` confirme). Positionner ces flags dans `.env` prod est sans effet et source de confusion. La section entière doit être supprimée.

---

### F4 — CHAOS_RUNBOOKS §1 : mauvais nom de variable escape hatch

`RATE_LIMIT_FAIL_OPEN=true` ne correspond à aucune variable dans le code. La vraie variable est `RATE_LIMIT_FAIL_CLOSED` (default `true` en prod) ; l'escape hatch est `RATE_LIMIT_FAIL_CLOSED=false`. ADR-011 l'explique clairement. Un op qui suit le runbook verbatim n'aura aucun effet.

**Code truth :** `env.ts:198` → `failClosed: toBoolean(process.env.RATE_LIMIT_FAIL_CLOSED, isProduction)`

---

### F5 — GDPR_ART22_SCOPE : endpoint explanation présenté comme "Phase 1 future" mais déjà livré

Doc §5 GDPR : "Phase 1 will ship the `GET /api/chat/messages/:id/explanation` endpoint preemptively". Cet endpoint est déjà implémenté et wiré (`chat-module.ts:926`, `explanation.controller.ts`, `get-message-explanation.use-case.ts`, git commit `c59cabc6b`). La phrase crée une fausse impression de gap compliance à combler alors que la feature est live.

---

### Findings mineurs

- **OPS_DEPLOYMENT §5** : `cp .env.local.example .env` pour le backend — fichier inexistant (seul `.env.example` existe). Faible impact (les devs voient l'erreur immédiatement).
- **AI_VOICE.md** : mention "TODO J2: cache local expo-file-system" dans la table FE — le cache est implémenté dans `useTextToSpeech.ts:4,40`. À mettre à jour. `useOfflineAudio.ts` toujours absent — confirmer abandon ou backlog explicite.
- **UPTIME_MONITORING.md** : domaines `<prod-domain>` / `<staging-domain>` non résolus — document inutilisable en état d'incident si un SRE tombe dessus sans connaître le domaine.
- **AI_SAFETY.md** : claim "LlamaPromptGuard scaffolded but not yet wired" — aucun fichier `llama-prompt-guard*.ts` trouvé dans `src/`. L'adapter Presidio (`presidio.adapter.ts`) existe bien. Confidence LOW sur le claim LlamaPromptGuard.

---

## Résumé

**6 OK / 8 À MODIFIER / 0 À SUPPRIMER**

Aucun fichier ne mérite suppression. Les 8 à modifier ont 2-3 corrections ciblées chacun — aucune réécriture complète. Les 4 findings bloquants (F1-F4) sont des erreurs factuelles qui induisent en erreur en conditions d'incident ou de configuration prod.
