import type { MigrationInterface, QueryRunner } from 'typeorm';

export class WidenTicketMessageSenderRole1794847191041 implements MigrationInterface {
  name = 'WidenTicketMessageSenderRole1794847191041';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ticket_messages" ALTER COLUMN "sender_role" TYPE character varying(32)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ticket_messages" ALTER COLUMN "sender_role" TYPE character varying(8)`,
    );
  }
}
