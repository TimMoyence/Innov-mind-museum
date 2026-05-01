import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A2 — P1 simple foreign-key + partial token indexes (zero-downtime
 * CONCURRENTLY).
 *
 *   - museum_enrichment."museumId"   (FK, full index)
 *   - support_tickets.assigned_to    (FK, partial WHERE assigned_to IS NOT NULL)
 *   - ticket_messages.sender_id      (FK, full index)
 *   - users.reset_token              (partial WHERE reset_token IS NOT NULL)
 *   - users.email_change_token       (partial WHERE email_change_token IS NOT NULL)
 *
 * Out of scope (verified YAGNI in spec):
 *   - message_reports."userId"       — composite (messageId, userId) covers callers
 *   - message_feedback."userId"      — same
 *   - museums (lat, lng) GiST        — A3 deferred sub-spec (PostGIS)
 *
 * Same CONCURRENTLY / `transaction = false` discipline as A1.
 *
 * Spec: docs/superpowers/specs/2026-04-30-A1-A2-critical-fk-indexes-design.md
 */
export class AddP1FKAndTokenIndexes1777617893834 implements MigrationInterface {
  name = 'AddP1FKAndTokenIndexes1777617893834';
  public readonly transaction = false as const;

  /**
   * Build the P1 FK + token indexes concurrently.
   *
   * @param queryRunner TypeORM query runner injected by the migration executor.
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_museum_enrichment_museumId" ` +
        `ON "museum_enrichment" ("museumId")`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_support_tickets_assigned_to" ` +
        `ON "support_tickets" ("assigned_to") WHERE "assigned_to" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_ticket_messages_sender_id" ` +
        `ON "ticket_messages" ("sender_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_users_reset_token" ` +
        `ON "users" ("reset_token") WHERE "reset_token" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_users_email_change_token" ` +
        `ON "users" ("email_change_token") WHERE "email_change_token" IS NOT NULL`,
    );
  }

  /**
   * Drop the P1 indexes in reverse order, also concurrently.
   *
   * @param queryRunner TypeORM query runner injected by the migration executor.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_users_email_change_token"`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_users_reset_token"`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_ticket_messages_sender_id"`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_support_tickets_assigned_to"`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_museum_enrichment_museumId"`);
  }
}
