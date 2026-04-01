import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import * as Sentry from '@sentry/node';

import { logger } from '@shared/logger/logger';
import { startSpan } from '@shared/observability/sentry';
import { env } from '@src/config/env';

import { LLMCircuitBreaker } from './llm-circuit-breaker';
import { parseAssistantResponse } from '../../application/assistant-response';
import {
  buildOrchestratorMessages,
  buildSectionMessages,
  toContentString,
  estimatePayloadBytes,
} from '../../application/llm-prompt-builder';
import {
  runSectionTasks,
  type SectionRunResult,
  type SectionTask,
} from '../../application/llm-section-runner';
import { createSummaryFallback, type LlmSectionName } from '../../application/llm-sections';
import { Semaphore } from '../../application/semaphore';

import type { ChatAssistantDiagnostics, ChatAssistantMetadata } from '../../domain/chat.types';
import type { ChatMessage } from '../../domain/chatMessage.entity';
import type {
  OrchestratorInput,
  OrchestratorOutput,
  ChatOrchestrator,
} from '../../domain/ports/chat-orchestrator.port';
// Re-export domain port types so existing consumers that imported from here keep working
export type {
  OrchestratorInput,
  OrchestratorOutput,
  ChatOrchestrator,
} from '../../domain/ports/chat-orchestrator.port';

// Re-export prompt builder types/functions so test imports keep working
export {
  buildOrchestratorMessages,
  buildSectionMessages,
} from '../../application/llm-prompt-builder';
export type { OrchestratorPrepared } from '../../application/llm-prompt-builder';

/** Minimal contract for LLM models — satisfied by LangChain BaseChatModel and test fakes. */
interface ChatModel {
  invoke(messages: unknown, options?: { signal?: AbortSignal }): Promise<{ content: unknown }>;
  stream(
    messages: unknown,
    options?: { signal?: AbortSignal },
  ): Promise<AsyncIterable<{ content: unknown }>>;
}

