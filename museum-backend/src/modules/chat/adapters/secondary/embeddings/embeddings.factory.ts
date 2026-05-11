/**
 * Factory for the visual `EmbeddingsPort` adapter (T4.4 — design §9 D6).
 *
 * Selects the concrete encoder implementation at composition-root wiring time
 * based on `env.visualSimilarity.provider`:
 *
 *   - `'siglip-onnx'` (default) → {@link SiglipOnnxAdapter} backed by
 *     `onnxruntime-node` running SigLIP-base-patch16-224 locally on CPU.
 *   - `'replicate'`             → {@link ReplicateEmbeddingsAdapter} hitting
 *     the hosted Replicate Predictions API as the R8 fallback.
 *
 * Fail-fast posture:
 *   - `provider === 'replicate'` with an empty / missing `replicateApiToken`
 *     throws synchronously at construction. We refuse to silently degrade to
 *     an adapter that would later crash on every encode() — a missing token
 *     is an operator misconfiguration, surface it at boot.
 *   - Any provider value outside the {@link EmbeddingsProvider} union throws.
 *     Defends against an out-of-band `EMBEDDINGS_PROVIDER` slipping past the
 *     env resolver (e.g. raw env override in a test or a future provider
 *     constant added to the type without wiring here).
 *
 * Both branches share the single `encodeTimeoutMs` budget — the use case
 * does not differentiate provider when racing the encode against the request
 * deadline.
 *
 * The factory is intentionally pure (no I/O, no logging, no module-level
 * caching): repeated invocations build fresh adapter instances. Composition
 * roots call this once per process at boot.
 */

import { ReplicateEmbeddingsAdapter } from '@modules/chat/adapters/secondary/embeddings/replicate.adapter';
import { SiglipOnnxAdapter } from '@modules/chat/adapters/secondary/embeddings/siglip-onnx.adapter';

import type { EmbeddingsPort } from '@modules/chat/domain/ports/embeddings.port';
import type { AppEnv } from '@src/config/env.types';

/**
 * Replicate model identifier used when `provider === 'replicate'`.
 *
 * Pinned to the SigLIP-base-patch16-224 hosted port (matches the local ONNX
 * model so embeddings stay comparable). Stored as a constant rather than an
 * env var to keep the operator surface small — the only Replicate knob we
 * expose today is the API token. A future env override can be added if/when
 * we need to swap models per environment.
 */
const REPLICATE_SIGLIP_MODEL = 'lucataco/siglip-base-patch16-224';

/**
 * Builds the {@link EmbeddingsPort} adapter selected by
 * `env.visualSimilarity.provider`.
 *
 * @param env - Resolved application env (only the `visualSimilarity` slice is read).
 * @returns Concrete adapter implementing `EmbeddingsPort`.
 * @throws {Error} when `provider === 'replicate'` but `replicateApiToken` is
 *         missing/empty, or when `provider` is not a known value.
 */
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
      // Exhaustiveness check — narrows `visual.provider` to `never` when all
      // members of the EmbeddingsProvider union are handled above. If a new
      // provider value is added to the type without a matching case, this
      // assignment fails to compile, catching the omission at build time.
      const exhaustive: never = visual.provider;
      throw new Error(
        `createEmbeddingsAdapter: unknown EMBEDDINGS_PROVIDER value "${String(exhaustive)}"`,
      );
    }
  }
}
