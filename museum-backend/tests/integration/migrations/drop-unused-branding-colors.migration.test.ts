import { DropUnusedBrandingColors1794144071274 } from '@data/db/migrations/1794144071274-DropUnusedBrandingColors';
import { MuseumRepositoryPg } from '@modules/museum/adapters/secondary/pg/museum.repository.pg';
import {
  createIntegrationHarness,
  type IntegrationHarness,
} from 'tests/helpers/integration/integration-harness';

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration(
  'L4 · les couleurs secondaire et d’accent quittent la base [integration, real PG]',
  () => {
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

    async function migrate(): Promise<void> {
      const queryRunner = harness.dataSource.createQueryRunner();
      try {
        await new DropUnusedBrandingColors1794144071274().up(queryRunner);
      } finally {
        await queryRunner.release();
      }
    }

    it('un musée qui porte les deux couleurs garde sa couleur principale, son logo et ses autres réglages', async () => {
      const museum = await repo.create({
        name: 'Orsay',
        slug: 'branding-colors',
        config: {
          legacyKey: 'kept',
          branding: {
            primaryColor: '#38A169',
            logoUrl: 'https://cdn.museum.fr/logo.svg',
            secondaryColor: '#000000',
            accentColor: '#FFFFFF',
          },
        },
      });

      await migrate();

      const reloaded = await repo.findById(museum.id);
      expect(reloaded?.config).toEqual({
        legacyKey: 'kept',
        branding: { primaryColor: '#38A169', logoUrl: 'https://cdn.museum.fr/logo.svg' },
      });
    });

    it('un musée sans branding reste inchangé', async () => {
      const museum = await repo.create({
        name: 'Carnavalet',
        slug: 'no-branding',
        config: { legacyKey: 'kept' },
      });

      await migrate();

      const reloaded = await repo.findById(museum.id);
      expect(reloaded?.config).toEqual({ legacyKey: 'kept' });
    });

    it.each([null, 'legacy-theme', ['#000000']])(
      'un branding qui n’est pas un objet (%p) reste inchangé',
      async (branding) => {
        const museum = await repo.create({
          name: 'Cluny',
          slug: 'odd-branding',
          config: { branding },
        });

        await migrate();

        const reloaded = await repo.findById(museum.id);
        expect(reloaded?.config).toEqual({ branding });
      },
    );

    it('rejouée deux fois, la migration donne le même résultat', async () => {
      const museum = await repo.create({
        name: 'Guimet',
        slug: 'twice',
        config: { branding: { primaryColor: '#38A169', accentColor: '#FFFFFF' } },
      });

      await migrate();
      await migrate();

      const reloaded = await repo.findById(museum.id);
      expect(reloaded?.config).toEqual({ branding: { primaryColor: '#38A169' } });
    });
  },
);
