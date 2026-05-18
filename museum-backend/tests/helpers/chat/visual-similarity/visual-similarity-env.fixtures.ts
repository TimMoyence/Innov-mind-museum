/**
 * Shared factory for the `visualSimilarity` slice of {@link AppEnv}, used by
 * the embeddings factory + adapter tests.
 *
 * Per CLAUDE.md test discipline (UFR-002), no test file may inline a
 * `visualSimilarity: { provider: …, … }` literal — call
 * {@link makeVisualSimilarityEnv} and override the dimensions you exercise.
 */
import type { AppEnv } from '@src/config/env.types';

/** Convenience alias matching the canonical {@link AppEnv} shape. */
export type VisualSimilarityEnv = AppEnv['visualSimilarity'];

/**
 * Build a deterministic `visualSimilarity` env slice with safe defaults
 * mirroring the production resolver in `src/config/env.ts`.
 *
 * Defaults:
 *   - `provider: 'siglip-onnx'` (self-host CPU path),
 *   - `replicateApiToken: undefined` (set when exercising the fallback),
 *   - dims/topN/topK aligned with `EMBEDDINGS_DIM=768`, `VISUAL_TOP_N=20`,
 *     `VISUAL_TOP_K_DEFAULT=5`,
 *   - `compareEnabled: true`, encode timeout 3s.
 *
 * @param overrides - Partial slice overrides.
 */
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
