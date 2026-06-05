import { withPolicyCitation } from '@modules/chat/useCase/image/chat-image.helpers';
import { AUDIT_SECURITY_GUARDRAIL_PASS } from '@shared/audit/audit.types';
import { logger } from '@shared/logger/logger';
import { deriveTier } from '@shared/observability/derive-tier';
import { env } from '@src/config/env';

import {
  buildGuardrailRefusal,
  evaluateAssistantOutputGuardrail,
  evaluateUserInputGuardrail,
} from './art-topic-guardrail';
import { recordBiasMetrics, resolveLocaleLabel } from './eval/bias-metrics.helper';
import { aggregateOutputText } from './eval/output-aggregator';
import {
  evaluateGuardrailProvider,
  runLlmJudge,
  type EvaluateGuardrailProviderDeps,
  type RunLlmJudgeDeps,
} from './eval/v2-layers.helper';
import { buildGuardrailBlockAuditEntry } from './guardrail-audit-payload';
import { logInputRedaction } from './guardrail-input-redaction';
import { buildBlockedOutputPayload } from './guardrail-refusal-builder';

import type { GuardrailBlockReason } from './art-topic-guardrail';
import type { GuardrailAuditContext } from './guardrail-audit-payload';
import type {
  GuardrailEvaluationServiceDeps,
  InputGuardrailResult,
  LlmJudgeFn,
} from './guardrail-evaluation.types';
import type { ChatAssistantMetadata } from '@modules/chat/domain/chat.types';
import type { GuardrailProvider } from '@modules/chat/domain/ports/guardrail-provider.port';
import type {
  ChatRepository,
  PersistMessageInput,
} from '@modules/chat/domain/session/chat.repository.interface';
import type { PostMessageResult } from '@modules/chat/useCase/orchestration/chat.service.types';
import type { AuditService } from '@shared/audit/audit.service';
import type { LlmJudgeScope } from '@shared/observability/derive-tier';

export type { GuardrailAuditContext, LlmJudgeFn };

export class GuardrailEvaluationService {
  private readonly repository: ChatRepository;
  private readonly audit?: AuditService;
  private readonly guardrailProvider?: GuardrailProvider;
  private readonly guardrailProviderObserveOnly: boolean;
  private readonly llmJudge?: LlmJudgeFn;
  private readonly llmJudgeEnabled: boolean;
  private readonly frictionEnabled: boolean;

  constructor(deps: GuardrailEvaluationServiceDeps) {
    this.repository = deps.repository;
    this.audit = deps.audit;
    this.guardrailProvider = deps.guardrailProvider;
    this.guardrailProviderObserveOnly = deps.guardrailProviderObserveOnly ?? true;
    this.llmJudge = deps.llmJudge;
    this.llmJudgeEnabled = deps.llmJudgeEnabled ?? false;
    this.frictionEnabled = deps.frictionEnabled ?? env.guardrails.frictionEnabled;
  }

  /**
   * V13 / STRIDE R3 — single forensic entry per block. NEVER throws:
   * `auditService.log()` swallows so an audit hiccup can't break chat hot path.
   */
  private async logBlock(params: {
    phase: 'input' | 'output';
    reason: GuardrailBlockReason | undefined;
    fullText: string;
    classifierRan: boolean;
    providerRan: boolean;
    context?: GuardrailAuditContext;
  }): Promise<void> {
    if (!this.audit) return;
    await this.audit.log(buildGuardrailBlockAuditEntry(params));
  }

  /** ADR-015 — V2 layers structurally independent (separate dep getters). */
  private providerDeps(): EvaluateGuardrailProviderDeps {
    return {
      guardrailProvider: this.guardrailProvider,
      guardrailProviderObserveOnly: this.guardrailProviderObserveOnly,
    };
  }

  private judgeDeps(): RunLlmJudgeDeps {
    return {
      llmJudge: this.llmJudge,
      llmJudgeEnabled: this.llmJudgeEnabled,
    };
  }

  /**
   * TD-20 (R13c/R13e/R12) — per-tenant scope for the judge + LLM-Guard
   * observations, derived from the audit context. `museumId` honestly ABSENT
   * (not in `GuardrailAuditContext` — spec §5/D5). Spread-omit `requestId`.
   */
  private scopeFromContext(context?: GuardrailAuditContext): LlmJudgeScope {
    return {
      tier: deriveTier(context?.userId),
      ...(context?.requestId !== undefined ? { requestId: context.requestId } : {}),
    };
  }

