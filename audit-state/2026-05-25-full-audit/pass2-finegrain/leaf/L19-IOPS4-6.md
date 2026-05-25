# L19 — I-OPS4 / I-OPS5 / I-OPS6 (Stabilité, pass2 fine-grain)

Audit READ-ONLY fresh-context (UFR-022). `dev` @ HEAD `1fb32f5bafc5ada0b97e7ce10af39d02834df8af`.
Aucun marqueur/closure antérieur n'a été cru ; chaque verdict re-dérivé du code (path:line).
Roadmap source : `docs/ROADMAP_PRODUCT.md:246-248` (entries I-OPS4/5/6).

---

## I-OPS4 — KR3 p99 < 5s : incohérence timeout LLM/budget/request + 2 sidecars en série

**VERDICT : CONFIRMÉ (❌ open).** Les chiffres exacts de la roadmap sont vérifiés. Une nuance IMPORTANTE corrige toutefois l'analyse "request timeout 20s coupe avant le budget 25s".

### Chiffres timeout (tous VÉRIFIÉS par Read)

| Param | Valeur défaut | Source path:line |
|---|---|---|
| `LLM_TIMEOUT_MS` (`llm.timeoutMs`) | **15000ms** | `museum-backend/src/config/env.ts:163` |
| `LLM_TIMEOUT_SUMMARY_MS` (`llm.timeoutSummaryMs`) | 10000ms | `env.ts:164` |
| `LLM_TOTAL_BUDGET_MS` (`llm.totalBudgetMs`) | **25000ms** | `env.ts:165` |
| `REQUEST_TIMEOUT_MS` (`requestTimeoutMs`) | **20000ms** | `env.ts:66` |
| `GUARDRAILS_V2_TIMEOUT_MS` (sidecar LLM-Guard) | **1500ms** | `env.ts:402` |
| `LLM_GUARDRAIL_JUDGE_TIMEOUT_MS` (LLM judge) | **500ms** | `env.ts:408` |

### Incohérence #1 — budget LLM (25s) > request timeout global (20s)

- Le request timeout global est armé sur CHAQUE réponse via middleware `app.ts:172-175`
  (`res.setTimeout(env.requestTimeoutMs)` = 20000ms par défaut).
- Le budget total LLM (`totalBudgetMs` = 25000ms) est la deadline du section-runner :
  `runSectionTasks` calcule `deadlineMs = now() + max(1, totalBudgetMs)` (`llm-section-runner.ts:320`),
  et chaque task est plafonnée à `min(task.timeoutMs, remainingBudget)` (`:252`).
- **Donc** : sur un POST chat **texte-seul** (non-multipart), le request timeout 20s expire AVANT
  que le budget LLM 25s soit épuisé. Incohérence réelle : la deadline applicative interne (25s)
  est plus large que le timeout transport (20s) → un appel LLM lent peut être coupé côté socket à
  20s alors que le runner se croit autorisé jusqu'à 25s. La roadmap (`ROADMAP_PRODUCT.md:246`)
  qualifie ça `(:66, incohérent)` — **exact**.

### NUANCE NON DOCUMENTÉE par la roadmap (correction honnête) — route chat override le 20s

- Pour les requêtes **multipart/form-data** (= upload image), le middleware
  `extendTimeoutForUpload` (`chat-route.helpers.ts:14-19`) ré-arme
  `res.setTimeout(env.llm.totalBudgetMs + 10_000)` = **35000ms**, monté sur la route
  `POST /sessions/:id/messages` (`chat-message.route.ts:192`).
- **Conséquence** : l'incohérence "20s coupe avant 25s" s'applique seulement au chat **texte-seul**.
  Le chat **avec image** dispose de 35s socket > 25s budget — pas d'incohérence sur ce chemin.
  La roadmap ne mentionne pas cet override ⇒ son verdict "REQUEST_TIMEOUT=20s < budget 25s" est
  vrai mais incomplet (ne tient pas pour le chemin multipart). Vérifié `chat-route.helpers.ts:16`.

