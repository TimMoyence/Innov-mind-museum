import { redactSnippetForAudit } from '@modules/chat/useCase/guardrail/guardrail-snippet';
import {
  AUDIT_GUARDRAIL_BLOCKED_INPUT,
  AUDIT_GUARDRAIL_BLOCKED_OUTPUT,
  AUDIT_GUARDRAIL_INPUT_REDACTED,
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
  providerRan: boolean;
  context?: GuardrailAuditContext;
}): AuditLogEntry {
  const { phase, reason, fullText, classifierRan, providerRan, context } = params;
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
      providerRan,
      // Phase 0 anchor (ADR-048) — every block audit carries the policy
      // version that made the decision. V1 = single global default; Phase 2
      // populates per-tenant policy versions resolved at request time.
      policyVersion: 'default-v0',
    },
    ip: context?.ip ?? null,
    requestId: context?.requestId ?? null,
  };
}

/**
 * Builds the audit entry for an effective PII redaction on chat input (LLM02).
 *
 * Forensic invariant: the function receives ONLY the post-scrub `redactedText`
 * — the raw user text never reaches this code path. `snippetPreview` /
 * `snippetFingerprint` therefore operate on the already-sanitized string,
 * making it structurally impossible to leak the original PII into the audit
 * hash chain (GDPR Art. 5(1)(c) + LLM02 hardening).
 *
 * Emitted by `GuardrailEvaluationService.evaluateInput` when the provider
 * returned a `redactedText` that differs from the input (placeholders observed).
 */
export function buildGuardrailInputRedactedAuditEntry(params: {
  redactedText: string;
  placeholderCount: number;
  providerName: string;
  providerVersion: string;
  context?: GuardrailAuditContext;
}): AuditLogEntry {
  const { redactedText, placeholderCount, providerName, providerVersion, context } = params;
  const { snippetPreview, snippetFingerprint } = redactSnippetForAudit(redactedText);
  const userId = context?.userId;

  return {
    action: AUDIT_GUARDRAIL_INPUT_REDACTED,
    actorType: userId ? 'user' : 'anonymous',
    actorId: userId ?? null,
    targetType: 'chat_session',
    targetId: context?.sessionId ?? null,
    metadata: {
      pii_redacted: true,
      placeholder_count: placeholderCount,
      snippetPreview,
      snippetFingerprint,
      locale: context?.locale ?? null,
      provider: { name: providerName, version: providerVersion },
      policyVersion: 'default-v0',
    },
    ip: context?.ip ?? null,
    requestId: context?.requestId ?? null,
  };
}
