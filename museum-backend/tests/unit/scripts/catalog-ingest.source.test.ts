import { join } from 'node:path';

import { ingestSourceOf } from '../../../scripts/catalog-ingest';
import { downloadThumbnail } from '../../../scripts/catalog-ingest.helpers';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const MAESTRO_CSV = join(__dirname, '../../../../museum-frontend/.maestro/fixtures/catalog.csv');

describe('catalog:ingest — source des œuvres', () => {
  it('MAESTRO-CHAT · --museum seul télécharge les vignettes Wikimedia par le chemin poli', async () => {
    const source = await ingestSourceOf({ museumQids: ['Q19675'] });

    expect(source.museumQids).toEqual(['Q19675']);
    expect(source.download).toBe(downloadThumbnail);
  });

  it('MAESTRO-CHAT · --from-csv seul prend les musées du fichier', async () => {
    const source = await ingestSourceOf({ museumQids: [], fromCsv: MAESTRO_CSV });

    expect(source.museumQids).toEqual(['Q19675']);
  });

  it('MAESTRO-CHAT · --from-csv avec --museum est refusé', async () => {
    await expect(ingestSourceOf({ museumQids: ['Q19675'], fromCsv: MAESTRO_CSV })).rejects.toThrow(
      'catalog_ingest_conflicting_input: pass --from-csv or --museum, not both',
    );
  });
});
