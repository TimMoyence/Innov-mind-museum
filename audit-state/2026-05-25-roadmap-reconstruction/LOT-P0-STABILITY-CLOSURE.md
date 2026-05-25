# Lot P0 stabilité & observabilité + I-SEC8 — Rapport de clôture

> Branche `p0/stability` (worktree `wt-p0-stability`), 4 commits, pipeline /team UFR-022 (spec→plan→red→green→verify→security→review→documenter) par groupe. Date : 2026-05-25.
> Source autoritaire : `findings/D4-lot4-stability.md` + `findings/D3-lot2-gdpr.md` (bloc I-SEC8).

## Items TRAITÉS (code livré, review APPROVED + security PASS)

| Item | Commit | Verdict review | Résumé du fix |
|---|---|---|---|
| **I-SEC8** (sécu critique, OWASP LLM08) | `a3f717cfc` | 93.35 | `museum_id` scope sur la KB `artwork_knowledge` (migration + entité + port + repo read-filter paramétré + caller pipeline). Miroir fidèle du précédent C7 (`artwork_embeddings`). ADR-061 **amendé** (renversement de la décision doc-only). Résiduel LOW : `currentArtworkId` non validé tenant à l'écriture (neutralisé par le scope au read). |
| **I-FIX3** (cost/guardrail) | `e206b453d` | 89.9 | Metering route-keyed du cost-guard (fan-out `/audio`/`/tts`/`/messages`/`/describe`, plus de flat $0.002/HTTP) ; anon `userId===null` rendu bruyant (warn+metric, branche morte car auth requise) ; judge fail-OPEN **inchangé en comportement** + métrique `musaium_guardrail_judge_degraded_total{reason}`. **Décision user** : degrade-to-backstop (le sidecar fail-closed tourne AVANT le judge et reste binding → pas de hard-block). |
| **I-OPS4** (timeout budget) | `f29521e23` | 92.65 | Ceiling socket chat ≈29s (budget LLM 25s + guardrails série 2s + marge) appliqué au chemin **texte-only** aussi (le finding avait raté que multipart était déjà à 35s). N'allonge jamais, ne raccourcit rien. |
| **I-OPS6** (pgvector guard) | `f29521e23` | 92.65 | Pré-flight `assertPgVectorAvailable` dans `run-migrations.ts` (vérifie `pg_available_extension_versions` ≥0.7.0 avant `runMigrations()`). **Pas d'édition de la migration appliquée** (MIGRATION_GOVERNANCE-clean). |
| **I-OPS7** (3 indices) | `f29521e23` | 92.65 | Migration `AddOpsStabilityIndexes` (CONCURRENTLY, transaction off) : `api_keys(user_id)`, composite `chat_sessions(userId,updatedAt,id)`, partiel `(updatedAt) WHERE purged_at IS NULL`. No-drift vérifié. |
| **TD-OP-01** (opossum) | `f29521e23` | 92.65 | `dispose()` idempotent → `breaker.shutdown()` + wiring graceful-shutdown. `--detectOpenHandles` confirme le timer libéré. TECH_DEBT.md mis à jour. |
| **I-OPS2** (alertes + routing) | `83feb1f0b` | 92.85 | `api-health.yml` : alertes 5xx (warning>5%/critical>20%), backend `up{job=musaium-backend}==0` for 2m, Redis (métrique fallback). Routing severity Alertmanager (critical→`telegram-ops-critical`, défaut→`-warning`). App-level only. |
| **I-OPS3** (double-run migration) | `83feb1f0b` | 92.85 | Dockerfile CMD = app-only ; le step CI deploy (prod+staging) lance le script gardé `run-migrations.js` (plus le CLI brut) → chemin unique, guard pgvector préservé, fail-fast `set -e` avant `up -d`. |
| **I-OPS8(a/b/c)** (gates CI) | `83feb1f0b` | 92.85 | ai-tests sur PR (paths-filter, plus `workflow_dispatch`-only) ; expo-doctor bloquant (retrait `continue-on-error`) ; nouveau job `migration-drift` (`pgvector/pgvector:pg16`, generate Check → assert vide) ; actionlint câblé dans le quality gate. |

