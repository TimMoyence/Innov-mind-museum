/**
 * RED — T4.4 — `createEmbeddingsAdapter(env)` factory.
 *
 * Locks down tasks.md T4.4 + design.md §9 D6:
 *   - `provider === 'siglip-onnx'` → returns a `SiglipOnnxAdapter` instance,
 *   - `provider === 'replicate'` + `replicateApiToken` set → returns a
 *     `ReplicateEmbeddingsAdapter` instance,
 *   - `provider === 'replicate'` without a token → throws (fail-fast),
 *   - any other provider value → throws.
 *
 * SUT does not yet exist. Tests are RED until Phase 4 lands.
 */

import { makeVisualSimilarityEnv } from '../../../helpers/chat/visual-similarity/visual-similarity-env.fixtures';
import type { AppEnv } from '@src/config/env.types';

// Mock onnxruntime-node so the SigLIP adapter's lazy session init does not
// crash at construction time (the factory only INSTANTIATES the class — the
// actual session is created lazily on first encode()).
jest.mock('onnxruntime-node', () => ({
  InferenceSession: { create: jest.fn().mockResolvedValue({ run: jest.fn() }) },
  Tensor: jest.fn(),
}));

// Silence logger noise.
jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// SUT — Phase 4 file, must not yet exist.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic SUT load
const { createEmbeddingsAdapter } = require('@modules/chat/adapters/secondary/embeddings/embeddings.factory') as {
  createEmbeddingsAdapter: (env: AppEnv) => unknown;
};

// SUT class names — the factory must hand back instances of these classes.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic SUT load
const { SiglipOnnxAdapter } = require('@modules/chat/adapters/secondary/embeddings/siglip-onnx.adapter') as {
  SiglipOnnxAdapter: new (...args: unknown[]) => unknown;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic SUT load
const { ReplicateEmbeddingsAdapter } = require('@modules/chat/adapters/secondary/embeddings/replicate.adapter') as {
  ReplicateEmbeddingsAdapter: new (...args: unknown[]) => unknown;
};

/** Minimal AppEnv stub — only the slice the factory reads is populated. */
const buildEnv = (visual: ReturnType<typeof makeVisualSimilarityEnv>): AppEnv =>
  ({ visualSimilarity: visual } as unknown as AppEnv);

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
      // Cast through unknown — we are deliberately exercising the runtime guard
      // for an out-of-band provider string. Not a real production value.
      makeVisualSimilarityEnv({
        provider: 'not-a-real-provider' as unknown as AppEnv['visualSimilarity']['provider'],
      }),
    );
    expect(() => createEmbeddingsAdapter(env)).toThrow();
  });
});
