import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 *
 */
export class CreateUserMemoriesTable1774300100000 implements MigrationInterface {
  name = 'CreateUserMemoriesTable1774300100000';

  /** Apply the CreateUserMemoriesTable migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_memories" (
        "id"                       UUID         NOT NULL DEFAULT gen_random_uuid(),
        "user_id"                  INTEGER      NOT NULL,
        "preferred_expertise"      VARCHAR(16)  NOT NULL DEFAULT 'beginner',
        "favorite_periods"         TEXT[]        NOT NULL DEFAULT '{}',
        "favorite_artists"         TEXT[]        NOT NULL DEFAULT '{}',
        "museums_visited"          TEXT[]        NOT NULL DEFAULT '{}',
        "total_artworks_discussed" INTEGER      NOT NULL DEFAULT 0,
        "notable_artworks"         JSONB        NOT NULL DEFAULT '[]',
        "interests"                TEXT[]        NOT NULL DEFAULT '{}',
        "summary"                  TEXT,
        "session_count"            INTEGER      NOT NULL DEFAULT 0,
        "last_session_id"          UUID,
        "version"                  INTEGER      NOT NULL DEFAULT 1,
        "created_at"               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_user_memories" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_memories_user_id" UNIQUE ("user_id"),
        CONSTRAINT "FK_user_memories_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_user_memories_user_id" ON "user_memories" ("user_id")`,
    );
  }

  /** Revert the CreateUserMemoriesTable migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_memories_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_memories"`);
  }
}
