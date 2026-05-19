import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * W3 (geo + walk + intra-musée) — prep column for W1.6b (DEFERRED).
 *
 * Adds `room_id uuid` (nullable) to `artwork_knowledge` so the eventual
 * SigLIP-based `findArtworkByImage` use case can return the room the
 * detected artwork lives in. The column is the ONLY prep this run owes
 * Phase 7 (design.md §D5 — no scaffolding of port/adapter/use case).
 */
export class AddArtworkKnowledgeRoomId1779051950000 implements MigrationInterface {
  name = 'AddArtworkKnowledgeRoomId1779051950000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "artwork_knowledge" ADD COLUMN IF NOT EXISTS "room_id" uuid`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "artwork_knowledge" DROP COLUMN IF EXISTS "room_id"`);
  }
}
