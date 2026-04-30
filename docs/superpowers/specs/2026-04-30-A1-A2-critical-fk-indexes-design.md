# A1 + A2 — Critical Foreign-Key Indexes (zero-downtime migration)

**Date:** 2026-04-30
**Author:** staff DB/SRE pass — Musaium scale hardening
**Subsystem:** A (P0 + P1 simple indexes) of the 8-subsystem decomposition
**Status:** Approved design, awaiting user spec review before plan
**Successor specs:** A3 PostGIS (deferred), C data debt, D Zod, E retention, F infra, G AI cache, H observability

---

## 1. Context

### 1.1 Problem

PostgreSQL does not auto-create indexes on foreign-key columns. Sequential scans on FK columns become catastrophic on cascade deletes and on common access patterns once tables grow beyond a few hundred thousand rows. Cybertec benchmarks show 10000× regression on cascade deletes when child-side FK columns lack an index.

A repo audit of `museum-backend` against the `Innov-mind-museum` GitNexus index identified eight FK or token columns without an index. Three are P0 (chat hot path, blast-radius critical) and five are P1 (admin / support / auth flow).

### 1.2 Verified findings

P0 — chat hot path, all on tables that will grow without bound:

| Table | Column | Used by | Today |
|---|---|---|---|
| `chat_messages` | `"sessionId"` | `OneToMany` from session, every chat detail screen, every replay | Seq Scan |
| `chat_sessions` | `"userId"` | `exportUserChatData`, `listSessions` (dashboard), GDPR export, cascade delete | Seq Scan |
| `artwork_matches` | `"messageId"` | `OneToMany` from message, every artwork-replay path | Seq Scan |

P1 — admin / support / auth, lower QPS but same pattern:

| Table | Column | Used by | Notes |
|---|---|---|---|
| `museum_enrichment` | `"museumId"` | enrichment worker join, admin enrichment list | FK with no index |
| `support_tickets` | `assigned_to` | admin "tickets assigned to me" | nullable, partial index `WHERE assigned_to IS NOT NULL` |
| `ticket_messages` | `sender_id` | ticket detail thread | FK with no index |
| `users` | `reset_token` | password-reset flow lookup | nullable, partial index |
| `users` | `email_change_token` | email-change confirmation flow | nullable, partial index |

P1 explicitly **out of scope** (YAGNI, verified via repo grep):

| Table | Column | Why deferred |
|---|---|---|
| `message_reports` | `"userId"` (separate from composite) | All callers query `(messageId, userId)` together; existing composite covers everything. |
| `message_feedback` | `"userId"` (separate from composite) | Same — only `(messageId, userId)` lookups in code. |
| `museums` | `(latitude, longitude)` GiST / PostGIS | Deferred to A3 sub-spec. Current `findInBoundingBox` uses `BETWEEN`, fine on small museums table; PostGIS migration is its own multi-step ADR-bearing scope. |

### 1.3 Naming convention

The codebase mixes camelCase quoted identifiers (`"sessionId"`, `"userId"`, `"messageId"`, `"museumId"`) on chat / museum tables and snake_case (`assigned_to`, `sender_id`, `reset_token`, `email_change_token`) on support / auth tables. Index names follow the existing convention seen in `1776593907869-Check.ts`: `IDX_<table>_<column>`. We do not normalise naming in this migration — that is unrelated cleanup and would explode scope.

---

## 2. Goals

1. Add indexes for all eight columns above with **zero downtime** in production.
2. Confirm via `EXPLAIN ANALYZE` on a 10M-row seeded local dataset that hot queries flip from `Seq Scan` to `Index Scan` and meet the latency targets in §6.
3. Idempotent migration: safe to rerun if interrupted.
4. Documented runbook for the failure mode that matters (`INVALID` index after a partial build).

Non-goals:

- Composite or covering indexes — added later if EXPLAIN reveals sort/limit pain in §6 measurements.
- Index renames or schema cleanup.
- PostGIS — A3 deferred.
- Userid-leading indexes for `message_reports` / `message_feedback` — YAGNI per grep.

---

## 3. Architecture

