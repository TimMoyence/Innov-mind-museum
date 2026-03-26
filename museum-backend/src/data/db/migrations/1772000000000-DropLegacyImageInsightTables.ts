import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 *
 */
export class DropLegacyImageInsightTables1772000000000 implements MigrationInterface {
  name = 'DropLegacyImageInsightTables1772000000000';

  /** Apply the DropLegacyImageInsightTables migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.startTransaction();
    try {
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "image_insight_messages" DROP CONSTRAINT IF EXISTS "FK_30f03922716e25cfaefb72a9e5f"`,
      );
      await queryRunner.query(
        `ALTER TABLE IF EXISTS "image_insight_conversations" DROP CONSTRAINT IF EXISTS "FK_be40cc010dd6fd7c67bb8bebd91"`,
      );
      await queryRunner.query(`DROP TABLE IF EXISTS "image_insight_messages"`);
      await queryRunner.query(`DROP TABLE IF EXISTS "image_insight_conversations"`);
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    }
  }

  /** Revert the DropLegacyImageInsightTables migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "image_insight_conversations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "imageUrl" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "userId" integer,
        CONSTRAINT "PK_05c8a3ab549dbd9cbb3a90c49c6" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "image_insight_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "role" character varying NOT NULL,
        "content" text NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "conversationId" uuid,
        CONSTRAINT "PK_26a7261320960138a72e45d5bf4" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "image_insight_messages" ADD CONSTRAINT "FK_30f03922716e25cfaefb72a9e5f" FOREIGN KEY ("conversationId") REFERENCES "image_insight_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "image_insight_conversations" ADD CONSTRAINT "FK_be40cc010dd6fd7c67bb8bebd91" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}
