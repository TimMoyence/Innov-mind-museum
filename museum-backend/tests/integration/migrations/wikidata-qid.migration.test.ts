/**
 * T-A3 (RED — Wave A / C3 / M1 — UFR-022 fresh-context red phase 2026-05-21).
 *
 * Pins the schema shape produced by the future `AddWikidataQidToMuseums`
 * migration (M1 in design.md §4). Asserts, on a real Postgres testcontainer
 * with every TypeORM migration applied :
 *
 *   - `museums.wikidata_qid` exists (`varchar`, nullable, UNIQUE).
 *
 * Currently NO migration exists for this column, and `Museum` entity
 * (museum-backend/src/modules/museum/domain/museum/museum.entity.ts) does
 * not declare a `wikidataQid` field — `information_schema.columns` returns
 * zero rows for the column → tests FAIL at baseline. This is the success
 * criterion of the red phase per UFR-022.
 *
 * RED expectation : every assertion inside the describe block throws because
 * `findCol('wikidata_qid')` fails ("Expected column not found in museums").
 *
 * Pattern mirrored from `tests/integration/db/migrations/add-user-tier.test.ts`
 * — keep the diff small + auditable for the reviewer.
 *
 * The integration harness applies ALL migrations on container boot (per
 * `tests/helpers/integration/integration-harness.ts:71` —
 * `AppDataSource.runMigrations({transaction:'none'})`) and uses
 * `harness.scheduleStop()` to share the container across suites (cf. CLAUDE.md
 * gotcha `feedback_integration_test_teardown.md`).
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

describe('AddWikidataQidToMuseums migration — schema shape [integration, real PG]', () => {
  jest.setTimeout(300_000);

  let harness: IntegrationHarness;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
  });

  describe('museums table — new column wikidata_qid (T-A3 — R-C3b)', () => {
    let columns: ColumnRow[];

    beforeAll(async () => {
      columns = await harness.dataSource.query<ColumnRow[]>(
        `SELECT column_name, data_type, udt_name, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'museums'
          ORDER BY ordinal_position`,
      );
    });

    const findCol = (name: string): ColumnRow => {
      const col = columns.find((c) => c.column_name === name);
      if (!col) {
        throw new Error(`Expected column "${name}" not found in museums table`);
      }
      return col;
    };

    it('adds a `wikidata_qid` column (varchar / text)', () => {
      const col = findCol('wikidata_qid');
      // TypeORM may emit `character varying` (when @Column varchar(16)) or
      // `text` (loose alias) — accept both shapes.
      expect(['character varying', 'text']).toContain(col.data_type);
    });

    it('makes `wikidata_qid` NULLABLE (B2B onboarding backfill window)', () => {
      const col = findCol('wikidata_qid');
      // Nullable so existing rows do not need a hand-curated Q-code at
      // migration time — operators set it via the seed (T-A9) or via
      // admin UI later. NOT NULL would block migration on existing tenants.
      expect(col.is_nullable).toBe('YES');
    });
  });

  describe('museums table — UNIQUE constraint on wikidata_qid (R-C3b)', () => {
    let indexes: IndexRow[];

    beforeAll(async () => {
      indexes = await harness.dataSource.query<IndexRow[]>(
        `SELECT indexname, indexdef
           FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'museums'`,
      );
    });

    it('declares a UNIQUE index on wikidata_qid (one Qid → at most one museum)', () => {
      // A `@Column({ unique: true })` produces either a UNIQUE constraint
      // (visible in pg_indexes as `UNIQUE INDEX` definition) or a stand-alone
      // unique index. Accept either form by matching on the indexdef.
      const uniqueIdx = indexes.find(
        (i) =>
          i.indexdef.toUpperCase().includes('UNIQUE') &&
          i.indexdef.toLowerCase().includes('wikidata_qid'),
      );
      expect(uniqueIdx).toBeDefined();
    });
  });
});