Two independent migrations, generated via `node scripts/migration-cli.cjs generate --name=…` per the project's migration governance rule. Each migration runs `CREATE INDEX CONCURRENTLY IF NOT EXISTS` so production traffic continues during the build. Each migration sets `transaction = false`, otherwise TypeORM wraps the migration in `BEGIN/COMMIT` and Postgres rejects `CREATE INDEX CONCURRENTLY` (cannot run inside a transaction).

```ts
export class AddCriticalChatIndexesP01XXXXXXXXXXX implements MigrationInterface {
  name = 'AddCriticalChatIndexesP01XXXXXXXXXXX';
  // Disable TypeORM's BEGIN/COMMIT wrapper. CONCURRENTLY needs its own connection.
  public transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_chat_messages_sessionId" ` +
      `ON "chat_messages" ("sessionId")`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_chat_sessions_userId" ` +
      `ON "chat_sessions" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_artwork_matches_messageId" ` +
      `ON "artwork_matches" ("messageId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_artwork_matches_messageId"`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_chat_sessions_userId"`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_chat_messages_sessionId"`);
  }
}
```

The A2 migration uses the same shape; partial indexes carry the `WHERE … IS NOT NULL` predicate — Postgres uses the partial index automatically when the planner sees a matching predicate (`WHERE reset_token = $1` implies `IS NOT NULL`).

---

## 4. Migration files

### 4.1 M1 — A1, P0 chat foreign keys

`src/data/db/migrations/<ts>-AddCriticalChatIndexesP0.ts`

```sql
-- up
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_chat_messages_sessionId"
  ON "chat_messages" ("sessionId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_chat_sessions_userId"
  ON "chat_sessions" ("userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_artwork_matches_messageId"
  ON "artwork_matches" ("messageId");

-- down
DROP INDEX CONCURRENTLY IF EXISTS "IDX_artwork_matches_messageId";
DROP INDEX CONCURRENTLY IF EXISTS "IDX_chat_sessions_userId";
DROP INDEX CONCURRENTLY IF EXISTS "IDX_chat_messages_sessionId";
```

### 4.2 M2 — A2, P1 simple FK and token columns

`src/data/db/migrations/<ts>-AddP1FKAndTokenIndexes.ts`

```sql
-- up
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_museum_enrichment_museumId"
  ON "museum_enrichment" ("museumId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_support_tickets_assigned_to"
  ON "support_tickets" ("assigned_to") WHERE "assigned_to" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_ticket_messages_sender_id"
  ON "ticket_messages" ("sender_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_users_reset_token"
  ON "users" ("reset_token") WHERE "reset_token" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_users_email_change_token"
  ON "users" ("email_change_token") WHERE "email_change_token" IS NOT NULL;

-- down
DROP INDEX CONCURRENTLY IF EXISTS "IDX_users_email_change_token";
DROP INDEX CONCURRENTLY IF EXISTS "IDX_users_reset_token";
DROP INDEX CONCURRENTLY IF EXISTS "IDX_ticket_messages_sender_id";
DROP INDEX CONCURRENTLY IF EXISTS "IDX_support_tickets_assigned_to";
DROP INDEX CONCURRENTLY IF EXISTS "IDX_museum_enrichment_museumId";
```

Both migrations are reversible. `IF NOT EXISTS` makes `up` idempotent; `IF EXISTS` makes `down` idempotent.

---

## 5. Performance benchmark — seeded dataset

### 5.1 Seed script

New script `museum-backend/scripts/seed-perf-load.ts` (run from a clean docker-compose dev DB only — never against staging or prod).

| Entity | Volume | Distribution |
|---|---|---|
| `users` | 500 000 | sequential ids 1–500 000 |
| `chat_sessions` | 1 000 000 | 2 sessions per user (mean), 90 % attached to a user, 10 % anonymous (`userId IS NULL`) |
| `chat_messages` | 10 000 000 | 10 messages per session (mean), 50 % `role='user'` / 50 % `role='assistant'`, payload approximated to production size (text 200–800 chars) |
| `artwork_matches` | 2 000 000 | ~20 % of assistant messages produce 1–3 matches |
| `museums` | 1 000 | seed-museums.ts level |
| `museum_enrichment` | 1 000 | one per museum |
| `support_tickets` | 50 000 | 10 % `assigned_to NOT NULL` |
| `ticket_messages` | 200 000 | 4 messages per ticket |

