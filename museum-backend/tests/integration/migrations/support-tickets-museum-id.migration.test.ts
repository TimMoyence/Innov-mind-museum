/**
 * T-B2 (RED — Wave B / C7 / M3 — UFR-022 fresh-context red phase 2026-05-21).
 *
 * Pins the schema shape produced by the future `AddMuseumIdToSupportTickets`
 * migration (M3 in design.md §4). Asserts, on a real Postgres testcontainer
 * with every TypeORM migration applied :
 *
 *   - `support_tickets.museum_id` exists, type `integer`, NULLABLE.
 *   - A FOREIGN KEY constraint on `support_tickets.museum_id` → `museums.id`.
 *   - A partial index `IDX_support_tickets_museum_id` (where museum_id IS NOT NULL).
 *
 * Baseline (HEAD `89d2d7b44`) :
 *   - `supportTicket.entity.ts:10-42` declares NO `museumId` field.
 *   - No `*AddMuseumIdToSupportTickets*` migration exists under
 *     `museum-backend/src/data/db/migrations/`.
 *   - `information_schema.columns` returns ZERO rows for the column ⇒ tests
 *     FAIL at baseline. This is the success criterion of the red phase per
 *     UFR-022.
 *
 * Spec : `team-state/2026-05-21-p0-feature-gates/spec.md` R-C7a (support_tickets
 * museum_id col) + R-C7c (scope) + `design.md` §4 M3 + `tasks.md` T-B2.
 *
 * Pattern mirrored from sibling `reviews-museum-id.migration.test.ts` (T-B1)
 * and the merged `wikidata-qid.migration.test.ts` (T-A3). Same harness contract
 * — share the container across suites via `harness.scheduleStop()` per the
 * CLAUDE.md `feedback_integration_test_teardown.md` gotcha.
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

describe('AddMuseumIdToSupportTickets migration — schema shape [integration, real PG]', () => {
  jest.setTimeout(300_000);

  let harness: IntegrationHarness;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
  });

  describe('support_tickets table — new column museum_id (T-B2 — R-C7a)', () => {
    let columns: ColumnRow[];

    beforeAll(async () => {
      columns = await harness.dataSource.query<ColumnRow[]>(
        `SELECT column_name, data_type, udt_name, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'support_tickets'
          ORDER BY ordinal_position`,
      );
    });

    const findCol = (name: string): ColumnRow => {
      const col = columns.find((c) => c.column_name === name);
      if (!col) {
        throw new Error(`Expected column "${name}" not found in support_tickets table`);
      }
      return col;
    };

    it('adds a `museum_id` column with integer type', () => {
      const col = findCol('museum_id');
      expect(col.data_type).toBe('integer');
    });

    it('makes `museum_id` NULLABLE (transitional B2B onboarding window)', () => {
      const col = findCol('museum_id');
      // Existing tickets pre-multi-tenant survive the migration; admin UI
      // backfills museum_id later.
      expect(col.is_nullable).toBe('YES');
    });
  });

  describe('support_tickets.museum_id — FK to museums.id (R-C7a)', () => {
    let fks: FkRow[];

    beforeAll(async () => {
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
          AND tc.table_name      = 'support_tickets'
          AND tc.constraint_type = 'FOREIGN KEY'
      `);
    });

    it('declares a FOREIGN KEY on support_tickets.museum_id → museums(id)', () => {
      const fk = fks.find(
        (f) => f.column_name === 'museum_id' && f.foreign_table_name === 'museums',
      );
      expect(fk).toBeDefined();
      expect(fk?.foreign_column_name).toBe('id');
    });
  });

  describe('support_tickets.museum_id — partial index (R-C7a)', () => {
    let indexes: IndexRow[];

    beforeAll(async () => {
      indexes = await harness.dataSource.query<IndexRow[]>(
        `SELECT indexname, indexdef
           FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'support_tickets'`,
      );
    });

    it('declares index `IDX_support_tickets_museum_id` on museum_id', () => {
      const idx = indexes.find((i) => i.indexname === 'IDX_support_tickets_museum_id');
      expect(idx).toBeDefined();
      expect(idx?.indexdef.toLowerCase()).toContain('museum_id');
    });
  });
});