  /**
   * ADR-048 input-leg provider call. Extracted so `evaluateInput` stays under
   * the line cap. TD-20 (R13e/R12) — forwards `{tier, requestId}` scope.
   */
  private async runProviderCheckInput(
    text: string | undefined,
    context?: GuardrailAuditContext,
  ): Promise<{ allow: boolean; reason?: string; redactedText?: string }> {
    if (!this.guardrailProvider) return { allow: true };
    return await this.guardrailProvider.checkInput({
      text: text ?? '',
      ...this.scopeFromContext(context),
    });
  }

  /**
   * Hybrid-gravity (2026-06-01) — legacy kill-switch inline judge. Extracted
   * from `evaluateInput` (complexity cap) and invoked ONLY when
   * `frictionEnabled=false`, preserving the prior hard-block-every-off-topic
   * behaviour (spec R13). Returns the block result when the judge refuses, or
   * `null` when it allows (caller continues the normal allow path).
   */
  private async runLegacyInlineJudge(
    text: string | undefined,
    locale: string,
    context?: GuardrailAuditContext,
  ): Promise<InputGuardrailResult | null> {
    const scope = this.scopeFromContext(context);
    const judgeDecision = await runLlmJudge(text ?? '', this.judgeDeps(), scope);
    if (judgeDecision.allow) return null;
    recordBiasMetrics({ locale, layer: 'judge', decision: judgeDecision });
    await this.logBlock({
      phase: 'input',
      reason: judgeDecision.reason,
      fullText: text ?? '',
      classifierRan: false,
      providerRan: false,
      context,
    });
    return judgeDecision;
  }

  /**
   * `preClassified='art'` skips soft off-topic check ONLY; hard blocks
   * (insults, prompt injection) always run. Every block goes through audit
   * chain (V13 / STRIDE R3).
   */
  async evaluateInput(
    text: string | undefined,
    preClassified?: 'art',
    context?: GuardrailAuditContext,
  ): Promise<InputGuardrailResult> {
    const providerRan = Boolean(this.guardrailProvider);
    const locale = resolveLocaleLabel(context);

    // Hard blocks always run regardless of preClassified.
    const decision = evaluateUserInputGuardrail({ text });
    if (!decision.allow) {
      recordBiasMetrics({ locale, layer: 'keyword', decision });
      await this.logBlock({
        phase: 'input',
        reason: decision.reason,
        fullText: text ?? '',
        classifierRan: false,
        providerRan: false,
        context,
      });
      return decision;
    }

    // ADR-048 — provider layer (LLM-Guard sidecar) runs IN ADDITION to keyword
    // layer, never replacing it.
    const providerVerdict = await evaluateGuardrailProvider(
      'input',
      () => this.runProviderCheckInput(text, context),
      this.providerDeps(),
    );
    if (!providerVerdict.allow) {
      recordBiasMetrics({ locale, layer: 'provider', decision: providerVerdict });
      await this.logBlock({
        phase: 'input',
        reason: providerVerdict.reason,
        fullText: text ?? '',
        classifierRan: false,
        providerRan,
        context,
      });
      return providerVerdict;
    }

    // LLM02 — audit + meter redaction when provider returned sanitized variant.
    // Substitution itself happens at the call site consuming `redactedText`.
    const redactedText = providerVerdict.redactedText;
    if (redactedText !== undefined && redactedText !== (text ?? '') && this.guardrailProvider) {
      await logInputRedaction({
        redactedText,
        locale,
        provider: this.guardrailProvider,
        audit: this.audit,
        context,
      });
    }

    // F4 — judge selectively invoked on long inputs where keyword said allow.
    // Cannot upgrade keyword blocks (those returned earlier). TD-20 (R13c/R12) —
    // forwards `{tier, requestId}` from the audit context (museumId absent, D5).
    //
    // Hybrid-gravity (2026-06-01): when `frictionEnabled`, the judge is NO
    // LONGER run inline here — it runs in PARALLEL of generation via
    // `evaluateInputSemantic` so an isolated off-topic is soft-redirected
    // instead of hard-blocked. The inline judge is kept ONLY for the legacy
    // kill-switch path (`frictionEnabled=false`), preserving the prior
    // hard-block-every-off-topic behaviour (spec R13). Single code path per
    // mode — no double evaluation.
    if (!this.frictionEnabled) {
      const legacyBlock = await this.runLegacyInlineJudge(text, locale, context);
      if (legacyBlock) return legacyBlock;
    }

    if (preClassified === 'art') {
      recordBiasMetrics({ locale, layer: 'classifier', decision: { allow: true } });
      logger.info(AUDIT_SECURITY_GUARDRAIL_PASS, { phase: 'input', preClassified: true });
      return {
        allow: true,
        ...(redactedText !== undefined ? { redactedText } : {}),
      };
    }

    // No soft check in synchronous guardrail (LLM classifier runs output-side).
    recordBiasMetrics({ locale, layer: 'keyword', decision: { allow: true } });
    logger.info(AUDIT_SECURITY_GUARDRAIL_PASS, { phase: 'input', preClassified: false });
    return {
      ...decision,
      ...(redactedText !== undefined ? { redactedText } : {}),
    };
  }

