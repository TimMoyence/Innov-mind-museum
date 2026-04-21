import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `notify_on_review_moderation` boolean column to the users table for the
 * review-moderation notification feature. Users opt-in to be notified by email
 * when an admin/moderator approves or rejects their review.
 *
 * Defaults to FALSE so existing users do not receive unsolicited emails — GDPR
 * Art. 6(1)(a) consent discipline. Zero downtime migration (NOT NULL with default).
 */
export class AddUserNotifyOnReviewModeration1776600000000 implements MigrationInterface {
  name = 'AddUserNotifyOnReviewModeration1776600000000';

  /** Apply the AddUserNotifyOnReviewModeration migration. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "notify_on_review_moderation" boolean NOT NULL DEFAULT false`,
    );
  }

  /** Revert the AddUserNotifyOnReviewModeration migration. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "notify_on_review_moderation"`);
  }
}
