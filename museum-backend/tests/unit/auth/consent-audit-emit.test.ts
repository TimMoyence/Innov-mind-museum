import {
  AUDIT_CONSENT_GRANTED,
  AUDIT_CONSENT_GRANTED_LOCATION_TO_LLM,
  AUDIT_CONSENT_GRANTED_THIRD_PARTY_AI,
  AUDIT_CONSENT_GRANTED_TOS,
  AUDIT_CONSENT_REVOKED_LOCATION_TO_LLM,
  AUDIT_CONSENT_REVOKED_THIRD_PARTY_AI,
} from '@shared/audit';

import { GrantConsentUseCase } from '@modules/auth/useCase/consent/grantConsent.useCase';
import { RevokeConsentUseCase } from '@modules/auth/useCase/consent/revokeConsent.useCase';

import { makeUserConsentRepo } from '../../helpers/auth/userConsent-repo.mock';

import type { AuditLogEntry } from '@shared/audit';

interface CapturedSink {
  log: jest.Mock<Promise<void>, [AuditLogEntry]>;
  rows: AuditLogEntry[];
}

const makeAuditSink = (): CapturedSink => {
  const rows: AuditLogEntry[] = [];
  const log = jest.fn(async (entry: AuditLogEntry) => {
    rows.push(entry);
  });
  return { log, rows };
};

