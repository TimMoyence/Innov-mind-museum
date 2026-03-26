import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 *
 */
export class AddSocialAccountsAndNullablePassword1773823617791 implements MigrationInterface {
    name = 'AddSocialAccountsAndNullablePassword1773823617791'

    /** Apply the AddSocialAccountsAndNullablePassword migration. */
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.startTransaction();
        try {
            await queryRunner.query(`ALTER TABLE "auth_refresh_tokens" DROP CONSTRAINT "FK_auth_refresh_tokens_user"`);
            await queryRunner.query(`DROP INDEX "public"."IDX_auth_refresh_tokens_userId"`);
            await queryRunner.query(`DROP INDEX "public"."IDX_auth_refresh_tokens_familyId"`);
            await queryRunner.query(`DROP INDEX "public"."IDX_auth_refresh_tokens_expiresAt"`);
            await queryRunner.query(`CREATE TABLE "social_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" integer NOT NULL, "provider" character varying(20) NOT NULL, "providerUserId" character varying(255) NOT NULL, "email" character varying(255), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_e2851f6842b0fa1d9e030cb8355" UNIQUE ("provider", "providerUserId"), CONSTRAINT "PK_e9e58d2d8e9fafa20af914d9750" PRIMARY KEY ("id"))`);
            await queryRunner.query(`CREATE INDEX "IDX_7de933c3670ec71c68aca0afd5" ON "social_accounts" ("userId") `);
            // message_reports already created by AddMessageReports migration — skip if exists
            const messageReportsExists = await queryRunner.query(
                `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'message_reports'`,
            );
            if (!messageReportsExists.length) {
                await queryRunner.query(`CREATE TABLE "message_reports" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" integer NOT NULL, "reason" character varying(20) NOT NULL, "comment" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "messageId" uuid, CONSTRAINT "UQ_6ceb8cd066569cd443469dc7a25" UNIQUE ("messageId", "userId"), CONSTRAINT "PK_59df246edfc1d9203ff93886000" PRIMARY KEY ("id"))`);
            }
            await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL`);
            await queryRunner.query(`ALTER TABLE "auth_refresh_tokens" ADD CONSTRAINT "FK_4cee0cefed5da7cdacff696683c" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
            await queryRunner.query(`ALTER TABLE "social_accounts" ADD CONSTRAINT "FK_7de933c3670ec71c68aca0afd56" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
            // FK may already exist from AddMessageReports migration
            const fkExists = await queryRunner.query(
                `SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'FK_7078835e4cc127f9394f40ac6e7'`,
            );
            if (!fkExists.length) {
                await queryRunner.query(`ALTER TABLE "message_reports" ADD CONSTRAINT "FK_7078835e4cc127f9394f40ac6e7" FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
            }
            await queryRunner.commitTransaction();
        } catch (error) {
            await queryRunner.rollbackTransaction();
            throw error;
        }
    }

    /** Revert the AddSocialAccountsAndNullablePassword migration. */
    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "message_reports" DROP CONSTRAINT "FK_7078835e4cc127f9394f40ac6e7"`);
        await queryRunner.query(`ALTER TABLE "social_accounts" DROP CONSTRAINT "FK_7de933c3670ec71c68aca0afd56"`);
        await queryRunner.query(`ALTER TABLE "auth_refresh_tokens" DROP CONSTRAINT "FK_4cee0cefed5da7cdacff696683c"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "password" SET NOT NULL`);
        await queryRunner.query(`DROP TABLE "message_reports"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7de933c3670ec71c68aca0afd5"`);
        await queryRunner.query(`DROP TABLE "social_accounts"`);
        await queryRunner.query(`CREATE INDEX "IDX_auth_refresh_tokens_expiresAt" ON "auth_refresh_tokens" ("expiresAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_auth_refresh_tokens_familyId" ON "auth_refresh_tokens" ("familyId") `);
        await queryRunner.query(`CREATE INDEX "IDX_auth_refresh_tokens_userId" ON "auth_refresh_tokens" ("userId") `);
        await queryRunner.query(`ALTER TABLE "auth_refresh_tokens" ADD CONSTRAINT "FK_auth_refresh_tokens_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
