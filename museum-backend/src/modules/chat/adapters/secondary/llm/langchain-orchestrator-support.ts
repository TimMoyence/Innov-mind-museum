import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';

import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import type { LLMCircuitBreaker } from './llm-circuit-breaker';
import type { LlmCostCircuitBreaker } from './llm-cost-circuit-breaker';
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

export type { ChatModel, UsageMetadata };

export type CacheStatus = 'hit' | 'partial' | 'miss';

export const isIncludeRawShape = <T>(
  value: T | { raw: { usage_metadata?: UsageMetadata }; parsed: T | null },
): value is { raw: { usage_metadata?: UsageMetadata }; parsed: T | null } => {
  if (value == null || typeof value !== 'object') return false;
  return 'raw' in value && 'parsed' in value;
};

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

export const recordPromptCacheTelemetry = (input: CacheTelemetryInput): void => {
  const status = classifyCacheStatus(input.usage);
  const inputTokens = input.usage?.input_tokens ?? 0;
  const cachedTokens = input.usage?.input_token_details?.cache_read ?? 0;
  const totalTokens = input.usage?.total_tokens ?? 0;

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
};

export interface InvokeSectionInput {
  model: ChatModel;
  sectionMessages: unknown;
  signal: AbortSignal;
  sectionName: string;
  timeoutMs: number;
  payloadBytes: number;
  outputSchema?: {
    schema: z.ZodType;
    name: string;
  };
  museumId?: number | null;
  tier?: string;
  requestId?: string;
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
  costBreaker?: LlmCostCircuitBreaker | null;
}

const LANGCHAIN_HTTP_RETRIES = 2;

export const toModel = (): ChatModel | null => {
  if (env.llm.provider === 'google' && env.llm.googleApiKey) {
    return new ChatGoogleGenerativeAI({
      apiKey: env.llm.googleApiKey,
      model: env.llm.model,
      maxOutputTokens: env.llm.maxOutputTokens,
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
