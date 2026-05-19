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
import { llmCostEurPerHour } from '@shared/observability/prometheus-metrics';
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
import { withLangfuseTrace } from './langchain-orchestrator-tracing';
import { CircuitOpenError, LLMCircuitBreaker } from './llm-circuit-breaker';
import { estimateCostCents } from './llm-cost-pricing';

import type {
  ChatModel,
  InvokeSectionInput,
  LangChainChatOrchestratorDeps,
  UsageMetadata,
  UsageRef,
} from './langchain-orchestrator-support';
import type { LlmCostCircuitBreaker } from './llm-cost-circuit-breaker';
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

  /**
   * C9.4 — records a conservative cost estimate against the cost circuit
   * breaker and updates the Prom gauge. Fail-open: any failure is logged but
   * does not propagate into the chat path.
   */
  private recordSectionCost(
    payloadBytes: number,
    museumId: number | null | undefined,
    tier: string | undefined,
  ): void {
    if (!this.costBreaker) return;
    try {
      const cents = estimateCostCents(payloadBytes, env.llm.model, env.llm.maxOutputTokens);
      if (cents <= 0) return;
      this.costBreaker.recordCharge(cents);
      const labels = {
        tier: tier ?? 'anonymous',
        museum_id: museumId != null ? String(museumId) : 'none',
      };
      llmCostEurPerHour.set(labels, this.costBreaker.getState().hourlySpendCents / 100);
    } catch (err) {
      logger.warn('llm_cost_record_failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  getCircuitBreakerState(): ReturnType<LLMCircuitBreaker['getState']> {
    return this.circuitBreaker.getState();
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
        // C9.17 R2 — fail-closed contract. The legacy plain-text + JSON-tail
        // fallback path was retired 2026-05-18 (UFR-016); every default-path
        // section MUST ship an `outputSchema` AND target a model that exposes
        // `withStructuredOutput`. The section runner catches the throw and
        // surfaces the canned `createSummaryFallback` text downstream.
        if (!input.outputSchema || !input.model.withStructuredOutput) {
          throw new Error(
            'section missing outputSchema or model.withStructuredOutput — legacy path retired C9.17',
          );
        }

        // Structured-output fast path → OpenAI/Gemini `response_format: json_schema`.
        // C9.5 — `includeRaw: true` exposes the raw AIMessage's
        // `usage_metadata.input_token_details.cache_read` for prompt-cache
        // telemetry. R10 fallback handles fakes / older SDKs that return the
        // legacy parsed-only shape.
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
            // C9.17 R2 — structured-output parse failure surfaces as a section
            // error; the runner catches it and ships the canned fallback.
            throw new Error('structured output parse failure — parsed: null');
          }
          parsed = result.parsed;
          usage = result.raw.usage_metadata;
        } else {
          // R10 — fake / older SDK / provider ignored `includeRaw: true` and
          // returned the parsed-only shape. Telemetry degrades to `'miss'`
          // (no usage metadata available); chat path stays healthy.
          parsed = result;
          usage = undefined;
        }

        // C9.5 — R8/R9/R11/R12 emit Prom + log + Langfuse usage block.
        // All side-effects are swallowed internally; this call never throws.
        recordPromptCacheTelemetry(
          {
            requestId: input.requestId,
            sectionName: input.sectionName,
            provider: env.llm.provider,
            model: env.llm.model,
            usage,
          },
          input.usageRef,
        );

        // C9.4 — record cost only on success (R2: no charge on error).
        this.recordSectionCost(input.payloadBytes, input.museumId, input.tier);
        return parsed;
      },
    );
  }

  async generate(input: OrchestratorInput): Promise<OrchestratorOutput> {
    // C9.5 D7 — `usageRef` ferries the section's `usage_metadata` (cache_read
    // + input/output tokens) up to the enclosing Langfuse generation.end()
    // call without polluting the public `OrchestratorOutput` port.
    const usageRef: UsageRef = {};
    return await withLangfuseTrace(
      'llm.orchestrate',
      input,
      () =>
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
              return await this.generateWalk(input, usageRef);
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

            const tasks = this.buildSectionTasks(model, prepared, input, usageRef);

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
        ),
      usageRef,
    );
  }

  private buildSectionTasks(
    model: ChatModel,
    prepared: ReturnType<typeof buildOrchestratorMessages>,
    input: OrchestratorInput,
    usageRef: UsageRef,
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
          // C4.1 (T3.5) — thread `KnowledgeRouter` result from upstream pipeline.
          facts: input.facts,
          source: input.factsSource,
        },
      );
      const payloadBytes = estimatePayloadBytes(sectionMessages);
      // C9.4 — V1 tier derivation. D5: anonymous when userId absent, free otherwise.
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
            // C9.5 — thread for cache-status telemetry.
            requestId: input.requestId,
            usageRef,
          }),
      };
    });
  }

  /**
   * intent='walk' — injects WALK_TOUR_GUIDE_SECTION as system msg + uses
   * withStructuredOutput → walkAssistantOutputSchema. No section runner / retry —
   * exceptions propagate.
   *
   * C9.5 D5.a — walk path uses `includeRaw: true` and emits the same
   * `recordPromptCacheTelemetry` side-effects as the default `invokeSection`
   * (Prom Counter + log + Langfuse usage block). R10/R12 graceful degradation
   * applies: fakes / older SDKs returning the parsed-only shape classify as
   * `'miss'` and telemetry helpers swallow their own failures.
   */
  private async generateWalk(
    input: OrchestratorInput,
    usageRef: UsageRef,
  ): Promise<OrchestratorOutput> {
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

    // C9.5 D5.a — parity with chat path: `includeRaw: true` surfaces the
    // raw AIMessage's `usage_metadata.input_token_details.cache_read` so we
    // can classify hit/partial/miss and feed the same Prom Counter + log +
    // Langfuse usage block. R10: fakes / providers returning the parsed-only
    // shape degrade to `'miss'` via the `isIncludeRawShape` narrowing below.
    const structured = model.withStructuredOutput(walkAssistantOutputSchema, {
      name: 'WalkAssistantOutput',
      includeRaw: true,
    });

    const signal = AbortSignal.timeout(env.llm.totalBudgetMs);
    const walkPayloadBytes = estimatePayloadBytes(messages);
    const rawResult = (await structured.invoke(messages, { signal })) as
      | WalkAssistantOutput
      | { raw: { usage_metadata?: UsageMetadata }; parsed: WalkAssistantOutput | null };
    const { result, usage } = this.narrowWalkStructuredResult(rawResult);

    // C9.5 D5.a — R8/R9/R11/R12 emit Prom + log + Langfuse usage block. All
    // side-effects swallowed internally; this call never throws.
    recordPromptCacheTelemetry(
      {
        requestId: input.requestId,
        sectionName: 'walk',
        provider: env.llm.provider,
        model: env.llm.model,
        usage,
      },
      usageRef,
    );

    // C9.4 — record cost on walk path (bypasses invokeSection). R2: only on success.
    const walkTier = input.userId == null ? 'anonymous' : 'free';
    this.recordSectionCost(walkPayloadBytes, input.museumId ?? null, walkTier);

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

  /**
   * C9.5 D5.a — narrows the walk path's `includeRaw: true` response. R10:
   * providers/fakes returning the parsed-only shape degrade to no usage.
   */
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
