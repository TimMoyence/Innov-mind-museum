import { ArtworkEmbeddingRepositoryPg } from '@modules/chat/adapters/secondary/persistence/artwork-embedding.repository.pg';

describe('RAZ-M1-DEAD-CODE', () => {
  it('RAZ-M1-DEAD-CODE · le dépôt des empreintes d’œuvres ne garde pas le compteur de la jauge Grafana retirée', () => {
    expect(Object.getOwnPropertyNames(ArtworkEmbeddingRepositoryPg.prototype)).not.toContain(
      'count',
    );
  });
});
