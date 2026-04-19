import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Schema drift sync — normalises FK constraints, renames user_memories columns
 * snake_case→camelCase, converts extracted_content.status to a proper enum,
 * and rebuilds all indexes to match current entity definitions.
 *
 * Generated via `migration-cli.cjs generate --name=Check` after Voice V1 entities.
 *
 * ⚠️  DATA SAFETY: The user_memories column renames are implemented as DROP + ADD
 * (TypeORM limitation — cannot detect renames). This destroys any existing rows'
 * data in those columns. Verify `SELECT COUNT(*) FROM user_memories` is 0 before
 * running in staging/prod. If non-empty, rewrite each pair as:
 *   ALTER TABLE user_memories RENAME COLUMN old_name TO "newName"
 *
 * Fully reversible via `down()` (down() has the same DROP + ADD caveat).
 */
export class Check1776593907869 implements MigrationInterface {
  name = 'Check1776593907869';

  /** Applies schema drift: column renames, enum conversion, FK / index rebuild. */
  // eslint-disable-next-line max-lines-per-function -- single atomic migration up() cannot be split
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "users_museum_id_fkey"`);
    await queryRunner.query(`ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_museum_id_fkey"`);
    await queryRunner.query(
      `ALTER TABLE "chat_sessions" DROP CONSTRAINT "chat_sessions_museum_id_fkey"`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_feedback" DROP CONSTRAINT "FK_message_feedback_message"`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_feedback" DROP CONSTRAINT "FK_message_feedback_user"`,
    );
    await queryRunner.query(`ALTER TABLE "user_memories" DROP CONSTRAINT "FK_user_memories_user"`);
    await queryRunner.query(
      `ALTER TABLE "museum_enrichment" DROP CONSTRAINT "FK_museum_enrichment_museum"`,
    );
    await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT "FK_reviews_userId"`);
    await queryRunner.query(
      `ALTER TABLE "support_tickets" DROP CONSTRAINT "FK_support_tickets_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_tickets" DROP CONSTRAINT "FK_support_tickets_assigned"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ticket_messages" DROP CONSTRAINT "FK_ticket_messages_ticket"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ticket_messages" DROP CONSTRAINT "FK_ticket_messages_sender"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_users_verification_token"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_users_museum_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_api_keys_museum_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_art_keywords_locale_hit_count"`);
    await queryRunner.query(`DROP INDEX "public"."idx_art_keywords_created_at"`);
    await queryRunner.query(`DROP INDEX "public"."idx_art_keywords_updated_at"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_chat_sessions_museum_id"`);
    await queryRunner.query(`DROP INDEX "public"."idx_message_feedback_message"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_message_reports_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_user_memories_user_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_artwork_knowledge_title_trgm"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_extracted_content_url"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_museums_active"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_museum_enrichment_name_trgm"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_reviews_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_reviews_userId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_reviews_createdAt"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_support_tickets_userId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_support_tickets_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_support_tickets_priority"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_support_tickets_updatedAt"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ticket_messages_ticket_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ticket_messages_createdAt"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_audit_logs_actor_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_audit_logs_action"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_audit_logs_target"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_audit_logs_created_at"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_audit_logs_actor_time"`);
    await queryRunner.query(
      `ALTER TABLE "message_feedback" DROP CONSTRAINT "CHK_message_feedback_value"`,
    );
    await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT "reviews_rating_check"`);
    await queryRunner.query(`ALTER TABLE "reviews" DROP CONSTRAINT "reviews_status_check"`);
    await queryRunner.query(
      `ALTER TABLE "art_keywords" DROP CONSTRAINT "UQ_art_keywords_keyword_locale"`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_feedback" DROP CONSTRAINT "UQ_message_feedback_message_user"`,
    );
    await queryRunner.query(`ALTER TABLE "user_memories" DROP COLUMN "total_artworks_discussed"`);
    await queryRunner.query(`ALTER TABLE "user_memories" DROP COLUMN "notable_artworks"`);
    await queryRunner.query(`ALTER TABLE "user_memories" DROP COLUMN "session_count"`);
    await queryRunner.query(`ALTER TABLE "user_memories" DROP COLUMN "last_session_id"`);
    await queryRunner.query(`ALTER TABLE "user_memories" DROP COLUMN "created_at"`);
    await queryRunner.query(`ALTER TABLE "user_memories" DROP COLUMN "updated_at"`);
    await queryRunner.query(`ALTER TABLE "user_memories" DROP COLUMN "preferred_expertise"`);
    await queryRunner.query(`ALTER TABLE "user_memories" DROP COLUMN "favorite_periods"`);
    await queryRunner.query(`ALTER TABLE "user_memories" DROP COLUMN "favorite_artists"`);
    await queryRunner.query(`ALTER TABLE "user_memories" DROP COLUMN "museums_visited"`);
    await queryRunner.query(
      `ALTER TABLE "user_memories" ADD "preferredExpertise" character varying(16) NOT NULL DEFAULT 'beginner'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_memories" ADD "favoritePeriods" text array NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_memories" ADD "favoriteArtists" text array NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_memories" ADD "museumsVisited" text array NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_memories" ADD "totalArtworksDiscussed" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_memories" ADD "notableArtworks" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_memories" ADD "sessionCount" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(`ALTER TABLE "user_memories" ADD "lastSessionId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "user_memories" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_memories" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(`ALTER TYPE "public"."user_role_enum" RENAME TO "user_role_enum_old"`);
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('visitor', 'moderator', 'museum_manager', 'admin')`,
    );
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."users_role_enum" USING "role"::"text"::"public"."users_role_enum"`,
    );
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'visitor'`);
    await queryRunner.query(`DROP TYPE "public"."user_role_enum_old"`);
    await queryRunner.query(
      `ALTER TABLE "chat_messages" DROP CONSTRAINT "FK_a82476a8acdd6cd6936378cb72d"`,
    );
    await queryRunner.query(`ALTER TABLE "chat_messages" ALTER COLUMN "sessionId" SET NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "message_reports" DROP CONSTRAINT "FK_7078835e4cc127f9394f40ac6e7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_reports" DROP CONSTRAINT "UQ_6ceb8cd066569cd443469dc7a25"`,
    );
    await queryRunner.query(`ALTER TABLE "message_reports" ALTER COLUMN "messageId" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "user_memories" ALTER COLUMN "version" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "extracted_content" DROP COLUMN "status"`);
    await queryRunner.query(
      `CREATE TYPE "public"."extracted_content_status_enum" AS ENUM('scraped', 'classified', 'failed', 'low_confidence')`,
    );
    await queryRunner.query(
      `ALTER TABLE "extracted_content" ADD "status" "public"."extracted_content_status_enum" NOT NULL DEFAULT 'scraped'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d187a3fe728bea63c3fc947824" ON "extracted_content" ("url") `,
    );
    await queryRunner.query(
      `ALTER TABLE "message_feedback" ADD CONSTRAINT "UQ_8b024f4d3ba375641745cbf03e5" UNIQUE ("messageId", "userId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_reports" ADD CONSTRAINT "UQ_6ceb8cd066569cd443469dc7a25" UNIQUE ("messageId", "userId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_messages" ADD CONSTRAINT "FK_a82476a8acdd6cd6936378cb72d" FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_feedback" ADD CONSTRAINT "FK_0b9283515f07ae088c9e0328609" FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_reports" ADD CONSTRAINT "FK_7078835e4cc127f9394f40ac6e7" FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_memories" ADD CONSTRAINT "FK_3ac930c10d5fef8dd82b50460b8" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "museum_enrichment" ADD CONSTRAINT "FK_77de702b8a47af6a79f24edb2c2" FOREIGN KEY ("museumId") REFERENCES "museums"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  /** Reverts schema drift: column renames, enum revert, FK / index restore. */
  // eslint-disable-next-line max-lines-per-function -- single atomic migration down() cannot be split
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "museum_enrichment" DROP CONSTRAINT "FK_77de702b8a47af6a79f24edb2c2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_memories" DROP CONSTRAINT "FK_3ac930c10d5fef8dd82b50460b8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_reports" DROP CONSTRAINT "FK_7078835e4cc127f9394f40ac6e7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_feedback" DROP CONSTRAINT "FK_0b9283515f07ae088c9e0328609"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_messages" DROP CONSTRAINT "FK_a82476a8acdd6cd6936378cb72d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_reports" DROP CONSTRAINT "UQ_6ceb8cd066569cd443469dc7a25"`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_feedback" DROP CONSTRAINT "UQ_8b024f4d3ba375641745cbf03e5"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_d187a3fe728bea63c3fc947824"`);
    await queryRunner.query(`ALTER TABLE "extracted_content" DROP COLUMN "status"`);
    await queryRunner.query(`DROP TYPE "public"."extracted_content_status_enum"`);
    await queryRunner.query(
      `ALTER TABLE "extracted_content" ADD "status" character varying(20) NOT NULL DEFAULT 'scraped'`,
    );
    await queryRunner.query(`ALTER TABLE "user_memories" ALTER COLUMN "version" SET DEFAULT '1'`);
    await queryRunner.query(`ALTER TABLE "message_reports" ALTER COLUMN "messageId" DROP NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "message_reports" ADD CONSTRAINT "UQ_6ceb8cd066569cd443469dc7a25" UNIQUE ("userId", "messageId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_reports" ADD CONSTRAINT "FK_7078835e4cc127f9394f40ac6e7" FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`ALTER TABLE "chat_messages" ALTER COLUMN "sessionId" DROP NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "chat_messages" ADD CONSTRAINT "FK_a82476a8acdd6cd6936378cb72d" FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."user_role_enum_old" AS ENUM('visitor', 'moderator', 'museum_manager', 'admin')`,
    );
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."user_role_enum_old" USING "role"::"text"::"public"."user_role_enum_old"`,
    );
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'visitor'`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(`ALTER TYPE "public"."user_role_enum_old" RENAME TO "user_role_enum"`);
    await queryRunner.query(`ALTER TABLE "user_memories" DROP COLUMN "updatedAt"`);
    await queryRunner.query(`ALTER TABLE "user_memories" DROP COLUMN "createdAt"`);
    await queryRunner.query(`ALTER TABLE "user_memories" DROP COLUMN "lastSessionId"`);
    await queryRunner.query(`ALTER TABLE "user_memories" DROP COLUMN "sessionCount"`);
    await queryRunner.query(`ALTER TABLE "user_memories" DROP COLUMN "notableArtworks"`);
    await queryRunner.query(`ALTER TABLE "user_memories" DROP COLUMN "totalArtworksDiscussed"`);
    await queryRunner.query(`ALTER TABLE "user_memories" DROP COLUMN "museumsVisited"`);
    await queryRunner.query(`ALTER TABLE "user_memories" DROP COLUMN "favoriteArtists"`);
    await queryRunner.query(`ALTER TABLE "user_memories" DROP COLUMN "favoritePeriods"`);
    await queryRunner.query(`ALTER TABLE "user_memories" DROP COLUMN "preferredExpertise"`);
    await queryRunner.query(
      `ALTER TABLE "user_memories" ADD "museums_visited" text array NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_memories" ADD "favorite_artists" text array NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_memories" ADD "favorite_periods" text array NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_memories" ADD "preferred_expertise" character varying(16) NOT NULL DEFAULT 'beginner'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_memories" ADD "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_memories" ADD "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(`ALTER TABLE "user_memories" ADD "last_session_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "user_memories" ADD "session_count" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_memories" ADD "notable_artworks" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_memories" ADD "total_artworks_discussed" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_feedback" ADD CONSTRAINT "UQ_message_feedback_message_user" UNIQUE ("messageId", "userId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "art_keywords" ADD CONSTRAINT "UQ_art_keywords_keyword_locale" UNIQUE ("keyword", "locale")`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "reviews_status_check" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])))`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_check" CHECK (((rating >= 1) AND (rating <= 5)))`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_feedback" ADD CONSTRAINT "CHK_message_feedback_value" CHECK (((value)::text = ANY ((ARRAY['positive'::character varying, 'negative'::character varying])::text[])))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_actor_time" ON "audit_logs" ("actor_id", "created_at") WHERE (actor_id IS NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_created_at" ON "audit_logs" ("created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_target" ON "audit_logs" ("target_type", "target_id") WHERE (target_type IS NOT NULL)`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_audit_logs_action" ON "audit_logs" ("action") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_actor_id" ON "audit_logs" ("actor_id") WHERE (actor_id IS NOT NULL)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ticket_messages_createdAt" ON "ticket_messages" ("ticket_id", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ticket_messages_ticket_id" ON "ticket_messages" ("ticket_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_support_tickets_updatedAt" ON "support_tickets" ("updatedAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_support_tickets_priority" ON "support_tickets" ("priority") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_support_tickets_status" ON "support_tickets" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_support_tickets_userId" ON "support_tickets" ("userId") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_reviews_createdAt" ON "reviews" ("createdAt") `);
    await queryRunner.query(`CREATE INDEX "IDX_reviews_userId" ON "reviews" ("userId") `);
    await queryRunner.query(`CREATE INDEX "IDX_reviews_status" ON "reviews" ("status") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_museum_enrichment_name_trgm" ON "museum_enrichment" ("name") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_museums_active" ON "museums" ("id") WHERE (is_active = true)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_extracted_content_url" ON "extracted_content" ("url") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_artwork_knowledge_title_trgm" ON "artwork_knowledge" ("title") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_memories_user_id" ON "user_memories" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_message_reports_status" ON "message_reports" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_message_feedback_message" ON "message_feedback" ("messageId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_chat_sessions_museum_id" ON "chat_sessions" ("museum_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_art_keywords_updated_at" ON "art_keywords" ("updatedAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_art_keywords_created_at" ON "art_keywords" ("createdAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_art_keywords_locale_hit_count" ON "art_keywords" ("locale", "hitCount") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_api_keys_museum_id" ON "api_keys" ("museum_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_users_museum_id" ON "users" ("museum_id") `);
    await queryRunner.query(
      `CREATE INDEX "idx_users_verification_token" ON "users" ("verification_token") WHERE (verification_token IS NOT NULL)`,
    );
    await queryRunner.query(
      `ALTER TABLE "ticket_messages" ADD CONSTRAINT "FK_ticket_messages_sender" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ticket_messages" ADD CONSTRAINT "FK_ticket_messages_ticket" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_tickets" ADD CONSTRAINT "FK_support_tickets_assigned" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_tickets" ADD CONSTRAINT "FK_support_tickets_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "FK_reviews_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "museum_enrichment" ADD CONSTRAINT "FK_museum_enrichment_museum" FOREIGN KEY ("museumId") REFERENCES "museums"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_memories" ADD CONSTRAINT "FK_user_memories_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_feedback" ADD CONSTRAINT "FK_message_feedback_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "message_feedback" ADD CONSTRAINT "FK_message_feedback_message" FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_museum_id_fkey" FOREIGN KEY ("museum_id") REFERENCES "museums"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_museum_id_fkey" FOREIGN KEY ("museum_id") REFERENCES "museums"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "users_museum_id_fkey" FOREIGN KEY ("museum_id") REFERENCES "museums"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }
}
