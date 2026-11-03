import { TypeOrmArtKeywordRepository } from '@modules/chat/adapters/secondary/persistence/artKeyword.repository.typeorm';

import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

describe('RAZ-M1-KEYWORD-UPSERT', () => {
  jest.setTimeout(300_000);

  let harness: IntegrationHarness;
  let repo: TypeOrmArtKeywordRepository;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
    repo = new TypeOrmArtKeywordRepository(harness.dataSource);
  });

  beforeEach(async () => {
    await harness.reset();
  });

  it('RAZ-M1-KEYWORD-UPSERT · un mot-clé déjà appris incrémente son compteur au lieu d’échouer', async () => {
    await repo.upsert('Monet', 'fr');
    const second = await repo.upsert(' monet ', 'fr');

    expect(second.hitCount).toBe(2);
    expect(await repo.findByLocale('fr')).toHaveLength(1);
  });

  it('RAZ-M1-KEYWORD-UPSERT · l’apprentissage groupé fusionne avec les mots-clés existants par langue', async () => {
    await repo.upsert('Monet', 'fr');
    await repo.bulkUpsert(['Monet', 'Rodin'], 'fr');
    await repo.bulkUpsert(['Monet'], 'en');

    const counts = (await repo.findByLocale('%')).map((row) => [
      row.keyword,
      row.locale,
      row.hitCount,
    ]);

    expect(counts).toEqual(
      expect.arrayContaining([
        ['monet', 'fr', 2],
        ['rodin', 'fr', 1],
        ['monet', 'en', 1],
      ]),
    );
    expect(counts).toHaveLength(3);
  });
});
