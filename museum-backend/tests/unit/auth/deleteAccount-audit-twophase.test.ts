/**
 * RED (T1.1 — Cycle D, R1/R2/R3) — two-phase audit on `DELETE /api/auth/account`.
 *
 * The audit journal MUST NOT lie (spec §1.1, design §1 D1). Today the route
 * handler (`auth-profile.route.ts:151-160`) emits `ACCOUNT_DELETED` BEFORE
 * `deleteAccountUseCase.execute()` runs — so a failed `execute()` leaves a row
 * claiming the account was deleted when nothing was. The fix sequences it:
 *
 *   R1 — emit `ACCOUNT_DELETION_REQUESTED` BEFORE `execute()`.
 *   R2 — emit `ACCOUNT_DELETED` only AFTER `execute()` resolves.
 *   R3 — if `execute()` rejects → NO `ACCOUNT_DELETED`; `REQUESTED` is the only
 *        trace; the handler propagates the error (non-2xx).
 *
 * Ordering is observed via `jest.fn().mock.invocationCallOrder` (monotonic
 * global per jest run) shared between the mocked `auditService.log` and the
 * mocked `deleteAccountUseCase.execute`.
 *
 * RED at baseline:
 *  - `AUDIT_ACCOUNT_DELETION_REQUESTED` does NOT exist in `audit.types.ts` →
 *    the route never logs a `REQUESTED` action → the R1 assertion fails.
 *  - The current handler logs `ACCOUNT_DELETED` BEFORE `execute()` and even
 *    when `execute()` throws (the `log()` already ran) → R2/R3 assertions fail.
 *
 * The whole `@modules/auth/useCase` barrel + `@shared/audit` are mocked (mirror
 * `tests/unit/auth/consent.route.test.ts`) so the route can mount under the real
 * app + `isAuthenticated` gate without a DB.
 */
import request from 'supertest';

import { createRouteTestApp, stopRateLimitSweep } from '../../helpers/http/route-test-setup';
import { makeToken } from '../../helpers/auth/token.helpers';

// ── Mock the auth useCase barrel: the route + isAuthenticated both pull from
//    @modules/auth/useCase. We expose deleteAccountUseCase.execute (spied) +
//    authSessionService.verifyAccessToken (jwt-backed) + stubs for the rest.
// ────────────────────────────────────────────────────────────────────────────
jest.mock('@modules/auth/useCase', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory runs before ESM imports
  const jwtLib = require('jsonwebtoken');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory runs before ESM imports
  const { env: envConfig } = require('@src/config/env');

  const verifyAccessToken = (token: string) => {
    const decoded = jwtLib.verify(token, envConfig.auth.accessTokenSecret) as {
      sub: string;
      role?: string;
      museumId?: number;
      type: string;
    };
    if (decoded.type !== 'access' || !decoded.sub) {
      throw new Error('Invalid access token');
    }
    return {
      id: Number(decoded.sub),
      role: decoded.role ?? 'visitor',
      museumId: decoded.museumId ?? null,
    };
  };

  return {
    authSessionService: {
      verifyAccessToken,
      verifyAccessTokenWithClaims: verifyAccessToken,
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
    },
    deleteAccountUseCase: { execute: jest.fn().mockResolvedValue(undefined) },
    getProfileUseCase: { execute: jest.fn() },
    updateContentPreferencesUseCase: { execute: jest.fn() },
    updateProfilePreferencesUseCase: { execute: jest.fn() },
    updateTtsVoiceUseCase: { execute: jest.fn() },
    completeOnboarding: jest.fn(),
    // Other barrel members the auth router imports (stubs — not exercised here).
    registerUseCase: { execute: jest.fn() },
    forgotPasswordUseCase: { execute: jest.fn() },
    resetPasswordUseCase: { execute: jest.fn() },
    socialLoginUseCase: { execute: jest.fn() },
    exportUserDataUseCase: { execute: jest.fn() },
    changePasswordUseCase: { execute: jest.fn() },
    changeEmailUseCase: { execute: jest.fn() },
    confirmEmailChangeUseCase: { execute: jest.fn() },
    verifyEmailUseCase: { execute: jest.fn() },
    generateApiKeyUseCase: { execute: jest.fn() },
    revokeApiKeyUseCase: { execute: jest.fn() },
    listApiKeysUseCase: { execute: jest.fn() },
    grantConsentUseCase: { execute: jest.fn() },
    revokeConsentUseCase: { execute: jest.fn() },
    userConsentRepository: {},
    wireAuthMiddleware: jest.fn(),
  };
});

jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn().mockResolvedValue(undefined) },
}));

// Re-grab the mocked singletons after jest.mock hoisting.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- re-grab through the mocked module after jest.mock hoisting (mirror consent.route.test.ts)
const { auditService } = require('@shared/audit') as {
  auditService: { log: jest.Mock };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- re-grab through the mocked module after jest.mock hoisting (mirror consent.route.test.ts)
const { deleteAccountUseCase } = require('@modules/auth/useCase') as {
  deleteAccountUseCase: { execute: jest.Mock };
};

/** Names of the audit actions the two-phase contract requires (spec §6). */
const ACTION_REQUESTED = 'ACCOUNT_DELETION_REQUESTED';
const ACTION_DELETED = 'ACCOUNT_DELETED';

/** Extract the `action` of every `auditService.log` call, in call order. */
function loggedActions(): string[] {
  return auditService.log.mock.calls.map((c) => (c[0] as { action: string }).action);
}

const { app } = createRouteTestApp();

describe('DELETE /api/auth/account — two-phase audit (R1/R2/R3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    deleteAccountUseCase.execute.mockResolvedValue(undefined);
    auditService.log.mockResolvedValue(undefined);
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('emits ACCOUNT_DELETION_REQUESTED BEFORE execute() (R1)', async () => {
    const token = makeToken({ sub: '42' });

    const res = await request(app)
      .delete('/api/auth/account')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    // R1 — a REQUESTED row must be logged at all.
    const requestedCall = auditService.log.mock.calls.find(
      (c) => (c[0] as { action: string }).action === ACTION_REQUESTED,
    );
    expect(requestedCall).toBeDefined();

    // R1 — REQUESTED is logged BEFORE execute() runs (invocationCallOrder is a
    // monotonic global counter shared across all jest.fn()s).
    const requestedOrder = auditService.log.mock.invocationCallOrder.find(
      (_order, idx) =>
        (auditService.log.mock.calls[idx][0] as { action: string }).action === ACTION_REQUESTED,
    );
    const executeOrder = deleteAccountUseCase.execute.mock.invocationCallOrder[0];
    expect(requestedOrder).toBeDefined();
    expect(executeOrder).toBeDefined();
    expect(requestedOrder!).toBeLessThan(executeOrder);
  });

  it('emits ACCOUNT_DELETED only AFTER execute() resolves (R2)', async () => {
    const token = makeToken({ sub: '7' });

    await request(app).delete('/api/auth/account').set('Authorization', `Bearer ${token}`);

    const deletedOrder = auditService.log.mock.invocationCallOrder.find(
      (_order, idx) =>
        (auditService.log.mock.calls[idx][0] as { action: string }).action === ACTION_DELETED,
    );
    const executeOrder = deleteAccountUseCase.execute.mock.invocationCallOrder[0];
    expect(deletedOrder).toBeDefined();
    expect(executeOrder).toBeDefined();
    // DELETED must come AFTER execute(), never before.
    expect(deletedOrder!).toBeGreaterThan(executeOrder);
  });

  it('does NOT emit ACCOUNT_DELETED when execute() rejects; keeps REQUESTED only + non-2xx (R3)', async () => {
    deleteAccountUseCase.execute.mockRejectedValue(new Error('DB down during cascade'));
    const token = makeToken({ sub: '9' });

    const res = await request(app)
      .delete('/api/auth/account')
      .set('Authorization', `Bearer ${token}`);

    // The error propagates → handler returns a non-2xx (5xx via errorHandler).
    expect(res.status).toBeGreaterThanOrEqual(500);

    const actions = loggedActions();
    // REQUESTED is the only trace (the request was received).
    expect(actions).toContain(ACTION_REQUESTED);
    // The journal must NOT claim the account was deleted.
    expect(actions).not.toContain(ACTION_DELETED);
  });
});