The script uses `INSERT … VALUES` batches of 10 000 rows and `pg_temp` work_mem hints. Expected runtime on a laptop docker-compose Postgres: roughly 15–25 minutes. The script writes a checkpoint file so it can resume after interruption.

The seed is for a local laptop benchmark only. Production scale validation happens in subsystem **H** (k6 + observability) once F (infra) is in place.

### 5.2 Hot queries benchmarked

```sql
-- Hot 1 — list messages of one session (chat detail screen, every message render)
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM "chat_messages"
WHERE "sessionId" = $1
ORDER BY "createdAt" ASC
LIMIT 200;

-- Hot 2 — list sessions for one user (dashboard, GDPR export prelude)
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM "chat_sessions"
WHERE "userId" = $1
ORDER BY "updatedAt" DESC
LIMIT 50;

-- Hot 3 — replay artwork matches for one message
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM "artwork_matches"
WHERE "messageId" = $1;

-- Hot 4 — cascade delete one user (account deletion, GDPR)
EXPLAIN (ANALYZE, BUFFERS)
DELETE FROM "chat_sessions" WHERE "userId" = $1;

-- P1 — assigned ticket lookup
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM "support_tickets" WHERE "assigned_to" = $1 ORDER BY "createdAt" DESC LIMIT 50;

-- P1 — password-reset token lookup
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, email FROM "users" WHERE "reset_token" = $1;
```

Sample at least 50 random `$1` values per query, record p50 / p95 / p99.

### 5.3 Acceptance criteria

| Query | p99 target before | p99 target after |
|---|---|---|
| Hot 1 (list session messages) | `Seq Scan`, > 1 s on 10M rows | **`Index Scan`, < 10 ms** |
| Hot 2 (list user sessions) | `Seq Scan`, > 200 ms | `Index Scan`, < 20 ms |
| Hot 3 (artwork matches per message) | `Seq Scan`, > 100 ms | `Index Scan`, < 5 ms |
| Hot 4 (cascade delete one user, ~2 sessions, ~20 messages, ~4 matches per user — seed mean) | sequential scans on every child | child lookups via index; total < 100 ms p99 |
| P1 (assigned tickets) | `Seq Scan`, > 30 ms | `Index Scan`, < 5 ms |
| P1 (reset_token) | `Seq Scan`, > 50 ms | `Index Scan`, < 2 ms |

The Hot 1 < 10 ms p99 target is the headline acceptance criterion. If any target fails by more than 2× we revisit covering / composite indexes before declaring A1+A2 done.

Output committed to `museum-backend/docs/perf/2026-04-30-A1-explain-analyze.md` (new directory). Includes raw `EXPLAIN ANALYZE` output for each query, before-and-after pairs, machine specs (cpu, ram, postgres version, work_mem, shared_buffers).

---

## 6. Tests

### 6.1 Existing tests must pass unchanged

The migration is purely additive: no schema change for entities, no behaviour change for repositories. The full Jest suite (`pnpm test`) is the regression gate. We do not modify any entity, repository, or service file.

### 6.2 New test — migration idempotence

`tests/unit/data/db/migrations/AddCriticalChatIndexesP0.spec.ts` (new). Skipped by default (`describe.skip`) because it requires a live test Postgres; runnable in the integration suite (`pnpm test:e2e` or a dedicated migration script). Verifies:

- `up` runs cleanly on an empty DB.
- `up` runs cleanly twice (idempotent).
- `down` runs cleanly.
- Down then up restores the index.

A2 migration gets the same test scaffold.

### 6.3 Perf bench — out of CI

`museum-backend/tests/perf/explain-analyze.bench.ts` (new). Manual `pnpm run bench:explain` command added to `package.json`. Not part of CI: depends on seeded data, runs > 1 minute.

---

## 7. Rollout

