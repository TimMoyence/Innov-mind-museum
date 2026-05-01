import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import * as Sentry from '@sentry/node';

import { logger } from '@shared/logger/logger';
import { startSpan } from '@shared/observability/sentry';
import { env } from '@src/config/env';

import {
  EMPTY_RESPONSE_FALLBACK,
  MISSING_LLM_KEY_FALLBACK,
  toModel,
  isRetryableError,
  sectionRunnerHooks,
} from './langchain-orchestrator-support';
import { LLMCircuitBreaker } from './llm-circuit-breaker';
import { parseAssistantResponse } from '../../useCase/assistant-response';
import {
  buildOrchestratorMessages,
  buildSectionMessages,
  toContentString,
  estimatePayloadBytes,
} from '../../useCase/llm-prompt-builder';
import {
  runSectionTasks,
  type SectionRunResult,
  type SectionTask,
} from '../../useCase/llm-section-runner';
import { createSummaryFallback, type LlmSectionName } from '../../useCase/llm-sections';
import {
  WALK_TOUR_GUIDE_SECTION,
  walkAssistantOutputSchema,
} from '../../useCase/llm-sections/walk-tour-guide';
import { Semaphore } from '../../useCase/semaphore';

import type {
  ChatModel,
  InvokeSectionInput,
  AssembleResponseInput,
  LangChainChatOrchestratorDeps,
} from './langchain-orchestrator-support';
import type { ChatAssistantDiagnostics, ChatAssistantMetadata } from '../../domain/chat.types';
import type { ChatMessage } from '../../domain/chatMessage.entity';
import type {
  OrchestratorInput,
  OrchestratorOutput,
  ChatOrchestrator,
} from '../../domain/ports/chat-orchestrator.port';

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
  private async invokeSection(input: InvokeSectionInput): Promise<string> {
    return await startSpan(
      {
        name: `llm.section.${input.sectionName}`,
        op: 'ai.invoke',
        attributes: {
          'llm.section': input.sectionName,
          'llm.timeout_ms': input.timeoutMs,
          'llm.payload_bytes': input.payloadBytes,
        },
      },
      async () => {
        const result = await this.circuitBreaker.execute(() =>
          this.semaphore.use(
            async () => await input.model.invoke(input.sectionMessages, { signal: input.signal }),
          ),
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

  /** Resolves summary text + metadata from section results, applying fallback when needed. */
  private resolveSummary(
    bySection: Map<LlmSectionName, SectionRunResult<string>>,
    input: OrchestratorInput,
    recentHistory: ChatMessage[],
    normalizedText: string | undefined,
  ): {
    text: string;
    metadata: ChatAssistantMetadata;
    degraded: boolean;
    fallbackApplied: boolean;
  } {
    const summaryResult = bySection.get('summary');

    if (summaryResult?.status === 'success') {
      const parsed = parseAssistantResponse(summaryResult.value);
      return {
        text: parsed.answer || EMPTY_RESPONSE_FALLBACK,
        metadata: parsed.metadata,
        degraded: false,
        fallbackApplied: false,
      };
    }

    logger.warn('llm_section_fallback', {
      requestId: input.requestId,
      section: 'summary',
      reason:
        summaryResult?.status === 'timeout'
          ? 'timeout'
          : (summaryResult?.status ?? 'missing-result'),
    });

    const text = createSummaryFallback({
      history: recentHistory,
      question: normalizedText,
      location: input.context?.location,
      locale: input.locale,
      museumMode: input.museumMode,
    });

    return {
      text: text || EMPTY_RESPONSE_FALLBACK,
      metadata: {},
      degraded: true,
      fallbackApplied: true,
    };
  }

  /** Builds per-section diagnostics entries for observability metadata. */
  private buildDiagnosticsSections(
    sectionPlan: ReturnType<typeof buildOrchestratorMessages>['sectionPlan'],
    bySection: Map<LlmSectionName, SectionRunResult<string>>,
    fallbackApplied: boolean,
  ): ChatAssistantDiagnostics['sections'] {
    return sectionPlan.map((section) => {
      const result = bySection.get(section.name);

      if (!result) {
        return {
          name: section.name,
          status: fallbackApplied ? 'fallback' : 'error',
          attempts: 0,
          latencyMs: 0,
          timeoutMs: section.timeoutMs,
          payloadBytes: 0,
          error: 'No section result',
        };
      }

      return {
        name: section.name,
        status: fallbackApplied ? 'fallback' : result.status,
        attempts: result.attempts,
        latencyMs: result.latencyMs,
        timeoutMs: result.timeoutMs,
        payloadBytes: result.payloadBytes,
        ...(result.status !== 'success' ? { error: result.error } : {}),
      };
    });
  }

  /** Assembles diagnostics sections and logs orchestration completion. */
  private assembleResponse(params: AssembleResponseInput): OrchestratorOutput {
    const { input, sectionPlan, bySection, recentHistory, normalizedText, startedAt } = params;
    const {
      text,
      metadata: baseMeta,
      degraded,
      fallbackApplied,
    } = this.resolveSummary(bySection, input, recentHistory, normalizedText);

    const totalLatencyMs = Date.now() - startedAt;
    const profile: ChatAssistantDiagnostics['profile'] = 'single_section';
    const diagnosticsSections = this.buildDiagnosticsSections(
      sectionPlan,
      bySection,
      fallbackApplied,
    );

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

    let metadata = baseMeta;
    if (env.llm.includeDiagnostics) {
      metadata = {
        ...metadata,
        diagnostics: { profile, degraded, totalLatencyMs, sections: diagnosticsSections },
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
        if (input.intent === 'walk') {
          return await this.generateWalk(input);
        }

        const startedAt = Date.now();

        const prepared = buildOrchestratorMessages(input);
        const { normalizedText, recentHistory, sectionPlan } = prepared;

        const model = this.model;
        if (!model) {
          return {
            text: MISSING_LLM_KEY_FALLBACK,
            metadata: { citations: ['system:missing-llm-api-key'] },
          };
        }

        const tasks = this.buildSectionTasks(model, prepared, input);

        const sectionResults = await runSectionTasks(
          tasks,
          this.buildRunnerOptions(input.requestId),
        );

        const bySection = new Map<LlmSectionName, SectionRunResult<string>>();
        for (const result of sectionResults) {
          bySection.set(result.name as LlmSectionName, result);
        }

        return this.assembleResponse({
          input,
          sectionPlan,
          bySection,
          recentHistory,
          normalizedText,
          startedAt,
        });
      },
    ); // end startSpan('llm.orchestrate')
  }

  /** Builds section tasks from the plan for use with the section runner. */
  private buildSectionTasks(
    model: ChatModel,
    prepared: ReturnType<typeof buildOrchestratorMessages>,
    input: OrchestratorInput,
  ): SectionTask<string>[] {
    const { sectionPlan, systemPrompt, historyMessages, userMessage } = prepared;
    return sectionPlan.map((section) => {
      const sectionMessages = buildSectionMessages(
        systemPrompt,
        section.prompt,
        historyMessages,
        userMessage,
        {
          userMemoryBlock: input.userMemoryBlock,
          knowledgeBaseBlock: input.knowledgeBaseBlock,
          webSearchBlock: input.webSearchBlock,
          localKnowledgeBlock: input.localKnowledgeBlock,
        },
      );
      const payloadBytes = estimatePayloadBytes(sectionMessages);
      return {
        name: section.name,
        timeoutMs: section.timeoutMs,
        payloadBytes,
        run: async (signal: AbortSignal) =>
          await this.invokeSection({
            model,
            sectionMessages,
            signal,
            sectionName: section.name,
            timeoutMs: section.timeoutMs,
            payloadBytes,
          }),
      };
    });
  }

  /** Builds runner options for section task execution. */
  private buildRunnerOptions(requestId?: string) {
    return {
      maxConcurrent: 1,
      retries: env.llm.retries,
      retryBaseDelayMs: env.llm.retryBaseDelayMs,
      totalBudgetMs: env.llm.totalBudgetMs,
      requestId,
      shouldRetry: (error: unknown, status: string) => {
        if (status === 'timeout') return true;
        return isRetryableError(error);
      },
      hooks: sectionRunnerHooks,
    };
  }

  /** Builds messages for the first section of a plan (used in streaming). */
  private buildFirstSectionMessages(
    section: ReturnType<typeof buildOrchestratorMessages>['sectionPlan'][0],
    prepared: ReturnType<typeof buildOrchestratorMessages>,
    input: OrchestratorInput,
  ) {
    return buildSectionMessages(
      prepared.systemPrompt,
      section.prompt,
      prepared.historyMessages,
      prepared.userMessage,
      {
        userMemoryBlock: input.userMemoryBlock,
        knowledgeBaseBlock: input.knowledgeBaseBlock,
        webSearchBlock: input.webSearchBlock,
        localKnowledgeBlock: input.localKnowledgeBlock,
      },
    );
  }

  /** Creates an AbortController + timeout pair for stream time-limiting. */
  private createStreamTimeout(timeoutMs: number): {
    controller: AbortController;
    clearStreamTimeout: () => void;
  } {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    return {
      controller,
      clearStreamTimeout: () => {
        clearTimeout(timeoutId);
      },
    };
  }

  /** Parses raw streamed content into the final response, optionally attaching diagnostics. */
  private buildStreamSuccessResponse(rawContent: string, requestId?: string): OrchestratorOutput {
    const parsed = parseAssistantResponse(rawContent);

    logger.info('llm_stream_complete', {
      requestId,
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
  }

  /**
   * Streams assistant response tokens via the onChunk callback while building the full response.
   * Uses the same system prompt, sections, semaphore, and retry logic as generate().
   *
   * @param input - Conversation history, user text/image, locale, museum context, etc.
   * @param onChunk - Called with each text token as it arrives from the LLM.
   * @returns Generated text and metadata after the stream completes.
   */
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
      async () => {
        if (input.intent === 'walk') {
          const walkResult = await this.generateWalk(input);
          onChunk(walkResult.text);
          return walkResult;
        }

        const prepared = buildOrchestratorMessages(input);
        const { normalizedText, recentHistory, sectionPlan } = prepared;

        const model = this.model;
        if (!model) {
          onChunk(MISSING_LLM_KEY_FALLBACK);
          return {
            text: MISSING_LLM_KEY_FALLBACK,
            metadata: { citations: ['system:missing-llm-api-key'] },
          };
        }

        const section = sectionPlan[0];
        const sectionMessages = this.buildFirstSectionMessages(section, prepared, input);

        const { controller, clearStreamTimeout } = this.createStreamTimeout(section.timeoutMs);
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

          clearStreamTimeout();
          return this.buildStreamSuccessResponse(rawContent, input.requestId);
        } catch (error) {
          clearStreamTimeout();

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

  /**
   * Dedicated orchestration path for intent='walk'. Injects WALK_TOUR_GUIDE_SECTION
   * as an additional system message and uses LangChain withStructuredOutput to return
   * a { answer, suggestions } object validated by walkAssistantOutputSchema.
   *
   * No section runner, no retry logic — exceptions propagate to the caller.
   */
  private async generateWalk(input: OrchestratorInput): Promise<OrchestratorOutput> {
    const model = this.model;
    if (!model) {
      return {
        text: MISSING_LLM_KEY_FALLBACK,
        metadata: { citations: ['system:missing-llm-api-key'] },
        suggestions: undefined,
      };
    }

    const prepared = buildOrchestratorMessages(input);
    const { systemPrompt, historyMessages, userMessage, sectionPlan } = prepared;

    // Use the first section prompt (summary) as the base section prompt.
    const sectionPrompt = sectionPlan[0]?.prompt ?? '';

    // Build message array mirroring buildSectionMessages layout but inserting
    // WALK_TOUR_GUIDE_SECTION as a SystemMessage right before the user message.
    const messages = buildSectionMessages(
      systemPrompt,
      sectionPrompt,
      historyMessages,
      userMessage,
      {
        userMemoryBlock: input.userMemoryBlock,
        knowledgeBaseBlock: input.knowledgeBaseBlock,
        webSearchBlock: input.webSearchBlock,
        localKnowledgeBlock: input.localKnowledgeBlock,
      },
    );

    // Insert WALK_TOUR_GUIDE_SECTION AFTER existing system instructions and BEFORE
    // the user's HumanMessage. buildSectionMessages also appends a trailing reminder
    // SystemMessage after the HumanMessage, so we cannot rely on length-1 here.
    const humanIdx = messages.findIndex((m) => m instanceof HumanMessage);
    const insertAt = humanIdx >= 0 ? humanIdx : messages.length;
    messages.splice(insertAt, 0, new SystemMessage(WALK_TOUR_GUIDE_SECTION));

    const structuredChain = (
      model as unknown as {
        withStructuredOutput: (
          schema: typeof walkAssistantOutputSchema,
          options: { name: string },
        ) => {
          invoke: (
            messages: unknown,
            options?: { signal?: AbortSignal },
          ) => Promise<{ answer: string; suggestions: string[] }>;
        };
      }
    ).withStructuredOutput(walkAssistantOutputSchema, { name: 'WalkAssistantOutput' });

    const signal = AbortSignal.timeout(env.llm.totalBudgetMs);
    const result = await structuredChain.invoke(messages, { signal });

    logger.info('llm_walk_orchestration_complete', {
      requestId: input.requestId,
      provider: env.llm.provider,
      model: env.llm.model,
      suggestionsCount: result.suggestions.length,
    });

    return {
      text: result.answer,
      metadata: { citations: [] },
      suggestions: result.suggestions,
    };
  }
}
