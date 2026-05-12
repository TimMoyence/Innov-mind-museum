import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds `users.date_of_birth` (nullable DATE) so the registration flow can
 * enforce the French digital majority (15 years — CNIL Délibération 2021-018).
 *
 * Nullable so legacy accounts that pre-date the age-gate aren't invalidated.
 * The application code rejects new registrations with DOB < 15y at insert time.
 */
export class AddUserDateOfBirth1778572103132 implements MigrationInterface {
    name = 'AddUserDateOfBirth1778572103132'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "date_of_birth" date`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "date_of_birth"`);
    }

}
