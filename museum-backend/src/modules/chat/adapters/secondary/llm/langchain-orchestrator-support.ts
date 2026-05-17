import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';

import { logger } from '@shared/logger/logger';
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
import type { LlmSectionName } from '@modules/chat/useCase/llm/llm-sections';
import type { Semaphore } from '@modules/chat/useCase/llm/semaphore';
import type { z } from 'zod';

export const EMPTY_RESPONSE_FALLBACK =
  'I can help with artworks, artist context, and guided museum visits.';

export const MISSING_LLM_KEY_FALLBACK =
  'Musaium is running without an LLM key. Configure provider keys to enable live AI responses.';

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
   */
  withStructuredOutput?<T>(
    schema: z.ZodType<T>,
    opts?: { name?: string },
  ): {
    invoke(messages: unknown, opts?: { signal?: AbortSignal }): Promise<T>;
  };
}

export interface InvokeSectionInput {
  model: ChatModel;
  sectionMessages: unknown;
  signal: AbortSignal;
  sectionName: string;
  timeoutMs: number;
  payloadBytes: number;
  /**
   * When provided AND model exposes `withStructuredOutput`, routes through adapter and
   * re-serialises as `{ answer, ...metadata }` so legacy-JSON parser branch consumes
   * transparently. Falls back to plain-text `[META]` path if missing.
   */
  outputSchema?: {
    schema: z.ZodType;
    name: string;
  };
  /** C9.4 — Prom gauge label scoping. `null` ⇒ label value `'none'`. */
  museumId?: number | null;
  /** C9.4 — Prom gauge label. V1: `'anonymous'` | `'free'`. */
  tier?: string;
}

export interface AssembleResponseInput {
  input: OrchestratorInput;
  sectionPlan: ReturnType<typeof buildOrchestratorMessages>['sectionPlan'];
  bySection: Map<LlmSectionName, SectionRunResult<string>>;
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
      openAIApiKey: env.llm.deepseekApiKey,
      model: env.llm.model,
      temperature: env.llm.temperature,
      maxTokens: env.llm.maxOutputTokens,
    });
  }

  if (env.llm.openAiApiKey) {
    return new ChatOpenAI({
      openAIApiKey: env.llm.openAiApiKey,
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