describe('Consent use cases — audit-chain emission (S4-P0-02)', () => {
  describe('GrantConsentUseCase', () => {
    it('emits AUDIT_CONSENT_GRANTED_TOS with scope metadata on tos_privacy grant', async () => {
      const repo = makeUserConsentRepo();
      const sink = makeAuditSink();
      const useCase = new GrantConsentUseCase(repo, sink);

      await useCase.execute(42, 'tos_privacy', '2026-06-01', 'registration', {
        ip: '203.0.113.1',
        requestId: 'req-abc',
      });

      expect(sink.log).toHaveBeenCalledTimes(1);
      expect(sink.rows[0]).toMatchObject({
        action: AUDIT_CONSENT_GRANTED_TOS,
        actorType: 'user',
        actorId: 42,
        targetType: 'user_consent',
        metadata: {
          scope: 'tos_privacy',
          version: '2026-06-01',
          source: 'registration',
        },
        ip: '203.0.113.1',
        requestId: 'req-abc',
      });
    });

    it('emits AUDIT_CONSENT_GRANTED_THIRD_PARTY_AI with provider+category breakdown', async () => {
      const repo = makeUserConsentRepo();
      const sink = makeAuditSink();
      const useCase = new GrantConsentUseCase(repo, sink);

      await useCase.execute(42, 'third_party_ai_image_openai', '2026-06-01', 'ui');

      expect(sink.rows[0]).toMatchObject({
        action: AUDIT_CONSENT_GRANTED_THIRD_PARTY_AI,
        metadata: {
          scope: 'third_party_ai_image_openai',
          provider: 'openai',
          category: 'image',
        },
      });
    });

    it('emits AUDIT_CONSENT_GRANTED_LOCATION_TO_LLM on location grant', async () => {
      const repo = makeUserConsentRepo();
      const sink = makeAuditSink();
      const useCase = new GrantConsentUseCase(repo, sink);

      await useCase.execute(42, 'location_to_llm', '2026-06-01', 'ui');

      expect(sink.rows[0].action).toBe(AUDIT_CONSENT_GRANTED_LOCATION_TO_LLM);
    });

    // Cycle 1.5 (RUN_ID 2026-05-26-chat-pipeline-hardening) — CR4. The new coarse
    // geo scope produces an audit row. Per D-AUDIT (recommendation: generic
    // fallback, no dedicated constant), it maps to AUDIT_CONSENT_GRANTED with the
    // scope in metadata. FAILS today: scope validation rejects the unknown scope
    // (`location_coarse_to_llm` not yet in CONSENT_SCOPES) → execute() throws.
    it('CR4: emits an audit row with scope metadata on a location_coarse_to_llm grant', async () => {
      const repo = makeUserConsentRepo();
      const sink = makeAuditSink();
      const useCase = new GrantConsentUseCase(repo, sink);

      await useCase.execute(42, 'location_coarse_to_llm', '2026-05-26', 'ui');

      expect(sink.log).toHaveBeenCalledTimes(1);
      expect(sink.rows[0]).toMatchObject({
        action: AUDIT_CONSENT_GRANTED,
        actorType: 'user',
        actorId: 42,
        targetType: 'user_consent',
        metadata: {
          scope: 'location_coarse_to_llm',
          version: '2026-05-26',
          source: 'ui',
        },
      });
    });

    it('emits generic AUDIT_CONSENT_GRANTED for analytics/marketing scopes', async () => {
      const repo = makeUserConsentRepo();
      const sink = makeAuditSink();
      const useCase = new GrantConsentUseCase(repo, sink);

      await useCase.execute(42, 'analytics', '2026-06-01', 'ui');

      expect(sink.rows[0].action).toBe(AUDIT_CONSENT_GRANTED);
    });

    it('does NOT emit when no audit sink is wired (back-compat)', async () => {
      const repo = makeUserConsentRepo();
      const useCase = new GrantConsentUseCase(repo);

      await expect(
        useCase.execute(42, 'tos_privacy', '2026-06-01', 'registration'),
      ).resolves.toMatchObject({ scope: 'tos_privacy' });
      // No throw, no sink call — back-compat: existing callers that ignore audit still work.
    });

    it('does NOT emit when scope validation fails', async () => {
      const repo = makeUserConsentRepo();
      const sink = makeAuditSink();
      const useCase = new GrantConsentUseCase(repo, sink);

      await expect(useCase.execute(42, 'mining_bitcoin', '2026-06-01', 'ui')).rejects.toThrow();
      expect(sink.log).not.toHaveBeenCalled();
    });
  });

  describe('RevokeConsentUseCase', () => {
    it('emits AUDIT_CONSENT_REVOKED_THIRD_PARTY_AI on active third-party AI revocation', async () => {
      const repo = makeUserConsentRepo();
      const sink = makeAuditSink();
      await new GrantConsentUseCase(repo, sink).execute(
        42,
        'third_party_ai_audio_google',
        '2026-06-01',
        'ui',
      );
      sink.log.mockClear();
      sink.rows.length = 0;

      const revoke = new RevokeConsentUseCase(repo, sink);
      await revoke.execute(42, 'third_party_ai_audio_google', {
        ip: '203.0.113.2',
        requestId: 'req-def',
      });

      expect(sink.rows[0]).toMatchObject({
        action: AUDIT_CONSENT_REVOKED_THIRD_PARTY_AI,
        actorId: 42,
        targetType: 'user_consent',
        metadata: {
          scope: 'third_party_ai_audio_google',
          provider: 'google',
          category: 'audio',
        },
        ip: '203.0.113.2',
      });
    });

    it('does NOT emit a revoke row when there is no active grant (idempotent)', async () => {
      const repo = makeUserConsentRepo();
      const sink = makeAuditSink();
      const revoke = new RevokeConsentUseCase(repo, sink);

      await revoke.execute(42, 'analytics');

      expect(sink.log).not.toHaveBeenCalled();
    });

    it('emits AUDIT_CONSENT_REVOKED_LOCATION_TO_LLM on location revoke', async () => {
      const repo = makeUserConsentRepo();
      const sink = makeAuditSink();
      await new GrantConsentUseCase(repo, sink).execute(42, 'location_to_llm', '2026-06-01', 'ui');
      sink.log.mockClear();
      sink.rows.length = 0;

      await new RevokeConsentUseCase(repo, sink).execute(42, 'location_to_llm');

      expect(sink.rows[0].action).toBe(AUDIT_CONSENT_REVOKED_LOCATION_TO_LLM);
    });
  });
});
