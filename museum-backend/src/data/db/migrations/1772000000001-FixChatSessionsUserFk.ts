import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixChatSessionsUserFk1772000000001 implements MigrationInterface {
  name = 'FixChatSessionsUserFk1772000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.startTransaction();
    try {
      await queryRunner.query(
        `ALTER TABLE "chat_sessions" DROP CONSTRAINT IF EXISTS "FK_d0320df1059d8a029a460f4161d"`,
      );
      await queryRunner.query(
        `ALTER TABLE "chat_sessions" ADD CONSTRAINT "FK_d0320df1059d8a029a460f4161d" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
      );
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chat_sessions" DROP CONSTRAINT IF EXISTS "FK_d0320df1059d8a029a460f4161d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_sessions" ADD CONSTRAINT "FK_d0320df1059d8a029a460f4161d" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}
