/**
 * RED — M2 (run 2026-05-26-auth-mfa-rgpd-zerodefect), task T1.1 (R1/R2).
 *
 * Target graceful behaviour: when the backend login envelope carries
 * `mfaRequired`, `authService.login()` MUST reject with a *structured*
 * `AppError` (kind `Forbidden`, code `MFA_WEB_ONLY`) so that `getErrorMessage`
 * resolves a translated i18n string instead of leaking the cryptic raw
 * `'MFA_REQUIRED'` token to the visitor (MFA is web-admin-only in V1).
 *
 * MUST FAIL today: `authApi.ts:62` does `throw new Error('MFA_REQUIRED')` — a
 * bare `Error` with neither `.kind` nor `.code`, and whose `.message` IS the
 * cryptic `'MFA_REQUIRED'` token that `getErrorMessage` would surface verbatim.
 * Asserting kind/code + the absence of `'MFA_REQUIRED'` proves the gap.
 *
 * Contract source verified by Read (UFR-013):
 *   - authApi.login → museum-frontend/features/auth/infrastructure/authApi.ts:54-65
 *   - AppError / createAppError → museum-frontend/shared/types/AppError.ts:20-52
 *   - getErrorMessage / Forbidden→authCodeMessage → museum-frontend/shared/lib/errors.ts:154-242
 *   - mock pattern mirrors verifyEmail.api.test.ts (same folder).
 */
const mockOpenApiRequest = jest.fn();
jest.mock('@/shared/api/openapiClient', () => ({
  openApiRequest: (...args: unknown[]) => mockOpenApiRequest(...args),
}));

const mockClearAccessToken = jest.fn();
jest.mock('@/features/auth/infrastructure/authTokenStore', () => ({
  clearAccessToken: () => mockClearAccessToken(),
}));

import { authService } from '@/features/auth/infrastructure/authApi';
import { getErrorMessage } from '@/shared/lib/errors';
import type { AppError } from '@/shared/types/AppError';

describe('authApi.login graceful MFA handling (R1/R2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects with a structured Forbidden / MFA_WEB_ONLY AppError when the backend returns mfaRequired', async () => {
    mockOpenApiRequest.mockResolvedValue({ mfaRequired: true });

    const error = await authService
      .login('visitor@example.com', 'correct-horse-battery-staple')
      .then(
        () => {
          throw new Error('login should have rejected on mfaRequired');
        },
        (err: unknown) => err,
      );

    // Cast to read the structured discriminators (a bare `Error` lacks them today → FAIL).
    const appError = error as AppError;
    expect(appError.kind).toBe('Forbidden');
    expect(appError.code).toBe('MFA_WEB_ONLY');
  });

  it('does not surface the raw "MFA_REQUIRED" token through getErrorMessage', async () => {
    mockOpenApiRequest.mockResolvedValue({ mfaRequired: true });

    const error = await authService
      .login('visitor@example.com', 'correct-horse-battery-staple')
      .then(
        () => {
          throw new Error('login should have rejected on mfaRequired');
        },
        (err: unknown) => err,
      );

    const message = getErrorMessage(error);
    expect(message).not.toContain('MFA_REQUIRED');
    expect(message.length).toBeGreaterThan(0);
  });
});
