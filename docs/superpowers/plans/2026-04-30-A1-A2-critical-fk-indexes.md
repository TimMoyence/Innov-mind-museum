# A1 + A2 Critical FK Indexes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add eight foreign-key / token-column indexes to the `museum-backend` Postgres schema with zero downtime, verified by EXPLAIN ANALYZE on a 10M-row seeded dataset.

**Architecture:** Two TypeORM blank migrations, each issuing `CREATE INDEX CONCURRENTLY IF NOT EXISTS` with `transaction = false`. A1 covers three P0 chat hot-path FK columns; A2 covers five P1 simple FK and partial token-column indexes. A new `seed-perf-load.ts` script and EXPLAIN-ANALYZE bench harness live under `museum-backend/scripts/` and `museum-backend/tests/perf/` respectively. Bench output committed to `museum-backend/docs/perf/`.

**Tech Stack:** TypeORM 0.3, PostgreSQL 16, pnpm, Jest 29, ts-node, `scripts/migration-cli.cjs` (project-mandated wrapper around TypeORM CLI).

**Spec:** `docs/superpowers/specs/2026-04-30-A1-A2-critical-fk-indexes-design.md` (committed in `27e9680e`).

---

## File Structure

```
museum-backend/
├── src/data/db/migrations/
│   ├── <ts>-AddCriticalChatIndexesP0.ts          NEW — A1 migration
│   └── <ts>-AddP1FKAndTokenIndexes.ts            NEW — A2 migration
├── scripts/
│   └── seed-perf-load.ts                          NEW — 10M / 1M / 500K seed
├── tests/
│   ├── perf/
│   │   └── explain-analyze.bench.ts               NEW — EXPLAIN harness, manual run
│   └── unit/data/db/migrations/
│       ├── AddCriticalChatIndexesP0.spec.ts       NEW — idempotence test (skipped by default)
│       └── AddP1FKAndTokenIndexes.spec.ts         NEW — same shape
├── docs/perf/
│   └── 2026-04-30-A1-A2-explain-analyze.md        NEW — bench output
└── package.json                                   MODIFY — bench:explain script

docs/
└── DB_BACKUP_RESTORE.md                           MODIFY — invalid-index recovery runbook
```

Decomposition rationale: each migration file owns one logical batch (P0 vs P1) so they can be reverted independently. The seed script is reusable for future perf work (subsystem H). The bench harness is a thin wrapper around `EXPLAIN ANALYZE` that we keep — same harness re-used for future index decisions.

---

## Conventions

- Always run from `museum-backend/` cwd unless noted.
- Migration timestamps come from `migration-cli.cjs create` — never hand-author the prefix.
- DB col identifiers preserve the existing repo convention: camelCase quoted (`"sessionId"`, `"userId"`, `"messageId"`, `"museumId"`) on chat / museum tables; snake_case (`assigned_to`, `sender_id`, `reset_token`, `email_change_token`) on support / auth tables.
- Commits: one per task. No squash. Use the project conventional-commit style observed in `git log --oneline -10`.

---

## Task 1: Generate the A1 blank migration via the CLI

**Files:**
- Create: `museum-backend/src/data/db/migrations/<ts>-AddCriticalChatIndexesP0.ts`

The `generate` operation diffs entity metadata against the current DB schema. It will not pick up index-only changes (we are not declaring `@Index` decorators). Use `create` for a blank migration shell, then hand-author the body.

- [ ] **Step 1: Generate the blank migration**

```bash
cd museum-backend
node scripts/migration-cli.cjs create --name=AddCriticalChatIndexesP0
```

Expected output:
```
Migration <abs-path>/src/data/db/migrations/<ts>-AddCriticalChatIndexesP0.ts has been generated successfully.
```

- [ ] **Step 2: Verify the file exists and capture the timestamp**

```bash
ls -la museum-backend/src/data/db/migrations/ | tail -3
```

Note the new file's timestamp prefix. Replace `<ts>` everywhere below with that prefix when authoring tasks.

- [ ] **Step 3: Commit the empty shell**

```bash
git add museum-backend/src/data/db/migrations/<ts>-AddCriticalChatIndexesP0.ts
git commit -m "chore(db): scaffold A1 migration shell (P0 chat FK indexes)"
```

This commit is intentionally trivial — it locks the timestamp so subsequent edits have a stable filename.

---

## Task 2: Author the A1 migration body

**Files:**
- Modify: `museum-backend/src/data/db/migrations/<ts>-AddCriticalChatIndexesP0.ts`

- [ ] **Step 1: Replace the generated body with the CONCURRENTLY index migration**

Open the file. Replace its contents with exactly:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A1 — P0 chat foreign-key indexes.
 *
 * Adds B-tree indexes on the three FK columns that today drive Seq Scans
 * on every chat detail screen and every cascade delete:
 *   - chat_messages."sessionId"
 *   - chat_sessions."userId"
 *   - artwork_matches."messageId"
 *
 * Uses CREATE INDEX CONCURRENTLY (zero downtime). The class disables
 * TypeORM's BEGIN/COMMIT wrapper because Postgres rejects CONCURRENTLY
 * inside a transaction.
 *
 * IF NOT EXISTS makes `up` idempotent if the migration is re-run after a
 * mid-build interruption; the matching DROP INDEX CONCURRENTLY IF EXISTS
 * makes `down` idempotent.
 *
 * Runbook for INVALID indexes (after a CONCURRENTLY build is killed)
 * lives in docs/DB_BACKUP_RESTORE.md.
 */
