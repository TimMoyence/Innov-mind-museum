import {
  AUDIT_GUARDRAIL_BLOCKED_INPUT,
  AUDIT_GUARDRAIL_BLOCKED_OUTPUT,
  AUDIT_SECURITY_GUARDRAIL_PASS,
} from '@shared/audit/audit.types';
import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import {
  buildGuardrailRefusal,
  evaluateAssistantOutputGuardrail,
  evaluateUserInputGuardrail,
} from './art-topic-guardrail';
import { withPolicyCitation } from './chat-image.helpers';
import { redactSnippetForAudit } from '../util/guardrail-snippet';

import type { GuardrailBlockReason } from './art-topic-guardrail';
import type { PostMessageResult } from './chat.service.types';
import type { JudgeDecision } from './llm-judge-guardrail';
import type { ChatRepository, PersistMessageInput } from '../domain/chat.repository.interface';
import type { ChatAssistantMetadata } from '../domain/chat.types';
import type { AdvancedGuardrail } from '../domain/ports/advanced-guardrail.port';
import type { AuditService } from '@shared/audit/audit.service';

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
 * Optional request-scoped context threaded into guardrail audit rows so
 * forensic queries can pivot by session, actor, request id, ip, and locale
 * (V13 / STRIDE R3). All fields optional — anonymous traffic still logs, just
 * with `actorType: 'anonymous'` and `actorId: null`.
 */
export interface GuardrailAuditContext {
  sessionId?: string;
  userId?: number;
  requestId?: string;
  ip?: string;
  locale?: string;
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

    const reason = GuardrailEvaluationService.judgeVerdictToReason(decision.decision);

    logger.info('guardrail_judge_block', {
      verdict: decision.decision,
      confidence: decision.confidence,
      mappedReason: reason,
    });

    return { allow: false, reason };
  }

  /**
   * Routes a guardrail block to the audit chain (V13 / STRIDE R3).
   *
   * Single forensic entry per block: phase-scoped action, actor identification,
   * redacted snippet (≤64 chars + sha256 of full text), classifier flags, locale,
   * and request correlation fields. Never throws — `auditService.log()` swallows
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

    const { phase, reason, fullText, classifierRan, advancedRan, context } = params;
    const { snippetPreview, snippetFingerprint } = redactSnippetForAudit(fullText);
    const userId = context?.userId;

    await this.audit.log({
      action: phase === 'input' ? AUDIT_GUARDRAIL_BLOCKED_INPUT : AUDIT_GUARDRAIL_BLOCKED_OUTPUT,
      actorType: userId ? 'user' : 'anonymous',
      actorId: userId ?? null,
      targetType: 'chat_session',
      targetId: context?.sessionId ?? null,
      metadata: {
        phase,
        reason: reason ?? null,
        snippetPreview,
        snippetFingerprint,
        locale: context?.locale ?? null,
        classifierRan,
        advancedRan,
      },
      ip: context?.ip ?? null,
      requestId: context?.requestId ?? null,
    });
  }

  /**
   * F4 — maps a JudgeVerdict to the canonical GuardrailBlockReason. The judge
   * cannot return `block:offtopic` for hard-block channels — those map to
   * `off_topic` (soft channel) and the keyword pre-filter still wins for
   * insult / prompt_injection blocks.
   */
  private static judgeVerdictToReason(verdict: JudgeDecision['decision']): GuardrailBlockReason {
    if (verdict === 'block:abuse') return 'insult';
    if (verdict === 'block:injection') return 'prompt_injection';
    return 'off_topic';
  }

  /**
   * Maps an AdvancedGuardrail reason to our canonical GuardrailBlockReason, used
   * downstream by the refusal message builder and audit log.
   */
  private static mapAdvancedReason(reason: string | undefined): GuardrailBlockReason {
    switch (reason) {
      case 'pii':
      case 'bias':
      case 'toxicity':
      case 'data_exfiltration':
      case 'schema_violation':
      case 'error':
        return 'unsafe_output';
      case 'off_topic':
        return 'off_topic';
      case 'jailbreak':
      case 'prompt_injection':
      default:
        return 'prompt_injection';
    }
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

    const mappedReason = GuardrailEvaluationService.mapAdvancedReason(raw.reason);

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
   * Pass decisions stay on the structured logger — only blocks are audit-logged.
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
   * The `userMessage` parameter is required: the product decision is to preserve
   * the user's blocked attempt for audit/moderation (see
   * `chat-message-service.test.ts:403/:414`). Passing it through to the repo's
   * `persistBlockedExchange` guarantees both rows land together or neither does —
   * no more orphan user row if the refusal write fails.
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
      return {
        text: buildGuardrailRefusal(requestedLocale, 'unsafe_output'),
        metadata: withPolicyCitation(metadata, 'unsafe_output'),
        allowed: false,
      };
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
      return {
        text: buildGuardrailRefusal(requestedLocale, 'off_topic'),
        metadata: withPolicyCitation(metadata, 'off_topic'),
        allowed: false,
      };
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
      return {
        text: buildGuardrailRefusal(requestedLocale, safetyDecision.reason),
        metadata: withPolicyCitation(metadata, safetyDecision.reason),
        allowed: false,
      };
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
      return {
        text: buildGuardrailRefusal(requestedLocale, advanced.reason),
        metadata: withPolicyCitation(metadata, advanced.reason),
        allowed: false,
      };
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
