import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 *
 */
export class InitDatabase1771427010387 implements MigrationInterface {
  name = 'InitDatabase1771427010387';

  /** Apply the InitDatabase migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "users" ("id" SERIAL NOT NULL, "email" character varying NOT NULL, "password" character varying NOT NULL, "firstname" character varying, "lastname" character varying, "reset_token" character varying, "reset_token_expires" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "image_insight_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "role" character varying NOT NULL, "content" text NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "conversationId" uuid, CONSTRAINT "PK_26a7261320960138a72e45d5bf4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "image_insight_conversations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "imageUrl" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" integer, CONSTRAINT "PK_05c8a3ab549dbd9cbb3a90c49c6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "chat_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "locale" character varying(32), "museumMode" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" integer, CONSTRAINT "PK_efc151a4aafa9a28b73dedc485f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "chat_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "role" character varying(20) NOT NULL, "text" text, "imageRef" text, "metadata" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "sessionId" uuid, CONSTRAINT "PK_40c55ee0e571e268b0d3cd37d10" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "artwork_matches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "artworkId" character varying(128), "title" character varying(256), "artist" character varying(256), "confidence" double precision NOT NULL DEFAULT '0', "source" character varying(512), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "messageId" uuid, CONSTRAINT "PK_0573b35aae5d2896f3999b24512" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "image_insight_messages" ADD CONSTRAINT "FK_30f03922716e25cfaefb72a9e5f" FOREIGN KEY ("conversationId") REFERENCES "image_insight_conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "image_insight_conversations" ADD CONSTRAINT "FK_be40cc010dd6fd7c67bb8bebd91" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_sessions" ADD CONSTRAINT "FK_d0320df1059d8a029a460f4161d" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_messages" ADD CONSTRAINT "FK_a82476a8acdd6cd6936378cb72d" FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "artwork_matches" ADD CONSTRAINT "FK_4e09da4e92fddfef0d14f634d5e" FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  /** Revert the InitDatabase migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "artwork_matches" DROP CONSTRAINT "FK_4e09da4e92fddfef0d14f634d5e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_messages" DROP CONSTRAINT "FK_a82476a8acdd6cd6936378cb72d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_sessions" DROP CONSTRAINT "FK_d0320df1059d8a029a460f4161d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "image_insight_conversations" DROP CONSTRAINT "FK_be40cc010dd6fd7c67bb8bebd91"`,
    );
    await queryRunner.query(
      `ALTER TABLE "image_insight_messages" DROP CONSTRAINT "FK_30f03922716e25cfaefb72a9e5f"`,
    );
    await queryRunner.query(`DROP TABLE "artwork_matches"`);
    await queryRunner.query(`DROP TABLE "chat_messages"`);
    await queryRunner.query(`DROP TABLE "chat_sessions"`);
    await queryRunner.query(`DROP TABLE "image_insight_conversations"`);
    await queryRunner.query(`DROP TABLE "image_insight_messages"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
