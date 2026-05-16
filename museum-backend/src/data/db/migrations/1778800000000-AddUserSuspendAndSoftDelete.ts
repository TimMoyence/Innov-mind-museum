import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `users.suspended` (BOOLEAN NOT NULL DEFAULT false) and `users.deleted_at`
 * (nullable TIMESTAMP) to back the admin user-management primitives (P0 #9
 * — audit-2026-05-12). `suspended=true` blocks login + refresh without
 * destroying state; `deleted_at` is a soft-delete marker keeping audit and FK
 * integrity intact (chat_messages, audit_log point to user_id).
 *
 * Token-revocation at suspend/delete relies on the existing
 * `auth_refresh_tokens.revokeFamily` mechanism — no schema change there. The
 * 15-min access-token TTL provides the natural revocation window (ADR-052).
 */
export class AddUserSuspendAndSoftDelete1778800000000 implements MigrationInterface {
  name = 'AddUserSuspendAndSoftDelete1778800000000';

  /** Add suspended + deleted_at columns, plus a partial index on deleted_at for soft-delete lookups. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "suspended" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "users" ADD "deleted_at" TIMESTAMP`);
    await queryRunner.query(
      `CREATE INDEX "IDX_users_deleted_at" ON "users" ("deleted_at") WHERE "deleted_at" IS NOT NULL`,
    );
  }

  /** Drop the partial index first, then both columns. Reversible — no data loss beyond soft-delete history. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_deleted_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deleted_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "suspended"`);
  }
}
