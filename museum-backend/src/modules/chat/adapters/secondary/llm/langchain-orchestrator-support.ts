import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';

import { logger } from '@shared/logger/logger';
import { llmPromptCacheHitsTotal } from '@shared/observability/prometheus-metrics';
import { env } from '@src/config/env';

import type { LLMCircuitBreaker } from './llm-circuit-breaker';
import type { LlmCostCircuitBreaker } from './llm-cost-circuit-breaker';
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { ChatModel, UsageMetadata } from '@modules/chat/domain/llm/chat-model.port';
import type { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import type { OrchestratorInput } from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { buildOrchestratorMessages } from '@modules/chat/useCase/llm/llm-prompt-builder';
import type {
  SectionRunResult,
  SectionRunnerHooks,
} from '@modules/chat/useCase/llm/llm-section-runner';
import type { LlmSectionName, MainAssistantOutput } from '@modules/chat/useCase/llm/llm-sections';
import type { Semaphore } from '@modules/chat/useCase/llm/semaphore';
import type { z } from 'zod';

export const EMPTY_RESPONSE_FALLBACK =
  'I can help with artworks, artist context, and guided museum visits.';

export const MISSING_LLM_KEY_FALLBACK =
  'Musaium is running without an LLM key. Configure provider keys to enable live AI responses.';

// `ChatModel` + `UsageMetadata` moved to `domain/llm/chat-model.port.ts`
// (B2 close, run 2026-06-04-hexagonal-boundaries-enforcement). Re-exported here
// (identity-preserving, spec R5) so the orchestrator + every existing importer
// of this adapter module compile unchanged.
export type { ChatModel, UsageMetadata };

/** C9.5 R6 — three-bucket prompt-cache classification. */
export type CacheStatus = 'hit' | 'partial' | 'miss';

/**
 * C9.5 D7 — mutable ref that the orchestrator threads into `withLangfuseTrace`
 * so the section's `usage_metadata` can be lifted into the same
 * `generation.end()` call (R9). The ref is opt-in; null/undefined keeps the
 * C9.0 payload shape untouched.
 */
export interface UsageRef {
  current?: UsageMetadata;
}

/**
 * TD-LF-02 — mutable ref that ferries the `langfuse-langchain`
 * `CallbackHandler` from `withLangfuseTrace` into every `.invoke()` call
 * downstream. `withLangfuseTrace` constructs the handler with `root: trace`
 * so the handler's chain / LLM observations append to the trace it just
 * opened (rather than starting a parallel one). Typed as
 * `BaseCallbackHandler[]` (not `unknown[]`) so the `.invoke({ callbacks })`
 * opt stays structurally compatible with the real LangChain `Callbacks`
 * type ; `langfuse-langchain`'s `CallbackHandler` extends `BaseCallbackHandler`
 * so the assignment is sound at runtime (asserted by the loader). The ref
 * is opt-in : absent / empty array → invoke runs without callbacks,
 * identical to the pre-LF-02 path.
 */
export interface LangfuseCallbacksRef {
  current?: BaseCallbackHandler[];
}

/**
 * C9.5 R10 — runtime predicate distinguishing the `{ raw, parsed }` shape
 * returned by `withStructuredOutput({ includeRaw: true })` from the legacy
 * parsed-only `T` shape returned by fakes / older SDKs / providers that ignore
 * the option.
 */
export const isIncludeRawShape = <T>(
  value: T | { raw: { usage_metadata?: UsageMetadata }; parsed: T | null },
): value is { raw: { usage_metadata?: UsageMetadata }; parsed: T | null } => {
  if (value == null || typeof value !== 'object') return false;
  return 'raw' in value && 'parsed' in value;
};

/**
 * C9.5 R6 — pure stateless classifier. Three buckets, no fuzzy thresholds:
 *   miss    = no usage, no cache_read, OR cache_read === 0, OR input_tokens <= 0.
 *   partial = 0 < cache_read < input_tokens.
 *   hit     = cache_read === input_tokens AND input_tokens > 0.
 *
 * Deliberately reads optionally — missing `usage_metadata` (Deepseek
 * OpenAI-compat, transport degradation) classifies as `'miss'` per R7
 * fail-open contract.
 */
export const classifyCacheStatus = (usage: UsageMetadata | undefined): CacheStatus => {
  const input = usage?.input_tokens ?? 0;
  const cached = usage?.input_token_details?.cache_read ?? 0;
  if (input <= 0) return 'miss';
  if (cached <= 0) return 'miss';
  if (cached >= input) return 'hit';
  return 'partial';
};

interface CacheTelemetryInput {
  requestId?: string;
  sectionName: string;
  provider: string;
  model: string;
  usage: UsageMetadata | undefined;
}

/**
 * C9.5 — emits per-section prompt-cache telemetry (Prom Counter + structured
 * log line). Also mutates `usageRef.current` (when provided) so the Langfuse
 * generation `.end()` call in `withLangfuseTrace` can ferry `cached_tokens`
 * + `cacheStatus` onto the same span (R9 / D7).
 *
 * R11 — log fields are enumerated (`requestId, section, provider, model,
 * cacheStatus, inputTokens, cachedTokens, totalTokens`). No raw user text,
 * image bytes, or userId beyond the requestId proxy. Numeric usage only.
 *
 * R12 — Prom Counter `.inc()` wrapped in try/catch; failures `warn`-logged
 * and swallowed so the chat path stays healthy.
 */
export const recordPromptCacheTelemetry = (
  input: CacheTelemetryInput,
  usageRef?: UsageRef,
): void => {
  const status = classifyCacheStatus(input.usage);
  const inputTokens = input.usage?.input_tokens ?? 0;
  const cachedTokens = input.usage?.input_token_details?.cache_read ?? 0;
  const totalTokens = input.usage?.total_tokens ?? 0;

  // R11 — structured log line, no PII.
  logger.info('llm_prompt_cache', {
    requestId: input.requestId,
    section: input.sectionName,
    provider: input.provider,
    model: input.model,
    cacheStatus: status,
    inputTokens,
    cachedTokens,
    totalTokens,
  });

  // R8 + R12 — Prom Counter, swallowed on failure.
  try {
    llmPromptCacheHitsTotal.inc({ cache_status: status, provider: input.provider });
  } catch (err) {
    logger.warn('llm_prompt_cache_counter_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // R9 / D7 — ferry usage to the enclosing Langfuse `generation.end()` via the
  // mutable ref. `withLangfuseTrace` reads `usageRef.current` if defined.
  if (usageRef && input.usage) {
    usageRef.current = input.usage;
  }
};

export interface InvokeSectionInput {
  model: ChatModel;
  sectionMessages: unknown;
  signal: AbortSignal;
  sectionName: string;
  timeoutMs: number;
  payloadBytes: number;
  /**
   * Routes the section through `model.withStructuredOutput(schema).invoke()`.
   * REQUIRED for sections that go through the default orchestrator —
   * `invokeSection` fails closed when missing (C9.17 R2, the legacy
   * plain-text + JSON-tail fallback was retired 2026-05-18). Stays optional
   * in the shared type so the walk-tour-guide path (which builds its own
   * structured adapter call) can keep using the same `ChatModel` contract.
   */
  outputSchema?: {
    schema: z.ZodType;
    name: string;
  };
  /** C9.4 — Prom gauge label scoping. `null` ⇒ label value `'none'`. */
  museumId?: number | null;
  /** C9.4 — Prom gauge label. V1: `'anonymous'` | `'free'`. */
  tier?: string;
  /** C9.5 — propagated into `llm_prompt_cache` log line + Langfuse correlation. */
  requestId?: string;
  /**
   * C9.5 D7 — mutable ref that lets `recordPromptCacheTelemetry` lift the
   * section's `usage_metadata` into the enclosing `withLangfuseTrace`
   * generation `.end()` call (R9). Undefined when the caller has no Langfuse
   * wrapper above this invocation (walk-intent path).
   */
  usageRef?: UsageRef;
  /**
   * TD-LF-02 — mutable ref with the `langfuse-langchain` `CallbackHandler`
   * that `withLangfuseTrace` constructs against the just-opened trace. Threaded
   * here so each section `.invoke()` writes its LLM-level observations onto
   * the same trace root (`updateRoot:true`), powering the Langfuse cost UI.
   * Undefined / empty array = pre-LF-02 path (no callbacks attached).
   */
  callbacksRef?: LangfuseCallbacksRef;
}

export interface AssembleResponseInput {
  input: OrchestratorInput;
  sectionPlan: ReturnType<typeof buildOrchestratorMessages>['sectionPlan'];
  bySection: Map<LlmSectionName, SectionRunResult<MainAssistantOutput>>;
  recentHistory: ChatMessage[];
  normalizedText: string | undefined;
  startedAt: number;
}

export interface LangChainChatOrchestratorDeps {
  model?: ChatModel | null;
  semaphore?: Semaphore;
  circuitBreaker?: LLMCircuitBreaker;
  /**
   * Cost-based circuit breaker (C9.4). When provided, orchestrator records
   * an `estimateCostCents()` charge per successful section invoke. When
   * omitted, no cost recording happens (legacy callers / tests).
   */
  costBreaker?: LlmCostCircuitBreaker | null;
}

/**
 * TD-LC-02 (PATTERNS.md DO #6) — explicit `maxRetries` + `timeout` on every
 * LangChain chat-model constructor. LangChain's default `maxRetries=6` can
 * be too slow / too eager depending on provider — pinning to 2 makes the
 * retry budget predictable on top of the section-runner's own retry layer
 * (`isRetryableError`). `timeout` mirrors `env.llm.timeoutMs` so a hung
 * provider request doesn't outlive the section deadline.
 */
const LANGCHAIN_HTTP_RETRIES = 2;

export const toModel = (): ChatModel | null => {
  if (env.llm.provider === 'google' && env.llm.googleApiKey) {
    return new ChatGoogleGenerativeAI({
      apiKey: env.llm.googleApiKey,
      model: env.llm.model,
      maxOutputTokens: env.llm.maxOutputTokens,
      // PATTERNS.md §2.c documents `maxRetries` on the Gemini class but not
      // `timeout` — the GoogleGenerativeAIChatInput type rejects it as
      // unknown, so this branch ships only the retry cap.
      maxRetries: LANGCHAIN_HTTP_RETRIES,
    });
  }

  if (env.llm.provider === 'deepseek' && env.llm.deepseekApiKey) {
    return new ChatOpenAI({
      configuration: {
        baseURL: 'https://api.deepseek.com/v1',
      },
      apiKey: env.llm.deepseekApiKey,
      model: env.llm.model,
      temperature: env.llm.temperature,
      maxTokens: env.llm.maxOutputTokens,
      // TD-LC-03 / PATTERNS.md DO #8 — third-party OpenAI-compatible endpoints
      // (Deepseek) must opt out of streaming usage to avoid token-usage errors.
      streamUsage: false,
      maxRetries: LANGCHAIN_HTTP_RETRIES,
      timeout: env.llm.timeoutMs,
    });
  }

  if (env.llm.openAiApiKey) {
    return new ChatOpenAI({
      apiKey: env.llm.openAiApiKey,
      model: env.llm.model,
      temperature: env.llm.temperature,
      maxTokens: env.llm.maxOutputTokens,
      maxRetries: LANGCHAIN_HTTP_RETRIES,
      timeout: env.llm.timeoutMs,
    });
  }

  return null;
};

export const isRetryableError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const text = `${error.name} ${error.message}`.toLowerCase();
  return (
    text.includes('timeout') ||
    text.includes('timed out') ||
    text.includes('rate limit') ||
    text.includes('429') ||
    text.includes('503') ||
    text.includes('502') ||
    text.includes('504') ||
    text.includes('temporar') ||
    text.includes('econnreset') ||
    text.includes('etimedout') ||
    text.includes('abort')
  );
};

interface SectionLogEvent {
  requestId?: string;
  name: string;
  attempt: number;
  timeoutMs: number;
  payloadBytes: number;
  latencyMs?: number;
  error?: string;
}

const logSectionEvent = (level: 'info' | 'warn', label: string, event: SectionLogEvent): void => {
  logger[level](label, {
    requestId: event.requestId,
    section: event.name,
    attempt: event.attempt,
    ...(event.latencyMs !== undefined ? { latencyMs: event.latencyMs } : {}),
    timeoutMs: event.timeoutMs,
    payloadBytes: event.payloadBytes,
    ...(event.error !== undefined ? { error: event.error } : {}),
    provider: env.llm.provider,
    model: env.llm.model,
  });
};

const buildLoggingHooks = (): SectionRunnerHooks => ({
  onStart: (event) => {
    logSectionEvent('info', 'llm_section_start', event);
  },
  onSuccess: (event) => {
    logSectionEvent('info', 'llm_section_success', event);
  },
  onRetry: (event) => {
    logSectionEvent('warn', 'llm_section_retry', event);
  },
  onTimeout: (event) => {
    logSectionEvent('warn', 'llm_section_timeout', event);
  },
  onError: (event) => {
    logSectionEvent('warn', 'llm_section_error', event);
  },
});

export const sectionRunnerHooks = buildLoggingHooks();
