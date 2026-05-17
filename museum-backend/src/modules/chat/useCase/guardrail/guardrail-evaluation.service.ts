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

// Re-export the public API surface from `guardrail-evaluation.types.ts` so the
// 5 downstream consumers (chat-message.service, chat.service, stream-buffer,
// message-commit, prepare-message.pipeline) keep importing from this module
// path. Zero-impact refactor: deep imports into `.types.ts` are not required.
export type { GuardrailAuditContext, ArtTopicClassifierPort, LlmJudgeFn };

/**
 * Evaluates input and output guardrails, logs audit events for blocked messages,
 * and builds localized refusal responses.
 */
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
   * Routes a guardrail block to the audit chain (V13 / STRIDE R3). Single
   * forensic entry per block; never throws — `auditService.log()` swallows
   * pipeline errors so a hiccup in audit insert can't break the chat hot path.
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

  /**
   * ADR-015 — exposes ONLY the V2 LLM Guard sidecar deps. Kept separate from
   * {@link judgeDeps} so the two V2 layers stay structurally independent.
   */
  private providerDeps(): EvaluateGuardrailProviderDeps {
    return {
      guardrailProvider: this.guardrailProvider,
      guardrailProviderObserveOnly: this.guardrailProviderObserveOnly,
    };
  }

  /**
   * ADR-015 — exposes ONLY the V2 LLM judge deps. Separate from
   * {@link providerDeps} so flipping the judge cannot accidentally affect the
   * sidecar provider and vice versa.
   */
  private judgeDeps(): RunLlmJudgeDeps {
    return {
      llmJudge: this.llmJudge,
      llmJudgeEnabled: this.llmJudgeEnabled,
    };
  }

  /**
   * Evaluates user input against the guardrail rules.
   * When preClassified is 'art', the soft off-topic check is skipped (classifier bypass)
   * but hard blocks (insults, prompt injection) always run.
   *
   * Every block decision is routed through the audit chain (V13 / STRIDE R3) so
   * attack patterns, frequency, locale, and offending users can be retro-analysed.
   *
   * @param text - User message text.
   * @param preClassified - Optional frontend pre-classification hint.
   * @param context - Optional request-scoped context for the audit row.
   * @returns Guardrail decision.
   */
  async evaluateInput(
    text: string | undefined,
    preClassified?: 'art',
    context?: GuardrailAuditContext,
  ): Promise<InputGuardrailResult> {
    const providerRan = Boolean(this.guardrailProvider);
    const locale = resolveLocaleLabel(context);

    // Hard blocks (insults, injection) always run regardless of preClassified
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

    // Guardrail provider layer (LLM-Guard sidecar, future Llama Prompt Guard 2,
    // Lakera, etc. — ADR-048) when configured. Runs in addition to the
    // deterministic guardrail above, never replacing it.
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

    // LLM02 — when the provider returned a sanitized variant that differs
    // from the input, audit + meter the redaction (the substitution itself
    // happens at the call site that consumes `redactedText`).
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

    // F4 (2026-04-30) — LLM judge second layer. Selective invocation: only on
    // long inputs where the keyword pre-filter said allow. Cannot upgrade
    // keyword blocks (those returned earlier above). Hard-block channels —
    // insult / prompt_injection — always trump the preClassified='art' hint.
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

    // When preClassified === 'art', skip the soft off-topic classifier — trust frontend hint
    if (preClassified === 'art') {
      recordBiasMetrics({ locale, layer: 'classifier', decision: { allow: true } });
      logger.info(AUDIT_SECURITY_GUARDRAIL_PASS, { phase: 'input', preClassified: true });
      return {
        allow: true,
        ...(redactedText !== undefined ? { redactedText } : {}),
      };
    }

    // Default: no soft check in the synchronous guardrail (LLM classifier runs on output side)
    recordBiasMetrics({ locale, layer: 'keyword', decision: { allow: true } });
    logger.info(AUDIT_SECURITY_GUARDRAIL_PASS, { phase: 'input', preClassified: false });
    return {
      ...decision,
      ...(redactedText !== undefined ? { redactedText } : {}),
    };
  }

  /**
   * Handles a blocked input: logs the audit event and persists both the attempted
   * user message and the assistant refusal in a single atomic transaction.
   *
   * @param params - Session context, guardrail reason, locale, and the user message to persist atomically.
   * @param params.sessionId - Chat session identifier.
   * @param params.reason - Guardrail block reason category.
   * @param params.requestedLocale - Locale for localised refusal text.
   * @param params.userId - Owner id for audit trail.
   * @param params.userMessage - The user's blocked message to persist atomically with the refusal.
   * @returns The refusal message result ready to return to the caller.
   */
  async handleInputBlock(params: {
    sessionId: string;
    reason?: GuardrailBlockReason;
    requestedLocale?: string;
    userId?: number;
    userMessage: PersistMessageInput;
  }): Promise<PostMessageResult> {
    const { sessionId, reason, requestedLocale, userMessage } = params;

    // NB: the audit row for this block is written upstream in `evaluateInput`
    // via `logBlock` — that is the single source of truth (V13 / STRIDE R3).
    // Logging again here would double-write to the hash chain.
    const refusalText = buildGuardrailRefusal(requestedLocale, reason);
    const refusalMetadata = withPolicyCitation({}, reason);
    // A5 (Q1 decision 2026-05-14) — refusals follow the standard
    // `composing → done` path. The terminal phase is `done` regardless of
    // whether the pipeline returned a real answer or a refusal — uniformity
    // simplifies FE handling (StatusIndicator unmounts on response in both
    // cases). Spec §1.1 R1 + dispatcher Q1.
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
   * Evaluates the assistant output guardrail. If the output is blocked, returns
   * the sanitized refusal text and metadata; otherwise returns the original.
   *
   * Runs safety keyword checks (insults, injections, empty) first, then an
   * optional art-topic classifier check. SECURITY: the classifier is now
   * fail-CLOSED — if it throws, the LLM output is suppressed and a generic
   * safe refusal is returned (OWASP LLM 2026 guidance: never pass unverified
   * model output when a safety check fails to execute).
   *
   * @param params - The LLM output text, metadata, and locale.
   * @param params.text - Raw LLM output text to evaluate.
   * @param params.metadata - Assistant metadata from the orchestrator.
   * @param params.requestedLocale - Locale for localised refusal text.
   * @param params.context - Optional request-scoped context threaded into audit rows on block.
   * @returns The final text/metadata pair and whether the output was allowed.
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

    // Safety keyword checks (insults, injections, empty).
    // C2 v2 (D3 — 2026-05): the LLM-authored `caption` + `rationale` on each
    // EnrichedImage flow back to the FE bubble inside <Text>; they are not
    // markdown-rendered, but they are user-visible content authored by the LLM
    // and may carry leaks. Aggregate them with the answer text so the keyword
    // guardrail catches injections / PII leaks in either surface — single
    // source of truth (CLAUDE.md AI Safety §4) preserved by routing through
    // the same evaluator.
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

    // Guardrail provider output check when configured (ADR-048;
    // defense-in-depth after keywords).
    const providerVerdict = await evaluateGuardrailProvider(
      'output',
      async () => {
        if (!this.guardrailProvider) return { allow: true };
        // Spread lifts ChatAssistantMetadata → Record<string, unknown> (variance
        // gap) and yields a fresh top-level object so provider mutation can't
        // leak back. Replaces prior `as unknown as` cast.
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
