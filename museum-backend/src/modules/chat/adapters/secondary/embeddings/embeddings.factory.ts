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

/**
 * Replicate hosted fallback slug. NOTE: pinned to SigLIP v1 because Replicate
 * did not publish a `siglip2-base-patch16-224` model at the time of the C9.14
 * upgrade (verified 2026-05-18, HTTP 404 on `lucataco/siglip2-base-patch16-224`).
 * The local SigLIP-2 adapter is the primary path; the Replicate fallback now
 * lags one model generation and emits a distinct `modelVersion`
 * (`siglip-base-patch16-224@replicate-v1`) — cross-comparing rows between the
 * two adapters is unsupported by design (the `modelVersion` column is the
 * stale-row signal). Bump this slug once Replicate ships SigLIP-2.
 */
const REPLICATE_SIGLIP_MODEL = 'lucataco/siglip-base-patch16-224';

/** @throws {Error} on missing REPLICATE_API_TOKEN (when provider='replicate') or unknown provider. */
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