| Step | Action | Gate |
|---|---|---|
| 1 | Generate migration files locally via `migration-cli.cjs`. | — |
| 2 | Apply both migrations on docker-compose dev DB. | `pnpm migration:run` succeeds, `pnpm migration:run` again no-op (drift check). |
| 3 | Run `seed-perf-load.ts`. | Seed completes, row counts match §5.1. |
| 4 | Run perf bench. | All §5.3 targets met; output committed. |
| 5 | Run full Jest suite. | `pnpm test` green. |
| 6 | Open PR, link spec + plan + bench output. | CI green (lint, tsc, test, openapi, audit). |
| 7 | Merge to `staging`, deploy. | CI/CD `ci-cd-backend.yml` pipeline green. |
| 8 | Verify staging EXPLAIN matches dev pattern (smaller volume, same plan shape). | Manual check; document in PR. |
| 9 | Merge to `main`, deploy prod. | Manual approval gate. |
| 10 | Post-deploy: `EXPLAIN ANALYZE` on prod for Hot 1 sample, attach output to PR. | Plan shape matches expectation. |

A2 rolls out one PR after A1, same path. We do not bundle the two migrations in a single PR — A1 is critical and gets independent review; A2 is lower-risk follow-up.

---

## 8. Failure modes and recovery

### 8.1 `CREATE INDEX CONCURRENTLY` interrupted

If the migration or its host is killed during the build, the index is left in `INVALID` state in `pg_index`. Postgres still rejects new attempts on the same name (without `IF NOT EXISTS`) and ignores the invalid index for query planning. Recovery:

```sql
-- diagnose
SELECT relname, indisvalid FROM pg_class JOIN pg_index ON pg_class.oid = pg_index.indexrelid
  WHERE relname LIKE 'IDX_chat_messages_sessionId';

-- repair
DROP INDEX CONCURRENTLY IF EXISTS "IDX_chat_messages_sessionId";
-- re-run migration (the IF NOT EXISTS in CREATE will then build fresh)
```

This runbook is added to `docs/DB_BACKUP_RESTORE.md` under a new "Index migration recovery" section.

### 8.2 Lock conflict

`CREATE INDEX CONCURRENTLY` takes a `SHARE UPDATE EXCLUSIVE` lock — non-blocking for `SELECT` / `INSERT` / `UPDATE` / `DELETE` but waits for any concurrent `VACUUM FULL`, `ALTER TABLE`, `REINDEX`, or other index build on the same table. Acceptable. Document expectation: migration may pause briefly during autovacuum windows; do not cancel.

### 8.3 Disk space

10M chat_messages ≈ 5 GB table; index ≈ 1 GB. 1M chat_sessions ≈ 200 MB; index ≈ 30 MB. 2M artwork_matches ≈ 400 MB; index ≈ 80 MB. Total temporary build space (CONCURRENTLY uses extra) ≈ 2 GB headroom at peak. Production must have at least 5 GB free; document in the rollout PR.

### 8.4 Long build time on prod

CONCURRENTLY is slower than non-concurrent by roughly 2–3×. On a 10M row table, plan for 5–15 minutes per index on production hardware. The migration must not run inside CI's 10-minute timeout — it runs as a one-shot post-deploy step or via the existing `pnpm migration:run` against prod from a maintenance shell. The `_deploy-backend.yml` workflow already runs migrations as a separate phase; verify that phase has no migration-step timeout cap and document the expected duration in the PR description.

---

## 9. Out of scope (explicit YAGNI)

- A3 PostGIS migration — deferred sub-spec, blocked by F.
- Composite indexes (e.g. `("userId", "updatedAt" DESC)` on `chat_sessions`). Only consider if §5.3 Hot 2 fails the target.
- BRIN indexes on append-only timestamp columns — defer until table volume is observed in prod.
- Renaming existing badly-named indexes — unrelated cleanup.
- `message_reports` / `message_feedback` userId-leading separate index — composite already covers all callers (verified via repo grep).

---

## 10. Open questions deferred to follow-up specs

- Actual prod traffic baseline (RPS, p99 today). Required to size F. Not blocking A1+A2 — these indexes are required regardless of traffic level once tables grow.
- 100K req/sec target — aspirational vs hard requirement. Discussed in F.
