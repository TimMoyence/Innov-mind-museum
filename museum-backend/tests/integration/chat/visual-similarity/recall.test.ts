import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

import { createIntegrationHarness } from 'tests/helpers/integration/integration-harness';
import {
  EMBEDDING_DIM,
  makeCenterCroppedQueryBuffer,
  makeNormalisedFloat32,
} from '../../../helpers/chat/visual-similarity/embedding.fixtures';

import type { EmbeddingsPort } from '@modules/chat/domain/ports/embeddings.port';
import type {
  ArtworkEmbeddingRepository,
  ArtworkEmbeddingRow,
} from '@modules/chat/domain/visual-similarity/artworkEmbedding.repository.interface';

interface RecallPair {
  inputImagePath: string;
  expectedQid: string;
  title: string;
  museumQid: string;
}

interface RecallFixture {
  _meta: {
    currentSize: number;
    modelVersion: string;
  };
  pairs: RecallPair[];
}

const ONNX_MODEL_PATH =
  process.env.SIGLIP_ONNX_MODEL_PATH ?? './models/siglip2-base-patch16-224.onnx';
const MODEL_AVAILABLE = existsSync(resolve(ONNX_MODEL_PATH));
const FIXTURE_PATH = resolve(__dirname, '../../../fixtures/recall-eval.json');
const REPO_ROOT = resolve(__dirname, '../../../..');

const describeFn = MODEL_AVAILABLE ? describe : describe.skip;

const RECALL_FLOOR = 0.85;
const TOP_K = 5;
const NUM_DISTRACTORS = 1_000;
const CROP_FRACTION = 0.5;
const SELF_MATCH_CEILING = 0.999;

const cosine = (a: Float32Array, b: Float32Array): number => {
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
  }
  return dot;
};

describeFn('recall@5 (T7.4 — crop-robustness, real ONNX model + pgvector)', () => {
  let harness: Awaited<ReturnType<typeof createIntegrationHarness>>;
  let repo: ArtworkEmbeddingRepository;
  let encoder: EmbeddingsPort;
  let fixture: RecallFixture;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();

    const { ArtworkEmbeddingRepositoryPg } =
      require('@modules/chat/adapters/secondary/persistence/artwork-embedding.repository.pg') as {
        ArtworkEmbeddingRepositoryPg: new (
          ds: import('typeorm').DataSource,
        ) => ArtworkEmbeddingRepository;
      };
    repo = new ArtworkEmbeddingRepositoryPg(harness.dataSource);

    const { SiglipOnnxAdapter } =
      require('@modules/chat/adapters/secondary/embeddings/siglip-onnx.adapter') as {
        SiglipOnnxAdapter: new (args: { modelPath: string; timeoutMs: number }) => EmbeddingsPort;
      };
    encoder = new SiglipOnnxAdapter({
      modelPath: ONNX_MODEL_PATH,
      timeoutMs: 30_000,
    });

    fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as RecallFixture;
  });

  afterAll(async () => {
    await encoder?.shutdown?.();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  it(`reaches recall@5 ≥ ${String(RECALL_FLOOR)} on cropped queries (no self-match)`, async () => {
    expect(fixture.pairs.length).toBeGreaterThan(0);

    const catalogRows: ArtworkEmbeddingRow[] = [];
    const fullVectors = new Map<string, Float32Array>();

    for (const pair of fixture.pairs) {
      const imagePath = resolve(REPO_ROOT, pair.inputImagePath);
      if (!existsSync(imagePath)) {
        throw new Error(`recall fixture image missing: ${pair.inputImagePath}`);
      }
      const fullBuffer = readFileSync(imagePath);
      const { vector, modelVersion } = await encoder.encode({
        buffer: fullBuffer,
        mimeType: 'image/jpeg',
      });
      fullVectors.set(pair.expectedQid, vector);
      catalogRows.push({
        qid: pair.expectedQid,
        vector,
        metadata: {
          title: pair.title,
          imageUrl: `https://example.org/${pair.expectedQid}.jpg`,
          museumQid: pair.museumQid,
        },
        imageSource: 'wikimedia',
        license: 'public-domain',
        embeddingModelVersion: modelVersion,
      });
    }

    const distractors: ArtworkEmbeddingRow[] = Array.from({ length: NUM_DISTRACTORS }, (_, i) => ({
      qid: `Q${9_000_000 + i}`,
      vector: makeNormalisedFloat32(i + 100, EMBEDDING_DIM),
      metadata: {
        title: `Distractor ${i}`,
        imageUrl: `https://example.org/distractor-${i}.jpg`,
      },
      imageSource: 'wikimedia',
      license: 'public-domain',
      embeddingModelVersion: fixture._meta.modelVersion,
    }));

    await repo.upsertBatch([...catalogRows, ...distractors]);

    let hits = 0;
    const selfCosines: number[] = [];

    for (const pair of fixture.pairs) {
      const imagePath = resolve(REPO_ROOT, pair.inputImagePath);
      const fullBuffer = readFileSync(imagePath);
      const cropBuffer = await makeCenterCroppedQueryBuffer(fullBuffer, CROP_FRACTION);
      const { vector: queryVector } = await encoder.encode({
        buffer: cropBuffer,
        mimeType: 'image/jpeg',
      });

      const storedVector = fullVectors.get(pair.expectedQid);
      expect(storedVector).toBeDefined();
      if (storedVector) {
        selfCosines.push(cosine(queryVector, storedVector));
      }

      const nearest = await repo.findNearest(queryVector, TOP_K);
      if (nearest.map((r) => r.qid).includes(pair.expectedQid)) {
        hits += 1;
      }
    }

    const maxSelfCosine = Math.max(...selfCosines);
    expect(maxSelfCosine).toBeLessThan(SELF_MATCH_CEILING);

    const recall = hits / fixture.pairs.length;
    expect(recall).toBeGreaterThanOrEqual(RECALL_FLOOR);
  });
});