const toModel = (): ChatModel | null => {
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

const isRetryableError = (error: unknown): boolean => {
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

// ---------------------------------------------------------------------------

interface LangChainChatOrchestratorDeps {
  model?: ChatModel | null;
  semaphore?: Semaphore;
  circuitBreaker?: LLMCircuitBreaker;
}

/** Shared logging hooks for section runner — logs start, success, retry, timeout, and error events. */
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- dynamic import() avoids circular dependency with section runner module
const sectionRunnerHooks: import('../../application/llm-section-runner').SectionRunnerHooks = {
  onStart: (event) => {
    logger.info('llm_section_start', {
      requestId: event.requestId,
      section: event.name,
      attempt: event.attempt,
      timeoutMs: event.timeoutMs,
      payloadBytes: event.payloadBytes,
      provider: env.llm.provider,
      model: env.llm.model,
    });
  },
  onSuccess: (event) => {
    logger.info('llm_section_success', {
      requestId: event.requestId,
      section: event.name,
      attempt: event.attempt,
      latencyMs: event.latencyMs,
      timeoutMs: event.timeoutMs,
      payloadBytes: event.payloadBytes,
      provider: env.llm.provider,
      model: env.llm.model,
    });
  },
  onRetry: (event) => {
    logger.warn('llm_section_retry', {
      requestId: event.requestId,
      section: event.name,
      attempt: event.attempt,
      latencyMs: event.latencyMs,
      timeoutMs: event.timeoutMs,
      payloadBytes: event.payloadBytes,
      error: event.error,
      provider: env.llm.provider,
      model: env.llm.model,
    });
  },
  onTimeout: (event) => {
    logger.warn('llm_section_timeout', {
      requestId: event.requestId,
      section: event.name,
      attempt: event.attempt,
      latencyMs: event.latencyMs,
      timeoutMs: event.timeoutMs,
      payloadBytes: event.payloadBytes,
      error: event.error,
      provider: env.llm.provider,
      model: env.llm.model,
    });
  },
  onError: (event) => {
    logger.warn('llm_section_error', {
      requestId: event.requestId,
      section: event.name,
      attempt: event.attempt,
      latencyMs: event.latencyMs,
      timeoutMs: event.timeoutMs,
      payloadBytes: event.payloadBytes,
      error: event.error,
      provider: env.llm.provider,
      model: env.llm.model,
    });
  },
};

/** LangChain-based implementation of {@link ChatOrchestrator} that delegates to OpenAI, Google, or Deepseek models. */
export class LangChainChatOrchestrator implements ChatOrchestrator {
  private readonly model: ChatModel | null;
  private readonly semaphore: Semaphore;
  private readonly circuitBreaker: LLMCircuitBreaker;

  /** Creates a new LangChain orchestrator instance. \@param deps - Optional overrides for the LLM model and concurrency semaphore (useful for testing). */
  constructor(deps: LangChainChatOrchestratorDeps = {}) {
    this.model = deps.model === undefined ? toModel() : deps.model;
    this.semaphore = deps.semaphore ?? new Semaphore(Math.max(1, env.llm.maxConcurrent));
    this.circuitBreaker = deps.circuitBreaker ?? new LLMCircuitBreaker();
  }

  /** Returns the circuit breaker's observable state for health-check endpoints. */
  getCircuitBreakerState() {
    return this.circuitBreaker.getState();
  }

  /** Invokes the LLM for a single section behind circuit-breaker + semaphore, wrapped in a Sentry span. */
  // eslint-disable-next-line max-params -- LLM invocation requires model, messages, signal, section name, timeout, and payload size
  private async invokeSection(
    model: ChatModel,
    sectionMessages: unknown,
    signal: AbortSignal,
    sectionName: string,
    timeoutMs: number,
    payloadBytes: number,
  ): Promise<string> {
    return await startSpan(
      {
        name: `llm.section.${sectionName}`,
        op: 'ai.invoke',
        attributes: {
          'llm.section': sectionName,
          'llm.timeout_ms': timeoutMs,
          'llm.payload_bytes': payloadBytes,
        },
      },
      async () => {
        const result = await this.circuitBreaker.execute(() =>
          this.semaphore.use(async () => await model.invoke(sectionMessages, { signal })),
        );
        return toContentString(result.content);
      },
    );
  }

  /**
   * Streams LLM output for a single section behind circuit-breaker + semaphore, wrapped in a Sentry span.
   * Appends every chunk to `accumulator` so the caller can access partial content on error.
   */
  private async streamSection(
    model: ChatModel,
    sectionMessages: unknown,
    signal: AbortSignal,
    onChunk: (text: string) => void,
    accumulator: { text: string },
  ): Promise<string> {
    return await startSpan({ name: 'llm.stream', op: 'ai.stream' }, async () => {
      const stream = await model.stream(sectionMessages, { signal });
      for await (const chunk of stream) {
        const chunkText = toContentString(chunk.content);
        if (chunkText) {
          accumulator.text += chunkText;
          onChunk(chunkText);
        }
      }
      return accumulator.text;
    });
  }

  /** Assembles diagnostics sections and logs orchestration completion. */
  // eslint-disable-next-line max-lines-per-function, max-params -- response assembly aggregates all section results, diagnostics, and fallback logic into one coherent output
  private assembleResponse(
    input: OrchestratorInput,
    sectionPlan: ReturnType<typeof buildOrchestratorMessages>['sectionPlan'],
    bySection: Map<LlmSectionName, SectionRunResult<string>>,
    recentHistory: ChatMessage[],
    normalizedText: string | undefined,
    startedAt: number,
  ): OrchestratorOutput {
    const summaryResult = bySection.get('summary');
    let text: string;
    let metadata: ChatAssistantMetadata = {};
    let degraded = false;
    let summaryFallbackApplied = false;

    if (summaryResult?.status === 'success') {
      const parsed = parseAssistantResponse(summaryResult.value);
      text = parsed.answer;
      metadata = parsed.metadata;
    } else {
      summaryFallbackApplied = true;
      degraded = true;
      text = createSummaryFallback({
        history: recentHistory,
        question: normalizedText,
        location: input.context?.location,
        locale: input.locale,
        museumMode: input.museumMode,
      });

      logger.warn('llm_section_fallback', {
        requestId: input.requestId,
        section: 'summary',
        reason:
          summaryResult?.status === 'timeout'
            ? 'timeout'
            : (summaryResult?.status ?? 'missing-result'),
      });
    }

    if (!text) {
      text = 'I can help with artworks, artist context, and guided museum visits.';
    }

    const totalLatencyMs = Date.now() - startedAt;
    const profile: ChatAssistantDiagnostics['profile'] = 'single_section';

    const diagnosticsSections: ChatAssistantDiagnostics['sections'] = sectionPlan.map((section) => {
      const result = bySection.get(section.name);

      if (!result) {
        return {
          name: section.name,
          status: summaryFallbackApplied ? 'fallback' : 'error',
          attempts: 0,
          latencyMs: 0,
          timeoutMs: section.timeoutMs,
          payloadBytes: 0,
          error: 'No section result',
        };
      }

      return {
        name: section.name,
        status: summaryFallbackApplied ? 'fallback' : result.status,
        attempts: result.attempts,
        latencyMs: result.latencyMs,
        timeoutMs: result.timeoutMs,
        payloadBytes: result.payloadBytes,
        ...(result.status !== 'success' ? { error: result.error } : {}),
      };
    });

    logger.info('llm_orchestration_complete', {
      requestId: input.requestId,
      profile,
      provider: env.llm.provider,
      model: env.llm.model,
      degraded,
      totalLatencyMs,
      sections: diagnosticsSections.map((section) => ({
        name: section.name,
        status: section.status,
        attempts: section.attempts,
        latencyMs: section.latencyMs,
      })),
    });

    if (env.llm.includeDiagnostics) {
      metadata = {
        ...metadata,
        diagnostics: {
          profile,
          degraded,
          totalLatencyMs,
          sections: diagnosticsSections,
        },
      };
    }

    Sentry.getActiveSpan()?.setAttribute('llm.latency_ms', totalLatencyMs);
    Sentry.getActiveSpan()?.setAttribute('llm.degraded', degraded);

    return { text, metadata };
  }

  /**
   * Builds section-based prompts, invokes the LLM with retry/timeout logic, and assembles the final response.
   *
   * @param input - Conversation history, user text/image, locale, museum context, etc.
   * @returns Generated text and metadata (citations, diagnostics).
   */
  // eslint-disable-next-line max-lines-per-function -- orchestration method wires section tasks, retry logic, and tracing into a single Sentry span
  async generate(input: OrchestratorInput): Promise<OrchestratorOutput> {
    return await startSpan(
      {
        name: 'llm.orchestrate',
        op: 'ai.orchestrate',
        attributes: {
          'llm.provider': env.llm.provider,
          'llm.model': env.llm.model,
          'llm.has_image': !!input.image,
          'llm.history_length': input.history.length,
        },
      },
      async () => {
        const startedAt = Date.now();

        const {
          normalizedText,
          recentHistory,
          systemPrompt,
          historyMessages,
          userMessage,
          sectionPlan,
        } = buildOrchestratorMessages(input);

        const model = this.model;
        if (!model) {
          return {
            text: 'Musaium is running without an LLM key. Configure provider keys to enable live AI responses.',
            metadata: {
              citations: ['system:missing-llm-api-key'],
            },
          };
        }

        const tasks: SectionTask<string>[] = sectionPlan.map((section) => {
          const sectionMessages = buildSectionMessages(
            systemPrompt,
            section.prompt,
            historyMessages,
            userMessage,
            {
              userMemoryBlock: input.userMemoryBlock,
              knowledgeBaseBlock: input.knowledgeBaseBlock,
            },
          );

          const payloadBytes = estimatePayloadBytes(sectionMessages);

          return {
            name: section.name,
            timeoutMs: section.timeoutMs,
            payloadBytes,
            run: async (signal: AbortSignal) =>
              await this.invokeSection(
                model,
                sectionMessages,
                signal,
                section.name,
                section.timeoutMs,
                payloadBytes,
              ),
          };
        });

        const sectionResults = await runSectionTasks(tasks, {
          maxConcurrent: 1,
          retries: env.llm.retries,
          retryBaseDelayMs: env.llm.retryBaseDelayMs,
          totalBudgetMs: env.llm.totalBudgetMs,
          requestId: input.requestId,
          shouldRetry: (error, status) => {
            if (status === 'timeout') return true;
            return isRetryableError(error);
          },
          hooks: sectionRunnerHooks,
        });

        const bySection = new Map<LlmSectionName, SectionRunResult<string>>();
        for (const result of sectionResults) {
          bySection.set(result.name as LlmSectionName, result);
        }

        return this.assembleResponse(
          input,
          sectionPlan,
          bySection,
          recentHistory,
          normalizedText,
          startedAt,
        );
      },
    ); // end startSpan('llm.orchestrate')
  }

  /**
   * Streams assistant response tokens via the onChunk callback while building the full response.
   * Uses the same system prompt, sections, semaphore, and retry logic as generate().
   *
   * @param input - Conversation history, user text/image, locale, museum context, etc.
   * @param onChunk - Called with each text token as it arrives from the LLM.
   * @returns Generated text and metadata after the stream completes.
   */
  // eslint-disable-next-line max-lines-per-function -- streaming orchestration wires section tasks, chunk handling, and tracing into a single Sentry span
  async generateStream(
    input: OrchestratorInput,
    onChunk: (text: string) => void,
  ): Promise<OrchestratorOutput> {
    return await startSpan(
      {
        name: 'llm.orchestrate.stream',
        op: 'ai.orchestrate',
        attributes: {
          'llm.provider': env.llm.provider,
          'llm.model': env.llm.model,
          'llm.has_image': !!input.image,
        },
      },
      // eslint-disable-next-line max-lines-per-function -- streaming callback is the core of generateStream, extracting it would add indirection without reducing complexity
      async () => {
        const {
          normalizedText,
          recentHistory,
          systemPrompt,
          historyMessages,
          userMessage,
          sectionPlan,
        } = buildOrchestratorMessages(input);

        const model = this.model;
        if (!model) {
          const fallbackText =
            'Musaium is running without an LLM key. Configure provider keys to enable live AI responses.';
          onChunk(fallbackText);
          return {
            text: fallbackText,
            metadata: { citations: ['system:missing-llm-api-key'] },
          };
        }

        const section = sectionPlan[0];
        const sectionMessages = buildSectionMessages(
          systemPrompt,
          section.prompt,
          historyMessages,
          userMessage,
          {
            userMemoryBlock: input.userMemoryBlock,
            knowledgeBaseBlock: input.knowledgeBaseBlock,
          },
        );

        const timeoutMs = section.timeoutMs;
        const controller = new AbortController();
        const timeout = setTimeout(() => {
          controller.abort();
        }, timeoutMs);

        const accumulator = { text: '' };
        try {
          const rawContent = await this.circuitBreaker.execute(() =>
            this.semaphore.use(
              async () =>
                await this.streamSection(
                  model,
                  sectionMessages,
                  controller.signal,
                  onChunk,
                  accumulator,
                ),
            ),
          );

          clearTimeout(timeout);

          const parsed = parseAssistantResponse(rawContent);
          logger.info('llm_stream_complete', {
            requestId: input.requestId,
            provider: env.llm.provider,
            model: env.llm.model,
            textLength: rawContent.length,
          });

          let metadata = parsed.metadata;
          if (env.llm.includeDiagnostics) {
            metadata = {
              ...metadata,
              diagnostics: {
                profile: 'single_section' as const,
                degraded: false,
                totalLatencyMs: 0,
                sections: [],
              },
            };
          }

          return { text: parsed.answer, metadata };
        } catch (error) {
          clearTimeout(timeout);

          logger.warn('llm_stream_error', {
            requestId: input.requestId,
            provider: env.llm.provider,
            model: env.llm.model,
            error: (error as Error).message,
          });

          // If we have partial content, try to parse what we have
          if (accumulator.text.length > 0) {
            const parsed = parseAssistantResponse(accumulator.text);
            return { text: parsed.answer, metadata: parsed.metadata };
          }

          // Fallback
          const fallbackText = createSummaryFallback({
            history: recentHistory,
            question: normalizedText,
            location: input.context?.location,
            locale: input.locale,
            museumMode: input.museumMode,
          });

          return { text: fallbackText, metadata: {} };
        }
      },
    ); // end startSpan('llm.orchestrate.stream')
  }
}
