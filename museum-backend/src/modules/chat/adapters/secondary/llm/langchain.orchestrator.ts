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
  LangfuseCallbacksRef,
  UsageMetadata,
  UsageRef,
} from './langchain-orchestrator-support';
import type { LlmCostCircuitBreaker } from './llm-cost-circuit-breaker';
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
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

/**
 * TD-LF-02 — folds the Langfuse `CallbackHandler` (when present) onto the
 * base `.invoke()` opts. Used by both the section path and the walk path so
 * the wiring is one helper, not two divergent ternaries. Returns the base
 * opts unchanged when no callbacks are registered (pre-LF-02 shape).
 */
function mergeInvokeOpts(
  baseOpts: { signal: AbortSignal },
  callbacksRef: LangfuseCallbacksRef | undefined,
): { signal: AbortSignal } | { signal: AbortSignal; callbacks: BaseCallbackHandler[] } {
  const callbacks = callbacksRef?.current;
  if (!callbacks || callbacks.length === 0) return baseOpts;
  return { ...baseOpts, callbacks };
}

/**
 * Insert `WALK_TOUR_GUIDE_SECTION` AFTER the system instructions and BEFORE
 * the first HumanMessage — `buildSectionMessages` also appends a trailing
 * reminder SystemMessage, so we can't use `length - 1`. Extracted to keep
 * `generateWalk` under the `max-lines-per-function` cap.
 */
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

  /**
   * RUN_ID 2026-05-21-p0-c2-cost-breaker — A7 / spec §3 R3. Latency
   * circuit-breaker guard for the walk path (default path already gates at
   * `generate()` entry). Throws `CircuitOpenError` when state is OPEN — the
   * walk path was previously early-returned BEFORE the default-path guard,
   * bypassing both breakers.
   */
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

  /**
   * RUN_ID 2026-05-21-p0-c2-cost-breaker — spec §3 R1 + R3. Cost-breaker
   * fail-CLOSED guard shared by `generate()` default path and
   * `generateWalk()`. Returns `{ wasHalfOpen }` so the caller can later wire
   * R9 `recordFailure()` when the probe attempt is consumed AND the LLM
   * call fails. Throws `CircuitOpenError` when `canAttempt()` returns false
   * (state OPEN, or HALF_OPEN with the probe already in flight).
   *
   * `wasHalfOpen` MUST be captured BEFORE the `canAttempt()` call because
   * the call mutates `probeInFlight` (single-probe semantics, see
   * `llm-cost-circuit-breaker.ts:107-114`).
   */
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

  /**
   * RUN_ID 2026-05-21-p0-c2-cost-breaker — spec §3 R9. When the HALF_OPEN
   * probe was consumed by `canAttempt()` and every section returned a
   * non-`success` status (no `recordCharge()` ever fired → no CLOSED
   * transition), the probe counts as failed evidence → call `recordFailure()`
   * to re-trip OPEN. Default path inspects the aggregate; walk path uses
   * its own try/catch around `structured.invoke`.
   */
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
        // TD-LF-02 — when `withLangfuseTrace` opened a trace, `callbacksRef`
        // carries the `langfuse-langchain` CallbackHandler ; the shared
        // `mergeInvokeOpts` helper folds it onto the signal opts so this
        // call writes its LLM observations onto the same trace root. Empty
        // / absent ref → unchanged invoke shape.
        const result = (await this.circuitBreaker.execute(() =>
          this.semaphore.use(
            async () =>
              await structured.invoke(
                input.sectionMessages,
                mergeInvokeOpts({ signal: input.signal }, input.callbacksRef),
              ),
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
    // TD-LF-02 — `callbacksRef` is populated by `withLangfuseTrace` after the
    // trace is open (and only when Langfuse is enabled). Sections + walk path
    // read `callbacksRef.current` at `.invoke()` time so LangChain's internal
    // chain / LLM observations append to the same trace.
    const callbacksRef: LangfuseCallbacksRef = {};
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
              return await this.generateWalk(input, usageRef, callbacksRef);
            }

            // Breaker fast-fail at entry → surface 503; section fallback can't mask a degraded provider.
            if (this.circuitBreaker.state === 'OPEN') {
              throw new CircuitOpenError();
            }

            // RUN_ID 2026-05-21-p0-c2-cost-breaker — A6 / spec §3 R1.
            // Cost-breaker fail-CLOSED guard. Throw bubbles through
            // `withLangfuseTrace` + `startSpan` (both rethrow on catch) up to
            // `chat-message.service.ts:259` → `mapOrchestratorError` preserves
            // the `AppError` → 503 `CIRCUIT_BREAKER_OPEN` to the client.
            // Placed BEFORE `runSectionTasks` because the section runner
            // swallows per-task errors into `SectionRunFailure` (degrade via
            // fallback) — the breaker rejection must bypass that path.
            const { wasHalfOpen: wasHalfOpenAtAttempt } = this.checkCostBreakerOrThrow(
              'invokeSection',
              input.requestId,
            );

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

            const tasks = this.buildSectionTasks(model, prepared, input, usageRef, callbacksRef);

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

            // RUN_ID 2026-05-21-p0-c2-cost-breaker — R9. See
            // `maybeRecordHalfOpenProbeFailure` for the rationale + algorithm.
            this.maybeRecordHalfOpenProbeFailure(
              wasHalfOpenAtAttempt,
              sectionResults,
              input.requestId,
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
      callbacksRef,
    );
  }

  private buildSectionTasks(
    model: ChatModel,
    prepared: ReturnType<typeof buildOrchestratorMessages>,
    input: OrchestratorInput,
    usageRef: UsageRef,
    callbacksRef: LangfuseCallbacksRef,
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
            // TD-LF-02 — opt-in LangChain CallbackHandler ref (populated by
            // `withLangfuseTrace` when Langfuse is enabled).
            callbacksRef,
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
  /** Walk-path canned fallback ; extracted to keep `generateWalk` under the line cap. */
  private walkFallback(citation: string): OrchestratorOutput {
    return {
      text: MISSING_LLM_KEY_FALLBACK,
      metadata: { citations: [citation] },
      suggestions: undefined,
    };
  }

  /**
   * RUN_ID 2026-05-21-p0-c2-cost-breaker — spec §3 R9 (walk path).
   * Wraps `structured.invoke()` so a probe failure under HALF_OPEN signals
   * `recordFailure()` to the cost breaker. Re-throws the original error so
   * the caller observes the same exception shape — bubbles through
   * `withLangfuseTrace` to `mapOrchestratorError`. Extracted to keep
   * `generateWalk` under the `max-lines-per-function` cap.
   */
  private async invokeWalkStructured(
    withStructuredOutput: NonNullable<NonNullable<ChatModel>['withStructuredOutput']>,
    messages: BaseMessage[],
    callbacksRef: LangfuseCallbacksRef,
    walkWasHalfOpen: boolean,
    requestId: string | undefined,
  ): Promise<
    | WalkAssistantOutput
    | { raw: { usage_metadata?: UsageMetadata }; parsed: WalkAssistantOutput | null }
  > {
    // C9.5 D5.a — parity with chat path: `includeRaw: true` surfaces the
    // raw AIMessage's `usage_metadata.input_token_details.cache_read` so we
    // can classify hit/partial/miss and feed the same Prom Counter + log +
    // Langfuse usage block. R10: fakes / providers returning the parsed-only
    // shape degrade to `'miss'` via the `isIncludeRawShape` narrowing.
    const structured = withStructuredOutput(walkAssistantOutputSchema, {
      name: 'WalkAssistantOutput',
      includeRaw: true,
    });
    const signal = AbortSignal.timeout(env.llm.totalBudgetMs);
    try {
      return (await structured.invoke(messages, mergeInvokeOpts({ signal }, callbacksRef))) as
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

  private async generateWalk(
    input: OrchestratorInput,
    usageRef: UsageRef,
    callbacksRef: LangfuseCallbacksRef,
  ): Promise<OrchestratorOutput> {
    const model = this.model;
    if (!model) return this.walkFallback('system:missing-llm-api-key');

    // ChatModel.withStructuredOutput is optional (test fakes / older providers).
    if (!model.withStructuredOutput) {
      logger.warn('llm_walk_no_structured_output', {
        requestId: input.requestId,
        provider: env.llm.provider,
        model: env.llm.model,
      });
      return this.walkFallback('system:missing-structured-output');
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

    injectWalkTourGuideSection(messages);

    // RUN_ID 2026-05-21-p0-c2-cost-breaker — A7 / spec §3 R3. Walk path was
    // early-returned at `generate()` BEFORE the default-path latency guard
    // AND BEFORE the cost guard. Mirror both here so the walk path honours
    // the same fail-CLOSED contract — `CircuitOpenError` bubbles through
    // `withLangfuseTrace` + `startSpan` to the chat service.
    this.checkLatencyBreakerOrThrow('generateWalk', input.requestId);
    const { wasHalfOpen: walkWasHalfOpen } = this.checkCostBreakerOrThrow(
      'generateWalk',
      input.requestId,
    );

    const withStructuredOutput = model.withStructuredOutput.bind(model);
    const rawResult = await this.invokeWalkStructured(
      withStructuredOutput,
      messages,
      callbacksRef,
      walkWasHalfOpen,
      input.requestId,
    );
    const { result, usage } = this.narrowWalkStructuredResult(rawResult);
    const walkPayloadBytes = estimatePayloadBytes(messages);

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
