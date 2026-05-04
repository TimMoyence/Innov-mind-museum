import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';

import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import type { LLMCircuitBreaker } from './llm-circuit-breaker';
import type { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import type { OrchestratorInput } from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { buildOrchestratorMessages } from '@modules/chat/useCase/llm/llm-prompt-builder';
import type {
  SectionRunResult,
  SectionRunnerHooks,
} from '@modules/chat/useCase/llm/llm-section-runner';
import type { LlmSectionName } from '@modules/chat/useCase/llm/llm-sections';
import type { Semaphore } from '@modules/chat/useCase/llm/semaphore';
import type { ZodSchema } from 'zod';

/** Fallback response when LLM produces no usable text after all retries/parsing. */
export const EMPTY_RESPONSE_FALLBACK =
  'I can help with artworks, artist context, and guided museum visits.';

/** Fallback response when no LLM API key is configured. */
export const MISSING_LLM_KEY_FALLBACK =
  'Musaium is running without an LLM key. Configure provider keys to enable live AI responses.';

/** Minimal contract for LLM models — satisfied by LangChain BaseChatModel and test fakes. */
export interface ChatModel {
  invoke(messages: unknown, options?: { signal?: AbortSignal }): Promise<{ content: unknown }>;
  stream(
    messages: unknown,
    options?: { signal?: AbortSignal },
  ): Promise<AsyncIterable<{ content: unknown }>>;
  /**
   * Optional structured-output adapter. Satisfied by LangChain BaseChatModel's
   * `withStructuredOutput<T>(schema, opts?)`. Used by the walk-intent path to
   * receive `{ answer, suggestions }` validated by walkAssistantOutputSchema.
   * Test fakes implement this only when exercising the structured path.
   *
   * Method-shorthand syntax is intentional: TS strictFunctionTypes leaves
   * method parameters bivariant, so LangChain's stricter `BaseLanguageModelInput`
   * input type remains assignable to our `unknown` parameter here without an
   * explicit cast in `toModel()`.
   */
  withStructuredOutput?<T>(
    schema: ZodSchema<T>,
    opts?: { name?: string },
  ): {
    invoke(messages: unknown, opts?: { signal?: AbortSignal }): Promise<T>;
  };
}

/** Parameters for a single section LLM invocation. */
export interface InvokeSectionInput {
  model: ChatModel;
  sectionMessages: unknown;
  signal: AbortSignal;
  sectionName: string;
  timeoutMs: number;
  payloadBytes: number;
}

/** Parameters for assembling the final orchestrator response. */
export interface AssembleResponseInput {
  input: OrchestratorInput;
  sectionPlan: ReturnType<typeof buildOrchestratorMessages>['sectionPlan'];
  bySection: Map<LlmSectionName, SectionRunResult<string>>;
  recentHistory: ChatMessage[];
  normalizedText: string | undefined;
  startedAt: number;
}

/**
 *
 */
export interface LangChainChatOrchestratorDeps {
  model?: ChatModel | null;
  semaphore?: Semaphore;
  circuitBreaker?: LLMCircuitBreaker;
}

/** Creates the appropriate LangChain chat model from environment config. */
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

/** Checks whether an LLM error is transient and safe to retry. */
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

const buildLoggingHooks = (): SectionRunnerHooks => {
  const logEvent = (
    level: 'info' | 'warn',
    label: string,
    event: {
      requestId?: string;
      name: string;
      attempt: number;
      timeoutMs: number;
      payloadBytes: number;
      latencyMs?: number;
      error?: string;
    },
  ) => {
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

  return {
    onStart: (event) => {
      logEvent('info', 'llm_section_start', event);
    },
    onSuccess: (event) => {
      logEvent('info', 'llm_section_success', event);
    },
    onRetry: (event) => {
      logEvent('warn', 'llm_section_retry', event);
    },
    onTimeout: (event) => {
      logEvent('warn', 'llm_section_timeout', event);
    },
    onError: (event) => {
      logEvent('warn', 'llm_section_error', event);
    },
  };
};

/** Pre-built logging hooks for the section runner. */
export const sectionRunnerHooks = buildLoggingHooks();
