/**
 * Domain port for the minimal chat-model contract the orchestrator + LLM judge
 * depend on. Relocated from
 * `adapters/secondary/llm/langchain-orchestrator-support.ts` so the application
 * judge (`useCase/llm/llm-judge-guardrail.ts`) depends on a DOMAIN port rather
 * than an infrastructure adapter (B2 close, run
 * 2026-06-04-hexagonal-boundaries-enforcement). The adapter re-exports both
 * symbols so its concrete code + the orchestrator compile unchanged (spec R5).
 *
 * The `z` (zod) + `@langchain/core` `BaseCallbackHandler` references are
 * 3rd-party types, allowed inside the domain layer (a domain port may name a
 * 3rd-party type in its signature; it must not import another in-module layer).
 */
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { z } from 'zod';

/**
 * C9.5 — minimal shape read off LangChain's unified `AIMessage.usage_metadata`.
 * Populated by `@langchain/openai` (`prompt_tokens_details.cached_tokens` →
 * `input_token_details.cache_read`) and `@langchain/google-genai`
 * (`cachedContentTokenCount` → `input_token_details.cache_read`). Deepseek's
 * OpenAI-compatible adapter does NOT surface `cache_read` today — R7 fail-open
 * classifies that as `'miss'` without throwing.
 */
export interface UsageMetadata {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_token_details?: {
    cache_read?: number;
    audio?: number;
  };
  output_token_details?: {
    audio?: number;
    reasoning?: number;
  };
}

/** Minimal contract — satisfied by LangChain BaseChatModel and test fakes. */
export interface ChatModel {
  invoke(messages: unknown, options?: { signal?: AbortSignal }): Promise<{ content: unknown }>;
  stream(
    messages: unknown,
    options?: { signal?: AbortSignal },
  ): Promise<AsyncIterable<{ content: unknown }>>;
  /**
   * Used by walk-intent for `{ answer, suggestions }` validated by walkAssistantOutputSchema.
   *
   * Method-shorthand syntax intentional: TS strictFunctionTypes leaves method params
   * bivariant, so LangChain's stricter `BaseLanguageModelInput` stays assignable to
   * our `unknown` parameter here without an explicit cast in `toModel()`.
   *
   * C9.5 — when `opts.includeRaw === true`, the runnable resolves with
   * `{ raw: AIMessage, parsed: T | null }` (LangChain
   * `assembleStructuredOutputPipeline` with `includeRaw=true`). Otherwise the
   * legacy parsed-only shape (`T`) is returned. The runtime predicate
   * `isIncludeRawShape()` decides which branch we are on; R10 falls back to
   * `'miss'` classification when a fake / older SDK ignores `includeRaw`.
   */
  withStructuredOutput?<T>(
    schema: z.ZodType<T>,
    opts?: { name?: string; includeRaw?: boolean; strict?: boolean },
  ): {
    invoke(
      messages: unknown,
      /**
       * TD-LF-02 — `callbacks` carries a `langfuse-langchain` `CallbackHandler`
       * (which extends LangChain's `BaseCallbackHandler`). Typed to the same
       * `BaseCallbackHandler[]` shape LangChain itself accepts so this
       * interface stays structurally compatible with the real `ChatOpenAI` /
       * `ChatGoogleGenerativeAI` classes returned by `toModel`.
       */
      opts?: { signal?: AbortSignal; callbacks?: BaseCallbackHandler[] },
    ): Promise<T | { raw: { usage_metadata?: UsageMetadata }; parsed: T | null }>;
  };
}
