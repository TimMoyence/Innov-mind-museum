# 15 — Fiabilité PRODUCTION : stack Node + Express + TypeORM + PostgreSQL + pgvector (RAG)

_Cartographie 360, 2026-05-31. Sources web citées + vérification code Musaium (`museum-backend/`)._

## 1. État de l'art (SOTA) 2024-2026

### TypeORM — le tournant v1.0 (mai 2026)

Fait majeur **vérifié, et en contradiction avec CLAUDE.md** : TypeORM **1.0.0 est sorti le 2026-05-19** (typeorm.io/blog, changelog gitbook), pas « planned H1 2026 ». La note CLAUDE.md « v1.0 planned H1 2026 / migration not urgent » est désormais **stale**. Breaking changes : `Connection`→`DataSource` (déjà adopté chez Musaium qui utilise `data-source.ts`), `@EntityRepository`/`getCustomRepository()` supprimés, `findOneBy()`/`findBy()`/`exists()` consolidés, `null`/`undefined` dans `where` lèvent désormais, relations non-nullables → INNER JOIN. **Node 20+ minimum** (Musaium = Node 22, OK). Codemod automatisé `npx @typeorm/codemod v1 src/` couvre ~80 % du travail (renames, find-options, pins). Le consensus 2026 (Encore, Better Stack, makerkit) classe TypeORM en « legacy » : bundle ~450 KB / cold start ~850 ms vs Drizzle ~7.4 KB/~45 ms, Prisma 7 ~180 KB/~320 ms ; Drizzle/Kysely Edge-ready, pas TypeORM.

### pgvector — HNSW est le défaut SOTA, halfvec FP16 acté

Consensus net (jkatz05, Instaclustr, dev.to philip_mcclarence) : **HNSW = défaut de production** pour RAG/semantic-search (QPS et p99 supérieurs, peu de tuning, robuste aux writes). **IVFFlat à réserver** aux datasets larges/quasi-statiques optimisant build-time/mémoire — il **dégrade au fil des delete/insert** (centroïdes non mis à jour → rebuild périodique requis). `halfvec` (FP16, pgvector ≥ 0.7.0) : -50 % mémoire/stockage à qualité ~équivalente ; jusqu'à 67× build-speed HNSW vs 0.5.1 (AWS Aurora) ; natif AVX-512 FP16 sur x86.

### Connection pooling — PgBouncer txn-mode

PgBouncer transaction-mode = bon défaut web, **mais casse les prepared statements server-side**. Côté `pg` Node : `{ prepare: false }`. Depuis **PgBouncer 1.21+** : support prepared statements en txn-mode via `max_prepared_statements` (100-200). SCRAM-SHA-256 sur port 6432 (Crunchy, Tiger Data, pganalyze).

### BullMQ/Redis — at-least-once conditionnel

BullMQ garantit re-delivery jusqu'au succès/retry-limit/`UnrecoverableError`, **mais PAS** la re-delivery des event-listeners → tout travail transactionnel **dans le job handler**, jamais dans un listener (docs BullMQ). Persistence Redis **AOF** obligatoire + `maxmemory-policy noeviction` (sinon corruption). Stalled jobs récupérés ~30 s après crash worker. Patterns prod : backoff exponentiel, DLQ, `removeOnComplete/Fail`, graceful shutdown.

### Sentry + OTel Node SDK v2

`skipOpenTelemetrySetup: true` exige câblage manuel `SentryContextManager` + `SentrySampler` + `SentryPropagator` (requis même sans envoyer le tracing à Sentry, pour la propagation) — docs Sentry.

### Audit tamper-evidence

Hash-chain = simple mais **coût de vérif linéaire + sérialisation des writes**. Merkle batch = vérif logarithmique, batch-validation, défaut pour logs haute fréquence (designgurus, dev.to veritaschain, evomap). Anchrage racine + batch asynchrone.

## 2. Comparaison Musaium (vérifié dans le code)

| Sujet | SOTA | Musaium (vérifié) | Verdict |
|---|---|---|---|
| ORM | TypeORM v1.0 dispo | `typeorm 0.3.28`, `pg 8.20.0`, Node 22 | OK mais doc stale |
| Vector index | HNSW défaut | **HNSW `halfvec_ip_ops` m=16 ef_construction=64**, `halfvec(768)` (migration `AddArtworkEmbeddings.ts`) | **Conforme SOTA** |
| Pooling | PgBouncer txn + `prepare:false` | aucun `prepare:false`, aucune config pool/statement_timeout repérée dans `data/db/*.ts` | À vérifier prod |
| Queue | AOF+noeviction, attempts/backoff | BullMQ 5.74, `removeOnComplete:50/Fail:100`, backoff exp leads 60s→1h cap 5, `maxRetriesPerRequest:null` (worker) / `1`+`enableReadyCheck:false` (cache) | Solide, AOF/noeviction = infra Redis à confirmer |
| Sentry/OTel | skip+sampler+propagator | `skipOpenTelemetrySetup:true`+`getDefaultIntegrationsWithoutPerformance()`+`tracePropagationTargets` (`sentry.ts:44-67`) | **Conforme** |
| Audit | Merkle batch à l'échelle | `pg_advisory_xact_lock` clé globale 0x75f1… ceiling 50-200/s, ADR-054 **Proposed** (pas implémenté) | OK V1, dette tracée |