## Items NON-CODE — ACTIONS OPS pour Tim

> Aucune de ces actions n'est patchable en code ; elles requièrent un accès infra/GitHub/IaC.

### 1. I-OPS8(d) — sentinel-mirror dans les required-checks (branch-protection)
Non vérifiable/patchable par fichier (réglage GitHub branch-protection). **Action** : via `gh api` ou Settings → Branches → `main` protection → required status checks, ajouter `sentinel-mirror` (et idéalement `migration-drift`, `ai-tests`). Le workflow `sentinel-mirror.yml` tourne déjà sur PR ; il faut juste l'imposer comme required.
```
gh api repos/<owner>/<repo>/branches/main/protection/required_status_checks \
  -X PATCH -F 'contexts[]=sentinel-mirror' -F 'contexts[]=migration-drift'
```

### 2. I-OPS5 — backup média + bucket SPOF (IaC/ops)
- **Média non backupé** : `db-backup-daily.yml` ne fait que `pg_dump`. Les uploads média (S3) ne sont pas sauvegardés. **Action** : activer la réplication cross-region du bucket média côté provider (Scaleway/OVH/MinIO) OU ajouter un job de sync S3→bucket-backup.
- **Bucket unique (SPOF)** : backups DB et médias dans le **même** bucket `S3_BUCKET` (préfixe `backups/daily/`). Perte du bucket = perte DB **et** médias. **Action** : provisionner un **second bucket** dédié backups (nouveau secret `S3_BACKUP_BUCKET`), repointer `db-backup-daily.yml`.
- La clé GPG est OK (rotation/seeding/copie offline documentés dans `DB_BACKUP_RESTORE.md`) — vérifier juste que la copie offline réelle existe.

### 3. I-OPS2 — exporters Postgres/Redis (IaC, optionnel V1)
Les alertes livrées sont **app-level** (5xx, backend-up, Redis via métrique fallback). Postgres-down est couvert **transitivement** via backend-up==0 (le healthcheck `/api/health` dépend de la DB). Pour de **vraies sondes** `pg_up`/`redis_up` directes, déployer `postgres_exporter` + `redis_exporter` et les ajouter aux `scrape_configs` de `prometheus.yml`. Non-bloquant V1.

### 4. I-OPS3 — runbook DR fresh-DB
Avec le single-path (migrations en CI deploy, plus au boot conteneur), un **rebuild DB fraîche hors pipeline CI** ne migre plus automatiquement. **Action** : noter dans le runbook DR que `run-migrations.js` doit être lancé manuellement avant le 1er boot sur une DB fraîche. (Commenté dans `Dockerfile.prod`.)

### 5. Pré-existant (non-introduit par ce lot) — `scripts-esm` globalTeardown
Le projet jest `scripts-esm` sort en exit 1 (transpile error `jest-global-teardown.ts: Unexpected identifier 'as'`) malgré tous les tests verts. Affecte le nouveau harnais `ops-infra-ci-gates.test.mjs` ET le `stryker-hot-files-gate.test.mjs` pré-existant. **Action** (hors lot) : fixer la config `globalTeardown` du projet scripts-esm (transform `.ts`).

## Item SANS action

### I-SEC11 — DEFERRED-V1.1 (confirmé latent)
`UrlHeadProbe` n'est instancié **nulle part** en code non-test (`new UrlHeadProbe` = 0 hits dans `src/`), non wiré au composition root (`chat-module.ts` ne le référence pas). Le probe R5 SSRF ne tourne **jamais** en V1 (code dormant). **Aucune action** — reste reporté V1.1, non-blocker launch.

## Notes pipeline
- 1 boucle de rejet reviewer (RUN C, I-OPS7) : nommage migration non-conventionnel + override eslint dir-wide → corrigé (timestamp convention, override retiré) → re-review APPROVED 92.65.
- Tous les commits : pre-commit hook PASS, **zéro bypass** (UFR-020).
- Worktree `wt-p0-stability` à merger sur `dev` après validation. `git worktree remove` après merge.
