import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * W3 (geo + walk + intra-musée) — adds `current_room` + `current_artwork_id`
 * (both nullable uuid) to `chat_sessions`. Populated by the cartel deeplink
 * flow (spec R19/R22) so the LLM prompt builder can emit a `[CURRENT ARTWORK]`
 * section keyed on the scanned IDs.
 *
 * Both columns are nullable + additive (no FK, no index in V1 — written
 * 1× per QR scan, read once per LLM prompt build, low cardinality).
 */
export class AddChatSessionCurrentRoomAndArtwork1779051900000 implements MigrationInterface {
  name = 'AddChatSessionCurrentRoomAndArtwork1779051900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "current_room" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "current_artwork_id" uuid`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chat_sessions" DROP COLUMN IF EXISTS "current_artwork_id"`,
    );
    await queryRunner.query(`ALTER TABLE "chat_sessions" DROP COLUMN IF EXISTS "current_room"`);
  }
}
