import 'reflect-metadata';
import { DataSource } from 'typeorm';

import { ArtKeyword } from '@modules/chat/domain/artKeyword.entity';
import { TypeOrmArtKeywordRepository } from '@modules/chat/adapters/secondary/artKeyword.repository.typeorm';

/**
 * Atomic UPSERT spec for the singular-keyword path. The test asserts the
 * `INSERT ... ON CONFLICT ... DO UPDATE` pattern by running repeated calls
 * sequentially against a real Postgres test DB. Concurrency simulation
 * needs an isolated DataSource per worker — out of scope for unit tests.
 *
 * Skipped by default — needs a live `TEST_DATABASE_URL`. Run via
 *   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5433/museumAI \
 *     pnpm test -- --testPathPattern=art-keyword-repo-atomic-upsert
 */
describe.skip('TypeOrmArtKeywordRepository.upsert (atomic)', () => {
  let dataSource: DataSource;
  let repo: TypeOrmArtKeywordRepository;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: process.env.TEST_DATABASE_URL,
      entities: [ArtKeyword],
      synchronize: false,
    });
    await dataSource.initialize();
    repo = new TypeOrmArtKeywordRepository(dataSource);
    // Clean target rows before each suite run.
    await dataSource.query(
      `DELETE FROM "art_keywords" WHERE "keyword" = 'atomic_test_keyword' AND "locale" = 'fr'`,
    );
  });

  afterAll(async () => {
    if (dataSource.isInitialized) {
      await dataSource.query(
        `DELETE FROM "art_keywords" WHERE "keyword" = 'atomic_test_keyword' AND "locale" = 'fr'`,
      );
      await dataSource.destroy();
    }
  });

  it('returns hitCount=1 on first call', async () => {
    const result = await repo.upsert('atomic_test_keyword', 'fr');
    expect(result.hitCount).toBe(1);
    expect(result.keyword).toBe('atomic_test_keyword');
    expect(result.locale).toBe('fr');
  });

  it('atomically increments hitCount on repeated calls (single SQL round-trip)', async () => {
    // First call seeded by previous test.
    const second = await repo.upsert('atomic_test_keyword', 'fr');
    expect(second.hitCount).toBe(2);
    const third = await repo.upsert('atomic_test_keyword', 'fr');
    expect(third.hitCount).toBe(3);
  });
});
