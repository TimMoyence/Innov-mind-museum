import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds cached TTS audio reference columns to `chat_messages`.
 * - `audioUrl` (text, nullable): storage reference (`s3://<key>` or `local-audio://<file>`).
 * - `audioGeneratedAt` (timestamp, nullable): generation time, used to invalidate stale cache.
 * - `audioVoice` (varchar 32, nullable): voice id used at synthesis (e.g. `alloy`, `verse`).
 *
 * All columns nullable / no default — non-breaking for existing rows. Backfill not required.
 */
export class AddAudioToChatMessage1776593841594 implements MigrationInterface {
  name = 'AddAudioToChatMessage1776593841594';

  /** Adds audioUrl, audioGeneratedAt, audioVoice nullable columns. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chat_messages" ADD "audioUrl" text`);
    await queryRunner.query(`ALTER TABLE "chat_messages" ADD "audioGeneratedAt" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "chat_messages" ADD "audioVoice" character varying(32)`);
  }

  /** Drops audioUrl, audioGeneratedAt, audioVoice columns. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "chat_messages" DROP COLUMN "audioVoice"`);
    await queryRunner.query(`ALTER TABLE "chat_messages" DROP COLUMN "audioGeneratedAt"`);
    await queryRunner.query(`ALTER TABLE "chat_messages" DROP COLUMN "audioUrl"`);
  }
}
