/**
 * RED — T1.7 — R6 — Migration `AddTotpLastUsedStep` MUST be zero-downtime :
 *   - new column `last_used_step bigint NULL` (nullable, no default).
 *   - all pre-existing rows preserved with `last_used_step IS NULL`.
 *   - first post-deploy code submission for one such user advances the column.
 *
 * Spec : team-state/2026-05-21-p0-c3-auth-crypto/spec.md §R6.
 * Design : team-state/2026-05-21-p0-c3-auth-crypto/design.md §3.2 + §4 — only
 *   `ALTER TABLE totp_secrets ADD last_used_step bigint;` (no index, no constraint).
 *
 * Anchored to PATTERNS / LESSONS :
 *  - `lib-docs/typeorm/PATTERNS.md` §7.1 idempotent up() + §3.8 migrations as
 *    source of truth (generated via `migration-cli.cjs`, never hand-written SQL).
 *  - `docs/MIGRATION_GOVERNANCE.md` — zero-drift gate (regenerate after run →
 *    output empty).
 *  - CLAUDE.md "Pièges connus" SAVEPOINT in migration — guard if `up()` ever
 *    backfills (currently NOT — pure ADD COLUMN nullable).
 *  - `lib-docs/typeorm/LESSONS.md` 2026-05 (verifyEmail) — silent-skip of
 *    `field: undefined` ; the entity's `lastUsedStep` is typed `string | null`,
 *    `markUsed` uses `String(step)` not `undefined`.
 *
 * Failure mode at HEAD `00325d81` :
 *  - The migration file `<unix-ms>-AddTotpLastUsedStep.ts` does NOT exist in
 *    `src/data/db/migrations/`. The harness applies every migration listed in
 *    `data-source.ts` ; `totp_secrets.last_used_step` column is therefore
 *    absent → the `information_schema.columns` query returns 0 rows.
 *
 * Run scope :
 *   pnpm jest tests/integration/db/migrations/AddTotpLastUsedStep.spec.ts --runInBand
 */

import bcrypt from 'bcrypt';

import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

// `@modules/auth/useCase/totp/totpEncryption` transitively imports
// `@src/config/env`, which reads PGDATABASE eagerly at module load. If we
// import it at the top of this file (before the harness runs and pins
// PGDATABASE to the testcontainer DB name), the env module caches the
// default 'museum_test' value and every subsequent `await import('@src/
// data/db/data-source')` inside `createIntegrationHarness` returns a
// DataSource bound to 'museum_test' → "database museum_test does not
// exist" on the very first query. The other integration tests don't
// reproduce this because their top-level imports stay clear of any
// `@src/config/env` transitive path. Lazy-require inside the tests
// is the smallest possible fix.
type EncryptTotp = (secret: string) => string;
let encryptTotpSecret: EncryptTotp;

interface ColumnRow {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
}

