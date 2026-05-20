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
import { logger } from '@shared/logger/logger';

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

/**
 * TD-ONNX-02 — most-recent boot-time adapter, captured so the top-level
 * SIGTERM teardown (`index.ts:drainAsyncResources`) can call `.shutdown()`
 * without needing to plumb the adapter through every chat-module getter.
 * Single-adapter-per-process matches reality (composition root builds once),
 * but `shutdownEmbeddingsAdapter()` is idempotent so a missed boot is safe.
 *
 * Module-level state is fine because the factory is invoked once per process
 * at boot ; tests that recreate the factory across specs call
 * `resetEmbeddingsAdapterRegistryForTests()`.
 */
let activeAdapter: EmbeddingsPort | null = null;

/** @throws {Error} on missing REPLICATE_API_TOKEN (when provider='replicate') or unknown provider. */
export function createEmbeddingsAdapter(env: AppEnv): EmbeddingsPort {
  const visual = env.visualSimilarity;

  let adapter: EmbeddingsPort;
  switch (visual.provider) {
    case 'siglip-onnx':
      adapter = new SiglipOnnxAdapter({
        modelPath: visual.siglipOnnxModelPath,
        timeoutMs: visual.encodeTimeoutMs,
      });
      break;

    case 'replicate': {
      const apiToken = visual.replicateApiToken;
      if (apiToken === undefined || apiToken.trim() === '') {
        throw new Error(
          "createEmbeddingsAdapter: provider='replicate' requires REPLICATE_API_TOKEN to be set (env.visualSimilarity.replicateApiToken is missing/empty)",
        );
      }
      adapter = new ReplicateEmbeddingsAdapter({
        apiToken,
        model: REPLICATE_SIGLIP_MODEL,
        timeoutMs: visual.encodeTimeoutMs,
      });
      break;
    }

    default: {
      // Exhaustiveness: never-narrow fails compile if a new provider lands without a case.
      const exhaustive: never = visual.provider;
      throw new Error(
        `createEmbeddingsAdapter: unknown EMBEDDINGS_PROVIDER value "${String(exhaustive)}"`,
      );
    }
  }

  activeAdapter = adapter;
  return adapter;
}

/**
 * TD-ONNX-02 — graceful teardown hook called from the top-level SIGTERM
 * sequence (`index.ts:drainAsyncResources`). Idempotent + fail-open : a
 * missing adapter is a no-op ; a thrown `.shutdown()` is logged at warn-level
 * and swallowed so the rest of the teardown sequence finishes.
 */
export async function shutdownEmbeddingsAdapter(): Promise<void> {
  const adapter = activeAdapter;
  activeAdapter = null;
  if (!adapter?.shutdown) return;
  try {
    await adapter.shutdown();
  } catch (err) {
    logger.warn('embeddings_adapter_shutdown_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Test-only helper — clears the module-level adapter reference between specs
 * that build a fresh factory. Production code never calls this.
 */
export function resetEmbeddingsAdapterRegistryForTests(): void {
  activeAdapter = null;
}
