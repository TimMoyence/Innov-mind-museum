import {
  buildGuardrailBlockAuditEntry,
  buildGuardrailInputRedactedAuditEntry,
} from '@modules/chat/useCase/guardrail/guardrail-audit-payload';
import {
  AUDIT_GUARDRAIL_BLOCKED_INPUT,
  AUDIT_GUARDRAIL_INPUT_REDACTED,
} from '@shared/audit/audit.types';

describe('guardrail-audit-payload', () => {
  describe('buildGuardrailBlockAuditEntry', () => {
    it('sets action to AUDIT_GUARDRAIL_BLOCKED_INPUT for an input block', () => {
      const entry = buildGuardrailBlockAuditEntry({
        phase: 'input',
        reason: 'insult',
        fullText: 'you are an idiot',
        classifierRan: false,
        providerRan: false,
        context: { sessionId: 's', userId: 7 },
      });

      expect(entry.action).toBe(AUDIT_GUARDRAIL_BLOCKED_INPUT);
      expect(entry.metadata?.snippetFingerprint).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('buildGuardrailInputRedactedAuditEntry (LLM02)', () => {
    // R6 — forensic invariant: the helper receives only the post-scrub
    // `redactedText`, so the raw PII passed by the user must never appear
    // anywhere in the constructed audit entry. The test asserts both the
    // structural shape AND the absence of the original PII tokens.
    it('R6 — never leaks raw PII into the audit entry', () => {
      const redacted = 'mon email est <EMAIL_ADDRESS_1> et carte <CREDIT_CARD_1>';

      const entry = buildGuardrailInputRedactedAuditEntry({
        redactedText: redacted,
        placeholderCount: 2,
        providerName: 'llm-guard',
        providerVersion: '0.3.16',
        context: {
          sessionId: 'session-pii',
          userId: 42,
          locale: 'fr',
          ip: '203.0.113.7',
          requestId: 'req-1',
        },
      });

      expect(entry.action).toBe(AUDIT_GUARDRAIL_INPUT_REDACTED);
      expect(entry.actorType).toBe('user');
      expect(entry.actorId).toBe(42);
      expect(entry.targetType).toBe('chat_session');
      expect(entry.targetId).toBe('session-pii');
      expect(entry.requestId).toBe('req-1');
      expect(entry.ip).toBe('203.0.113.7');

      const meta = entry.metadata!;
      expect(meta.pii_redacted).toBe(true);
      expect(meta.placeholder_count).toBe(2);
      expect(meta.locale).toBe('fr');
      expect(meta.provider).toEqual({ name: 'llm-guard', version: '0.3.16' });
      expect(meta.snippetPreview).toBe(redacted.slice(0, 64));
      expect(meta.snippetFingerprint).toMatch(/^[0-9a-f]{64}$/);

      // The original PII must NOT have leaked anywhere through stringification.
      const serialized = JSON.stringify(entry);
      expect(serialized).not.toContain('tim@example.com');
      expect(serialized).not.toContain('4111-1111-1111-1111');
    });

    it('falls back to anonymous actorType when userId is missing', () => {
      const entry = buildGuardrailInputRedactedAuditEntry({
        redactedText: '<EMAIL_ADDRESS_1>',
        placeholderCount: 1,
        providerName: 'llm-guard',
        providerVersion: '0.3.16',
        context: { sessionId: 'anon-session' },
      });

      expect(entry.actorType).toBe('anonymous');
      expect(entry.actorId).toBeNull();
    });
  });
});
