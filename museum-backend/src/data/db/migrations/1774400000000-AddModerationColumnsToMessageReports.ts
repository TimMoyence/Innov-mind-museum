import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 *
 */
export class AddModerationColumnsToMessageReports1774400000000 implements MigrationInterface {
    name = 'AddModerationColumnsToMessageReports1774400000000'

    /** Apply the AddModerationColumnsToMessageReports migration. */
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "message_reports"
              ADD COLUMN "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
              ADD COLUMN "reviewedBy" INTEGER,
              ADD COLUMN "reviewedAt" TIMESTAMPTZ,
              ADD COLUMN "reviewerNotes" TEXT
        `);
        await queryRunner.query(`CREATE INDEX "IDX_message_reports_status" ON "message_reports" ("status")`);
    }

    /** Revert the AddModerationColumnsToMessageReports migration. */
    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_message_reports_status"`);
        await queryRunner.query(`
            ALTER TABLE "message_reports"
              DROP COLUMN "reviewerNotes",
              DROP COLUMN "reviewedAt",
              DROP COLUMN "reviewedBy",
              DROP COLUMN "status"
        `);
    }

}
