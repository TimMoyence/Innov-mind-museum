import { getLangfuse } from '@shared/observability/langfuse.client';
import { safeTrace } from '@shared/observability/safeTrace';
import { env } from '@src/config/env';

import type {
  OrchestratorInput,
  OrchestratorOutput,
} from '@modules/chat/domain/ports/chat-orchestrator.port';

/**
 * Wraps an orchestration call with a top-level Langfuse trace. Fail-open via
 * `safeTrace`: any exception in the Langfuse SDK is swallowed and the chat
 * path continues. When `LANGFUSE_ENABLED=false` (default), `getLangfuse()`
 * returns `null` and this is a near-zero-cost no-op (one nullable read).
 */
export async function withLangfuseTrace<T extends OrchestratorOutput>(
  name: string,
  input: OrchestratorInput,
  fn: () => Promise<T>,
): Promise<T> {
  const lf = getLangfuse();
  const baseMeta = {
    provider: env.llm.provider,
    model: env.llm.model,
    requestId: input.requestId,
    intent: input.intent,
    hasImage: !!input.image,
    historyLength: input.history.length,
    locale: input.locale,
    museumMode: input.museumMode,
  };
  const trace = safeTrace('langfuse.trace.create', () => lf?.trace({ name, metadata: baseMeta }));
  const startedAt = Date.now();
  try {
    const result = await fn();
    safeTrace('langfuse.trace.update', () => {
      trace?.update({
        output: { textLength: result.text.length },
        metadata: { ...baseMeta, latencyMs: Date.now() - startedAt },
      });
    });
    return result;
  } catch (err) {
    safeTrace('langfuse.trace.update.error', () => {
      trace?.update({
        metadata: {
          ...baseMeta,
          latencyMs: Date.now() - startedAt,
          error: err instanceof Error ? err.message : String(err),
        },
      });
    });
    throw err;
  }
}
