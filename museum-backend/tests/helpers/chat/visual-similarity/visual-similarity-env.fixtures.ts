import type { AppEnv } from '@src/config/env.types';

export type VisualSimilarityEnv = AppEnv['visualSimilarity'];

export const makeVisualSimilarityEnv = (
  overrides: Partial<VisualSimilarityEnv> = {},
): VisualSimilarityEnv => ({
  provider: 'siglip-onnx',
  siglipOnnxModelPath: './models/siglip2-base-patch16-224.onnx',
  replicateApiToken: undefined,
  embeddingsDim: 768,
  topN: 20,
  topKDefault: 5,
  wVisual: 0.7,
  wMeta: 0.3,
  fallbackVisualThreshold: 0.4,
  embeddingsCacheTtlMs: 3_600_000,
  encodeTimeoutMs: 3_000,
  ...overrides,
});
