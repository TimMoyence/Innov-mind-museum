import { AUDIT_SECURITY_GUARDRAIL_BLOCK } from '@shared/audit/audit.types';
import { logger } from '@shared/logger/logger';

import {
  buildGuardrailRefusal,
  evaluateAssistantOutputGuardrail,
  evaluateUserInputGuardrail,
} from './art-topic-guardrail';
import { withPolicyCitation } from './chat-image.helpers';

import type { GuardrailBlockReason } from './art-topic-guardrail';
import type { PostMessageResult } from './chat.service.types';
import type { ChatRepository } from '../domain/chat.repository.interface';
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

  constructor(deps: GuardrailEvaluationServiceDeps) {
    this.repository = deps.repository;
    this.audit = deps.audit;
    this.artTopicClassifier = deps.artTopicClassifier;
    this.advancedGuardrail = deps.advancedGuardrail;
    this.advancedGuardrailObserveOnly = deps.advancedGuardrailObserveOnly ?? true;
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
   * @param text - User message text.
   * @param preClassified - Optional frontend pre-classification hint.
   * @returns Guardrail decision.
   */
  async evaluateInput(
    text: string | undefined,
    preClassified?: 'art',
  ): Promise<InputGuardrailResult> {
    // Hard blocks (insults, injection) always run regardless of preClassified
    const decision = evaluateUserInputGuardrail({ text });
    if (!decision.allow) return decision;

    // Advanced V2 layer (NeMo / LLM Guard / Prompt Armor) when configured. Runs in
    // addition to the deterministic guardrail above, never replacing it.
    const advanced = await this.evaluateAdvanced('input', async () => {
      if (!this.advancedGuardrail) return { allow: true };
      return await this.advancedGuardrail.checkInput({ text: text ?? '' });
    });
    if (!advanced.allow) return advanced;

    // When preClassified === 'art', skip the soft off-topic classifier — trust frontend hint
    if (preClassified === 'art') return { allow: true };

    // Default: no soft check in the synchronous guardrail (LLM classifier runs on output side)
    return decision;
  }

  /**
   * Handles a blocked input: logs audit event and persists the refusal response.
   *
   * @param params - Session context, guardrail reason, and locale.
   * @param params.sessionId - Chat session identifier.
   * @param params.reason - Guardrail block reason category.
   * @param params.requestedLocale - Locale for localised refusal text.
   * @param params.userId - Owner id for audit trail.
   * @returns The refusal message result ready to return to the caller.
   */
  async handleInputBlock(params: {
    sessionId: string;
    reason?: GuardrailBlockReason;
    requestedLocale?: string;
    userId?: number;
  }): Promise<PostMessageResult> {
    const { sessionId, reason, requestedLocale, userId } = params;

    this.audit?.log({
      action: AUDIT_SECURITY_GUARDRAIL_BLOCK,
      actorType: userId ? 'user' : 'anonymous',
      actorId: userId ?? null,
      targetType: 'session',
      targetId: sessionId,
      metadata: { reason },
    });

    const refusalText = buildGuardrailRefusal(requestedLocale, reason);
    const refusalMetadata = withPolicyCitation({}, reason);
    const assistantMessage = await this.repository.persistMessage({
      sessionId,
      role: 'assistant',
      text: refusalText,
      metadata: refusalMetadata as Record<string, unknown>,
    });

    return {
      sessionId,
      message: {
        id: assistantMessage.id,
        role: 'assistant',
        text: refusalText,
        createdAt: assistantMessage.createdAt.toISOString(),
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
   * @returns The final text/metadata pair and whether the output was allowed.
   */
  async evaluateOutput(params: {
    text: string;
    metadata: ChatAssistantMetadata;
    requestedLocale?: string;
  }): Promise<{ text: string; metadata: ChatAssistantMetadata; allowed: boolean }> {
    const { text, metadata, requestedLocale } = params;

    // Safety keyword checks (insults, injections, empty)
    const safetyDecision = evaluateAssistantOutputGuardrail({ text });
    if (!safetyDecision.allow) {
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
      return {
        text: buildGuardrailRefusal(requestedLocale, advanced.reason),
        metadata: withPolicyCitation(metadata, advanced.reason),
        allowed: false,
      };
    }

    // Art-topic classifier check (FAIL-CLOSED on error).
    // If the classifier throws, we cannot guarantee the output is safe — return
    // a generic unsafe_output refusal rather than leaking unverified LLM text.
    if (this.artTopicClassifier) {
      let isArt: boolean;
      try {
        isArt = await this.artTopicClassifier.isArtRelated(text);
      } catch {
        return {
          text: buildGuardrailRefusal(requestedLocale, 'unsafe_output'),
          metadata: withPolicyCitation(metadata, 'unsafe_output'),
          allowed: false,
        };
      }
      if (!isArt) {
        return {
          text: buildGuardrailRefusal(requestedLocale, 'off_topic'),
          metadata: withPolicyCitation(metadata, 'off_topic'),
          allowed: false,
        };
      }
    }

    return { text, metadata, allowed: true };
  }
}
