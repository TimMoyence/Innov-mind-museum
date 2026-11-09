import { HumanMessage, SystemMessage } from '@langchain/core/messages';

import {
  buildOrchestratorMessages,
  buildSectionMessages,
  estimatePayloadBytes,
} from '@modules/chat/useCase/llm/llm-prompt-builder';
import {
  runSectionTasks,
  type SectionRunResult,
  type SectionTask,
} from '@modules/chat/useCase/llm/llm-section-runner';
import {
  WALK_TOUR_GUIDE_SECTION,
  walkAssistantOutputSchema,
  type WalkAssistantOutput,
} from '@modules/chat/useCase/llm/llm-sections/walk-tour-guide';
import { Semaphore } from '@modules/chat/useCase/llm/semaphore';
import { logger } from '@shared/logger/logger';
import { startSpan } from '@shared/observability/sentry';
import { env } from '@src/config/env';

import { assembleResponse } from './langchain-orchestrator-assembly';
import { buildRunnerOptions } from './langchain-orchestrator-stream';
import {
  MISSING_LLM_KEY_FALLBACK,
  toModel,
  isRetryableError,
  isIncludeRawShape,
  recordPromptCacheTelemetry,
} from './langchain-orchestrator-support';
import { CircuitOpenError, LLMCircuitBreaker } from './llm-circuit-breaker';
import { chargeFailOpen, type LlmCostCircuitBreaker } from './llm-cost-circuit-breaker';
import { estimateCostCents } from './llm-cost-pricing';

import type {
  ChatModel,
  InvokeSectionInput,
  LangChainChatOrchestratorDeps,
  UsageMetadata,
} from './langchain-orchestrator-support';
import type { BaseMessage } from '@langchain/core/messages';
import type {
  OrchestratorInput,
  OrchestratorOutput,
  ChatOrchestrator,
} from '@modules/chat/domain/ports/chat-orchestrator.port';
import type {
  LlmSectionName,
  LlmSectionDefinition,
  MainAssistantOutput,
} from '@modules/chat/useCase/llm/llm-sections';

function injectWalkTourGuideSection(messages: BaseMessage[]): void {
  const humanIdx = messages.findIndex((m) => m instanceof HumanMessage);
  const insertAt = humanIdx >= 0 ? humanIdx : messages.length;
  messages.splice(insertAt, 0, new SystemMessage(WALK_TOUR_GUIDE_SECTION));
}

export class LangChainChatOrchestrator implements ChatOrchestrator {
  private readonly model: ChatModel | null;
  private readonly semaphore: Semaphore;
  private readonly circuitBreaker: LLMCircuitBreaker;
  private readonly costBreaker: LlmCostCircuitBreaker | null;

  constructor(deps: LangChainChatOrchestratorDeps = {}) {
    this.model = deps.model === undefined ? toModel() : deps.model;
    this.semaphore = deps.semaphore ?? new Semaphore(Math.max(1, env.llm.maxConcurrent));
    this.circuitBreaker = deps.circuitBreaker ?? new LLMCircuitBreaker();
    this.costBreaker = deps.costBreaker ?? null;
  }

  private recordSectionCost(payloadBytes: number): void {
    chargeFailOpen(
      this.costBreaker,
      () => estimateCostCents(payloadBytes, env.llm.model, env.llm.maxOutputTokens),
      'llm_cost_record_failed',
    );
  }

  getCircuitBreakerState(): ReturnType<LLMCircuitBreaker['getState']> {
    return this.circuitBreaker.getState();
  }

  private checkLatencyBreakerOrThrow(
    site: 'invokeSection' | 'generateWalk',
    requestId: string | undefined,
  ): void {
    if (this.circuitBreaker.state !== 'OPEN') return;
    logger.warn('llm_cost_circuit_breaker_reject', {
      site,
      requestId,
      reason: 'latency',
    });
    throw new CircuitOpenError();
  }

  private checkCostBreakerOrThrow(
    site: 'invokeSection' | 'generateWalk',
    requestId: string | undefined,
  ): { wasHalfOpen: boolean } {
    if (!this.costBreaker) return { wasHalfOpen: false };
    const wasHalfOpen = this.costBreaker.getState().state === 'HALF_OPEN';
    if (!this.costBreaker.canAttempt()) {
      logger.warn('llm_cost_circuit_breaker_reject', {
        site,
        requestId,
        reason: 'cost',
      });
      throw new CircuitOpenError();
    }
    return { wasHalfOpen };
  }

  private maybeRecordHalfOpenProbeFailure(
    wasHalfOpen: boolean,
    sectionResults: SectionRunResult<MainAssistantOutput>[],
    requestId: string | undefined,
  ): void {
    if (!wasHalfOpen || !this.costBreaker) return;
    if (sectionResults.length === 0) return;
    if (sectionResults.some((result) => result.status === 'success')) return;
    logger.info('llm_cost_circuit_breaker_probe_failure', {
      site: 'invokeSection',
      requestId,
    });
    this.costBreaker.recordFailure();
  }

