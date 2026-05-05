import { withPolicyCitation } from '@modules/chat/useCase/image/chat-image.helpers';
import { AUDIT_SECURITY_GUARDRAIL_PASS } from '@shared/audit/audit.types';
import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import {
  buildGuardrailRefusal,
  evaluateAssistantOutputGuardrail,
  evaluateUserInputGuardrail,
} from './art-topic-guardrail';
import { buildGuardrailBlockAuditEntry } from './guardrail-audit-payload';
import {
  judgeVerdictToReason,
  mapAdvancedReason,
} from './guardrail-reason-mapping';
import { buildBlockedOutputPayload } from './guardrail-refusal-builder';

import type { GuardrailBlockReason } from './art-topic-guardrail';
import type { GuardrailAuditContext } from './guardrail-audit-payload';
import type { ChatAssistantMetadata } from '@modules/chat/domain/chat.types';
import type { AdvancedGuardrail } from '@modules/chat/domain/ports/advanced-guardrail.port';
import type {
  ChatRepository,
  PersistMessageInput,
} from '@modules/chat/domain/session/chat.repository.interface';
import type { JudgeDecision } from '@modules/chat/useCase/llm/llm-judge-guardrail';
import type { PostMessageResult } from '@modules/chat/useCase/orchestration/chat.service.types';
import type { AuditService } from '@shared/audit/audit.service';

export type { GuardrailAuditContext } from './guardrail-audit-payload';

/** Minimal interface for the art-topic classifier used by the guardrail service. */
export interface ArtTopicClassifierPort {
  isArtRelated(text: string): Promise<boolean>;
}

/** Result of an input guardrail evaluation. */
interface InputGuardrailResult {
  allow: boolean;
  reason?: GuardrailBlockReason;
}

/**
 * F4 (2026-04-30) — callable shape for the LLM-judge second layer. Returns a
 * validated decision or `null` to signal fail-open (timeout / parse / budget).
 *
 * Wired in production by `chat-module.ts` to bind the orchestrator. Tests pass
 * a `jest.fn()` with the same signature.
 */
export type LlmJudgeFn = (message: string) => Promise<JudgeDecision | null>;

/** Dependencies for the guardrail evaluation service. */
interface GuardrailEvaluationServiceDeps {
  repository: ChatRepository;
  audit?: AuditService;
  artTopicClassifier?: ArtTopicClassifierPort;
  /**
   * Optional advanced (V2) guardrail layer. Runs AFTER the deterministic keyword
   * guardrail and uses the hexagonal AdvancedGuardrail port. When `observeOnly`
   * is true the service logs decisions but never blocks — useful for Phase A
   * rollout of a new candidate.
   */
  advancedGuardrail?: AdvancedGuardrail;
  advancedGuardrailObserveOnly?: boolean;
  /**
   * F4 — LLM judge callable. Runs ONLY when `llmJudgeEnabled` is true AND the
   * keyword pre-filter returned allow AND the message length is above the
   * configured threshold. The judge cannot upgrade keyword blocks to allow.
   *
   * `null` from the judge = fail-open (caller falls back to keyword decision).
   */
  llmJudge?: LlmJudgeFn;
  /**
   * F4 — toggle that mirrors `env.guardrails.candidate === 'llm-judge'`. Kept
   * as an explicit dep so tests can flip it without env mutation.
   */
  llmJudgeEnabled?: boolean;
}

/**
 * Evaluates input and output guardrails, logs audit events for blocked messages,
 * and builds localized refusal responses.
 */
export class GuardrailEvaluationService {
  private readonly repository: ChatRepository;
  private readonly audit?: AuditService;
  private readonly artTopicClassifier?: ArtTopicClassifierPort;
  private readonly advancedGuardrail?: AdvancedGuardrail;
  private readonly advancedGuardrailObserveOnly: boolean;
  private readonly llmJudge?: LlmJudgeFn;
  private readonly llmJudgeEnabled: boolean;

  constructor(deps: GuardrailEvaluationServiceDeps) {
    this.repository = deps.repository;
    this.audit = deps.audit;
    this.artTopicClassifier = deps.artTopicClassifier;
    this.advancedGuardrail = deps.advancedGuardrail;
    this.advancedGuardrailObserveOnly = deps.advancedGuardrailObserveOnly ?? true;
    this.llmJudge = deps.llmJudge;
    this.llmJudgeEnabled = deps.llmJudgeEnabled ?? false;
  }

