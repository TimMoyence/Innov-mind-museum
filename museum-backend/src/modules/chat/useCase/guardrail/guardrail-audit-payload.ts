import { redactSnippetForAudit } from '@modules/chat/useCase/guardrail/guardrail-snippet';
import {
  AUDIT_GUARDRAIL_BLOCKED_INPUT,
  AUDIT_GUARDRAIL_BLOCKED_OUTPUT,
} from '@shared/audit/audit.types';

import type { GuardrailBlockReason } from './art-topic-guardrail';
import type { AuditLogEntry } from '@shared/audit/audit.types';

export interface GuardrailAuditContext {
  sessionId?: string;
  userId?: number;
  requestId?: string;
  ip?: string;
  locale?: string;
}

export function buildGuardrailBlockAuditEntry(params: {
  phase: 'input' | 'output';
  reason: GuardrailBlockReason | undefined;
  fullText: string;
  context?: GuardrailAuditContext;
}): AuditLogEntry {
  const { phase, reason, fullText, context } = params;
  const { snippetPreview, snippetFingerprint } = redactSnippetForAudit(fullText);
  const userId = context?.userId;

  return {
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
      policyVersion: 'default-v0',
    },
    ip: context?.ip ?? null,
    requestId: context?.requestId ?? null,
  };
}
