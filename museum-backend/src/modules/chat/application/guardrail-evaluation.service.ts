import { AUDIT_SECURITY_GUARDRAIL_BLOCK } from '@shared/audit/audit.types';

import {
  buildGuardrailRefusal,
  evaluateAssistantOutputGuardrail,
  evaluateUserInputGuardrail,
} from './art-topic-guardrail';
import { withPolicyCitation } from './chat-image.helpers';

import type { ArtTopicClassifier } from './art-topic-classifier';
import type { GuardrailBlockReason } from './art-topic-guardrail';
import type { PostMessageResult } from './chat.service.types';
import type { ChatRepository } from '../domain/chat.repository.interface';
import type { ChatAssistantMetadata } from '../domain/chat.types';
import type { ChatMessage } from '../domain/chatMessage.entity';
import type { AuditService } from '@shared/audit/audit.service';

/** Result of an input guardrail evaluation. */
export interface InputGuardrailResult {
  allow: boolean;
  reason?: GuardrailBlockReason;
  redirectHint?: string;
}

/** Dependencies for the guardrail evaluation service. */
export interface GuardrailEvaluationServiceDeps {
  repository: ChatRepository;
  audit?: AuditService;
  dynamicArtKeywords?: ReadonlySet<string>;
  artTopicClassifier?: ArtTopicClassifier;
  onArtKeywordDiscovered?: (keyword: string, locale: string) => void;
}

/**
 * Evaluates input and output guardrails, logs audit events for blocked messages,
 * and builds localized refusal responses.
 */
export class GuardrailEvaluationService {
  private readonly repository: ChatRepository;
  private readonly audit?: AuditService;
  private readonly dynamicArtKeywords?: ReadonlySet<string>;
  private readonly artTopicClassifier?: ArtTopicClassifier;
  private readonly onArtKeywordDiscovered?: (keyword: string, locale: string) => void;

  constructor(deps: GuardrailEvaluationServiceDeps) {
    this.repository = deps.repository;
    this.audit = deps.audit;
    this.dynamicArtKeywords = deps.dynamicArtKeywords;
    this.artTopicClassifier = deps.artTopicClassifier;
    this.onArtKeywordDiscovered = deps.onArtKeywordDiscovered;
  }

  /**
   * Evaluates user input against the guardrail rules.
   *
   * @param text - User message text.
   * @param history - Recent conversation history.
   * @param requestedLocale - Locale for keyword discovery callbacks.
   * @returns Guardrail decision with optional redirect hint.
   */
  async evaluateInput(
    text: string | undefined,
    history: ChatMessage[],
    requestedLocale?: string,
  ): Promise<InputGuardrailResult> {
    return await evaluateUserInputGuardrail({
      text,
      history,
      dynamicKeywords: this.dynamicArtKeywords,
      classifier: this.artTopicClassifier,
      onKeywordDiscovered: this.onArtKeywordDiscovered
        ? (kw: string) => {
            this.onArtKeywordDiscovered?.(kw, requestedLocale ?? 'en');
          }
        : undefined,
    });
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
   * @param params - The LLM output text, history, and locale.
   * @param params.text - Raw LLM output text to evaluate.
   * @param params.history - Recent conversation history for context.
   * @param params.metadata - Assistant metadata from the orchestrator.
   * @param params.requestedLocale - Locale for localised refusal text.
   * @returns The final text/metadata pair and whether the output was allowed.
   */
  evaluateOutput(params: {
    text: string;
    history: ChatMessage[];
    metadata: ChatAssistantMetadata;
    requestedLocale?: string;
  }): { text: string; metadata: ChatAssistantMetadata; allowed: boolean } {
    const { text, history, metadata, requestedLocale } = params;

    const decision = evaluateAssistantOutputGuardrail({ text, history });

    if (decision.allow) {
      return { text, metadata, allowed: true };
    }

    return {
      text: buildGuardrailRefusal(requestedLocale, decision.reason),
      metadata: withPolicyCitation(metadata, decision.reason),
      allowed: false,
    };
  }
}
