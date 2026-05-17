/**
 * EmbeddingsPort factory (T4.4, design §9 D6). Branches on
 * env.visualSimilarity.provider: 'siglip-onnx' (default, local CPU) |
 * 'replicate' (R8 hosted fallback).
 *
 * Fail-fast: 'replicate' without REPLICATE_API_TOKEN throws at construction
 * (refuse silent degrade). Unknown provider also throws (exhaustiveness guard).
 * Pure — composition roots call once at boot.
 */

import { ReplicateEmbeddingsAdapter } from '@modules/chat/adapters/secondary/embeddings/replicate.adapter';
import { SiglipOnnxAdapter } from '@modules/chat/adapters/secondary/embeddings/siglip-onnx.adapter';

import type { EmbeddingsPort } from '@modules/chat/domain/ports/embeddings.port';
import type { AppEnv } from '@src/config/env.types';

/** Pinned to match the local ONNX model (vectors must stay comparable). */
const REPLICATE_SIGLIP_MODEL = 'lucataco/siglip-base-patch16-224';

/** @throws on missing REPLICATE_API_TOKEN (when provider='replicate') or unknown provider. */
export function createEmbeddingsAdapter(env: AppEnv): EmbeddingsPort {
  const visual = env.visualSimilarity;

  switch (visual.provider) {
    case 'siglip-onnx':
      return new SiglipOnnxAdapter({
        modelPath: visual.siglipOnnxModelPath,
        timeoutMs: visual.encodeTimeoutMs,
      });

    case 'replicate': {
      const apiToken = visual.replicateApiToken;
      if (apiToken === undefined || apiToken.trim() === '') {
        throw new Error(
          "createEmbeddingsAdapter: provider='replicate' requires REPLICATE_API_TOKEN to be set (env.visualSimilarity.replicateApiToken is missing/empty)",
        );
      }
      return new ReplicateEmbeddingsAdapter({
        apiToken,
        model: REPLICATE_SIGLIP_MODEL,
        timeoutMs: visual.encodeTimeoutMs,
      });
    }

    default: {
      // Exhaustiveness: never-narrow fails compile if a new provider lands without a case.
      const exhaustive: never = visual.provider;
      throw new Error(
        `createEmbeddingsAdapter: unknown EMBEDDINGS_PROVIDER value "${String(exhaustive)}"`,
      );
    }
  }
}
