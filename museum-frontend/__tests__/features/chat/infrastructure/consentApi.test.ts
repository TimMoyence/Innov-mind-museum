/**
 * C1 Red — consentApi infra service.
 *
 * Cluster C1 (hexagonal violations, 2026-05-23-frontend-dry-audit) — the
 * `features/chat/application/thirdPartyAiConsent.ts` module currently lives in
 * the application layer but is a pure HTTP adapter (3 named functions calling
 * `httpRequest<…>`). Plan T2.3 migrates the 3 functions to
 * `features/chat/infrastructure/consentApi.ts` exposed as
 * `consentApi.{ list, grant, revoke }`. Constants/types move to
 * `features/chat/domain/consentScopes.ts` (covered by a separate test file).
 *
 * THIS TEST FILE IS RED-PHASE: it must FAIL because
 * `@/features/chat/infrastructure/consentApi` does not yet exist (the
 * functions still live under `features/chat/application/thirdPartyAiConsent`).
 *
 * REQ-C1-009 (Apple 5.1.2(i)) — `grant(scope, version?)` MUST send exactly
 * ONE POST per call; no batching API exposed on the service. This file
 * enforces that contract via "emits exactly one underlying request" asserts.
 */

const mockHttpRequest = jest.fn();
jest.mock('@/shared/api/httpRequest', () => ({
  httpRequest: (...args: unknown[]) => mockHttpRequest(...args),
}));

// eslint-disable-next-line import/order, import/first -- mock-first per Jest hoisting rules
import { consentApi } from '@/features/chat/infrastructure/consentApi';
// eslint-disable-next-line import/order, import/first -- mock-first per Jest hoisting rules
import { CONSENT_POLICY_VERSION } from '@/features/chat/domain/consentScopes';

describe('consentApi (C1 hexagonal façade)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('list()', () => {
    it('sends GET /api/auth/consent with requiresAuth=true', async () => {
      mockHttpRequest.mockResolvedValueOnce({ consents: [] });

      await consentApi.list();

      expect(mockHttpRequest).toHaveBeenCalledWith(
        '/api/auth/consent',
        expect.objectContaining({ method: 'GET', requiresAuth: true }),
      );
    });

    it('returns the consents array from the response envelope', async () => {
      const consents = [
        {
          id: 1,
          scope: 'third_party_ai_text_openai',
          version: '2026-06-01',
          grantedAt: '2026-05-23T10:00:00.000Z',
          revokedAt: null,
          source: 'consent_sheet',
        },
      ];
      mockHttpRequest.mockResolvedValueOnce({ consents });

      const result = await consentApi.list();

      expect(result).toEqual(consents);
    });

    it('propagates transport errors untouched', async () => {
      const err = new Error('401 unauthorized');
      mockHttpRequest.mockRejectedValueOnce(err);

      await expect(consentApi.list()).rejects.toBe(err);
    });
  });

  describe('grant(scope, version?)', () => {
    it('sends POST /api/auth/consent with body { scope, version } (default policy version)', async () => {
      mockHttpRequest.mockResolvedValueOnce({ consent: {} });

      await consentApi.grant('third_party_ai_text_openai');

      expect(mockHttpRequest).toHaveBeenCalledWith(
        '/api/auth/consent',
        expect.objectContaining({
          method: 'POST',
          requiresAuth: true,
          body: { scope: 'third_party_ai_text_openai', version: CONSENT_POLICY_VERSION },
        }),
      );
    });

    it('honours an explicit policy version when provided', async () => {
      mockHttpRequest.mockResolvedValueOnce({ consent: {} });

      await consentApi.grant('third_party_ai_image_google', '2027-01-01');

      expect(mockHttpRequest).toHaveBeenCalledWith(
        '/api/auth/consent',
        expect.objectContaining({
          body: { scope: 'third_party_ai_image_google', version: '2027-01-01' },
        }),
      );
    });

    it('emits exactly ONE POST per call (REQ-C1-009, Apple 5.1.2(i))', async () => {
      mockHttpRequest.mockResolvedValueOnce({ consent: {} });

      await consentApi.grant('third_party_ai_text_openai');

      expect(mockHttpRequest).toHaveBeenCalledTimes(1);
    });

    it('propagates transport errors untouched', async () => {
      const err = new Error('500');
      mockHttpRequest.mockRejectedValueOnce(err);

      await expect(consentApi.grant('third_party_ai_text_openai')).rejects.toBe(err);
    });
  });

  describe('revoke(scope)', () => {
    it('sends DELETE /api/auth/consent/<scope> with requiresAuth=true', async () => {
      mockHttpRequest.mockResolvedValueOnce({ revoked: true, scope: 'third_party_ai_text_openai' });

      await consentApi.revoke('third_party_ai_text_openai');

      expect(mockHttpRequest).toHaveBeenCalledWith(
        '/api/auth/consent/third_party_ai_text_openai',
        expect.objectContaining({ method: 'DELETE', requiresAuth: true }),
      );
    });

    it('propagates transport errors untouched', async () => {
      const err = new Error('403 forbidden');
      mockHttpRequest.mockRejectedValueOnce(err);

      await expect(consentApi.revoke('third_party_ai_text_openai')).rejects.toBe(err);
    });
  });

  describe('API shape (REQ-C1-009 guard against accidental batching)', () => {
    it('exposes only the three single-scope methods (list, grant, revoke)', () => {
      const keys = Object.keys(consentApi).sort();
      expect(keys).toEqual(['grant', 'list', 'revoke']);
    });
  });
});