### Incohérence #2 — 2 sidecars guardrail V2 en SÉRIE autour du call LLM

Flux confirmé serial (docstring `chat.service.ts:212` "Input guardrail → persist user → LLM →
output guardrail → persist assistant"). Délégation : `chat.service.ts:230` →
`prepare-message.pipeline.ts:283` (`await evaluateInput`) → LLM → `message-commit.ts:186`
(`await evaluateOutput`).

**Leg INPUT** (`guardrail-evaluation.service.ts:122-212`) — 3 sous-couches **séquentielles** (chaque
`await` retourne tôt sur block, sinon enchaîne) :
1. keyword `evaluateUserInputGuardrail` (~sync, `:131`)
2. LLM-Guard sidecar `evaluateGuardrailProvider('input', …)` (`:147`) — timeout **1500ms** (`env.ts:402`)
3. LLM judge `runLlmJudge` (`:182`) — timeout **500ms** (`env.ts:408`), si msg ≥50 chars + budget>0

**Leg OUTPUT** (`guardrail-evaluation.service.ts:264-335`) :
1. keyword `evaluateAssistantOutputGuardrail` (`:277`)
2. LLM-Guard sidecar `evaluateGuardrailProvider('output', …)` (`:295`) — timeout **1500ms**

**Budget latence pire-cas additionnel (guardrails) ≈ input 1500+500 + output 1500 = 3500ms**,
ajoutés EN SÉRIE au call LLM (15000ms) → chemin chat = ~18.5s pire-cas hors cache.

> ⚠️ Précision honnête : les sidecars LLM-Guard/judge ne sont ACTIFS que si
> `GUARDRAILS_V2_LLM_GUARD_URL` set (provider, `env.ts:397`) resp. `LLM_GUARDRAIL_BUDGET_CENTS_PER_DAY>0`
> (judge, défaut 500, `env.ts:407`). En config par défaut SANS sidecar URL, seul le judge (500ms)
> s'ajoute. La roadmap dit "2 sidecars en série" — vrai SI le sidecar LLM-Guard est wired ;
> sinon seul le judge tourne. Code vérifié, déploiement non vérifié (pas de `.env` prod lisible).

### Incohérence #3 (citation roadmap) — path:line cité par la roadmap est IMPRÉCIS

La roadmap (`ROADMAP_PRODUCT.md:246`) cite `guardrail-evaluation.service.ts:118,154` pour
"2 sidecars en série". Vérification :
- `guardrail-evaluation.service.ts:118` = ligne de DOCSTRING (`preClassified='art' skips…`), pas un call.
- `:154` = `logBlock` dans la branche provider-block input, pas le call sidecar lui-même.
- Les **invocations** réelles sont `:147` (input provider) + `:182` (input judge) + `:295` (output provider).
- Les **valeurs** de timeout (1500/500) vivent dans `env.ts:402,408`, PAS dans le service.
- ⇒ la citation roadmap est approximativement juste (le service EST le point d'enchaînement
  séquentiel) mais les lignes exactes ne pointent pas les call-sites. Debt de citation mineure.

### Debt I-OPS4
- **TD-IOPS4-A** : aligner `REQUEST_TIMEOUT_MS` (20s) ≥ `LLM_TOTAL_BUDGET_MS` (25s) OU réduire le
  budget sous 20s pour le chemin texte. Aujourd'hui le socket peut couper avant la deadline runner.
- **TD-IOPS4-B** : KR3 p99<5s structurellement intenable hors cache (15s LLM + 3.5s guardrails série).
  La roadmap l'admet ("p99<5s tenu seulement sur cache-hit"). Confirmé par le code.
- **TD-IOPS4-C** (doc) : corriger la citation `:118,154` → call-sites `:147/:182/:295` + valeurs `env.ts:402/408`,
  et documenter l'override `extendTimeoutForUpload` (35s sur multipart).

---

## I-OPS5 — backup : volume uploads/media non-backupé + backups dans le même bucket que les médias

**VERDICT : CONFIRMÉ (⚠️ PARTIAL open).** Les deux résiduels du brief sont vérifiés mot pour mot
dans la doc autoritative ET le workflow.

### (a) Backups dans le MÊME bucket que les médias (shared-fate SPOF) — CONFIRMÉ

- `docs/DB_BACKUP_RESTORE.md:46-47` : « **Bucket reuse.** Backups land in the existing media S3
  bucket (`S3_BUCKET`) under prefix `backups/daily/`. **No second bucket is provisioned.** »
- `DB_BACKUP_RESTORE.md:87` : tableau secrets, `S3_BUCKET` = « **Same media bucket as the runtime app.** »
- Workflow `db-backup-daily.yml` (header + step "pg_dump | gpg encrypt | s5cmd cp") écrit
  `s3://${S3_BUCKET}/${BACKUP_KEY}` avec `BACKUP_KEY=backups/daily/${DATE}.pgdump.gpg` — **même
  `S3_BUCKET`** que les médias runtime. Commentaire header explicite : « Reuses the existing media
  S3 bucket (S3_BUCKET) … — NOT a separate bucket. »
- ⇒ compromission/suppression du bucket média = perte simultanée médias + sauvegardes DB. Shared-fate réel.

### (b) Volume uploads/media NON backupé — CONFIRMÉ

- Le seul pipeline de backup est `pg_dump` (DB Postgres uniquement) — `db-backup-daily.yml` step
  "pg_dump | gpg encrypt | s5cmd cp" ne sauvegarde QUE la base via `DATABASE_URL_RO`.
- `DB_BACKUP_RESTORE.md:61` : layout S3 → `media/  # untouched, existing app uploads` — le préfixe
  média est explicitement « untouched » (jamais copié/versionné par le pipeline).
- Aucun workflow/script ne snapshot le volume uploads/media. Recherche exhaustive : seuls
  `db-backup-daily.yml`, `db-backup-monthly-restore-drill.yml`, `scripts/backup-db.sh` (legacy VPS,
  DB-only), `deploy/scripts/pg-backup-local.sh` (DB-only) existent.
- ⇒ perte du bucket = perte définitive des images uploadées par les users (aucune copie off-bucket).

### Note sur la rotation clé GPG (3e résiduel roadmap, hors brief mais mentionné)
- `DB_BACKUP_RESTORE.md:19,109-110` : la clé privée GPG DOIT exister hors-CI (« CI-scoped copy must
  NEVER be the only one »). C'est une **mitigation documentaire** (runbook), pas un enforcement code.
  Roadmap qualifie « doc-mitigée » — exact. Perte de la clé = DR morte (les dumps GPG sont indéchiffrables).

### Caveat honnête
- Ce qui FONCTIONNE et n'est PAS un défaut : backup off-site GPG-chiffré quotidien + restore drill
  mensuel sont shippés (`db-backup-daily.yml` cron 02:00 UTC + `db-backup-monthly-restore-drill.yml`
  cron 1er du mois 04:00 UTC). La roadmap (`ROADMAP_PRODUCT.md:273,423`) note correctement que le
  claim historique "single point of failure / backup absent" était STALE/FAUX. Le résiduel I-OPS5
  est strictement (a)+(b)+clé GPG, pas l'absence de backup.

### Debt I-OPS5 (majoritairement IaC/ops, hors code applicatif)
- **TD-IOPS5-A** : provisionner un 2e bucket (idéalement provider/region distinct) pour
  `backups/` — supprimer le shared-fate avec les médias.
- **TD-IOPS5-B** : ajouter au pipeline une sauvegarde du volume uploads/media (sync incrémental
  vers le bucket de backup), sinon perte définitive des images users si le bucket média tombe.

---

## I-OPS6 — pgvector ≥0.7.0 jamais gaté en code

**VERDICT : CONFIRMÉ (❌ open).** `CREATE EXTENSION vector` + `halfvec(768)` posés sans AUCUN
contrôle de version. La recherche exhaustive ne trouve aucun garde `extversion`/`pg_extension`
nulle part dans `src/`.

### Preuve (path:line)
- `museum-backend/src/data/db/migrations/1778406339944-AddArtworkEmbeddings.ts:39`
  `await queryRunner.query("CREATE EXTENSION IF NOT EXISTS vector")` — **aucun check de version
  pré ou post**.
- `:53` : `"embedding" halfvec(768) NOT NULL` — type **FP16 distinct, requiert pgvector ≥ 0.7.0**
  (absent en 0.6.x ; `halfvec` n'est PAS un alias de `vector`).
- `:78` : index HNSW `USING hnsw ("embedding" halfvec_ip_ops)` — l'op-class `halfvec_ip_ops`
  exige aussi ≥0.7.0.
- Le commentaire `:9` documente « (pgvector ≥ 0.7 — design.md §9 D2) » comme HYPOTHÈSE de design,
  mais ce n'est qu'un commentaire — **aucun enforcement runtime**.

### Sweep version-gate (négatif, confirmé)
- `grep -rn "extversion|pg_extension|extname|halfvec|0.7|EXTENSION vector"` sur `src/**` (hors
  tests) : les seules occurrences "0.7" sont des poids de fusion / seuils sans rapport
  (`env.ts:314,343,379`, `similarity-scoring.ts:147`, etc.). Toutes les mentions "pgvector ≥ 0.7.0"
  sont des **commentaires** (`AddArtworkEmbeddings.ts:9`, `artwork-embedding.repository.pg.ts:7-8`,
  `artworkEmbedding.entity.ts:26-28`, domain interfaces). Zéro logique de garde.

### Impact (cohérent avec gotcha ADR-037 / CLAUDE.md)
- Sur un Postgres prod avec pgvector **0.6.x**, le 1er `migration:run` exécute `CREATE EXTENSION
  vector` (OK, mais 0.6.x), puis `CREATE TABLE … halfvec(768)` **échoue** (type inconnu) → la
  migration revert silencieusement → table `artwork_embeddings` absente → pipeline `/chat/compare`
  cassé sans message clair pointant la version pgvector. Exactement le piège décrit dans
  `CLAUDE.md § Pièges connus` (« halfvec(N) exige extension ≥ 0.7.0 … Migration C3 revert au 1er
  migration:run sinon. Vérifier `\dx vector` »). Le code ne fait PAS ce que le gotcha recommande
  de vérifier.

### Debt I-OPS6
- **TD-IOPS6-A** : ajouter dans la migration (ou un preflight bootstrap) un check
  `SELECT extversion FROM pg_extension WHERE extname='vector'` et FAIL-FAST avec message explicite
  si < 0.7.0, AVANT le `CREATE TABLE … halfvec`. Aujourd'hui zéro garde → fail/revert silencieux.

---

## Synthèse verdicts

| Item | Verdict | Confirmé vs brief | Réserve / nuance honnête |
|---|---|---|---|
| **I-OPS4** | ❌ CONFIRMÉ | Oui (15s/25s/20s + sidecars série tous vérifiés) | Override 35s sur multipart non doc'd par roadmap ; citation `:118,154` imprécise (réel `:147/182/295` + `env.ts:402/408`) ; sidecar LLM-Guard actif seulement si URL set |
| **I-OPS5** | ⚠️ PARTIAL CONFIRMÉ | Oui (même bucket + media non-backupé vérifiés mot-à-mot) | Backup DB off-site GPG + drill EXISTENT (claim "backup absent" était stale) ; résiduel = bucket partagé + media + clé GPG |
| **I-OPS6** | ❌ CONFIRMÉ | Oui (CREATE EXTENSION vector + halfvec sans version check) | Zéro garde dans tout `src/` ; "≥0.7.0" purement en commentaires |

Vérifié par Read/Grep sur le code à HEAD `1fb32f5ba`. Déploiement/`.env` prod NON lisibles ⇒
les valeurs ci-dessus sont les **défauts code** ; toute surcharge env prod n'a pas pu être vérifiée
(distinction honnête : "code dit X" ≠ "prod tourne X").
