import { withPolicyCitation } from '@modules/chat/useCase/image/chat-image.helpers';
import { AUDIT_SECURITY_GUARDRAIL_PASS } from '@shared/audit/audit.types';
import { logger } from '@shared/logger/logger';
import { deriveTier } from '@shared/observability/derive-tier';

import {
  buildGuardrailRefusal,
  evaluateAssistantOutputGuardrail,
  evaluateUserInputGuardrail,
} from './art-topic-guardrail';
import { aggregateOutputText } from './eval/output-aggregator';
import { runLlmJudge, type RunLlmJudgeDeps } from './eval/v2-layers.helper';
import { buildGuardrailBlockAuditEntry } from './guardrail-audit-payload';
import { buildBlockedOutputPayload } from './guardrail-refusal-builder';

import type { GuardrailBlockReason } from './art-topic-guardrail';
import type { GuardrailAuditContext } from './guardrail-audit-payload';
import type {
  GuardrailEvaluationServiceDeps,
  InputGuardrailResult,
  LlmJudgeFn,
} from './guardrail-evaluation.types';
import type { ChatAssistantMetadata } from '@modules/chat/domain/chat.types';
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
  private readonly llmJudge?: LlmJudgeFn;
  private readonly llmJudgeEnabled: boolean;

  constructor(deps: GuardrailEvaluationServiceDeps) {
    this.repository = deps.repository;
    this.audit = deps.audit;
    this.llmJudge = deps.llmJudge;
    this.llmJudgeEnabled = deps.llmJudgeEnabled ?? false;
  }

  private async logBlock(params: {
    phase: 'input' | 'output';
    reason: GuardrailBlockReason | undefined;
    fullText: string;
    context?: GuardrailAuditContext;
  }): Promise<void> {
    if (!this.audit) return;
    await this.audit.log(buildGuardrailBlockAuditEntry(params));
  }

  private judgeDeps(): RunLlmJudgeDeps {
    return { llmJudge: this.llmJudge, llmJudgeEnabled: this.llmJudgeEnabled };
  }

  private scopeFromContext(context?: GuardrailAuditContext): LlmJudgeScope {
    return {
      tier: deriveTier(context?.userId),
      ...(context?.requestId !== undefined ? { requestId: context.requestId } : {}),
    };
  }

  async evaluateInput(
    text: string | undefined,
    preClassified?: 'art',
    context?: GuardrailAuditContext,
  ): Promise<InputGuardrailResult> {
    const decision = evaluateUserInputGuardrail({ text });
    if (!decision.allow) {
      await this.logBlock({ phase: 'input', reason: decision.reason, fullText: text ?? '', context });
      return decision;
    }
    logger.info(AUDIT_SECURITY_GUARDRAIL_PASS, {
      phase: 'input',
      preClassified: preClassified === 'art',
    });
    return preClassified === 'art' ? { allow: true } : decision;
  }

  async evaluateInputSemantic(
    text: string,
    context?: GuardrailAuditContext,
  ): Promise<{ verdict: 'allow' } | { verdict: 'offtopic'; reason: GuardrailBlockReason }> {
    const judgeDecision = await runLlmJudge(text, this.judgeDeps(), this.scopeFromContext(context));
    if (judgeDecision.allow) return { verdict: 'allow' };
    return { verdict: 'offtopic', reason: judgeDecision.reason };
  }

  async logFrictionBlock(params: {
    reason: GuardrailBlockReason;
    fullText: string;
    context?: GuardrailAuditContext;
  }): Promise<void> {
    await this.logBlock({ phase: 'input', ...params });
  }

  async handleInputBlock(params: {
    sessionId: string;
    reason?: GuardrailBlockReason;
    requestedLocale?: string;
    userId?: number;
    userMessage: PersistMessageInput;
    useRefocus?: boolean;
  }): Promise<PostMessageResult> {
    const { sessionId, reason, requestedLocale, userMessage, useRefocus } = params;
    const refusalText = buildGuardrailRefusal(requestedLocale, reason, useRefocus ?? false);
    const refusalMetadata = withPolicyCitation({}, reason);
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

  async evaluateOutput(params: {
    text: string;
    metadata: ChatAssistantMetadata;
    requestedLocale?: string;
    context?: GuardrailAuditContext;
  }): Promise<{ text: string; metadata: ChatAssistantMetadata; allowed: boolean }> {
    const { text, metadata, requestedLocale, context } = params;
    const safetyDecision = evaluateAssistantOutputGuardrail({
      text: aggregateOutputText(text, metadata),
    });
    if (!safetyDecision.allow) {
      await this.logBlock({ phase: 'output', reason: safetyDecision.reason, fullText: text, context });
      return buildBlockedOutputPayload({ reason: safetyDecision.reason, requestedLocale, metadata });
    }
    logger.info(AUDIT_SECURITY_GUARDRAIL_PASS, { phase: 'output' });
    return { text, metadata, allowed: true };
  }
}
