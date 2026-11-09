import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

import { Museum } from '@modules/museum/domain/museum/museum.entity';

type SeedMuseums = (
  dataSource: IntegrationHarness['dataSource'],
) => Promise<{ inserted: number; totalInDb: number }>;

let seedMuseums: SeedMuseums;

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration(
  'seed-museums.ts — `.orUpdate` conflict target must be column-array, not constraint-name string',
  () => {
    jest.setTimeout(300_000);

    let harness: IntegrationHarness;

    beforeAll(async () => {
      harness = await createIntegrationHarness();
      harness.scheduleStop();

      seedMuseums = (
        require('../../../scripts/seed-museums') as {
          seedMuseums: SeedMuseums;
        }
      ).seedMuseums;
    });

    beforeEach(async () => {
      await harness.reset();
    });

    it('runs to completion without throwing (R1, AC1) — the constraint-name regression', async () => {
      await expect(seedMuseums(harness.dataSource)).resolves.toMatchObject({
        totalInDb: expect.any(Number),
      });
    });

    it('is idempotent — re-running keeps total count stable, no constraint error (R1, AC1, AC2)', async () => {
      const first = await seedMuseums(harness.dataSource);
      const second = await seedMuseums(harness.dataSource);

      expect(second.totalInDb).toBe(first.totalInDb);

      const repo = harness.dataSource.getRepository(Museum);
      const stored = await repo.count();
      expect(stored).toBe(second.totalInDb);
    });

    it('backfills wikidata_qid on subsequent runs without clobbering edited fields (R2, R3)', async () => {
      await seedMuseums(harness.dataSource);
      const repo = harness.dataSource.getRepository(Museum);

      const aquitaine = await repo.findOneByOrFail({ slug: 'musee-d-aquitaine' });
      expect(aquitaine.wikidataQid).toBe('Q3329534');

      const editedName = `${aquitaine.name} — édité via admin UI`;
      await repo.update({ slug: 'musee-d-aquitaine' }, { name: editedName, wikidataQid: null });

      await seedMuseums(harness.dataSource);

      const reloaded = await repo.findOneByOrFail({ slug: 'musee-d-aquitaine' });
      expect(reloaded.wikidataQid).toBe('Q3329534');
      expect(reloaded.name).toBe(editedName);
    });
  },
);
