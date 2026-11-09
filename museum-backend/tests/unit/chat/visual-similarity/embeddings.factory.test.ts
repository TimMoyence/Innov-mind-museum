import { makeVisualSimilarityEnv } from '../../../helpers/chat/visual-similarity/visual-similarity-env.fixtures';
import type { AppEnv } from '@src/config/env.types';

jest.mock('onnxruntime-node', () => ({
  InferenceSession: { create: jest.fn().mockResolvedValue({ run: jest.fn() }) },
  Tensor: jest.fn(),
}));

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const { createEmbeddingsAdapter } =
  require('@modules/chat/adapters/secondary/embeddings/embeddings.factory') as {
    createEmbeddingsAdapter: (env: AppEnv) => unknown;
  };

const { SiglipOnnxAdapter } =
  require('@modules/chat/adapters/secondary/embeddings/siglip-onnx.adapter') as {
    SiglipOnnxAdapter: new (...args: unknown[]) => unknown;
  };
const { ReplicateEmbeddingsAdapter } =
  require('@modules/chat/adapters/secondary/embeddings/replicate.adapter') as {
    ReplicateEmbeddingsAdapter: new (...args: unknown[]) => unknown;
  };

const buildEnv = (visual: ReturnType<typeof makeVisualSimilarityEnv>): AppEnv =>
  ({ visualSimilarity: visual }) as unknown as AppEnv;

describe('createEmbeddingsAdapter (T4.4)', () => {
  it("returns a SiglipOnnxAdapter when provider === 'siglip-onnx'", () => {
    const env = buildEnv(makeVisualSimilarityEnv({ provider: 'siglip-onnx' }));
    const adapter = createEmbeddingsAdapter(env);
    expect(adapter).toBeInstanceOf(SiglipOnnxAdapter);
  });

  it("returns a ReplicateEmbeddingsAdapter when provider === 'replicate' and apiToken is set", () => {
    const env = buildEnv(
      makeVisualSimilarityEnv({
        provider: 'replicate',
        replicateApiToken: 'r8_token_abc',
      }),
    );
    const adapter = createEmbeddingsAdapter(env);
    expect(adapter).toBeInstanceOf(ReplicateEmbeddingsAdapter);
  });

  it("throws when provider === 'replicate' but apiToken is missing (fail-fast)", () => {
    const env = buildEnv(
      makeVisualSimilarityEnv({
        provider: 'replicate',
        replicateApiToken: undefined,
      }),
    );
    expect(() => createEmbeddingsAdapter(env)).toThrow();
  });

  it('throws on an invalid provider value', () => {
    const env = buildEnv(
      makeVisualSimilarityEnv({
        provider: 'not-a-real-provider' as unknown as AppEnv['visualSimilarity']['provider'],
      }),
    );
    expect(() => createEmbeddingsAdapter(env)).toThrow();
  });
});
