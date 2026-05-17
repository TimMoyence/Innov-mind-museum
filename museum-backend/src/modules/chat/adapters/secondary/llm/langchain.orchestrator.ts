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
import {
  createSummaryFallback,
  type LlmSectionName,
  type LlmSectionDefinition,
} from '@modules/chat/useCase/llm/llm-sections';
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

/**
 * Maps schema `text → answer` for the legacy parseAssistantResponse JSON
 * branch. Non-object input → raw string (provider regression fallback to
 * plain-text path). JSON.stringify skips undefined → omitted optionals stay
 * absent (preserves existing semantics).
 */
const serializeStructuredOutput = (parsed: unknown): string => {
  if (typeof parsed !== 'object' || parsed === null) {
    return typeof parsed === 'string' ? parsed : '';
  }
  const { text, ...metadata } = parsed as { text?: unknown } & Record<string, unknown>;
  const answer = typeof text === 'string' ? text : '';
  return JSON.stringify({ answer, ...metadata });
};

export class LangChainChatOrchestrator implements ChatOrchestrator {
  private readonly model: ChatModel | null;
  private readonly semaphore: Semaphore;
  private readonly circuitBreaker: LLMCircuitBreaker;

  constructor(deps: LangChainChatOrchestratorDeps = {}) {
    this.model = deps.model === undefined ? toModel() : deps.model;
    this.semaphore = deps.semaphore ?? new Semaphore(Math.max(1, env.llm.maxConcurrent));
    this.circuitBreaker = deps.circuitBreaker ?? new LLMCircuitBreaker();
  }

  getCircuitBreakerState(): ReturnType<LLMCircuitBreaker['getState']> {
    return this.circuitBreaker.getState();
  }

  private async invokeSection(input: InvokeSectionInput): Promise<string> {
    return await startSpan(
      {
        name: `llm.section.${input.sectionName}`,
        op: 'ai.invoke',
        attributes: {
          'llm.section': input.sectionName,
          'llm.timeout_ms': input.timeoutMs,
          'llm.payload_bytes': input.payloadBytes,
          'llm.structured_output': !!input.outputSchema && !!input.model.withStructuredOutput,
        },
      },
      async () => {
        // Structured-output fast path → OpenAI/Gemini `response_format: json_schema`.
        // Re-stringified as `{answer,...metadata}` for legacy parser.
        // Fixes gpt-4o-mini ignoring [META] on first turn (promptfoo 2026-05).
        if (input.outputSchema && input.model.withStructuredOutput) {
          const structured = input.model.withStructuredOutput(input.outputSchema.schema, {
            name: input.outputSchema.name,
          });
          const parsed = await this.circuitBreaker.execute(() =>
            this.semaphore.use(
              async () => await structured.invoke(input.sectionMessages, { signal: input.signal }),
            ),
          );
          return serializeStructuredOutput(parsed);
        }

        // Legacy text + [META] — test fakes / providers without structured output.
        const result = await this.circuitBreaker.execute(() =>
          this.semaphore.use(
            async () => await input.model.invoke(input.sectionMessages, { signal: input.signal }),
          ),
        );
        return toContentString(result.content);
      },
    );
  }

  /** Mutates `accumulator.text` so caller can access partial content on error. */
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

          // Breaker fast-fail at entry → surface 503; section fallback can't mask a degraded provider.
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

          // Section errors degrade via resolveSummary fallback; only breaker fast-fail above surfaces 503.
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

  private buildSectionTasks(
    model: ChatModel,
    prepared: ReturnType<typeof buildOrchestratorMessages>,
    input: OrchestratorInput,
  ): SectionTask<string>[] {
    const { sectionPlan, systemPrompt, historyMessages, userMessage } = prepared;
    return sectionPlan.map((section: LlmSectionDefinition) => {
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
          // C4.1 (T3.5) — thread `KnowledgeRouter` result from upstream pipeline.
          facts: input.facts,
          source: input.factsSource,
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
            outputSchema: section.outputSchema,
          }),
      };
    });
  }

  /** Keeps call sites one nesting level shallow (sonarjs/no-nested-functions). */
  private async _executeGuarded<T>(fn: () => Promise<T>): Promise<T> {
    return await this.circuitBreaker.execute(() => this.semaphore.use(fn));
  }

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

            if (accumulator.text.length > 0) {
              const parsed = parseAssistantResponse(accumulator.text);
              return { text: parsed.answer, metadata: parsed.metadata };
            }

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
   * intent='walk' — injects WALK_TOUR_GUIDE_SECTION as system msg + uses
   * withStructuredOutput → walkAssistantOutputSchema. No section runner / retry —
   * exceptions propagate.
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

    // ChatModel.withStructuredOutput is optional (test fakes / older providers).
    // Distinct citation marker keeps this observable in metadata.
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

    const sectionPrompt = sectionPlan[0]?.prompt ?? '';

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
        // C4.1 (T3.5) — thread `KnowledgeRouter` result from upstream pipeline.
        facts: input.facts,
        source: input.factsSource,
      },
    );

    // Insert WALK_TOUR_GUIDE_SECTION AFTER system instructions, BEFORE HumanMessage.
    // buildSectionMessages also appends a trailing reminder SystemMessage → can't use length-1.
    const humanIdx = messages.findIndex((m) => m instanceof HumanMessage);
    const insertAt = humanIdx >= 0 ? humanIdx : messages.length;
    messages.splice(insertAt, 0, new SystemMessage(WALK_TOUR_GUIDE_SECTION));

    const structured = model.withStructuredOutput(walkAssistantOutputSchema, {
      name: 'WalkAssistantOutput',
    });

    const signal = AbortSignal.timeout(env.llm.totalBudgetMs);
    const result = await structured.invoke(messages, { signal });

    // Schema `.default([])` → always present (Zod 4 infers as required).
    const suggestions = result.suggestions;

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
