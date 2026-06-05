/**
 * T-API-1 (RED — S-BE-API, UFR-022 fresh-context red phase 2026-05-26).
 *
 * Pins the schema shape produced by the future `AddSessionIdToReviews`
 * migration (design-c2.md §4 M1 / Q3). Asserts, on a real Postgres
 * testcontainer with every TypeORM migration applied :
 *
 *   - `reviews.session_id` exists, type `uuid`, NULLABLE (no backfill of
 *     existing reviews — they keep session_id NULL).
 *   - A FOREIGN KEY `reviews.session_id` → `chat_sessions(id)` (uuid PK,
 *     verified `chatSession.entity.ts:21`), with `ON DELETE SET NULL` so a
 *     purged session nulls the link without corrupting the already-attributed
 *     `museum_id` (GDPR retention coupling, spec NFR Privacy).
 *   - A partial index `IDX_reviews_session_id WHERE session_id IS NOT NULL`,
 *     mirroring `IDX_reviews_museum_id`.
 *
 * Baseline FAILS (success of the red phase per UFR-022) because :
 *   - `review.entity.ts` declares NO `sessionId` field.
 *   - No `*AddSessionIdToReviews*` migration exists.
 *   - `information_schema.columns` returns ZERO rows for `session_id`.
 *
 * Pattern cloned from `reviews-museum-id.migration.test.ts` (same harness
 * contract). Harness applies ALL migrations on boot + `scheduleStop()`.
 * lib-docs/typeorm/PATTERNS.md §3.7 (relations / FK options) + §7 (migrations).
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

interface IndexRow {
  indexname: string;
  indexdef: string;
}

interface FkRow {
  constraint_name: string;
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
  delete_rule: string;
}

describe('AddSessionIdToReviews migration — schema shape [integration, real PG]', () => {
  jest.setTimeout(300_000);

  let harness: IntegrationHarness;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
  });

  describe('reviews table — new column session_id (T-API-1 — R5)', () => {
    let columns: ColumnRow[];

    beforeAll(async () => {
      columns = await harness.dataSource.query<ColumnRow[]>(
        `SELECT column_name, data_type, udt_name, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'reviews'
          ORDER BY ordinal_position`,
      );
    });

    const findCol = (name: string): ColumnRow => {
      const col = columns.find((c) => c.column_name === name);
      if (!col) {
        throw new Error(`Expected column "${name}" not found in reviews table`);
      }
      return col;
    };

    it('adds a `session_id` column with uuid type', () => {
      const col = findCol('session_id');
      // TypeORM `type: 'uuid'` emits udt_name `uuid` in information_schema.
      expect(col.udt_name).toBe('uuid');
    });

    it('makes `session_id` NULLABLE (no backfill of existing reviews)', () => {
      const col = findCol('session_id');
      expect(col.is_nullable).toBe('YES');
    });
  });

  describe('reviews.session_id — FK to chat_sessions.id ON DELETE SET NULL (Q3)', () => {
    let fks: FkRow[];

    beforeAll(async () => {
      fks = await harness.dataSource.query<FkRow[]>(`
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name  AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          rc.delete_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema    = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
         AND tc.table_schema    = ccu.table_schema
        JOIN information_schema.referential_constraints rc
          ON tc.constraint_name = rc.constraint_name
         AND tc.table_schema    = rc.constraint_schema
        WHERE tc.table_schema    = 'public'
          AND tc.table_name      = 'reviews'
          AND tc.constraint_type = 'FOREIGN KEY'
      `);
    });

    it('declares a FOREIGN KEY on reviews.session_id → chat_sessions(id)', () => {
      const fk = fks.find(
        (f) => f.column_name === 'session_id' && f.foreign_table_name === 'chat_sessions',
      );
      expect(fk).toBeDefined();
      expect(fk?.foreign_column_name).toBe('id');
    });

    it('FK uses ON DELETE SET NULL (session purge must not corrupt the review)', () => {
      const fk = fks.find(
        (f) => f.column_name === 'session_id' && f.foreign_table_name === 'chat_sessions',
      );
      expect(fk?.delete_rule).toBe('SET NULL');
    });
  });

  describe('reviews.session_id — partial index (R5)', () => {
    let indexes: IndexRow[];

    beforeAll(async () => {
      indexes = await harness.dataSource.query<IndexRow[]>(
        `SELECT indexname, indexdef
           FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'reviews'`,
      );
    });

    it('declares index `IDX_reviews_session_id` on session_id', () => {
      const idx = indexes.find((i) => i.indexname === 'IDX_reviews_session_id');
      expect(idx).toBeDefined();
      expect(idx?.indexdef.toLowerCase()).toContain('session_id');
    });

    it('the index is partial (WHERE session_id IS NOT NULL)', () => {
      const idx = indexes.find((i) => i.indexname === 'IDX_reviews_session_id');
      expect(idx?.indexdef.toLowerCase()).toContain('where');
      expect(idx?.indexdef.toLowerCase()).toMatch(/session_id is not null/);
    });
  });
});
