import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds onboarding_completed column to users table. */
export class AddOnboardingCompleted1774732556635 implements MigrationInterface {
  name = 'AddOnboardingCompleted1774732556635';

  /** Add onboarding_completed boolean column to users table. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "onboarding_completed" boolean NOT NULL DEFAULT false`,
    );
  }

  /** Revert: drop onboarding_completed column. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "onboarding_completed"`);
  }
}
