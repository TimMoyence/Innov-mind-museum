import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 *
 */
export class CreateSupportTables1774400100000 implements MigrationInterface {
  name = 'CreateSupportTables1774400100000';

  /** Apply the CreateSupportTables migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "support_tickets" (
        "id"          UUID          NOT NULL DEFAULT gen_random_uuid(),
        "userId"      INTEGER       NOT NULL,
        "subject"     VARCHAR(256)  NOT NULL,
        "description" TEXT          NOT NULL,
        "status"      VARCHAR(16)   NOT NULL DEFAULT 'open',
        "priority"    VARCHAR(8)    NOT NULL DEFAULT 'medium',
        "category"    VARCHAR(64),
        "assigned_to" INTEGER,
        "createdAt"   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updatedAt"   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_support_tickets" PRIMARY KEY ("id"),
        CONSTRAINT "FK_support_tickets_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_support_tickets_assigned" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_support_tickets_userId" ON "support_tickets" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_support_tickets_status" ON "support_tickets" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_support_tickets_priority" ON "support_tickets" ("priority")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_support_tickets_updatedAt" ON "support_tickets" ("updatedAt" DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE "ticket_messages" (
        "id"          UUID          NOT NULL DEFAULT gen_random_uuid(),
        "ticket_id"   UUID          NOT NULL,
        "sender_id"   INTEGER       NOT NULL,
        "sender_role" VARCHAR(8)    NOT NULL,
        "text"        TEXT          NOT NULL,
        "createdAt"   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_ticket_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ticket_messages_ticket" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ticket_messages_sender" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_ticket_messages_ticket_id" ON "ticket_messages" ("ticket_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ticket_messages_createdAt" ON "ticket_messages" ("ticket_id", "createdAt" ASC)`,
    );
  }

  /** Revert the CreateSupportTables migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ticket_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "support_tickets"`);
  }
}
