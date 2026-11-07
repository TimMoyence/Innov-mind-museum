import { DEFAULT_MODEL_VERSION } from './compare.fixtures';
import { EMBEDDING_DIM } from './embedding.fixtures';

import type { EmbeddingsPort, EncodeInput } from '@modules/chat/domain/ports/embeddings.port';
import type {
  ArtworkEmbeddingRepository,
  ArtworkEmbeddingRow,
} from '@modules/chat/domain/visual-similarity/artworkEmbedding.repository.interface';

export const makeStubEncoder = (): EmbeddingsPort & { inputs: EncodeInput[] } => {
  const inputs: EncodeInput[] = [];
  return {
    inputs,
    encode: async (input) => {
      const vector = new Float32Array(EMBEDDING_DIM);
      vector[inputs.length % EMBEDDING_DIM] = 1;
      inputs.push(input);
      return { vector, modelVersion: DEFAULT_MODEL_VERSION };
    },
  };
};

export const makeCapturingEmbeddingRepo = (): ArtworkEmbeddingRepository & {
  captured: ArtworkEmbeddingRow[];
} => {
  const captured: ArtworkEmbeddingRow[] = [];
  return {
    captured,
    upsertBatch: async (rows) => {
      captured.push(...rows);
      return { inserted: rows.length, updated: 0, skipped: 0 };
    },
    findNearest: async () => [],
    findByQid: async () => null,
    count: async () => captured.length,
  };
};
