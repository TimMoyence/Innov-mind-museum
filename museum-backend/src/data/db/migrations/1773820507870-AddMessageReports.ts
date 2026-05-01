import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 *
 */
export class AddMessageReports1773820507870 implements MigrationInterface {
  name = 'AddMessageReports1773820507870';

  /** Apply the AddMessageReports migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "message_reports" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" integer NOT NULL, "reason" character varying(20) NOT NULL, "comment" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "messageId" uuid, CONSTRAINT "UQ_6ceb8cd066569cd443469dc7a25" UNIQUE ("messageId", "userId"), CONSTRAINT "PK_59df246edfc1d9203ff93886000" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_reports" ADD CONSTRAINT "FK_7078835e4cc127f9394f40ac6e7" FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  /** Revert the AddMessageReports migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    // Use IF EXISTS: AddSocialAccountsAndNullablePassword (the next migration) also
    // drops message_reports in its own down(), so by the time this down() runs during
    // a full revert sequence the table may already be gone.
    await queryRunner.query(
      `ALTER TABLE IF EXISTS "message_reports" DROP CONSTRAINT IF EXISTS "FK_7078835e4cc127f9394f40ac6e7"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "message_reports"`);
  }
}
