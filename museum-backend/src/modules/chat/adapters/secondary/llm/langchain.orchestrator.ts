import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import {
  buildOrchestratorMessages,
  buildSectionMessages,
  toContentString,
  estimatePayloadBytes,
} from '@modules/chat/useCase/llm/llm-prompt-builder';
import {
  runSectionTasks,
  type SectionRunResult,
  type SectionTask,
} from '@modules/chat/useCase/llm/llm-section-runner';
import { createSummaryFallback, type LlmSectionName } from '@modules/chat/useCase/llm/llm-sections';
import {
  WALK_TOUR_GUIDE_SECTION,
  walkAssistantOutputSchema,
} from '@modules/chat/useCase/llm/llm-sections/walk-tour-guide';
import { Semaphore } from '@modules/chat/useCase/llm/semaphore';
import { parseAssistantResponse } from '@modules/chat/useCase/orchestration/assistant-response';
import { logger } from '@shared/logger/logger';
import { startSpan } from '@shared/observability/sentry';
import { env } from '@src/config/env';

import { assembleResponse, buildStreamSuccessResponse } from './langchain-orchestrator-assembly';
import {
  buildFirstSectionMessages,
  buildRunnerOptions,
  createStreamTimeout,
} from './langchain-orchestrator-stream';
import {
  MISSING_LLM_KEY_FALLBACK,
  toModel,
  isRetryableError,
} from './langchain-orchestrator-support';
import { withLangfuseTrace } from './langchain-orchestrator-tracing';
import { CircuitOpenError, LLMCircuitBreaker } from './llm-circuit-breaker';

import type {
  ChatModel,
  InvokeSectionInput,
  LangChainChatOrchestratorDeps,
} from './langchain-orchestrator-support';
import type {
  OrchestratorInput,
  OrchestratorOutput,
  ChatOrchestrator,
} from '@modules/chat/domain/ports/chat-orchestrator.port';

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
  getCircuitBreakerState(): ReturnType<LLMCircuitBreaker['getState']> {
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

  /**
   * Builds section-based prompts, invokes the LLM with retry/timeout logic, and assembles the final response.
   *
   * @param input - Conversation history, user text/image, locale, museum context, etc.
   * @returns Generated text and metadata (citations, diagnostics).
   */
  async generate(input: OrchestratorInput): Promise<OrchestratorOutput> {
    return await withLangfuseTrace('llm.orchestrate', input, () =>
      startSpan(
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

          // Banking-grade fast-fail: if the breaker is OPEN at orchestration entry,
          // surface the CIRCUIT_BREAKER_OPEN 503 immediately so callers stop retrying
          // and the synthetic per-section fallback can't mask a degraded provider.
          if (this.circuitBreaker.state === 'OPEN') {
            throw new CircuitOpenError();
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
            buildRunnerOptions({
              requestId: input.requestId,
              shouldRetry: (error: unknown, status: string) => {
                if (status === 'timeout') return true;
                return isRetryableError(error);
              },
            }),
          );

          // (Section-level errors degrade gracefully via the fallback path in
          // resolveSummary — see unit tests "fallback when section errors".
          // The breaker fast-fail at orchestrator entry above is the only
          // path that surfaces 503 to the caller for the LLM-provider-down
          // contract; once the breaker is OPEN, individual failed sections
          // never even start invoking the model.)

          const bySection = new Map<LlmSectionName, SectionRunResult<string>>();
          for (const result of sectionResults) {
            bySection.set(result.name as LlmSectionName, result);
          }

          return assembleResponse({
            input,
            sectionPlan,
            bySection,
            recentHistory,
            normalizedText,
            startedAt,
          });
        },
      ),
    );
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

  /**
   * Runs `fn` behind the LLM circuit breaker and the per-request semaphore.
   * Extracted into a single helper so call sites stay one nesting level shallow
   * (sonarjs/no-nested-functions + max-nested-callbacks).
   */
  private async _executeGuarded<T>(fn: () => Promise<T>): Promise<T> {
    return await this.circuitBreaker.execute(() => this.semaphore.use(fn));
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
    return await withLangfuseTrace('llm.orchestrate.stream', input, () =>
      startSpan(
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
          const sectionMessages = buildFirstSectionMessages(section, prepared, input);

          const { controller, clearStreamTimeout } = createStreamTimeout(section.timeoutMs);
          const accumulator = { text: '' };

          try {
            const rawContent = await this._executeGuarded(() =>
              this.streamSection(model, sectionMessages, controller.signal, onChunk, accumulator),
            );

            clearStreamTimeout();
            return buildStreamSuccessResponse(rawContent, input.requestId);
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
      ),
    );
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

    // Guard: structured output is optional on the ChatModel port. Test fakes and
    // older provider adapters may omit it. Fall back gracefully with a distinct
    // citation marker so this case is observable in metadata.
    if (!model.withStructuredOutput) {
      logger.warn('llm_walk_no_structured_output', {
        requestId: input.requestId,
        provider: env.llm.provider,
        model: env.llm.model,
      });
      return {
        text: MISSING_LLM_KEY_FALLBACK,
        metadata: { citations: ['system:missing-structured-output'] },
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

    const structured = model.withStructuredOutput(walkAssistantOutputSchema, {
      name: 'WalkAssistantOutput',
    });

    const signal = AbortSignal.timeout(env.llm.totalBudgetMs);
    const result = await structured.invoke(messages, { signal });

    // Schema applies `.default([])` so suggestions is always present at runtime,
    // but the inferred ZodSchema<T> may surface it as optional. Coalesce defensively.
    const suggestions = result.suggestions ?? [];

    logger.info('llm_walk_orchestration_complete', {
      requestId: input.requestId,
      provider: env.llm.provider,
      model: env.llm.model,
      suggestionsCount: suggestions.length,
    });

    return {
      text: result.answer,
      metadata: { citations: [] },
      suggestions,
    };
  }
}
