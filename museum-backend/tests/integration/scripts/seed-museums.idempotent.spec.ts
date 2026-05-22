/**
 * RED — Regression lock for the deploy-prod seed crash :
 *   `Seed failed: QueryFailedError: constraint "slug" for table "museums" does not exist`
 *
 * Root cause : `scripts/seed-museums.ts` calls
 *   `.orUpdate(['wikidata_qid'], 'slug')`
 * passing `'slug'` as a STRING — TypeORM's polymorphic `.orUpdate(overwrites, conflictTarget)`
 * interprets a non-array `conflictTarget` as a CONSTRAINT NAME, emitting
 *   `ON CONFLICT ON CONSTRAINT "slug"`
 * The real constraint on `museums.slug` is named `UQ_museums_slug` (per the
 * initial migration 1774300000000-CreateMuseumsAndTenantFKs.ts), so Postgres
 * rejects with PG error 42704 — `constraint "slug" does not exist`.
 *
 * Fix : pass `['slug']` (array) → TypeORM emits `ON CONFLICT ("slug")`, Postgres
 * resolves the constraint via the unique index on the column → idempotent.
 *
 * Test design — pure relational invariants (no assumption about pre-state) :
 *   The integration harness may keep ambient museum rows around (smoke seeds,
 *   prior suites, etc.). We don't assert absolute counts ; instead we assert
 *   the upsert is :
 *     1. Successful (no exception, exit code 0)
 *     2. Idempotent (count stable across re-runs)
 *     3. Backfilling (wikidata_qid restored after wipe)
 *     4. Non-destructive (admin-edited fields preserved)
 *   These invariants are what the deploy script needs from a re-run scenario.
 *
 * Run scope :
 *   pnpm jest tests/integration/scripts/seed-museums.idempotent.spec.ts --runInBand
 *
 * Repro on dev DB (commit f2130b328) :
 *   docker compose -f museum-backend/docker-compose.dev.yml up -d
 *   cd museum-backend
 *   NODE_ENV=development DB_HOST=localhost DB_PORT=5433 PGDATABASE=museumAI \
 *     DB_USER=postgres DB_PASSWORD=… \
 *     pnpm ts-node -r tsconfig-paths/register scripts/seed-museums.ts
 *   # → Seed failed: QueryFailedError: constraint "slug" for table "museums" does not exist
 */

import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

import { Museum } from '@modules/museum/domain/museum/museum.entity';

// `seedMuseums` doesn't exist yet — phase green will extract it from the
// top-level `main()` in scripts/seed-museums.ts and export it so the harness
// can pass its own DataSource (testcontainer-scoped, isolated from dev DB).
// The signature is pinned here as the contract phase green must satisfy.
type SeedMuseums = (
  dataSource: IntegrationHarness['dataSource'],
) => Promise<{ inserted: number; totalInDb: number }>;

let seedMuseums: SeedMuseums;

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration(
  'seed-museums.ts — `.orUpdate` conflict target must be column-array, not constraint-name string',
  () => {
    jest.setTimeout(300_000);

    let harness: IntegrationHarness;

    beforeAll(async () => {
      harness = await createIntegrationHarness();
      harness.scheduleStop();
      // Lazy-require AFTER harness has pinned PGDATABASE — same env-cache
      // race protection as the TOTP integration specs (CLAUDE.md gotcha).

      // eslint-disable-next-line @typescript-eslint/no-require-imports -- intentional lazy require: must run AFTER harness pins PGDATABASE (env-cache race protection, see beforeAll comment above)
      seedMuseums = (
        require('../../../scripts/seed-museums') as {
          seedMuseums: SeedMuseums;
        }
      ).seedMuseums;
    });

    beforeEach(async () => {
      await harness.reset();
    });

    it('runs to completion without throwing (R1, AC1) — the constraint-name regression', async () => {
      // Pre-fix this REJECTS with QueryFailedError ("constraint \"slug\" ... does not exist")
      // because the script emits ON CONFLICT ON CONSTRAINT "slug" (a constraint
      // name that doesn't exist). Post-fix it resolves cleanly because the
      // ARRAY form emits ON CONFLICT ("slug") which Postgres resolves via the
      // unique index on the column.
      await expect(seedMuseums(harness.dataSource)).resolves.toMatchObject({
        totalInDb: expect.any(Number),
      });
    });

    it('is idempotent — re-running keeps total count stable, no constraint error (R1, AC1, AC2)', async () => {
      const first = await seedMuseums(harness.dataSource);
      const second = await seedMuseums(harness.dataSource);

      // Pure relational invariant : whatever was in the DB after first run
      // must still be there after the second. No new rows materialize from a
      // re-run because every seed slug already exists.
      expect(second.totalInDb).toBe(first.totalInDb);

      const repo = harness.dataSource.getRepository(Museum);
      const stored = await repo.count();
      expect(stored).toBe(second.totalInDb);
    });

    it('backfills wikidata_qid on subsequent runs without clobbering edited fields (R2, R3)', async () => {
      await seedMuseums(harness.dataSource);
      const repo = harness.dataSource.getRepository(Museum);

      // Pick a museum that has a wikidataQid in the seed list — `musee-d-aquitaine`
      // ships with Q3329534 (Wikidata-verified, cf. reference memory).
      const aquitaine = await repo.findOneByOrFail({ slug: 'musee-d-aquitaine' });
      expect(aquitaine.wikidataQid).toBe('Q3329534');

      // Simulate an admin UI edit to a field outside the overwrite list, AND
      // wipe wikidata_qid to simulate "backfill needed" on a row that pre-dated
      // the wikidata feature.
      const editedName = `${aquitaine.name} — édité via admin UI`;
      await repo.update({ slug: 'musee-d-aquitaine' }, { name: editedName, wikidataQid: null });

      // Re-run seed — should backfill wikidata_qid AND preserve the admin edit.
      await seedMuseums(harness.dataSource);

      const reloaded = await repo.findOneByOrFail({ slug: 'musee-d-aquitaine' });
      expect(reloaded.wikidataQid).toBe('Q3329534'); // R2 backfill OK
      expect(reloaded.name).toBe(editedName); // R3 admin edit preserved
    });
  },
);
