import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readCsvCatalog } from '../../../scripts/catalog-ingest.helpers';
import { runIngest } from '../../../scripts/catalog-ingest';
import {
  makeCapturingEmbeddingRepo,
  makeStubEncoder,
} from '../../helpers/chat/visual-similarity/catalog-ingest.fixtures';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const MAESTRO_FIXTURES = join(__dirname, '../../../../museum-frontend/.maestro/fixtures');
const HEADER = 'qid,title,artist,license,museum_qid,image_url,image_file';
const MONA_LISA_URL = 'https://upload.wikimedia.org/mona-lisa.jpg';

function writeCatalog(rows: string[], header = HEADER): { dir: string; csv: string } {
  const dir = mkdtempSync(join(tmpdir(), 'catalog-csv-'));
  const csv = join(dir, 'catalog.csv');
  writeFileSync(csv, [header, ...rows].join('\n'));
  return { dir, csv };
}

async function ingest(csv: string): Promise<{
  inserted: number;
  repository: ReturnType<typeof makeCapturingEmbeddingRepo>;
  encoder: ReturnType<typeof makeStubEncoder>;
}> {
  const repository = makeCapturingEmbeddingRepo();
  const encoder = makeStubEncoder();
  const { inserted } = await runIngest({
    ...(await readCsvCatalog(csv)),
    licenseFilter: ['public-domain'],
    encoder,
    repository,
  });
  return { inserted, repository, encoder };
}

describe('catalog:ingest --from-csv', () => {
  const originalFetch = global.fetch;
  const fetchSpy = jest.fn();

  beforeEach(() => {
    global.fetch = fetchSpy;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    fetchSpy.mockReset();
  });

  it('MAESTRO-CHAT · ingère la Joconde de la fixture Maestro depuis sa photo locale, sans réseau', async () => {
    const { inserted, repository, encoder } = await ingest(join(MAESTRO_FIXTURES, 'catalog.csv'));

    expect(inserted).toBe(1);
    expect(repository.captured).toEqual([
      expect.objectContaining({
        qid: 'Q12418',
        license: 'public-domain',
        metadata: expect.objectContaining({
          title: 'Mona Lisa',
          artist: 'Leonardo da Vinci',
          museumQid: 'Q19675',
          imageUrl: expect.stringMatching(/^https:\/\/upload\.wikimedia\.org\/.+Mona_Lisa/),
        }),
      }),
    ]);
    expect(encoder.inputs.map(({ buffer }) => buffer)).toEqual([
      readFileSync(join(MAESTRO_FIXTURES, 'test-artwork.jpg')),
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('MAESTRO-CHAT · refuse un en-tête dont les colonnes ne sont pas dans l’ordre attendu', async () => {
    const { csv } = writeCatalog(
      [`Mona Lisa,Q12418,Leonardo da Vinci,public-domain,Q19675,${MONA_LISA_URL},m.jpg`],
      'title,qid,artist,license,museum_qid,image_url,image_file',
    );

    await expect(readCsvCatalog(csv)).rejects.toThrow(
      `catalog_ingest_csv_bad_header: expected ${HEADER}`,
    );
  });

  it('MAESTRO-CHAT · refuse une ligne dont le nombre de colonnes diffère de l’en-tête', async () => {
    const { csv } = writeCatalog(['Q12418,Mona Lisa, by Leonardo,public-domain,Q19675,x,y,z']);

    await expect(readCsvCatalog(csv)).rejects.toThrow('catalog_ingest_csv_bad_row: line 2');
  });

  it('MAESTRO-CHAT · refuse deux lignes qui partagent une même image', async () => {
    const { csv } = writeCatalog([
      `Q12418,Mona Lisa,Leonardo da Vinci,public-domain,Q19675,${MONA_LISA_URL},a.jpg`,
      `Q99999,Copy,Unknown,public-domain,Q19675,${MONA_LISA_URL},b.jpg`,
    ]);

    await expect(readCsvCatalog(csv)).rejects.toThrow('catalog_ingest_csv_bad_row: line 3');
  });

  it('MAESTRO-CHAT · écarte une photo locale plus lourde que le plafond des vignettes', async () => {
    const { dir, csv } = writeCatalog([
      `Q12418,Mona Lisa,Leonardo da Vinci,public-domain,Q19675,${MONA_LISA_URL},small.jpg`,
      `Q99999,Huge,Unknown,public-domain,Q19675,https://upload.wikimedia.org/huge.jpg,big.jpg`,
    ]);
    writeFileSync(join(dir, 'small.jpg'), Buffer.from([1, 2, 3]));
    writeFileSync(join(dir, 'big.jpg'), Buffer.alloc(2 * 1024 * 1024));

    const { repository, encoder } = await ingest(csv);

    expect(repository.captured.map(({ qid }) => qid)).toEqual(['Q12418']);
    expect(encoder.inputs.map(({ buffer }) => buffer)).toEqual([Buffer.from([1, 2, 3])]);
  });
});
