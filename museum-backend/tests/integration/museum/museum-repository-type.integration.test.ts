import { MuseumRepositoryPg } from '@modules/museum/adapters/secondary/pg/museum.repository.pg';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration('M5 · le type de musée choisi est enregistré [integration, real PG]', () => {
  let harness: IntegrationHarness;
  let repo: MuseumRepositoryPg;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
    repo = new MuseumRepositoryPg(harness.dataSource);
  });

  beforeEach(async () => {
    await harness.reset();
  });

  it('création avec le type science, coordonnées comprises : relu tel quel', async () => {
    const created = await repo.create({
      name: 'Cité des sciences',
      slug: 'type-science',
      museumType: 'science',
      latitude: 48.8957,
      longitude: 2.3876,
    });

    const reloaded = await repo.findById(created.id);
    expect(reloaded?.museumType).toBe('science');
    expect(reloaded?.latitude).toBeCloseTo(48.8957);
    expect(reloaded?.longitude).toBeCloseTo(2.3876);
  });

  it('mise à jour du type : le nouveau type est relu', async () => {
    const created = await repo.create({ name: 'Carnavalet', slug: 'type-history' });

    await repo.update(created.id, { museumType: 'history' });

    const reloaded = await repo.findById(created.id);
    expect(reloaded?.museumType).toBe('history');
  });
});
