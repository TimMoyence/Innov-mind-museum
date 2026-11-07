import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddArtworkEmbeddingArtist1794040681012 implements MigrationInterface {
  name = 'AddArtworkEmbeddingArtist1794040681012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "artwork_embeddings" ADD "artist" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "artwork_embeddings" DROP COLUMN "artist"`);
  }
}
