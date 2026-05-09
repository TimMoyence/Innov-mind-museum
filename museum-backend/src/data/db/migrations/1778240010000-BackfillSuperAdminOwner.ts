import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * C1 Phase 2 — backfill the platform owner account
 * (`tim.moyence@gmail.com`) with the `super_admin` role. Pairs with
 * `AddSuperAdminRoleAndBackfill1778240000000` which creates the enum
 * value in a previous transaction (PG SQLSTATE 55P04 forbids a fresh
 * enum value being used in the same transaction it was added to).
 *
 * Idempotency: re-running this migration after the owner already
 * carries `super_admin` is a no-op thanks to the `<>` filter. If the
 * platform owner email ever changes, write a fresh targeted UPDATE in a
 * follow-up migration rather than editing this file (history must
 * stay immutable).
 *
 * Down migration: an explicit no-op. Operators who need to demote
 * the platform owner during a rollback must do so manually in psql:
 *   `UPDATE users SET role = 'admin' WHERE email = '<owner-email>';`
 * Reverting this migration blindly would re-promote whichever account
 * happened to match the email at apply time, which is precisely the
 * surprise we want to avoid.
 */
export class BackfillSuperAdminOwner1778240010000 implements MigrationInterface {
  name = 'BackfillSuperAdminOwner1778240010000';

  /** Apply: promote the platform owner account. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "users"
          SET "role" = 'super_admin'
        WHERE "email" = 'tim.moyence@gmail.com'
          AND "role" <> 'super_admin'`,
    );
  }

  /** No-op — see class doc. */
  public async down(_queryRunner: QueryRunner): Promise<void> {
    await Promise.resolve();
  }
}
