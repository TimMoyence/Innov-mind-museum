import { withPolicyCitation } from '@modules/chat/useCase/image/chat-image.helpers';
import { AUDIT_SECURITY_GUARDRAIL_PASS } from '@shared/audit/audit.types';
import { logger } from '@shared/logger/logger';

import {
  buildGuardrailRefusal,
  evaluateAssistantOutputGuardrail,
  evaluateUserInputGuardrail,
} from './art-topic-guardrail';
import { recordBiasMetrics, resolveLocaleLabel } from './eval/bias-metrics.helper';
import { aggregateOutputText, runArtTopicClassifier } from './eval/output-classifier.helper';
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
  ArtTopicClassifierPort,
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

export type { GuardrailAuditContext, ArtTopicClassifierPort, LlmJudgeFn };

export class GuardrailEvaluationService {
  private readonly repository: ChatRepository;
  private readonly audit?: AuditService;
  private readonly artTopicClassifier?: ArtTopicClassifierPort;
  private readonly guardrailProvider?: GuardrailProvider;
  private readonly guardrailProviderObserveOnly: boolean;
  private readonly llmJudge?: LlmJudgeFn;
  private readonly llmJudgeEnabled: boolean;

  constructor(deps: GuardrailEvaluationServiceDeps) {
    this.repository = deps.repository;
    this.audit = deps.audit;
    this.artTopicClassifier = deps.artTopicClassifier;
    this.guardrailProvider = deps.guardrailProvider;
    this.guardrailProviderObserveOnly = deps.guardrailProviderObserveOnly ?? true;
    this.llmJudge = deps.llmJudge;
    this.llmJudgeEnabled = deps.llmJudgeEnabled ?? false;
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
      async () => {
        if (!this.guardrailProvider) return { allow: true };
        return await this.guardrailProvider.checkInput({ text: text ?? '' });
      },
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
    // Cannot upgrade keyword blocks (those returned earlier).
    const judgeDecision = await runLlmJudge(text ?? '', this.judgeDeps());
    if (!judgeDecision.allow) {
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

  /** Persists user message + assistant refusal atomically. */
  async handleInputBlock(params: {
    sessionId: string;
    reason?: GuardrailBlockReason;
    requestedLocale?: string;
    userId?: number;
    userMessage: PersistMessageInput;
  }): Promise<PostMessageResult> {
    const { sessionId, reason, requestedLocale, userMessage } = params;

    // Audit row written upstream in evaluateInput (V13/STRIDE R3 SSOT); logging
    // again here would double-write to the hash chain.
    const refusalText = buildGuardrailRefusal(requestedLocale, reason);
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
   * SEC FAIL-CLOSED — classifier throw → suppress LLM output + generic safe
   * refusal (OWASP LLM 2026: never pass unverified output when safety check
   * fails to execute).
   */
  async evaluateOutput(params: {
    text: string;
    metadata: ChatAssistantMetadata;
    requestedLocale?: string;
    context?: GuardrailAuditContext;
  }): Promise<{ text: string; metadata: ChatAssistantMetadata; allowed: boolean }> {
    const { text, metadata, requestedLocale, context } = params;
    const providerRan = Boolean(this.guardrailProvider);
    const classifierRan = Boolean(this.artTopicClassifier);

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

    const classifierBlock = await runArtTopicClassifier(
      {
        text,
        metadata,
        requestedLocale,
        providerRan,
        context,
      },
      {
        classifier: this.artTopicClassifier,
        logBlock: (logParams) => this.logBlock(logParams),
      },
    );
    if (classifierBlock) return classifierBlock;

    logger.info(AUDIT_SECURITY_GUARDRAIL_PASS, {
      phase: 'output',
      classifierRan,
      providerRan,
    });
    return { text, metadata, allowed: true };
  }
}
