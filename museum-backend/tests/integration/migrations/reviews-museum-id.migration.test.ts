/**
 * T-B1 (RED — Wave B / C7 / M2 — UFR-022 fresh-context red phase 2026-05-21).
 *
 * Pins the schema shape produced by the future `AddMuseumIdToReviews`
 * migration (M2 in design.md §4). Asserts, on a real Postgres testcontainer
 * with every TypeORM migration applied :
 *
 *   - `reviews.museum_id` exists, type `integer`, NULLABLE (B2B onboarding
 *     window — tenants without an assigned museum are tolerated transitorily).
 *   - A FOREIGN KEY constraint on `reviews.museum_id` → `museums.id`
 *     (integer FK, since `museums.id` is `PrimaryGeneratedColumn()` integer —
 *     verified `museum.entity.ts:18-19`, no UUID).
 *   - A partial index `IDX_reviews_museum_id` (where museum_id IS NOT NULL),
 *     mirroring the pattern used by `IDX_support_tickets_assigned_to` on
 *     `supportTicket.entity.ts:33-34`.
 *
 * Baseline (HEAD `89d2d7b44`) :
 *   - `review.entity.ts:9-34` declares NO `museumId` field.
 *   - No `*AddMuseumIdToReviews*` migration exists under
 *     `museum-backend/src/data/db/migrations/`.
 *   - `information_schema.columns` returns ZERO rows for the column ⇒ tests
 *     FAIL at baseline. This is the success criterion of the red phase per
 *     UFR-022.
 *
 * Spec : `team-state/2026-05-21-p0-feature-gates/spec.md` R-C7a (reviews
 * museum_id col) + `design.md` §4 M2 + `tasks.md` T-B1.
 *
 * Pattern mirrored from `tests/integration/migrations/wikidata-qid.migration.test.ts`
 * (T-A3, Wave A — already merged, same harness contract). Keep the diff small
 * and auditable for the reviewer.
 *
 * Integration harness applies ALL migrations on container boot (per
 * `tests/helpers/integration/integration-harness.ts:71` —
 * `AppDataSource.runMigrations({transaction:'none'})`) and uses
 * `harness.scheduleStop()` to share the container across suites (cf.
 * CLAUDE.md gotcha `feedback_integration_test_teardown.md`).
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
}

describe('AddMuseumIdToReviews migration — schema shape [integration, real PG]', () => {
  jest.setTimeout(300_000);

  let harness: IntegrationHarness;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
  });

  describe('reviews table — new column museum_id (T-B1 — R-C7a)', () => {
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

    it('adds a `museum_id` column with integer type', () => {
      const col = findCol('museum_id');
      // TypeORM `type: 'integer'` emits `integer` in information_schema.
      expect(col.data_type).toBe('integer');
    });

    it('makes `museum_id` NULLABLE (transitional B2B onboarding window)', () => {
      const col = findCol('museum_id');
      // Spec R-C7a: nullable so existing reviews (pre-multi-tenant) survive
      // the migration without a backfill. NOT NULL would block the
      // migration on any existing review row.
      expect(col.is_nullable).toBe('YES');
    });
  });

  describe('reviews.museum_id — FK to museums.id (R-C7a)', () => {
    let fks: FkRow[];

    beforeAll(async () => {
      // Standard information_schema join to enumerate FOREIGN KEYS on
      // `reviews`. Same pattern used by other migration tests in this repo.
      fks = await harness.dataSource.query<FkRow[]>(`
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name  AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema    = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
         AND tc.table_schema    = ccu.table_schema
        WHERE tc.table_schema    = 'public'
          AND tc.table_name      = 'reviews'
          AND tc.constraint_type = 'FOREIGN KEY'
      `);
    });

    it('declares a FOREIGN KEY on reviews.museum_id → museums(id)', () => {
      // FK target = museums.id (integer PK, verified museum.entity.ts:18-19).
      const fk = fks.find(
        (f) => f.column_name === 'museum_id' && f.foreign_table_name === 'museums',
      );
      expect(fk).toBeDefined();
      expect(fk?.foreign_column_name).toBe('id');
    });
  });

  describe('reviews.museum_id — partial index (R-C7a)', () => {
    let indexes: IndexRow[];

    beforeAll(async () => {
      indexes = await harness.dataSource.query<IndexRow[]>(
        `SELECT indexname, indexdef
           FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'reviews'`,
      );
    });

    it('declares index `IDX_reviews_museum_id` on museum_id', () => {
      const idx = indexes.find((i) => i.indexname === 'IDX_reviews_museum_id');
      expect(idx).toBeDefined();
      // Defensive: confirm the index actually targets the museum_id column
      // (not, say, a different column accidentally named the same).
      expect(idx?.indexdef.toLowerCase()).toContain('museum_id');
    });
  });
});