  /**
   * Hybrid-gravity (2026-06-01) — the off-topic SEMANTIC leg of the guardrail,
   * extracted from the inline `evaluateInput` judge block. Runs in PARALLEL of
   * generation (NOT before it). Returns a structured verdict; it does NOT
   * hard-block on its own — the orchestration decides soft-redirect vs
   * hard-block from the friction counters. Fail-OPEN: judge null/timeout/budget
   * → `allow` (a slow judge never blocks availability — spec R8).
   *
   * Gating (length ≥ `judgeMinMessageLength`, `llmJudgeEnabled`) is delegated to
   * the shared `runLlmJudge`, so a short message or a disabled judge → `allow`
   * with no model call.
   */
  async evaluateInputSemantic(
    text: string,
    context?: GuardrailAuditContext,
  ): Promise<{ verdict: 'allow' } | { verdict: 'offtopic'; reason: GuardrailBlockReason }> {
    const scope = this.scopeFromContext(context);
    const judgeDecision = await runLlmJudge(text, this.judgeDeps(), scope);
    if (judgeDecision.allow) return { verdict: 'allow' };
    return { verdict: 'offtopic', reason: judgeDecision.reason };
  }

  /**
   * Hybrid-gravity (2026-06-01) — audit a friction strike (off-topic or
   * security). Only emitted when the strike ESCALATES to a hard-block cool-down
   * (a soft-redirect is not a block, so it stays out of the audit chain).
   * Mirrors the `logBlock` used by the inline gates. NEVER throws.
   */
  async logFrictionBlock(params: {
    reason: GuardrailBlockReason;
    fullText: string;
    context?: GuardrailAuditContext;
  }): Promise<void> {
    const locale = resolveLocaleLabel(params.context);
    recordBiasMetrics({
      locale,
      layer: 'judge',
      decision: { allow: false, reason: params.reason },
    });
    await this.logBlock({
      phase: 'input',
      reason: params.reason,
      fullText: params.fullText,
      classifierRan: false,
      providerRan: false,
      context: params.context,
    });
  }

  /** Persists user message + assistant refusal atomically. */
  async handleInputBlock(params: {
    sessionId: string;
    reason?: GuardrailBlockReason;
    requestedLocale?: string;
    userId?: number;
    userMessage: PersistMessageInput;
    /**
     * Hybrid-gravity (2026-06-01) — when true, an `off_topic` block renders the
     * warmer `refocus` cool-down copy instead of the flat `default` refusal. The
     * `policy:off_topic` citation is unchanged. Defaults false (legacy wording).
     */
    useRefocus?: boolean;
  }): Promise<PostMessageResult> {
    const { sessionId, reason, requestedLocale, userMessage, useRefocus } = params;

    // Audit row written upstream in evaluateInput (V13/STRIDE R3 SSOT); logging
    // again here would double-write to the hash chain.
    const refusalText = buildGuardrailRefusal(requestedLocale, reason, useRefocus ?? false);
    const refusalMetadata = withPolicyCitation({}, reason);
    // A5 — refusals follow standard `composing → done`. Terminal phase always
    // `done` (uniform FE handling, StatusIndicator unmount).
    refusalMetadata.phase = 'done';
    const { refusal } = await this.repository.persistBlockedExchange({
      userMessage,
      refusal: {
        sessionId,
        role: 'assistant',
        text: refusalText,
        metadata: refusalMetadata as Record<string, unknown>,
      },
    });

    return {
      sessionId,
      message: {
        id: refusal.id,
        role: 'assistant',
        text: refusalText,
        createdAt: refusal.createdAt.toISOString(),
      },
      metadata: refusalMetadata,
    };
  }

