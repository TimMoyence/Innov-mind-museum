import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnsureChatTables1771900000000 implements MigrationInterface {
  name = 'EnsureChatTables1771900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_sessions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "locale" character varying(32),
        "museumMode" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "userId" integer,
        CONSTRAINT "PK_efc151a4aafa9a28b73dedc485f" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "role" character varying(20) NOT NULL,
        "text" text,
        "imageRef" text,
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "sessionId" uuid,
        CONSTRAINT "PK_40c55ee0e571e268b0d3cd37d10" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "artwork_matches" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "artworkId" character varying(128),
        "title" character varying(256),
        "artist" character varying(256),
        "confidence" double precision NOT NULL DEFAULT '0',
        "source" character varying(512),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "messageId" uuid,
        CONSTRAINT "PK_0573b35aae5d2896f3999b24512" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_d0320df1059d8a029a460f4161d'
        ) THEN
          ALTER TABLE "chat_sessions"
          ADD CONSTRAINT "FK_d0320df1059d8a029a460f4161d"
          FOREIGN KEY ("userId") REFERENCES "users"("id")
          ON DELETE NO ACTION ON UPDATE NO ACTION;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_a82476a8acdd6cd6936378cb72d'
        ) THEN
          ALTER TABLE "chat_messages"
          ADD CONSTRAINT "FK_a82476a8acdd6cd6936378cb72d"
          FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_4e09da4e92fddfef0d14f634d5e'
        ) THEN
          ALTER TABLE "artwork_matches"
          ADD CONSTRAINT "FK_4e09da4e92fddfef0d14f634d5e"
          FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_4e09da4e92fddfef0d14f634d5e'
        ) THEN
          ALTER TABLE "artwork_matches" DROP CONSTRAINT "FK_4e09da4e92fddfef0d14f634d5e";
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_a82476a8acdd6cd6936378cb72d'
        ) THEN
          ALTER TABLE "chat_messages" DROP CONSTRAINT "FK_a82476a8acdd6cd6936378cb72d";
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_d0320df1059d8a029a460f4161d'
        ) THEN
          ALTER TABLE "chat_sessions" DROP CONSTRAINT "FK_d0320df1059d8a029a460f4161d";
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "artwork_matches"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_sessions"`);
  }
}

