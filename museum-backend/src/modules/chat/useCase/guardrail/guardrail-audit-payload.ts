import { redactSnippetForAudit } from '@modules/chat/util/guardrail-snippet';
import {
  AUDIT_GUARDRAIL_BLOCKED_INPUT,
  AUDIT_GUARDRAIL_BLOCKED_OUTPUT,
} from '@shared/audit/audit.types';

import type { GuardrailBlockReason } from './art-topic-guardrail';
import type { AuditLogEntry } from '@shared/audit/audit.types';

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
 * Builds the AuditService.log() payload for a guardrail block (V13 / STRIDE R3).
 * Pure — no I/O, just shape construction. The caller persists via
 * `auditService.log(buildGuardrailBlockAuditEntry(...))`.
 *
 * Single forensic entry per block: phase-scoped action, actor identification,
 * redacted snippet (≤64 chars + sha256 of full text), classifier flags, locale,
 * and request correlation fields.
 */
export function buildGuardrailBlockAuditEntry(params: {
  phase: 'input' | 'output';
  reason: GuardrailBlockReason | undefined;
  fullText: string;
  classifierRan: boolean;
  advancedRan: boolean;
  context?: GuardrailAuditContext;
}): AuditLogEntry {
  const { phase, reason, fullText, classifierRan, advancedRan, context } = params;
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
      classifierRan,
      advancedRan,
    },
    ip: context?.ip ?? null,
    requestId: context?.requestId ?? null,
  };
}
