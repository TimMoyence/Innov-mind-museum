import { createLangfuseCallbackHandler } from '@shared/observability/langfuse-langchain';
import { getLangfuse } from '@shared/observability/langfuse.client';
import { safeTrace } from '@shared/observability/safeTrace';
import { env } from '@src/config/env';

import { classifyCacheStatus } from './langchain-orchestrator-support';

import type { LangfuseCallbacksRef, UsageRef } from './langchain-orchestrator-support';
import type {
  OrchestratorInput,
  OrchestratorOutput,
} from '@modules/chat/domain/ports/chat-orchestrator.port';

/**
 * TD-LF-02 — extracted to keep `withLangfuseTrace` inside the
 * `max-lines-per-function` cap. Mutates `callbacksRef.current` with a
 * one-element handler array so downstream `.invoke()` calls can fold it
 * onto their opts via `mergeInvokeOpts`. No-op when Langfuse is disabled
 * (`trace` undefined), the ref wasn't passed, or the SDK isn't loaded.
 */
function attachLangChainCallback(
  trace: unknown,
  callbacksRef: LangfuseCallbacksRef | undefined,
): void {
  if (!callbacksRef || !trace) return;
  safeTrace('langfuse.langchain.callback.create', () => {
    const handler = createLangfuseCallbackHandler(trace);
    if (handler !== null) callbacksRef.current = [handler];
  });
}

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
 *
 * C9.5 R9 — optional `usageRef` ferries the section's prompt-cache usage
 * metadata (cache_read + input/output tokens) into the same generation.end()
 * call. The orchestrator's `recordPromptCacheTelemetry` mutates `usageRef.current`
 * inside the wrapped `fn()`. When set, we spread a `usage` block + a
 * `metadata.cacheStatus` enum onto the success-path payload. Numeric usage data
 * is non-PII — the R6 discipline above stays satisfied.
 */
export async function withLangfuseTrace<T extends OrchestratorOutput>(
  name: string,
  input: OrchestratorInput,
  fn: () => Promise<T>,
  usageRef?: UsageRef,
  /**
   * TD-LF-02 — opt-in mutable ref. When supplied AND a Langfuse trace was
   * successfully opened, `withLangfuseTrace` constructs a
   * `langfuse-langchain` `CallbackHandler({ root: trace, updateRoot: true })`
   * and writes it as `callbacksRef.current = [handler]`. The orchestrator
   * then passes this array into every `.invoke()` `callbacks:` so LangChain's
   * built-in chain / LLM observations append to the same trace (rather than
   * opening a parallel one). Fail-open : when Langfuse is disabled, the
   * handler ctor returns null, or `langfuse-langchain` is missing, the ref
   * stays undefined and the chat path runs callback-free (identical to the
   * pre-LF-02 behaviour).
   */
  callbacksRef?: LangfuseCallbacksRef,
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

  // TD-LF-02 — attach the LangChain CallbackHandler after the trace is open
  // and before `fn()` runs. Helper-extracted to keep this function under the
  // line cap ; fail-open semantics live inside `attachLangChainCallback`.
  attachLangChainCallback(trace, callbacksRef);

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
      const usage = usageRef?.current;
      generation?.end({
        output: { textLength: result.text.length },
        // C9.5 R9 — only spread when `usage` is set; absent fields omitted
        // (e.g. cache_read undefined → omitted, not 0).
        ...(usage
          ? {
              usage: {
                ...(usage.input_tokens !== undefined ? { input: usage.input_tokens } : {}),
                ...(usage.output_tokens !== undefined ? { output: usage.output_tokens } : {}),
                ...(usage.total_tokens !== undefined ? { total: usage.total_tokens } : {}),
                ...(usage.input_token_details?.cache_read !== undefined
                  ? { cache_read: usage.input_token_details.cache_read }
                  : {}),
              },
              metadata: { cacheStatus: classifyCacheStatus(usage) },
            }
          : {}),
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
