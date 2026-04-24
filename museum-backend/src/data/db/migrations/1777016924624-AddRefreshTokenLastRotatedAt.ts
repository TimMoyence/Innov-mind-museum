import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * H1 — Refresh-token sliding idle window.
 *
 * Adds `last_rotated_at` to `auth_refresh_tokens` so the auth service can enforce
 * a 14-day sliding window on top of the (now reduced) 30-day absolute TTL.
 * The column is nullable because legacy rows predate the feature — the service
 * falls back to `createdAt` / `issuedAt` when `lastRotatedAt IS NULL`.
 *
 * Scope deliberately narrow: only the new column. TypeORM's global diff against
 * the live schema produced large amounts of unrelated drift (FK / index renames,
 * unrelated entity changes) — that drift is out of scope for this finding and is
 * owned by the teams that touched the affected entities.
 */
export class AddRefreshTokenLastRotatedAt1777016924624 implements MigrationInterface {
  name = 'AddRefreshTokenLastRotatedAt1777016924624';

  /**
   * Add the `last_rotated_at` column. `ADD COLUMN IF NOT EXISTS` keeps the
   * migration idempotent in environments where the column may already exist
   * (e.g. partial re-runs during development).
   *
   * @param queryRunner TypeORM query runner injected by the migration executor.
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "auth_refresh_tokens" ADD COLUMN IF NOT EXISTS "last_rotated_at" TIMESTAMP`,
    );
  }

  /**
   * Drop the `last_rotated_at` column. Reversing the idle-window feature is
   * always safe — the service tolerates rows where the column is absent via
   * the `?? createdAt` fallback chain.
   *
   * @param queryRunner TypeORM query runner injected by the migration executor.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "auth_refresh_tokens" DROP COLUMN "last_rotated_at"`);
  }
}