**Écart documentaire critique** : CLAUDE.md gotcha dit « pgvector halfvec IVFFlat … Index IVFFlat avec vector_cosine_ops » et le memo `project_*` cite IVFFlat. **Le code utilise HNSW + `halfvec_ip_ops`** (inner-product, vecteurs L2-normalisés ≡ cosine). La doc décrit un index qui n'existe pas. À corriger (UFR-013/UFR-018).

## 3. Risques réels V1 et au-delà

- **V1 (faible)** : audit ceiling 50-200/s >> charge B2C launch (qq dizaines de MAU). Aucun risque scalabilité réel avant 100k MAU. ADR-054 reste « Proposed » = bon arbitrage.
- **V1 (moyen)** : si déploiement passe par PgBouncer txn-mode sans `prepare:false`, risque « prepared statement does not exist » silencieux. Non confirmé (pas de PgBouncer trouvé dans le repo → probablement pool `pg` direct).
- **V1 (moyen)** : fiabilité BullMQ dépend de AOF + `noeviction` sur le Redis prod — config infra hors repo, à auditer côté VPS OVH.
- **Au-delà** : TypeORM 0.3.x sur un repo upstream archivé (mars 2026) → pas de patchs sécurité futurs. v1.0 dispo, codemod 80 %, Node OK → migration devenue **planifiable** (pas urgente, mais le « not urgent » doit redevenir « tracked avec v1.0 released »).
- **Au-delà** : IVFFlat aurait dégradé avec les writes ; HNSW déjà choisi = pas de dette ici. Bon point.

## 4. Recommandations priorisées

- **P0** Corriger la doc (CLAUDE.md gotcha pgvector + memos) IVFFlat→HNSW `halfvec_ip_ops` : le code est juste, la doc ment (UFR-013).
- **P0** Mettre à jour la note CLAUDE.md « TypeORM v1.0 planned H1 2026 » → « v1.0 released 2026-05-19, codemod dispo, Node 20+ OK, migration planifiable post-launch ».
- **P1** Vérifier la config Redis prod (AOF on + `maxmemory-policy noeviction`) et documenter dans le runbook OPS — sinon perte de jobs BullMQ silencieuse.
- **P1** Confirmer le mode de pooling prod (pool `pg` direct vs PgBouncer). Si PgBouncer txn-mode un jour → `prepare:false` ou `max_prepared_statements`.
- **P2** Garder ADR-054 « Proposed » ; ne déclencher la refonte Merkle qu'au signal réel (audit writes > ~50/s soutenu).
- **P2** Spike non-bloquant : évaluer le codemod TypeORM v1.0 sur une branche (mesurer le delta des 20 % non couverts : custom repos, `where null`).

## Sources
- TypeORM 1.0 blog : https://typeorm.io/blog/typeorm-1-0/
- TypeORM changelog 1.0.0 (2026-05-19) : https://orkhan.gitbook.io/typeorm/changelog
- Encore ORM 2026 : https://encore.dev/articles/prisma-vs-drizzle-vs-typeorm
- pgvector HNSW vs IVFFlat : https://dev.to/philip_mcclarence_2ef9475/ivfflat-vs-hnsw-in-pgvector-which-index-should-you-use-305p
- halfvec FP16 : https://dev.to/abhishek_gautam-01/halfvec-half-the-bits-twice-the-speed-3506
- AWS Aurora pgvector 67x : https://aws.amazon.com/blogs/database/load-vector-embeddings-up-to-67x-faster-with-pgvector-and-amazon-aurora/
- PgBouncer prepared stmts txn-mode : https://www.crunchydata.com/blog/prepared-statements-in-transaction-mode-for-pgbouncer
- BullMQ going to production : https://docs.bullmq.io/guide/going-to-production
- BullMQ delivery guarantees : https://github.com/taskforcesh/bullmq/discussions/2223
- Sentry OTel custom setup : https://docs.sentry.io/platforms/javascript/guides/node/opentelemetry/custom-setup/
- Tamper-evident scaling : https://www.designgurus.io/answers/detail/how-do-you-design-tamperevident-audit-logs-merkle-trees-hashing
