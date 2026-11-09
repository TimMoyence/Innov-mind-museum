import { buildGuardrailBlockAuditEntry } from '@modules/chat/useCase/guardrail/guardrail-audit-payload';
import { AUDIT_GUARDRAIL_BLOCKED_INPUT } from '@shared/audit/audit.types';

describe('guardrail-audit-payload', () => {
  describe('buildGuardrailBlockAuditEntry', () => {
    it('sets action to AUDIT_GUARDRAIL_BLOCKED_INPUT for an input block', () => {
      const entry = buildGuardrailBlockAuditEntry({
        phase: 'input',
        reason: 'insult',
        fullText: 'you are an idiot',
        context: { sessionId: 's', userId: 7 },
      });

      expect(entry.action).toBe(AUDIT_GUARDRAIL_BLOCKED_INPUT);
      expect(entry.metadata?.snippetFingerprint).toMatch(/^[0-9a-f]{64}$/);
    });

    it('TD-66 — never leaks raw user email/phone into the block audit entry', () => {
      const entry = buildGuardrailBlockAuditEntry({
        phase: 'input',
        reason: 'prompt_injection',
        fullText: 'contact me at john.doe@example.com or +33 6 12 34 56 78',
        context: { sessionId: 's', userId: 7, locale: 'fr' },
      });

      const preview = entry.metadata?.snippetPreview as string;
      expect(preview).not.toContain('john.doe@example.com');
      expect(preview).not.toContain('12 34 56 78');
      expect(preview).toContain('[EMAIL]');
      expect(preview).toContain('[PHONE]');

      const serialized = JSON.stringify(entry);
      expect(serialized).not.toContain('john.doe@example.com');
    });
  });
});