  /**
   * Hybrid-gravity (2026-06-01) — persists ONLY the assistant cool-down refusal.
   * Unlike `handleInputBlock`, the user message is NOT (re)persisted: the
   * friction escalation happens AFTER `prepare` already persisted the user turn
   * (the off-topic message went through to generation before being suppressed).
   * Warm `refocus` copy, `policy:off_topic` citation, standard `done` phase.
   */
  async buildCoolDownRefusal(params: {
    sessionId: string;
    requestedLocale?: string;
  }): Promise<PostMessageResult> {
    const { sessionId, requestedLocale } = params;
    const refusalText = buildGuardrailRefusal(requestedLocale, 'off_topic', true);
    const refusalMetadata = withPolicyCitation({}, 'off_topic');
    refusalMetadata.phase = 'done';
    const refusal = await this.repository.persistMessage({
      sessionId,
      role: 'assistant',
      text: refusalText,
      metadata: refusalMetadata as Record<string, unknown>,
    });
    return {
      sessionId,
      message: {
        id: refusal.id,
        role: 'assistant',
        text: refusalText,
        createdAt: refusal.createdAt.toISOString(),
      },
      metadata: refusalMetadata,
    };
  }

  /**
   * Output guardrail evaluation. Two layers after C9.9 (2026-05-18):
   *  1. V1 keyword guardrail on aggregated output text (answer + image
   *     captions + rationales).
   *  2. V2 `GuardrailProvider` adapter (ADR-048) — defense-in-depth.
   *
   * The legacy OUTPUT O3 LLM-based art-topic classifier was retired (C9.9)
   * — section prompt forces art focus, L3 LLM judge catches off-topic INPUTS
   * (C9.7), and the promptfoo CI corpus (`llm-security-promptfoo.yml`) gates
   * regressions. See ADR-015 amendment 2026-05-18.
   */
  async evaluateOutput(params: {
    text: string;
    metadata: ChatAssistantMetadata;
    requestedLocale?: string;
    context?: GuardrailAuditContext;
  }): Promise<{ text: string; metadata: ChatAssistantMetadata; allowed: boolean }> {
    const { text, metadata, requestedLocale, context } = params;
    const providerRan = Boolean(this.guardrailProvider);

    // C2 v2 — LLM-authored caption + rationale on EnrichedImage are user-visible
    // and may carry leaks; aggregate with answer text so keyword guardrail
    // catches injection/PII on either surface (SSOT — CLAUDE.md AI Safety §4).
    const guardrailText = aggregateOutputText(text, metadata);
    const safetyDecision = evaluateAssistantOutputGuardrail({ text: guardrailText });
    if (!safetyDecision.allow) {
      await this.logBlock({
        phase: 'output',
        reason: safetyDecision.reason,
        fullText: text,
        classifierRan: false,
        providerRan: false,
        context,
      });
      return buildBlockedOutputPayload({
        reason: safetyDecision.reason,
        requestedLocale,
        metadata,
      });
    }

    // ADR-048 — defense-in-depth after keywords.
    const providerVerdict = await evaluateGuardrailProvider(
      'output',
      async () => {
        if (!this.guardrailProvider) return { allow: true };
        // Spread lifts ChatAssistantMetadata → Record<string,unknown> (variance
        // gap) and yields a fresh object so provider mutation can't leak back.
        return await this.guardrailProvider.checkOutput({
          text,
          metadata: { ...metadata },
          locale: requestedLocale,
          // TD-20 (R13e/R12) — symmetric scope on the output leg (D5).
          ...this.scopeFromContext(context),
        });
      },
      this.providerDeps(),
    );
    if (!providerVerdict.allow) {
      await this.logBlock({
        phase: 'output',
        reason: providerVerdict.reason,
        fullText: text,
        classifierRan: false,
        providerRan,
        context,
      });
      return buildBlockedOutputPayload({
        reason: providerVerdict.reason,
        requestedLocale,
        metadata,
      });
    }

    logger.info(AUDIT_SECURITY_GUARDRAIL_PASS, {
      phase: 'output',
      // C9.9 — O3 classifier retired; flag retained for downstream audit
      // consumers (always false).
      classifierRan: false,
      providerRan,
    });
    return { text, metadata, allowed: true };
  }
}