export class AddCriticalChatIndexesP0<TS_NUMERIC> implements MigrationInterface {
  name = 'AddCriticalChatIndexesP0<TS_NUMERIC>';
  public readonly transaction = false as const;

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

Replace `<TS_NUMERIC>` (in the class name and the `name` field) with the timestamp digits captured in Task 1 — TypeORM scaffolds the class as `AddCriticalChatIndexesP0<digits>`. Match exactly what was generated.

- [ ] **Step 2: Typecheck**

```bash
cd museum-backend && npx tsc --noEmit
```

Expected: clean exit (0). If errors mention the migration class name, double-check the `<TS_NUMERIC>` substitution.

- [ ] **Step 3: Apply the migration on the local docker-compose dev DB**

Bring the dev DB up if needed:

```bash
docker compose -f museum-backend/docker-compose.dev.yml up -d
```

Then apply:

```bash
cd museum-backend && pnpm migration:run
```

Expected output: `Migration AddCriticalChatIndexesP0<digits> has been executed successfully.`

- [ ] **Step 4: Verify the indexes exist**

```bash
psql "$DATABASE_URL" -c "\d+ chat_messages" | grep -i sessionid
psql "$DATABASE_URL" -c "\d+ chat_sessions" | grep -i userid
psql "$DATABASE_URL" -c "\d+ artwork_matches" | grep -i messageid
```

Expected: three lines each showing `"IDX_<table>_<col>" btree (...)`.

- [ ] **Step 5: Verify drift-free generate**

```bash
cd museum-backend && node scripts/migration-cli.cjs generate --name=DriftCheck
```

Expected: `No changes in database schema were found - cannot generate a migration.` If a `DriftCheck` migration is created instead, delete it (`rm src/data/db/migrations/*DriftCheck.ts`) and review what TypeORM thinks differs.

- [ ] **Step 6: Run the full backend test suite**

```bash
cd museum-backend && pnpm test
```

Expected: same baseline as before (`tests=3406 passed` per session start, may have moved as other agents commit; no regressions caused by this migration).

- [ ] **Step 7: Commit**

```bash
git add museum-backend/src/data/db/migrations/<ts>-AddCriticalChatIndexesP0.ts
git commit -m "feat(db): A1 — P0 chat FK indexes (CONCURRENTLY, zero-downtime)"
```

---

## Task 3: Author the A1 migration idempotence test

**Files:**
- Create: `museum-backend/tests/unit/data/db/migrations/AddCriticalChatIndexesP0.spec.ts`

This is a documentation-grade test. It is `describe.skip`-d by default because it needs a live Postgres DataSource and would slow CI; runs manually when migrations are authored or refactored.

- [ ] **Step 1: Write the failing test**

```ts
import 'reflect-metadata';
import { DataSource } from 'typeorm';

// Sentinel: replace `<TS_NUMERIC>` with the actual digits from Task 1.
import { AddCriticalChatIndexesP0<TS_NUMERIC> } from
  '@data/db/migrations/<ts>-AddCriticalChatIndexesP0';

// Skipped by default: requires a real Postgres test DB. Enable manually with
// `pnpm test -- --testPathPattern=AddCriticalChatIndexesP0 --testEnvironment=node`
// after exporting TEST_DATABASE_URL for an isolated database.
describe.skip('AddCriticalChatIndexesP0 migration', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: process.env.TEST_DATABASE_URL,
      entities: [],
      migrations: [AddCriticalChatIndexesP0<TS_NUMERIC>],
      migrationsRun: false,
      synchronize: false,
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('declares transaction = false (CONCURRENTLY requirement)', () => {
    const m = new AddCriticalChatIndexesP0<TS_NUMERIC>();
    expect(m.transaction).toBe(false);
  });

  it('up runs cleanly twice (idempotent)', async () => {
    const m = new AddCriticalChatIndexesP0<TS_NUMERIC>();
    const qr = dataSource.createQueryRunner();
    try {
      await m.up(qr);
      await m.up(qr); // second run — IF NOT EXISTS must protect
    } finally {
      await qr.release();
    }
  });

  it('down runs cleanly twice (idempotent)', async () => {
    const m = new AddCriticalChatIndexesP0<TS_NUMERIC>();
    const qr = dataSource.createQueryRunner();
    try {
      await m.down(qr);
      await m.down(qr);
    } finally {
      await qr.release();
    }
  });

  it('up after down restores the indexes', async () => {
    const m = new AddCriticalChatIndexesP0<TS_NUMERIC>();
    const qr = dataSource.createQueryRunner();
    try {
      await m.down(qr);
      await m.up(qr);
      const rows = await qr.query(
        `SELECT indexname FROM pg_indexes ` +
        `WHERE indexname IN ($1, $2, $3)`,
        [
          'IDX_chat_messages_sessionId',
          'IDX_chat_sessions_userId',
          'IDX_artwork_matches_messageId',
        ],
      );
      expect(rows.length).toBe(3);
    } finally {
      await qr.release();
    }
  });
});
```

- [ ] **Step 2: Verify it compiles and is correctly skipped**

```bash
cd museum-backend && npx tsc --noEmit && \
  pnpm test -- --testPathPattern=AddCriticalChatIndexesP0 --coverage=false 2>&1 | tail -10
```

Expected: typecheck clean; test run reports the spec found and `0 passed, 4 skipped` (because `describe.skip`).

- [ ] **Step 3: Commit**

```bash
git add museum-backend/tests/unit/data/db/migrations/AddCriticalChatIndexesP0.spec.ts
git commit -m "test(db): A1 migration idempotence spec (skipped, manual)"
```

---

## Task 4: Write the perf-load seed script

**Files:**
- Create: `museum-backend/scripts/seed-perf-load.ts`
- Modify: `museum-backend/package.json` (add `seed:perf` script)

This script seeds 500 000 users / 1 000 000 chat_sessions / 10 000 000 chat_messages / 2 000 000 artwork_matches into the docker-compose dev DB. Idempotent via a checkpoint file (`.perf-seed-checkpoint.json`) so it can resume after interruption.

- [ ] **Step 1: Add the script entry to package.json**

In `museum-backend/package.json`, under `"scripts"`, add:

```json
"seed:perf": "ts-node -r tsconfig-paths/register scripts/seed-perf-load.ts"
```

Place it next to the other `seed:*` entries.

- [ ] **Step 2: Write the seed script**

```ts
// museum-backend/scripts/seed-perf-load.ts
import 'dotenv/config';
import 'reflect-metadata';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppDataSource } from '@data/db/data-source';

interface Checkpoint {
  users: number;
  sessions: number;
  messages: number;
  artworkMatches: number;
}

const CHECKPOINT_PATH = resolve(__dirname, '../.perf-seed-checkpoint.json');
const TARGET = {
  users: 500_000,
  sessions: 1_000_000,
  messages: 10_000_000,
  artworkMatches: 2_000_000,
} as const;
const BATCH = 10_000;

const loadCheckpoint = (): Checkpoint =>
  existsSync(CHECKPOINT_PATH)
    ? (JSON.parse(readFileSync(CHECKPOINT_PATH, 'utf8')) as Checkpoint)
    : { users: 0, sessions: 0, messages: 0, artworkMatches: 0 };

const saveCheckpoint = (cp: Checkpoint): void => {
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp), 'utf8');
};

const guardEnv = (): void => {
  const url = process.env.DATABASE_URL ?? '';
  if (url.includes('rds.amazonaws') || url.includes('staging') || url.includes('prod')) {
    throw new Error('seed-perf-load refuses to run against staging/prod URLs');
  }
};

const seedUsers = async (cp: Checkpoint): Promise<void> => {
  const ds = AppDataSource;
  while (cp.users < TARGET.users) {
    const start = cp.users + 1;
    const end = Math.min(start + BATCH - 1, TARGET.users);
    const values: string[] = [];
    for (let i = start; i <= end; i += 1) {
      values.push(`('perf-${i}@test.local','x','U','${i}','perf')`);
    }
    await ds.query(
      `INSERT INTO "users" ("email","password","firstname","lastname","provider") ` +
      `VALUES ${values.join(',')} ON CONFLICT (email) DO NOTHING`,
    );
    cp.users = end;
    saveCheckpoint(cp);
    if (cp.users % 100_000 === 0) console.log(`users: ${cp.users}/${TARGET.users}`);
  }
};

// Sessions: 90% attached to a user, 10% anonymous. Mean 2 sessions per attached user.
const seedSessions = async (cp: Checkpoint): Promise<void> => {
  const ds = AppDataSource;
  while (cp.sessions < TARGET.sessions) {
    const start = cp.sessions + 1;
    const end = Math.min(start + BATCH - 1, TARGET.sessions);
    const values: string[] = [];
    for (let i = start; i <= end; i += 1) {
      const userId = i % 10 === 0 ? 'NULL' : `${(i % TARGET.users) + 1}`;
      values.push(`(uuid_generate_v4(),'fr',false,${userId},NOW(),NOW())`);
    }
    await ds.query(
      `INSERT INTO "chat_sessions" ` +
      `("id","locale","museumMode","userId","createdAt","updatedAt") ` +
      `VALUES ${values.join(',')}`,
    );
    cp.sessions = end;
    saveCheckpoint(cp);
    if (cp.sessions % 100_000 === 0) console.log(`sessions: ${cp.sessions}/${TARGET.sessions}`);
  }
};

const seedMessages = async (cp: Checkpoint): Promise<void> => {
  const ds = AppDataSource;
  // Get session id range — fetched once.
  const sessionIds = (await ds.query(
    `SELECT id FROM chat_sessions ORDER BY "createdAt" LIMIT $1`,
    [TARGET.sessions],
  )) as { id: string }[];
  while (cp.messages < TARGET.messages) {
    const start = cp.messages + 1;
    const end = Math.min(start + BATCH - 1, TARGET.messages);
    const values: string[] = [];
    for (let i = start; i <= end; i += 1) {
      const sessionId = sessionIds[i % sessionIds.length].id;
      const role = i % 2 === 0 ? 'user' : 'assistant';
      values.push(
        `(uuid_generate_v4(),'${sessionId}','${role}','perf message body ${i}',NOW())`,
      );
    }
    await ds.query(
      `INSERT INTO "chat_messages" ("id","sessionId","role","text","createdAt") ` +
      `VALUES ${values.join(',')}`,
    );
    cp.messages = end;
    saveCheckpoint(cp);
    if (cp.messages % 1_000_000 === 0) console.log(`messages: ${cp.messages}/${TARGET.messages}`);
  }
};

const seedArtworkMatches = async (cp: Checkpoint): Promise<void> => {
  const ds = AppDataSource;
  // Source from assistant messages only, sample as we go.
  while (cp.artworkMatches < TARGET.artworkMatches) {
    const start = cp.artworkMatches + 1;
    const end = Math.min(start + BATCH - 1, TARGET.artworkMatches);
    const messageIds = (await ds.query(
      `SELECT id FROM chat_messages WHERE role = 'assistant' OFFSET $1 LIMIT $2`,
      [start, BATCH],
    )) as { id: string }[];
    if (messageIds.length === 0) break;
    const values: string[] = messageIds.map(
      (m) => `(uuid_generate_v4(),'${m.id}','LV-001','Test artwork','Anon',0.9,NOW())`,
    );
    await ds.query(
      `INSERT INTO "artwork_matches" ` +
      `("id","messageId","artworkId","title","artist","confidence","createdAt") ` +
      `VALUES ${values.join(',')}`,
    );
    cp.artworkMatches = Math.min(end, cp.artworkMatches + messageIds.length);
    saveCheckpoint(cp);
    if (cp.artworkMatches % 200_000 === 0) {
      console.log(`artwork_matches: ${cp.artworkMatches}/${TARGET.artworkMatches}`);
    }
  }
};

async function main(): Promise<void> {
  guardEnv();
  await AppDataSource.initialize();
  const cp = loadCheckpoint();
  await seedUsers(cp);
  await seedSessions(cp);
  await seedMessages(cp);
  await seedArtworkMatches(cp);
  await AppDataSource.destroy();
  console.log('seed:perf complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

This script intentionally uses raw SQL `INSERT VALUES (...)` batches — TypeORM's `Repository.save()` is far too slow for 10M rows.

- [ ] **Step 3: Add the checkpoint file to .gitignore**

Open `.gitignore` (project root). Add at the end:

```
museum-backend/.perf-seed-checkpoint.json
```

- [ ] **Step 4: Run the seed**

```bash
cd museum-backend && pnpm seed:perf
```

Expected: progress logs printed, takes 15–30 minutes on a laptop docker-compose Postgres. Final line: `seed:perf complete`. If interrupted, re-run — the checkpoint resumes from where it stopped.

- [ ] **Step 5: Verify row counts**

```bash
psql "$DATABASE_URL" -c \
  "SELECT 'users' n, COUNT(*) FROM users WHERE email LIKE 'perf-%' \
   UNION ALL SELECT 'sessions', COUNT(*) FROM chat_sessions \
   UNION ALL SELECT 'messages', COUNT(*) FROM chat_messages \
   UNION ALL SELECT 'matches', COUNT(*) FROM artwork_matches"
```

Expected (approx):
- `users`: 500 000
- `sessions`: 1 000 000
- `messages`: 10 000 000
- `matches`: 2 000 000

- [ ] **Step 6: Commit the script (not the checkpoint, not the .perf-seed-checkpoint.json)**

```bash
git add museum-backend/scripts/seed-perf-load.ts museum-backend/package.json .gitignore
git commit -m "chore(scripts): seed-perf-load — 10M/1M/500K perf-bench dataset"
```

---

## Task 5: Capture the BEFORE EXPLAIN ANALYZE baseline

We need the "no index" baseline before A1 indexes were added, but the indexes already exist on this DB after Task 2. To get the baseline: drop the three indexes, run the queries, capture output, then re-add them.

- [ ] **Step 1: Drop the three A1 indexes (BEFORE measurement)**

```bash
psql "$DATABASE_URL" <<'SQL'
DROP INDEX CONCURRENTLY IF EXISTS "IDX_chat_messages_sessionId";
DROP INDEX CONCURRENTLY IF EXISTS "IDX_chat_sessions_userId";
DROP INDEX CONCURRENTLY IF EXISTS "IDX_artwork_matches_messageId";
SQL
```

- [ ] **Step 2: Run the four hot queries with EXPLAIN ANALYZE, save output**

```bash
mkdir -p museum-backend/docs/perf
cat > /tmp/explain-a1.sql <<'SQL'
-- Pick one real id from the seeded data for each parameter.
\set sid '(SELECT id FROM chat_sessions LIMIT 1)'
\set uid '(SELECT "userId" FROM chat_sessions WHERE "userId" IS NOT NULL LIMIT 1)'
\set mid '(SELECT id FROM chat_messages WHERE role = ''assistant'' LIMIT 1)'

\echo '## Hot 1 — list session messages (BEFORE A1 indexes)'
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM "chat_messages"
  WHERE "sessionId" = :sid ORDER BY "createdAt" ASC LIMIT 200;

\echo '## Hot 2 — list user sessions (BEFORE A1 indexes)'
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM "chat_sessions"
  WHERE "userId" = :uid ORDER BY "updatedAt" DESC LIMIT 50;

\echo '## Hot 3 — artwork matches per message (BEFORE A1 indexes)'
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM "artwork_matches"
  WHERE "messageId" = :mid;

\echo '## Hot 4 — cascade delete one user (BEFORE A1 indexes)'
BEGIN; EXPLAIN (ANALYZE, BUFFERS) DELETE FROM "chat_sessions" WHERE "userId" = :uid; ROLLBACK;
SQL

psql "$DATABASE_URL" -f /tmp/explain-a1.sql > museum-backend/docs/perf/2026-04-30-A1-A2-explain-analyze.before.txt 2>&1
```

Expected: file contains four `EXPLAIN ANALYZE` blocks, each showing `Seq Scan` on the target table with `Execution Time` in the hundreds-of-ms to seconds range. Hot 1 should show `Execution Time:` over 1000 ms.

- [ ] **Step 3: Re-add the indexes**

```bash
cd museum-backend && pnpm migration:revert
cd museum-backend && pnpm migration:run
```

Or, if `pnpm migration:revert` does not work cleanly because the dropped indexes were already removed by Step 1:

```bash
psql "$DATABASE_URL" <<'SQL'
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_chat_messages_sessionId" ON "chat_messages" ("sessionId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_chat_sessions_userId" ON "chat_sessions" ("userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_artwork_matches_messageId" ON "artwork_matches" ("messageId");
SQL
```

Wait for index builds to complete (each can take 1–5 minutes on the seeded dataset).

- [ ] **Step 4: Verify indexes are valid**

```bash
psql "$DATABASE_URL" -c \
  "SELECT relname, indisvalid FROM pg_class JOIN pg_index ON pg_class.oid = indexrelid
   WHERE relname IN (
     'IDX_chat_messages_sessionId',
     'IDX_chat_sessions_userId',
     'IDX_artwork_matches_messageId'
   );"
```

Expected: three rows, all `indisvalid = t`.

---

## Task 6: Capture the AFTER EXPLAIN ANALYZE and write the bench report

- [ ] **Step 1: Re-run the four hot queries on the same parameter ids**

```bash
psql "$DATABASE_URL" -f /tmp/explain-a1.sql \
  > museum-backend/docs/perf/2026-04-30-A1-A2-explain-analyze.after.txt 2>&1
```

Replace `BEFORE` headings inside the SQL file with `AFTER` for clarity (or pipe through `sed 's/BEFORE A1 indexes/AFTER A1 indexes/'` when capturing).

- [ ] **Step 2: Compose the bench report**

Create `museum-backend/docs/perf/2026-04-30-A1-A2-explain-analyze.md` with this exact structure:

```markdown
# A1 + A2 Index Performance — EXPLAIN ANALYZE

**Date:** 2026-04-30
**Postgres version:** <fill from `psql -c 'SELECT version()'`>
**Hardware:** <laptop model + cpu + ram>
**Dataset:** seed-perf-load (10M chat_messages / 1M chat_sessions / 500K users / 2M artwork_matches)
**Spec:** docs/superpowers/specs/2026-04-30-A1-A2-critical-fk-indexes-design.md

## Acceptance summary

| Query | Target p99 | Before | After | Pass? |
|---|---|---|---|---|
| Hot 1 — session messages | < 10 ms | <ms> | <ms> | <yes/no> |
| Hot 2 — user sessions | < 20 ms | <ms> | <ms> | <yes/no> |
| Hot 3 — artwork matches | < 5 ms | <ms> | <ms> | <yes/no> |
| Hot 4 — cascade delete | < 100 ms | <ms> | <ms> | <yes/no> |
| P1 — assigned tickets | < 5 ms | (filled in Task 10) |  |  |
| P1 — reset_token | < 2 ms | (filled in Task 10) |  |  |

## Before (no A1 indexes)

\`\`\`
<paste contents of 2026-04-30-A1-A2-explain-analyze.before.txt>
\`\`\`

## After (A1 indexes installed)

\`\`\`
<paste contents of 2026-04-30-A1-A2-explain-analyze.after.txt>
\`\`\`

## Acceptance verdict (A1)

<one paragraph: did each Hot query meet its target? If any failed by >2×, what
do we do — composite / covering / different shape? Defer follow-up to a
separate spec rather than expanding A1 scope.>
```

Fill the placeholders with concrete numbers from the `.txt` files.

- [ ] **Step 3: Commit the bench report and raw outputs**

```bash
git add museum-backend/docs/perf/2026-04-30-A1-A2-explain-analyze.md \
        museum-backend/docs/perf/2026-04-30-A1-A2-explain-analyze.before.txt \
        museum-backend/docs/perf/2026-04-30-A1-A2-explain-analyze.after.txt
git commit -m "perf(db): A1 EXPLAIN ANALYZE — Hot 1 < 10ms p99 acceptance"
```

If any Hot query fails its target by more than 2×, **do not fudge the verdict**: write the failure in the report and STOP. Open a follow-up note in the report describing what composite or covering index is needed. Do not modify the A1 migration to add more indexes — that belongs in a separate spec.

---

## Task 7: Generate the A2 blank migration

**Files:**
- Create: `museum-backend/src/data/db/migrations/<ts2>-AddP1FKAndTokenIndexes.ts`

- [ ] **Step 1: Generate the blank migration**

```bash
cd museum-backend
node scripts/migration-cli.cjs create --name=AddP1FKAndTokenIndexes
```

Capture the new timestamp prefix as `<ts2>`.

- [ ] **Step 2: Commit the empty shell**

```bash
git add museum-backend/src/data/db/migrations/<ts2>-AddP1FKAndTokenIndexes.ts
git commit -m "chore(db): scaffold A2 migration shell (P1 simple FK + token indexes)"
```

---

## Task 8: Author the A2 migration body

**Files:**
- Modify: `museum-backend/src/data/db/migrations/<ts2>-AddP1FKAndTokenIndexes.ts`

- [ ] **Step 1: Replace the body**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A2 — P1 simple foreign-key and partial token indexes.
 *
 *   - museum_enrichment."museumId"  (FK)
 *   - support_tickets.assigned_to   (FK, partial WHERE assigned_to IS NOT NULL)
 *   - ticket_messages.sender_id     (FK)
 *   - users.reset_token             (partial WHERE reset_token IS NOT NULL)
 *   - users.email_change_token      (partial WHERE email_change_token IS NOT NULL)
 *
 * Out of scope (verified YAGNI in spec):
 *   - message_reports."userId"      — composite (messageId, userId) covers callers
 *   - message_feedback."userId"     — same
 *   - museums (lat, lng) GiST       — A3 deferred sub-spec (PostGIS)
 *
 * Same CONCURRENTLY / transaction = false discipline as A1.
 */
export class AddP1FKAndTokenIndexes<TS_NUMERIC> implements MigrationInterface {
  name = 'AddP1FKAndTokenIndexes<TS_NUMERIC>';
  public readonly transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_museum_enrichment_museumId" ` +
      `ON "museum_enrichment" ("museumId")`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_support_tickets_assigned_to" ` +
      `ON "support_tickets" ("assigned_to") WHERE "assigned_to" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_ticket_messages_sender_id" ` +
      `ON "ticket_messages" ("sender_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_users_reset_token" ` +
      `ON "users" ("reset_token") WHERE "reset_token" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_users_email_change_token" ` +
      `ON "users" ("email_change_token") WHERE "email_change_token" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_users_email_change_token"`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_users_reset_token"`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_ticket_messages_sender_id"`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_support_tickets_assigned_to"`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_museum_enrichment_museumId"`);
  }
}
```

Substitute the real `<TS_NUMERIC>` digits the same way as Task 2.

- [ ] **Step 2: Typecheck**

```bash
cd museum-backend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Apply locally**

