import { DEFAULT_MODEL_VERSION } from '../../../helpers/chat/visual-similarity/compare.fixtures';
import {
  EMBEDDING_DIM,
  makeNormalisedFloat32,
} from '../../../helpers/chat/visual-similarity/embedding.fixtures';
import { createIntegrationHarness } from 'tests/helpers/integration/integration-harness';

import { ArtworkEmbeddingRepositoryPg } from '@modules/chat/adapters/secondary/persistence/artwork-embedding.repository.pg';

import type { ArtworkEmbeddingRow } from '@modules/chat/domain/visual-similarity/artworkEmbedding.repository.interface';
import type { ArtworkMetadata } from '@modules/chat/domain/visual-similarity/compare-result.types';

const MONA_LISA_URL = 'https://upload.wikimedia.org/mona-lisa.jpg';

const monaLisaRow = (metadata: Partial<ArtworkMetadata> = {}): ArtworkEmbeddingRow => ({
  qid: 'Q12418',
  vector: makeNormalisedFloat32(0, EMBEDDING_DIM),
  metadata: { title: 'Mona Lisa', imageUrl: MONA_LISA_URL, museumQid: 'Q19675', ...metadata },
  imageSource: 'wikimedia',
  license: 'public-domain',
  embeddingModelVersion: DEFAULT_MODEL_VERSION,
});

describe('ArtworkEmbeddingRepositoryPg — artiste de la carte du catalogue', () => {
  let harness: Awaited<ReturnType<typeof createIntegrationHarness>>;
  let repo: ArtworkEmbeddingRepositoryPg;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
    repo = new ArtworkEmbeddingRepositoryPg(harness.dataSource);
  });

  beforeEach(async () => {
    await harness.reset();
  });

  it('MAESTRO-CHAT · la voisine trouvée rend l’artiste ingéré, que la carte du catalogue montre quand Wikidata se tait', async () => {
    await repo.upsertBatch([monaLisaRow({ artist: 'Leonardo da Vinci' })]);

    const [nearest] = await repo.findNearest(makeNormalisedFloat32(0, EMBEDDING_DIM), 1);

    expect(nearest?.metadata).toEqual({
      title: 'Mona Lisa',
      artist: 'Leonardo da Vinci',
      imageUrl: MONA_LISA_URL,
      museumQid: 'Q19675',
    });
  });

  it('MAESTRO-CHAT · une œuvre ingérée sans artiste n’en porte aucun', async () => {
    await repo.upsertBatch([monaLisaRow()]);

    const [nearest] = await repo.findNearest(makeNormalisedFloat32(0, EMBEDDING_DIM), 1);

    expect(nearest?.metadata).toEqual({
      title: 'Mona Lisa',
      imageUrl: MONA_LISA_URL,
      museumQid: 'Q19675',
    });
  });

  it('MAESTRO-CHAT · réingérer une œuvre déjà en base, même photo, lui apprend son artiste', async () => {
    await repo.upsertBatch([monaLisaRow()]);

    const second = await repo.upsertBatch([monaLisaRow({ artist: 'Leonardo da Vinci' })]);
    const [nearest] = await repo.findNearest(makeNormalisedFloat32(0, EMBEDDING_DIM), 1);

    expect(second).toEqual({ inserted: 0, updated: 1, skipped: 0 });
    expect(nearest?.metadata.artist).toBe('Leonardo da Vinci');
  });

  it('MAESTRO-CHAT · réingérer une œuvre identique ne réécrit rien', async () => {
    await repo.upsertBatch([monaLisaRow({ artist: 'Leonardo da Vinci' })]);

    await expect(repo.upsertBatch([monaLisaRow({ artist: 'Leonardo da Vinci' })])).resolves.toEqual(
      {
        inserted: 0,
        updated: 0,
        skipped: 1,
      },
    );
  });
});
