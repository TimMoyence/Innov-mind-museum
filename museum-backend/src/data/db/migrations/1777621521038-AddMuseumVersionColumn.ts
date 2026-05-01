import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * C.1 — Museum optimistic-locking version column.
 *
 * Adds `version integer NOT NULL` to the museums table so TypeORM can detect
 * concurrent admin edits and throw `OptimisticLockVersionMismatchError`. The
 * application wraps Museum mutations in `withOptimisticLockRetry` so
 * short-lived contention is invisible; sustained contention surfaces a 409.
 *
 * Existing rows are backfilled to `version = 1` via a transient `DEFAULT 1`
 * that is immediately dropped, so the final column definition matches the
 * TypeORM `VersionColumn` metadata (NOT NULL, no DB-level default — TypeORM
 * manages the value at the application layer).
 *
 * Spec: `docs/superpowers/specs/2026-05-01-C-data-debt-design.md` section 3.1.
 */
export class AddMuseumVersionColumn1777621521038 implements MigrationInterface {
  name = 'AddMuseumVersionColumn1777621521038';

  /** Adds the `version` column on `museums` (NOT NULL, transient default for backfill). */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "museums" ADD COLUMN "version" integer NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(`ALTER TABLE "museums" ALTER COLUMN "version" DROP DEFAULT`);
  }

  /** Drops the `version` column from `museums`. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "museums" DROP COLUMN "version"`);
  }
}