```bash
cd museum-backend && pnpm migration:run
```

Expected: `Migration AddP1FKAndTokenIndexes<digits> has been executed successfully.`

- [ ] **Step 4: Verify**

```bash
psql "$DATABASE_URL" <<'SQL'
\d+ museum_enrichment
\d+ support_tickets
\d+ ticket_messages
\d+ users
SQL
```

Expected: each `\d+` output includes the new partial / FK index lines.

- [ ] **Step 5: Drift-free generate**

```bash
cd museum-backend && node scripts/migration-cli.cjs generate --name=DriftCheck2
```

Expected: `No changes in database schema were found - cannot generate a migration.`

- [ ] **Step 6: Run the full test suite**

```bash
cd museum-backend && pnpm test
```

Expected: green, no regressions.

- [ ] **Step 7: Commit**

```bash
git add museum-backend/src/data/db/migrations/<ts2>-AddP1FKAndTokenIndexes.ts
git commit -m "feat(db): A2 — P1 simple FK + token partial indexes (CONCURRENTLY)"
```

---

## Task 9: A2 idempotence test

**Files:**
- Create: `museum-backend/tests/unit/data/db/migrations/AddP1FKAndTokenIndexes.spec.ts`

- [ ] **Step 1: Write the skipped idempotence test**