  private async invokeSection(input: InvokeSectionInput): Promise<MainAssistantOutput> {
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
        if (!input.outputSchema || !input.model.withStructuredOutput) {
          throw new Error(
            'section missing outputSchema or model.withStructuredOutput — legacy path retired C9.17',
          );
        }

        const structured = input.model.withStructuredOutput(input.outputSchema.schema, {
          name: input.outputSchema.name,
          includeRaw: true,
        });
        const result = (await this.circuitBreaker.execute(() =>
          this.semaphore.use(
            async () => await structured.invoke(input.sectionMessages, { signal: input.signal }),
          ),
        )) as
          | MainAssistantOutput
          | { raw: { usage_metadata?: UsageMetadata }; parsed: MainAssistantOutput | null };

        let parsed: MainAssistantOutput;
        let usage: UsageMetadata | undefined;
        if (isIncludeRawShape<MainAssistantOutput>(result)) {
          if (result.parsed === null) {
            throw new Error('structured output parse failure — parsed: null');
          }
          parsed = result.parsed;
          usage = result.raw.usage_metadata;
        } else {
          parsed = result;
          usage = undefined;
        }

        recordPromptCacheTelemetry({
          requestId: input.requestId,
          sectionName: input.sectionName,
          provider: env.llm.provider,
          model: env.llm.model,
          usage,
        });

        this.recordSectionCost(input.payloadBytes);
        return parsed;
      },
    );
  }

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

        if (this.circuitBreaker.state === 'OPEN') {
          throw new CircuitOpenError();
        }

        const { wasHalfOpen: wasHalfOpenAtAttempt } = this.checkCostBreakerOrThrow(
          'invokeSection',
          input.requestId,
        );

        const startedAt = Date.now();

        const prepared = buildOrchestratorMessages(input);
        const { normalizedText, recentHistory, sectionPlan } = prepared;

        const model = this.model;
        if (!model) {
          return this.cannedFallback('system:missing-llm-api-key');
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

        this.maybeRecordHalfOpenProbeFailure(wasHalfOpenAtAttempt, sectionResults, input.requestId);

        const bySection = new Map<LlmSectionName, SectionRunResult<MainAssistantOutput>>();
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
    );
  }

  private buildSectionTasks(
    model: ChatModel,
    prepared: ReturnType<typeof buildOrchestratorMessages>,
    input: OrchestratorInput,
  ): SectionTask<MainAssistantOutput>[] {
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
          facts: input.facts,
          source: input.factsSource,
        },
      );
      const payloadBytes = estimatePayloadBytes(sectionMessages);
      const tier = input.userId == null ? 'anonymous' : 'free';
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
            museumId: input.museumId ?? null,
            tier,
            requestId: input.requestId,
          }),
      };
    });
  }

  private cannedFallback(citation: string): OrchestratorOutput {
    return {
      text: MISSING_LLM_KEY_FALLBACK,
      metadata: { citations: [citation] },
      suggestions: undefined,
      degraded: true,
    };
  }

  private async invokeWalkStructured(
    withStructuredOutput: NonNullable<NonNullable<ChatModel>['withStructuredOutput']>,
    messages: BaseMessage[],
    walkWasHalfOpen: boolean,
    requestId: string | undefined,
  ): Promise<
    | WalkAssistantOutput
    | { raw: { usage_metadata?: UsageMetadata }; parsed: WalkAssistantOutput | null }
  > {
    const structured = withStructuredOutput(walkAssistantOutputSchema, {
      name: 'WalkAssistantOutput',
      includeRaw: true,
    });
    const signal = AbortSignal.timeout(env.llm.totalBudgetMs);
    try {
      return (await structured.invoke(messages, { signal })) as
        | WalkAssistantOutput
        | { raw: { usage_metadata?: UsageMetadata }; parsed: WalkAssistantOutput | null };
    } catch (err) {
      if (walkWasHalfOpen && this.costBreaker) {
        logger.info('llm_cost_circuit_breaker_probe_failure', {
          site: 'generateWalk',
          requestId,
        });
        this.costBreaker.recordFailure();
      }
      throw err;
    }
  }

  private async generateWalk(input: OrchestratorInput): Promise<OrchestratorOutput> {
    const model = this.model;
    if (!model) return this.cannedFallback('system:missing-llm-api-key');

    if (!model.withStructuredOutput) {
      logger.warn('llm_walk_no_structured_output', {
        requestId: input.requestId,
        provider: env.llm.provider,
        model: env.llm.model,
      });
      return this.cannedFallback('system:missing-structured-output');
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
        facts: input.facts,
        source: input.factsSource,
      },
    );

    injectWalkTourGuideSection(messages);

    this.checkLatencyBreakerOrThrow('generateWalk', input.requestId);
    const { wasHalfOpen: walkWasHalfOpen } = this.checkCostBreakerOrThrow(
      'generateWalk',
      input.requestId,
    );

    const withStructuredOutput = model.withStructuredOutput.bind(model);
    const rawResult = await this.invokeWalkStructured(
      withStructuredOutput,
      messages,
      walkWasHalfOpen,
      input.requestId,
    );
    const { result, usage } = this.narrowWalkStructuredResult(rawResult);
    const walkPayloadBytes = estimatePayloadBytes(messages);

    recordPromptCacheTelemetry({
      requestId: input.requestId,
      sectionName: 'walk',
      provider: env.llm.provider,
      model: env.llm.model,
      usage,
    });

    this.recordSectionCost(walkPayloadBytes);

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
      degraded: false,
    };
  }

  private narrowWalkStructuredResult(
    rawResult:
      | WalkAssistantOutput
      | { raw: { usage_metadata?: UsageMetadata }; parsed: WalkAssistantOutput | null },
  ): {
    result: WalkAssistantOutput;
    usage: UsageMetadata | undefined;
  } {
    if (isIncludeRawShape<WalkAssistantOutput>(rawResult)) {
      if (rawResult.parsed === null) {
        throw new Error('walk structured output parse failure — parsed: null');
      }
      return { result: rawResult.parsed, usage: rawResult.raw.usage_metadata };
    }
    return { result: rawResult, usage: undefined };
  }
}
