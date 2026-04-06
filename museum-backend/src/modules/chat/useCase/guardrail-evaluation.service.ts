import { AUDIT_SECURITY_GUARDRAIL_BLOCK } from '@shared/audit/audit.types';

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
}

/**
 * Evaluates input and output guardrails, logs audit events for blocked messages,
 * and builds localized refusal responses.
 */
export class GuardrailEvaluationService {
  private readonly repository: ChatRepository;
  private readonly audit?: AuditService;
  private readonly artTopicClassifier?: ArtTopicClassifierPort;

  constructor(deps: GuardrailEvaluationServiceDeps) {
    this.repository = deps.repository;
    this.audit = deps.audit;
    this.artTopicClassifier = deps.artTopicClassifier;
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
  // eslint-disable-next-line @typescript-eslint/require-await -- async kept for caller compat; guardrail is now synchronous
  async evaluateInput(
    text: string | undefined,
    preClassified?: 'art',
  ): Promise<InputGuardrailResult> {
    // Hard blocks (insults, injection) always run regardless of preClassified
    const decision = evaluateUserInputGuardrail({ text });
    if (!decision.allow) return decision;

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
   * optional art-topic classifier check (fail-open on error).
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

    // Art-topic classifier check (fail-open)
    if (this.artTopicClassifier) {
      try {
        const isArt = await this.artTopicClassifier.isArtRelated(text);
        if (!isArt) {
          return {
            text: buildGuardrailRefusal(requestedLocale, 'off_topic'),
            metadata: withPolicyCitation(metadata, 'off_topic'),
            allowed: false,
          };
        }
      } catch {
        // Fail-open: classifier error → allow
      }
    }

    return { text, metadata, allowed: true };
  }
}