Same shape as Task 3, replacing class name and the verified index list. The verification query lists all five indexes.

```ts
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { AddP1FKAndTokenIndexes<TS_NUMERIC> } from
  '@data/db/migrations/<ts2>-AddP1FKAndTokenIndexes';

describe.skip('AddP1FKAndTokenIndexes migration', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: process.env.TEST_DATABASE_URL,
      entities: [],
      migrations: [AddP1FKAndTokenIndexes<TS_NUMERIC>],
      migrationsRun: false,
      synchronize: false,
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('declares transaction = false', () => {
    const m = new AddP1FKAndTokenIndexes<TS_NUMERIC>();
    expect(m.transaction).toBe(false);
  });

  it('up runs cleanly twice', async () => {
    const m = new AddP1FKAndTokenIndexes<TS_NUMERIC>();
    const qr = dataSource.createQueryRunner();
    try {
      await m.up(qr);
      await m.up(qr);
    } finally {
      await qr.release();
    }
  });

  it('down runs cleanly twice', async () => {
    const m = new AddP1FKAndTokenIndexes<TS_NUMERIC>();
    const qr = dataSource.createQueryRunner();
    try {
      await m.down(qr);
      await m.down(qr);
    } finally {
      await qr.release();
    }
  });

  it('up after down restores all five indexes', async () => {
    const m = new AddP1FKAndTokenIndexes<TS_NUMERIC>();
    const qr = dataSource.createQueryRunner();
    try {
      await m.down(qr);
      await m.up(qr);
      const rows = await qr.query(
        `SELECT indexname FROM pg_indexes WHERE indexname = ANY($1)`,
        [[
          'IDX_museum_enrichment_museumId',
          'IDX_support_tickets_assigned_to',
          'IDX_ticket_messages_sender_id',
          'IDX_users_reset_token',
          'IDX_users_email_change_token',
        ]],
      );
      expect(rows.length).toBe(5);
    } finally {
      await qr.release();
    }
  });
});
```

