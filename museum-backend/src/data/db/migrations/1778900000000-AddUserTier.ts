import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * R1 (C6) — Soft-paywall foundation. Adds three columns to `users` to back
 * the monthly session quota + admin tier override :
 *
 *  - `tier varchar(16) NOT NULL DEFAULT 'free'` w/ CHECK `tier IN ('free','premium')`
 *    — canonical premium-grant signal in V1 (no Stripe yet, R1 §0.1).
 *  - `sessions_month_count integer NOT NULL DEFAULT 0` — counter mutated by
 *    `monthlySessionQuota` middleware via atomic UPDATE-with-WHERE-condition.
 *  - `sessions_month_start date NULL` — first-day-of-current-UTC-month sentinel
 *    initialised by the first session-create after R1 ships ; nullable for
 *    backfill (existing users at deploy-time keep NULL until first hit).
 *
 * Reversibility (N12 / R3) : the `down()` drops the CHECK first, then the three
 * columns. Leaf columns, no FK references, no orphan data risk. Backfill (R2)
 * is automatic via the DEFAULT clauses — every existing row gets `tier='free'`,
 * `sessions_month_count=0`, `sessions_month_start=NULL` without an explicit
 * UPDATE.
 */
export class AddUserTier1778900000000 implements MigrationInterface {
  name = 'AddUserTier1778900000000';

  /**
   * Adds the three soft-paywall columns + a CHECK constraint pinning tier to
   * `{'free','premium'}`. DEFAULTs backfill existing rows automatically.
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "tier" varchar(16) NOT NULL DEFAULT 'free'`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "CHK_users_tier" CHECK ("tier" IN ('free','premium'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "sessions_month_count" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "sessions_month_start" date`);
  }

  /**
   * Drops the CHECK constraint first, then the three columns. Reversible —
   * the only state lost is the per-user monthly counter, which the next
   * session-create re-initialises after a re-apply.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "CHK_users_tier"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "sessions_month_start"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "sessions_month_count"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "tier"`);
  }
}
