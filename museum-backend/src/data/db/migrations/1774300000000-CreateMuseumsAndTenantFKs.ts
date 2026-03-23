import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMuseumsAndTenantFKs1774300000000 implements MigrationInterface {
  name = 'CreateMuseumsAndTenantFKs1774300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create museums table
    await queryRunner.query(`
      CREATE TABLE "museums" (
        "id"          SERIAL       NOT NULL,
        "name"        VARCHAR(256) NOT NULL,
        "slug"        VARCHAR(128) NOT NULL,
        "address"     VARCHAR(512),
        "description" TEXT,
        "config"      JSONB        NOT NULL DEFAULT '{}',
        "is_active"   BOOLEAN      NOT NULL DEFAULT true,
        "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_museums" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_museums_slug" UNIQUE ("slug")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_museums_active" ON "museums" ("id") WHERE "is_active" = true`,
    );

    // 2. Add museum_id FK to users
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "museum_id" INTEGER REFERENCES "museums"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_users_museum_id" ON "users" ("museum_id")`,
    );

    // 3. Add museum_id FK to chat_sessions
    await queryRunner.query(
      `ALTER TABLE "chat_sessions" ADD COLUMN "museum_id" INTEGER REFERENCES "museums"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_chat_sessions_museum_id" ON "chat_sessions" ("museum_id")`,
    );

    // 4. Add museum_id FK to api_keys
    await queryRunner.query(
      `ALTER TABLE "api_keys" ADD COLUMN "museum_id" INTEGER REFERENCES "museums"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_api_keys_museum_id" ON "api_keys" ("museum_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_api_keys_museum_id"`);
    await queryRunner.query(`ALTER TABLE "api_keys" DROP COLUMN IF EXISTS "museum_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_sessions_museum_id"`);
    await queryRunner.query(`ALTER TABLE "chat_sessions" DROP COLUMN IF EXISTS "museum_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_museum_id"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "museum_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_museums_active"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "museums"`);
  }
}