- [ ] **Step 2: Verify it compiles + skips**

```bash
cd museum-backend && npx tsc --noEmit && \
  pnpm test -- --testPathPattern=AddP1FKAndTokenIndexes --coverage=false 2>&1 | tail -10
```

Expected: typecheck clean; `0 passed, 4 skipped`.

- [ ] **Step 3: Commit**

```bash
git add museum-backend/tests/unit/data/db/migrations/AddP1FKAndTokenIndexes.spec.ts
git commit -m "test(db): A2 migration idempotence spec (skipped, manual)"
```

---

## Task 10: P1 EXPLAIN ANALYZE pass and update the bench report

This task only needs supplementary data on `support_tickets` and `users` lookups. We do not need a full re-seed for these — Task 4's seed only populated chat tables. Seed a small slice now.

- [ ] **Step 1: Seed P1 helper data**

```bash
psql "$DATABASE_URL" <<'SQL'
INSERT INTO "support_tickets" ("subject","body","status","userId","assigned_to")
SELECT 'perf-' || gs, 'body', 'open', (gs % 500000) + 1,
       CASE WHEN gs % 10 = 0 THEN ((gs / 10) % 100) + 1 ELSE NULL END
FROM generate_series(1, 50000) gs;

UPDATE "users" SET reset_token = 'token-' || id WHERE id <= 100 AND id > 0;
UPDATE "users" SET email_change_token = 'echg-' || id WHERE id BETWEEN 200 AND 300;
SQL
```

