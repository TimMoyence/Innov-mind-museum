import type { GuardrailBlockReason } from './art-topic-guardrail';
import type { ChatRepository } from '@modules/chat/domain/session/chat.repository.interface';
import type { JudgeDecision } from '@modules/chat/useCase/llm/llm-judge-guardrail';
import type { AuditService } from '@shared/audit/audit.service';
import type { LlmJudgeScope } from '@shared/observability/derive-tier';

export type { GuardrailAuditContext } from './guardrail-audit-payload';

export interface InputGuardrailResult {
  allow: boolean;
  reason?: GuardrailBlockReason;
}

export type LlmJudgeFn = (message: string, scope?: LlmJudgeScope) => Promise<JudgeDecision | null>;

export interface GuardrailEvaluationServiceDeps {
  repository: ChatRepository;
  audit?: AuditService;
  llmJudge?: LlmJudgeFn;
  llmJudgeEnabled?: boolean;
}