  /**
   * F4 — runs the LLM judge after the keyword pre-filter has already returned
   * allow. The judge can ONLY downgrade allow → block; never upgrade block →
   * allow (the caller never invokes this when keyword decision is already
   * blocking).
   *
   * Confidence floor of 0.6 — below that, the judge's verdict is too weak to
   * justify overriding the deterministic keyword pass.
   */
  private async runLlmJudge(
    text: string,
  ): Promise<{ allow: true } | { allow: false; reason: GuardrailBlockReason }> {
    if (!this.llmJudgeEnabled || !this.llmJudge) return { allow: true };
    if (text.length <= env.guardrails.judgeMinMessageLength) return { allow: true };

    const decision = await this.llmJudge(text);
    if (!decision) return { allow: true }; // fail-open

    if (decision.decision === 'allow' || decision.confidence < 0.6) {
      return { allow: true };
    }

    const reason = judgeVerdictToReason(decision.decision);

    logger.info('guardrail_judge_block', {
      verdict: decision.decision,
      confidence: decision.confidence,
      mappedReason: reason,
    });

    return { allow: false, reason };
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
    advancedRan: boolean;
    context?: GuardrailAuditContext;
  }): Promise<void> {
    if (!this.audit) return;
    await this.audit.log(buildGuardrailBlockAuditEntry(params));
  }

  /**
   * Runs the advanced guardrail check with a safety net: any throw is translated
   * to a fail-CLOSED blocking decision. In observe-only mode blocking decisions
   * are downgraded to `allow: true` after logging — letting operators validate a
   * new candidate on production traffic without user-visible refusals.
   */
  private async evaluateAdvanced(
    phase: 'input' | 'output',
    run: () => Promise<{ allow: boolean; reason?: string }>,
  ): Promise<{ allow: boolean; reason?: GuardrailBlockReason }> {
    if (!this.advancedGuardrail) return { allow: true };

    let raw: { allow: boolean; reason?: string };
    try {
      raw = await run();
    } catch (error) {
      logger.warn('advanced_guardrail_throw_fail_closed', {
        adapter: this.advancedGuardrail.name,
        phase,
        error: error instanceof Error ? error.message : String(error),
      });
      raw = { allow: false, reason: 'error' };
    }

    if (raw.allow) return { allow: true };

    const mappedReason = mapAdvancedReason(raw.reason);

    if (this.advancedGuardrailObserveOnly) {
      logger.info('advanced_guardrail_observe_would_block', {
        adapter: this.advancedGuardrail.name,
        phase,
        rawReason: raw.reason,
        mappedReason,
      });
      return { allow: true };
    }

    logger.info('advanced_guardrail_block', {
      adapter: this.advancedGuardrail.name,
      phase,
      rawReason: raw.reason,
      mappedReason,
    });
    return { allow: false, reason: mappedReason };
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
    const advancedRan = Boolean(this.advancedGuardrail);

    // Hard blocks (insults, injection) always run regardless of preClassified
    const decision = evaluateUserInputGuardrail({ text });
    if (!decision.allow) {
      await this.logBlock({
        phase: 'input',
        reason: decision.reason,
        fullText: text ?? '',
        classifierRan: false,
        advancedRan: false,
        context,
      });
      return decision;
    }

    // Advanced V2 layer (NeMo / LLM Guard / Prompt Armor) when configured. Runs in
    // addition to the deterministic guardrail above, never replacing it.
    const advanced = await this.evaluateAdvanced('input', async () => {
      if (!this.advancedGuardrail) return { allow: true };
      return await this.advancedGuardrail.checkInput({ text: text ?? '' });
    });
    if (!advanced.allow) {
      await this.logBlock({
        phase: 'input',
        reason: advanced.reason,
        fullText: text ?? '',
        classifierRan: false,
        advancedRan,
        context,
      });
      return advanced;
    }

    // F4 (2026-04-30) — LLM judge second layer. Selective invocation: only on
    // long inputs where the keyword pre-filter said allow. Cannot upgrade
    // keyword blocks (those returned earlier above). Hard-block channels —
    // insult / prompt_injection — always trump the preClassified='art' hint.
    const judgeDecision = await this.runLlmJudge(text ?? '');
    if (!judgeDecision.allow) {
      await this.logBlock({
        phase: 'input',
        reason: judgeDecision.reason,
        fullText: text ?? '',
        classifierRan: false,
        advancedRan: false,
        context,
      });
      return judgeDecision;
    }

    // When preClassified === 'art', skip the soft off-topic classifier — trust frontend hint
    if (preClassified === 'art') {
      logger.info(AUDIT_SECURITY_GUARDRAIL_PASS, { phase: 'input', preClassified: true });
      return { allow: true };
    }

    // Default: no soft check in the synchronous guardrail (LLM classifier runs on output side)
    logger.info(AUDIT_SECURITY_GUARDRAIL_PASS, { phase: 'input', preClassified: false });
    return decision;
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
   * Runs the optional art-topic classifier as the last layer of the output
   * guardrail. Fail-CLOSED on error: if the classifier throws, suppress the
   * LLM output and return a generic `unsafe_output` refusal (OWASP LLM 2026
   * guidance — never pass unverified model output when a safety check fails
   * to execute). Returns `undefined` when allowed, the refusal payload when
   * blocked. Audit rows are emitted on every block branch.
   */
  private async runArtTopicClassifier(args: {
    text: string;
    metadata: ChatAssistantMetadata;
    requestedLocale?: string;
    advancedRan: boolean;
    context?: GuardrailAuditContext;
  }): Promise<{ text: string; metadata: ChatAssistantMetadata; allowed: boolean } | undefined> {
    const { text, metadata, requestedLocale, advancedRan, context } = args;
    if (!this.artTopicClassifier) return undefined;

    let isArt: boolean;
    try {
      isArt = await this.artTopicClassifier.isArtRelated(text);
    } catch {
      await this.logBlock({
        phase: 'output',
        reason: 'unsafe_output',
        fullText: text,
        classifierRan: true,
        advancedRan,
        context,
      });
      return buildBlockedOutputPayload({
        reason: 'unsafe_output',
        requestedLocale,
        metadata,
      });
    }
    if (!isArt) {
      await this.logBlock({
        phase: 'output',
        reason: 'off_topic',
        fullText: text,
        classifierRan: true,
        advancedRan,
        context,
      });
      return buildBlockedOutputPayload({
        reason: 'off_topic',
        requestedLocale,
        metadata,
      });
    }
    return undefined;
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
    const advancedRan = Boolean(this.advancedGuardrail);
    const classifierRan = Boolean(this.artTopicClassifier);

    // Safety keyword checks (insults, injections, empty)
    const safetyDecision = evaluateAssistantOutputGuardrail({ text });
    if (!safetyDecision.allow) {
      await this.logBlock({
        phase: 'output',
        reason: safetyDecision.reason,
        fullText: text,
        classifierRan: false,
        advancedRan: false,
        context,
      });
      return buildBlockedOutputPayload({
        reason: safetyDecision.reason,
        requestedLocale,
        metadata,
      });
    }

    // Advanced V2 output check when configured (defense-in-depth after keywords).
    const advanced = await this.evaluateAdvanced('output', async () => {
      if (!this.advancedGuardrail) return { allow: true };
      return await this.advancedGuardrail.checkOutput({
        text,
        metadata: metadata as unknown as Record<string, unknown>,
        locale: requestedLocale,
      });
    });
    if (!advanced.allow) {
      await this.logBlock({
        phase: 'output',
        reason: advanced.reason,
        fullText: text,
        classifierRan: false,
        advancedRan,
        context,
      });
      return buildBlockedOutputPayload({
        reason: advanced.reason,
        requestedLocale,
        metadata,
      });
    }

    const classifierBlock = await this.runArtTopicClassifier({
      text,
      metadata,
      requestedLocale,
      advancedRan,
      context,
    });
    if (classifierBlock) return classifierBlock;

    logger.info(AUDIT_SECURITY_GUARDRAIL_PASS, {
      phase: 'output',
      classifierRan,
      advancedRan,
    });
    return { text, metadata, allowed: true };
  }
}