If `support_tickets` schema or columns differ from the assumption above, adapt by reading the actual `\d+ support_tickets` first.

- [ ] **Step 2: Run BEFORE measurement (drop A2 indexes)**

```bash
psql "$DATABASE_URL" <<'SQL'
DROP INDEX CONCURRENTLY IF EXISTS "IDX_support_tickets_assigned_to";
DROP INDEX CONCURRENTLY IF EXISTS "IDX_users_reset_token";
DROP INDEX CONCURRENTLY IF EXISTS "IDX_users_email_change_token";

\echo '## P1 — assigned tickets (BEFORE A2)'
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM "support_tickets"
  WHERE "assigned_to" = 1 ORDER BY "createdAt" DESC LIMIT 50;
\echo '## P1 — reset_token (BEFORE A2)'
EXPLAIN (ANALYZE, BUFFERS) SELECT id, email FROM "users" WHERE "reset_token" = 'token-50';
SQL
```

Pipe to `museum-backend/docs/perf/2026-04-30-P1-explain-analyze.before.txt`.

- [ ] **Step 3: Re-add A2 indexes**

```bash
psql "$DATABASE_URL" <<'SQL'
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_support_tickets_assigned_to"
  ON "support_tickets" ("assigned_to") WHERE "assigned_to" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_users_reset_token"
  ON "users" ("reset_token") WHERE "reset_token" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_users_email_change_token"
  ON "users" ("email_change_token") WHERE "email_change_token" IS NOT NULL;
SQL
```

