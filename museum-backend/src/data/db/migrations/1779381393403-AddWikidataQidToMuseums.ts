import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * T-A7 — Add `museums.wikidata_qid` (UFR-022 Wave A C3 / M1).
 *
 * Pins each tenant museum row to its canonical Wikidata Q-identifier so the
 * catalog-ingest CLI can resolve `--museum=<Qid>` → `museum_id` and so the
 * seed (T-A9) can backfill the 3 Bordeaux museums + the Pont de Pierre
 * monument idempotently via `.orUpdate(['wikidata_qid'], 'slug')`.
 *
 * Shape :
 *   - `wikidata_qid varchar(16) NULL UNIQUE`
 *   - Nullable so the migration is non-destructive against existing tenants
 *     (operators backfill via seed or admin UI after deploy).
 *   - UNIQUE so a single Wikidata entity maps to at most one tenant row
 *     (defensive against duplicate seed runs without the orUpdate path).
 *
 * Body was generated via `pnpm migration:generate:host` against the dev
 * Postgres testcontainer with all prior migrations applied (per
 * `docs/MIGRATION_GOVERNANCE.md` §1). The full generated diff also surfaced
 * a number of pre-existing baseline drifts (FK names, `recovery_codes::jsonb`
 * cast, `embedding` halfvec→text, `IDX_users_deleted_at` etc.) that
 * originate from migrations landed pre-2026-05-21 and are NOT this commit's
 * concern — they belong to a separate tech-debt sweep. This file retains
 * ONLY the wikidata_qid statements, isolating the intentional diff (per
 * MIGRATION_GOVERNANCE §6 — drift unrelated to current spec work surfacing
 * in DriftCheck is acceptable when documented).
 */
export class AddWikidataQidToMuseums1779381393403 implements MigrationInterface {
  name = 'AddWikidataQidToMuseums1779381393403';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "museums" ADD "wikidata_qid" character varying(16)`);
    await queryRunner.query(
      `ALTER TABLE "museums" ADD CONSTRAINT "UQ_museums_wikidata_qid" UNIQUE ("wikidata_qid")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "museums" DROP CONSTRAINT "UQ_museums_wikidata_qid"`);
    await queryRunner.query(`ALTER TABLE "museums" DROP COLUMN "wikidata_qid"`);
  }
}
