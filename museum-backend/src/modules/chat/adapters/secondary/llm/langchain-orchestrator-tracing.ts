import { getLangfuse } from '@shared/observability/langfuse.client';
import { safeTrace } from '@shared/observability/safeTrace';
import { env } from '@src/config/env';

import type {
  OrchestratorInput,
  OrchestratorOutput,
} from '@modules/chat/domain/ports/chat-orchestrator.port';

/**
 * Wraps an orchestrator `fn()` call in a Langfuse trace + nested generation
 * observation (C9.0). Fail-open via `safeTrace` (Langfuse SDK exceptions
 * swallowed, chat path continues). When `LANGFUSE_ENABLED=false` (default)
 * `getLangfuse()` returns `null` — near-zero-cost no-op.
 *
 * Span shape:
 *   trace  : { name, userId, sessionId, metadata }
 *   └ generation : { name: `${name}.generation`, model, input, output, startTime, endTime }
 *
 * PII discipline (C9.0 spec R6): `input` and `output` carry ONLY lengths,
 * booleans, locale, intent enum, model name — never raw user text, image
 * bytes, or LLM response text.
 */
export async function withLangfuseTrace<T extends OrchestratorOutput>(
  name: string,
  input: OrchestratorInput,
  fn: () => Promise<T>,
): Promise<T> {
  const lf = getLangfuse();

  const traceMetadata = {
    provider: env.llm.provider,
    model: env.llm.model,
    requestId: input.requestId,
    intent: input.intent,
    hasImage: !!input.image,
    historyLength: input.history.length,
    locale: input.locale,
    museumMode: input.museumMode,
    museumId: input.museumId ?? null,
  };

  const trace = safeTrace('langfuse.trace.create', () =>
    lf?.trace({
      name,
      userId: input.userId != null ? String(input.userId) : undefined,
      sessionId: input.sessionId,
      metadata: traceMetadata,
    }),
  );

  const startedAt = new Date();
  const generation = safeTrace('langfuse.generation.create', () =>
    trace?.generation({
      name: `${name}.generation`,
      model: env.llm.model,
      input: {
        historyLength: input.history.length,
        locale: input.locale,
        hasImage: !!input.image,
        intent: input.intent,
        museumMode: input.museumMode,
      },
      startTime: startedAt,
    }),
  );

  try {
    const result = await fn();
    safeTrace('langfuse.generation.end', () => {
      // `endTime` is set implicitly by the SDK when `.end()` is called (the
      // SDK omits `endTime` from the body type for exactly this reason).
      generation?.end({
        output: { textLength: result.text.length },
      });
    });
    return result;
  } catch (err) {
    safeTrace('langfuse.generation.end.error', () => {
      generation?.end({
        level: 'ERROR',
        statusMessage: err instanceof Error ? err.message : String(err),
      });
    });
    throw err;
  }
}