- [ ] **Step 4: Run AFTER measurement**

Same SQL block, pipe to `…P1-explain-analyze.after.txt`.

- [ ] **Step 5: Update the bench report**

Open `museum-backend/docs/perf/2026-04-30-A1-A2-explain-analyze.md`, fill the P1 rows in the acceptance summary table, append a "P1 before/after" section with the two new files' contents, and update the verdict paragraph.

- [ ] **Step 6: Commit**

```bash
git add museum-backend/docs/perf/2026-04-30-A1-A2-explain-analyze.md \
        museum-backend/docs/perf/2026-04-30-P1-explain-analyze.before.txt \
        museum-backend/docs/perf/2026-04-30-P1-explain-analyze.after.txt
git commit -m "perf(db): A2 EXPLAIN ANALYZE — P1 indexes pass acceptance"
```

---

## Task 11: Document the invalid-index recovery runbook

**Files:**
- Modify: `docs/DB_BACKUP_RESTORE.md`

- [ ] **Step 1: Read the current file structure**

```bash
head -50 docs/DB_BACKUP_RESTORE.md
```

Find an appropriate insertion point — usually a top-level `## Recovery procedures` section, or append at the end.

- [ ] **Step 2: Append the runbook**

Add this section verbatim at the end of the file (or in the recovery section):

