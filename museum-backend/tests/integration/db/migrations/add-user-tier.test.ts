/**
 * R1 RED — schema assertion for the future `AddUserTier` migration (T1.1).
 *
 * Pins R1 §1 R1 / R2 / R3 / R4 down BEFORE implementation by asserting, on a
 * real Postgres testcontainer with all migrations applied, the *desired* shape
 * of the `users` table after `AddUserTier` runs :
 *
 *  - new column `tier` (text / varchar) NOT NULL DEFAULT 'free' + CHECK
 *    constraint restricted to {'free','premium'} (R1 §0.3 + R1 §1 R1).
 *  - new column `sessions_month_count` INT NOT NULL DEFAULT 0 (R1 §1 R1).
 *  - new column `sessions_month_start` DATE NULL (R1 §1 R1 + N5).
 *  - backfill : every pre-existing row gets `tier='free'`, count=0, start=NULL
 *    (R1 §1 R2).
 *
 * Reverse / round-trip is exercised by the existing
 * `tests/integration/db/migration-round-trip.test.ts` (auto-iterates every
 * migration in `data-source.ts`, fingerprint equality) — no separate file
 * needed once `AddUserTier` lands in the migration list (R1 §1 R3, N11, N12).
 *
 * MUST FAIL at baseline `cd7e22bc` — migration file does not exist; the
 * `tier` / `sessions_month_count` / `sessions_month_start` columns are absent
 * from the `users` table after running migrations.
 *
 * Source of truth for the schema :
 *   - R1.md §0.3 (column list + types + CHECK)
 *   - R1.md §3.1 D1 chosen option (three columns on `users`)
 *   - R1.md §3.2 D2 (atomic UPDATE pattern using `sessions_month_start`)
 */
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

interface ColumnRow {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
}

interface CheckRow {
  conname: string;
  consrc: string;
}

describe('AddUserTier migration — schema shape [integration, real PG]', () => {
  jest.setTimeout(300_000);

  let harness: IntegrationHarness;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
  });

  describe('users table — new columns (R1 §1 R1)', () => {
    let columns: ColumnRow[];

    beforeAll(async () => {
      columns = await harness.dataSource.query<ColumnRow[]>(
        `SELECT column_name, data_type, udt_name, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'users'
          ORDER BY ordinal_position`,
      );
    });

    const findCol = (name: string): ColumnRow => {
      const col = columns.find((c) => c.column_name === name);
      if (!col) throw new Error(`Expected column "${name}" not found in users table`);
      return col;
    };

    it("adds a `tier` column NOT NULL DEFAULT 'free' (R1 §1 R1)", () => {
      const col = findCol('tier');
      // Either `text` or `character varying` is acceptable — R1 spec says
      // `varchar(16)` but the migration generator may emit `text` if the
      // entity type alias is `'free' | 'premium'`. Both keep the CHECK
      // constraint enforced.
      expect(['text', 'character varying']).toContain(col.data_type);
      expect(col.is_nullable).toBe('NO');
      expect(col.column_default ?? '').toMatch(/'free'/);
    });

    it('adds a `sessions_month_count` integer NOT NULL DEFAULT 0 (R1 §1 R1)', () => {
      const col = findCol('sessions_month_count');
      expect(col.data_type).toBe('integer');
      expect(col.is_nullable).toBe('NO');
      expect(col.column_default ?? '').toMatch(/^0$|::integer/);
    });

    it('adds a `sessions_month_start` date NULLABLE (R1 §1 R1 + N5)', () => {
      const col = findCol('sessions_month_start');
      expect(col.data_type).toBe('date');
      expect(col.is_nullable).toBe('YES');
    });
  });

  describe('users table — CHECK constraints (R1 §0.3)', () => {
    let checks: CheckRow[];

    beforeAll(async () => {
      checks = await harness.dataSource.query<CheckRow[]>(
        `SELECT con.conname,
                pg_get_constraintdef(con.oid) AS consrc
           FROM pg_constraint con
           JOIN pg_class c ON c.oid = con.conrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relname = 'users'
            AND con.contype = 'c'`,
      );
    });

    it('restricts `tier` to {free, premium} (R1 §0.3 CHECK constraint)', () => {
      const tierCheck = checks.find((c) => c.consrc.includes('tier'));
      expect(tierCheck).toBeDefined();
      const def = tierCheck?.consrc ?? '';
      expect(def).toMatch(/free/);
      expect(def).toMatch(/premium/);
    });
  });

  describe('backfill behavior (R1 §1 R2)', () => {
    it('every existing user row defaults to tier=free, count=0, start=NULL', async () => {
      // The harness applies every migration on a brand-new DB ; any seed row
      // inserted by a prior migration must satisfy R2's "backfill" invariant.
      // We assert the post-migration invariant rather than diffing against a
      // pre-migration snapshot (the round-trip test handles full reversibility).
      const rows = await harness.dataSource.query<
        { tier: string; sessions_month_count: number; sessions_month_start: string | null }[]
      >(
        `SELECT tier, sessions_month_count, sessions_month_start
           FROM users`,
      );
      for (const row of rows) {
        expect(row.tier).toBe('free');
        expect(row.sessions_month_count).toBe(0);
        expect(row.sessions_month_start).toBeNull();
      }
    });
  });
});
