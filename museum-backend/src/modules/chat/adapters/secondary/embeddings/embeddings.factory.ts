import { ReplicateEmbeddingsAdapter } from '@modules/chat/adapters/secondary/embeddings/replicate.adapter';
import { SiglipOnnxAdapter } from '@modules/chat/adapters/secondary/embeddings/siglip-onnx.adapter';
import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';

import type { EmbeddingsPort } from '@modules/chat/domain/ports/embeddings.port';
import type { AppEnv } from '@src/config/env.types';

const REPLICATE_SIGLIP_MODEL = 'lucataco/siglip-base-patch16-224';

let activeAdapter: EmbeddingsPort | null = null;

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
      const exhaustive: never = visual.provider;
      throw new Error(
        `createEmbeddingsAdapter: unknown EMBEDDINGS_PROVIDER value "${String(exhaustive)}"`,
      );
    }
  }

  activeAdapter = adapter;
  return adapter;
}

export async function shutdownEmbeddingsAdapter(): Promise<void> {
  const adapter = activeAdapter;
  activeAdapter = null;
  if (!adapter?.shutdown) return;
  try {
    await adapter.shutdown();
  } catch (err) {
    logger.warn('embeddings_adapter_shutdown_failed', {
      error: errorMessage(err),
    });
  }
}

export function resetEmbeddingsAdapterRegistryForTests(): void {
  activeAdapter = null;
}