```markdown
## Index migration recovery — INVALID after a CONCURRENTLY interrupt

`CREATE INDEX CONCURRENTLY` runs without taking an `ACCESS EXCLUSIVE` lock,
so a SIGKILL or connection drop during the build leaves the index in
`pg_index` with `indisvalid = false`. Postgres ignores invalid indexes when
planning queries but will refuse to create a new index with the same name
unless the broken one is dropped first.

### Diagnose

```sql
SELECT i.relname AS index_name, c.relname AS table_name, x.indisvalid
FROM pg_index x
JOIN pg_class i ON i.oid = x.indexrelid
JOIN pg_class c ON c.oid = x.indrelid
WHERE x.indisvalid = false;
```

Any row returned is a stale invalid index from an interrupted build.

### Recover

1. Drop the invalid index (CONCURRENTLY so reads keep flowing):

   ```sql
   DROP INDEX CONCURRENTLY IF EXISTS "<index-name>";
   ```

2. Re-run the migration. The migration's `IF NOT EXISTS` clause is safe — it
   simply rebuilds the missing index.

   ```bash
   pnpm migration:run
   ```

3. Verify validity:

   ```sql
   SELECT relname, indisvalid FROM pg_class
   JOIN pg_index ON pg_class.oid = indexrelid
   WHERE relname = '<index-name>';
   ```

   `indisvalid = t` confirms recovery.

### When to use this

Triggered automatically if a CI deploy step is killed mid-`migration:run` for
an index migration (A1 / A2 / future). For non-index migrations, the
TypeORM migration table tracks completion atomically — they either run
fully or roll back.
```

- [ ] **Step 3: Commit**

```bash
git add docs/DB_BACKUP_RESTORE.md
git commit -m "docs(ops): runbook for INVALID index after CONCURRENTLY interrupt"
```

---

## Task 12: Final verification + PR opening

- [ ] **Step 1: Re-run the full backend test suite**

```bash
cd museum-backend && pnpm test
```

Expected: green. Same baseline +/- as before. The new idempotence specs add 8 skipped tests but no failing ones.

- [ ] **Step 2: Lint**

```bash
cd museum-backend && pnpm lint
```

Expected: clean exit.

- [ ] **Step 3: Confirm no schema drift**

```bash
cd museum-backend && node scripts/migration-cli.cjs generate --name=FinalDriftCheck
```

Expected: `No changes in database schema were found - cannot generate a migration.` If a file was generated, delete it and investigate.

- [ ] **Step 4: Push the branch and open the PR**

```bash
git push -u origin <branch>
```

Use `gh pr create` with this body skeleton:

```markdown
## Summary
- A1: P0 chat hot-path FK indexes (3) — `chat_messages."sessionId"`, `chat_sessions."userId"`, `artwork_matches."messageId"`. CONCURRENTLY, zero downtime.
- A2: P1 simple FK + token partial indexes (5) — museum_enrichment, support_tickets, ticket_messages, users.reset_token, users.email_change_token.
- Bench report committed: Hot 1 < 10ms p99 ✅ (10M-row seeded dataset).
- Runbook: invalid-index recovery added to DB_BACKUP_RESTORE.md.
- Spec: docs/superpowers/specs/2026-04-30-A1-A2-critical-fk-indexes-design.md (committed earlier in 27e9680e).

## Test plan
- [ ] Apply migrations on staging via existing `_deploy-backend.yml` flow.
- [ ] Verify staging plan shape matches dev pattern (Index Scan, not Seq Scan) on Hot 1 sample query.
- [ ] Production deploy: confirm migration phase has no timeout; expect 5–15 min per index on 10M-row tables.
- [ ] Post-deploy: run `EXPLAIN ANALYZE` on prod for Hot 1 sample, attach output to PR.
```

- [ ] **Step 5: Hand off to user for staging deploy**

The plan ends here. Staging + prod deploy are user-driven steps controlled by the existing CI/CD pipeline.

---

## Out of scope (deferred to follow-up specs)

- A3 — PostGIS migration for `museums` geo queries.
- C — Data debt (Check1776 rewrite, museum_qa FK, @VersionColumn Museum, atomic hitCount, optimistic-lock retry callers, BullMQ DLQ, seed-museums idempotency).
- D — JSONB Zod runtime validation (10 fields).
- E — Retention policies + scheduled prune.
- F — Scale infra (pgbouncer, read replicas, Redis cluster, CDN).
- G — AI semantic + per-user cache.
- H — Observability (Grafana SLO), k6 load test, chaos engineering.