// Post C3 follow-up: RUN_INTEGRATION guard per project pattern
// (cf. tests/integration/chat/chat-repository-typeorm.integration.test.ts).
// Skips in `pnpm test` ; runs only in `pnpm test:integration` CI job.
const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration('AddTotpLastUsedStep migration — zero-downtime (R6)', () => {
  jest.setTimeout(300_000);

  let harness: IntegrationHarness;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
    // Lazy-require AFTER harness has pinned PGDATABASE to the testcontainer
    // DB name — see file-top docblock for the env-cache bug this dodges.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- intentional lazy require, justified above
    encryptTotpSecret = (
      require('@modules/auth/useCase/totp/totpEncryption') as {
        encryptTotpSecret: EncryptTotp;
      }
    ).encryptTotpSecret;
  });

  describe('schema shape', () => {
    let columns: ColumnRow[];

    beforeAll(async () => {
      columns = await harness.dataSource.query<ColumnRow[]>(
        `SELECT column_name, data_type, udt_name, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'totp_secrets'
          ORDER BY ordinal_position`,
      );
    });

    it('adds a `last_used_step` column of type bigint NULLABLE (R6 nullable-then-stamp)', () => {
      const col = columns.find((c) => c.column_name === 'last_used_step');
      expect(col).toBeDefined();
      expect(col?.data_type).toBe('bigint');
      expect(col?.is_nullable).toBe('YES');
    });

    it('does NOT set a column default (nullable-then-stamp, design §3.2)', () => {
      const col = columns.find((c) => c.column_name === 'last_used_step');
      expect(col).toBeDefined();
      // Either NULL default explicit OR no default at all — both acceptable.
      expect(col?.column_default ?? '').not.toMatch(/^\d/);
    });

    it('does NOT add an index on `last_used_step` (design §4 — no index, table 1:1 user)', async () => {
      const indexes = await harness.dataSource.query<{ indexname: string; indexdef: string }[]>(
        `SELECT indexname, indexdef FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'totp_secrets'`,
      );
      const stepIndex = indexes.find((i) => i.indexdef.includes('last_used_step'));
      expect(stepIndex).toBeUndefined();
    });
  });

  describe('backfill behaviour — pre-existing rows', () => {
    beforeEach(async () => {
      await harness.reset();
    });

    it('pre-existing totp rows retain last_used_step IS NULL post-migration (R6 backfill = none)', async () => {
      // Simulate "rows that existed BEFORE the migration ran" by inserting
      // them now — the column default is NULL → reads back NULL.
      const passwordHash = await bcrypt.hash('Test1234!', 4);
      for (const userId of [20001, 20002, 20003]) {
        // `users` timestamps are camelCase-quoted (`"createdAt"`/`"updatedAt"`)
        // per the initial migration; omitting them lets the column DEFAULT now()
        // fire and avoids the schema-drift trap.
        await harness.dataSource.query(
          `INSERT INTO users (id, email, password, email_verified, role)
           VALUES ($1, $2, $3, true, 'visitor')
           ON CONFLICT DO NOTHING`,
          [userId, `r6-${String(userId)}@test.musaium`, passwordHash],
        );
        await harness.dataSource.query(
          `INSERT INTO totp_secrets (user_id, secret_encrypted, recovery_codes)
           VALUES ($1, $2, '[]'::jsonb)`,
          [userId, encryptTotpSecret('JBSWY3DPEHPK3PXP')],
        );
      }

      const rows = await harness.dataSource.query<
        { user_id: number; last_used_step: string | null }[]
      >(`SELECT user_id, last_used_step FROM totp_secrets WHERE user_id IN (20001, 20002, 20003)`);

      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(row.last_used_step).toBeNull();
      }
    });

    it('a row with last_used_step IS NULL accepts a fresh UPDATE that stamps the step (R6 stamp on first use)', async () => {
      const passwordHash = await bcrypt.hash('Test1234!', 4);
      await harness.dataSource.query(
        `INSERT INTO users (id, email, password, email_verified, role)
         VALUES (20100, 'r6-first-use@test.musaium', $1, true, 'visitor')
         ON CONFLICT DO NOTHING`,
        [passwordHash],
      );
      await harness.dataSource.query(
        `INSERT INTO totp_secrets (user_id, secret_encrypted, recovery_codes)
         VALUES (20100, $1, '[]'::jsonb)`,
        [encryptTotpSecret('JBSWY3DPEHPK3PXP')],
      );

      // Raw SQL stamp — proves the column accepts a value cleanly, no constraint blocks it.
      await harness.dataSource.query(
        `UPDATE totp_secrets SET last_used_step = $1, last_used_at = NOW() WHERE user_id = 20100`,
        ['58259640'],
      );

      const row = await harness.dataSource.query<{ last_used_step: string | null }[]>(
        `SELECT last_used_step FROM totp_secrets WHERE user_id = 20100`,
      );
      expect(row[0].last_used_step).toBe('58259640');
    });
  });
});
