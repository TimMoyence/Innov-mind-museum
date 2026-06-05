import type { ChatModel } from '@modules/chat/adapters/secondary/llm/langchain-orchestrator-support';
import type { MainAssistantOutput } from '@modules/chat/useCase/llm/llm-sections';
import type { BaseMessage } from '@langchain/core/messages';

/**
 * RUN_ID 2026-05-31-e2e-guardrail-blindspot — deterministic fake `ChatModel`
 * for the guardrail-chain e2e suite.
 *
 * Implements the project's structural-output contract
 * (`langchain-orchestrator-support.ts` `ChatModel`): `withStructuredOutput(schema,
 * opts)` returns a runnable whose `.invoke(messages)` :
 *  - captures the `BaseMessage[]` array the orchestrator built (prompt-isolation
 *    assertion, R4),
 *  - increments `invokeCount` (reach-or-not assertions, R2/R3/R5/R6),
 *  - returns a fully-populated {@link MainAssistantOutput} whose `text` field is
 *    the per-suite configured response (`cfg.text` — the field carrying the
 *    visitor-visible answer per `main-assistant-output.schema.ts:94`).
 *
 * Returns the parsed-only shape (`MainAssistantOutput`), NOT the
 * `{ raw, parsed }` includeRaw shape — the orchestrator's `isIncludeRawShape`
 * predicate (`langchain-orchestrator-support.ts:125`) falls back gracefully
 * (R10: telemetry degrades to `'miss'`, chat path stays healthy). This keeps the
 * fake minimal and avoids fabricating `usage_metadata`.
 *
 * DRY factory (docs/TEST_FACTORIES.md). `as ChatModel` cast confined to this
 * tests/helpers file (Phase 7 shape-match policy permits `as` only under
 * `tests/helpers/`).
 */

/** Per-suite configuration of the fake model's deterministic response. */
export interface FakeChatModelConfig {
  /** Verbatim `text` returned in the parsed MainAssistantOutput answer. */
  text: string;
}

/**
 * Handle exposing the live `model` (injected into the orchestrator) plus the
 * mutable observation surface the e2e test reads after each request.
 */
export interface FakeChatModelHandle {
  /** The `ChatModel` instance to pass to `new LangChainChatOrchestrator({ model })`. */
  model: ChatModel;
  /** Number of `withStructuredOutput(...).invoke()` calls so far. */
  invokeCount: number;
  /** The `BaseMessage[]` of the most recent invoke, or `null` if never invoked. */
  capturedMessages: BaseMessage[] | null;
}

/**
 * Builds the full {@link MainAssistantOutput} the fake returns. All fields other
 * than `text` are nullable per the schema; we emit `null` for every optional
 * surface so the parsed object is schema-shaped without fabricating content.
 * @param text The visitor-visible answer text.
 */
const buildAssistantOutput = (text: string): MainAssistantOutput => ({
  text,
  deeperContext: null,
  openQuestion: null,
  suggestedFollowUp: null,
  imageDescription: null,
  suggestedImages: null,
  detectedArtwork: null,
  recommendations: null,
  expertiseSignal: null,
  citations: null,
  sources: null,
});

/**
 * Creates a {@link FakeChatModelHandle}. The returned `model` captures messages
 * + counts invocations into the handle (same object reference), so the e2e test
 * can assert on `handle.invokeCount` / `handle.capturedMessages` after driving a
 * request through the real orchestrator.
 * @param config Deterministic response config.
 */
export const makeFakeChatModel = (config: FakeChatModelConfig): FakeChatModelHandle => {
  const handle: FakeChatModelHandle = {
    // Assigned below once `model` is constructed.
    model: undefined as unknown as ChatModel,
    invokeCount: 0,
    capturedMessages: null,
  };

  const model: ChatModel = {
    // The orchestrator default path never calls bare `invoke` / `stream`
    // (it always routes through `withStructuredOutput`), but the `ChatModel`
    // contract requires them. Provide honest throwing stubs so an unexpected
    // call surfaces loudly rather than silently passing.
    invoke() {
      return Promise.reject(
        new Error('fake chat model: bare invoke() is not used by the orchestrator default path'),
      );
    },
    stream() {
      return Promise.reject(
        new Error('fake chat model: stream() is not used by the orchestrator default path'),
      );
    },
    withStructuredOutput<T>() {
      return {
        invoke(messages: unknown): Promise<T> {
          handle.invokeCount += 1;
          handle.capturedMessages = messages as BaseMessage[];
          // The orchestrator always binds `mainAssistantOutputSchema`, so the
          // runtime `T` is `MainAssistantOutput`. The generic `T` cannot be
          // narrowed structurally at the type level (the `ChatModel` port keeps
          // `withStructuredOutput` generic), so cast through `unknown` — confined
          // to this tests/helpers fixture per the Phase 7 shape-match policy.
          return Promise.resolve(buildAssistantOutput(config.text) as unknown as T);
        },
      };
    },
  };

  handle.model = model;
  return handle;
};
