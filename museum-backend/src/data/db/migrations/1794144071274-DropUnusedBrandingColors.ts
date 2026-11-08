import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DropUnusedBrandingColors1794144071274 implements MigrationInterface {
  name = 'DropUnusedBrandingColors1794144071274';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "museums"
       SET "config" = jsonb_set("config", '{branding}', ("config" -> 'branding') - 'secondaryColor' - 'accentColor')
       WHERE jsonb_typeof("config" -> 'branding') = 'object'
         AND ("config" -> 'branding') ?| ARRAY['secondaryColor', 'accentColor']`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    await Promise.resolve();
  }
}
