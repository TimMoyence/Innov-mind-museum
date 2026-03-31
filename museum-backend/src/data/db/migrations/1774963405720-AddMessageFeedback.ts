import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the message_feedback table for thumbs up/down on assistant messages.
 */
export class AddMessageFeedback1774963405720 implements MigrationInterface {
  name = 'AddMessageFeedback1774963405720';

  /** Apply the AddMessageFeedback migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "message_feedback" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "messageId" uuid NOT NULL,
        "userId" integer NOT NULL,
        "value" character varying(10) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_message_feedback_value" CHECK ("value" IN ('positive', 'negative')),
        CONSTRAINT "UQ_message_feedback_message_user" UNIQUE ("messageId", "userId"),
        CONSTRAINT "PK_message_feedback" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_message_feedback_message" ON "message_feedback" ("messageId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_feedback" ADD CONSTRAINT "FK_message_feedback_message" FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_feedback" ADD CONSTRAINT "FK_message_feedback_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  /** Revert the AddMessageFeedback migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "message_feedback" DROP CONSTRAINT "FK_message_feedback_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_feedback" DROP CONSTRAINT "FK_message_feedback_message"`,
    );
    await queryRunner.query(`DROP INDEX "idx_message_feedback_message"`);
    await queryRunner.query(`DROP TABLE "message_feedback"`);
  }
}
