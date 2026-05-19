import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';

import { logger } from '@shared/logger/logger';
import { llmPromptCacheHitsTotal } from '@shared/observability/prometheus-metrics';
import { env } from '@src/config/env';

import type { LLMCircuitBreaker } from './llm-circuit-breaker';
import type { LlmCostCircuitBreaker } from './llm-cost-circuit-breaker';
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

/**
 * C9.5 — minimal shape we read off LangChain's unified `AIMessage.usage_metadata`.
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
      opts?: { signal?: AbortSignal },
    ): Promise<T | { raw: { usage_metadata?: UsageMetadata }; parsed: T | null }>;
  };
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

export const toModel = (): ChatModel | null => {
  if (env.llm.provider === 'google' && env.llm.googleApiKey) {
    return new ChatGoogleGenerativeAI({
      apiKey: env.llm.googleApiKey,
      model: env.llm.model,
      maxOutputTokens: env.llm.maxOutputTokens,
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
      streamUsage: false,
    });
  }

  if (env.llm.openAiApiKey) {
    return new ChatOpenAI({
      apiKey: env.llm.openAiApiKey,
      model: env.llm.model,
      temperature: env.llm.temperature,
      maxTokens: env.llm.maxOutputTokens,
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
