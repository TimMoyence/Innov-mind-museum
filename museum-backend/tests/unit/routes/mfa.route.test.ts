import request from 'supertest';

import { AppError } from '@shared/errors/app.error';
import { issueMfaSessionToken } from '@modules/auth/useCase/totp/mfaSessionToken';

import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';
import { makeToken } from '../../helpers/auth/token.helpers';

/**
 * Route-level unit tests for `mfa.route.ts`.
 *
 * Targets the 61 Stryker `NoCoverage` mutants reported for this file by
 * exercising every handler body (status + JSON shape + use-case args) plus
 * every branch of the `bySessionOrIp` key-generator helper. The e2e file
 * `tests/unit/auth/mfa-flow.e2e.test.ts` covers the full DB path; this file
 * isolates the HTTP surface so `perTest` coverage maps mutants directly to
 * a route assertion.
 */

// ── Use-case mocks ───────────────────────────────────────────────────

const mockEnroll = jest.fn();
const mockVerify = jest.fn();
const mockChallenge = jest.fn();
const mockRecovery = jest.fn();
const mockDisable = jest.fn();
const mockGetStatus = jest.fn();

jest.mock('@modules/auth/useCase', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory runs before ESM imports (mirror of auth.route.test.ts)
  const jwtLib = require('jsonwebtoken');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory runs before ESM imports (mirror of auth.route.test.ts)
  const { env: envConfig } = require('@src/config/env');

  return {
    enrollMfaUseCase: { execute: (...args: unknown[]) => mockEnroll(...args) },
    verifyMfaUseCase: { execute: (...args: unknown[]) => mockVerify(...args) },
    challengeMfaUseCase: { execute: (...args: unknown[]) => mockChallenge(...args) },
    recoveryMfaUseCase: { execute: (...args: unknown[]) => mockRecovery(...args) },
    disableMfaUseCase: { execute: (...args: unknown[]) => mockDisable(...args) },
    getMfaStatusUseCase: { execute: (...args: unknown[]) => mockGetStatus(...args) },
    authSessionService: {
      // Post C3 (run 2026-05-21-p0-c3-auth-crypto): middleware async + uses
      // verifyAccessTokenWithClaims (returns {id, role, museumId, jti, expSec})
      // for denylist consultation per R8.
      verifyAccessToken: (token: string) => {
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
      },
      verifyAccessTokenWithClaims: (token: string) => {
        const decoded = jwtLib.verify(token, envConfig.auth.accessTokenSecret) as {
          sub: string;
          role?: string;
          museumId?: number;
          type: string;
          jti?: string;
          exp?: number;
        };
        if (decoded.type !== 'access' || !decoded.sub) {
          throw new Error('Invalid access token');
        }
        return {
          id: Number(decoded.sub),
          role: decoded.role ?? 'visitor',
          museumId: decoded.museumId ?? null,
          jti: decoded.jti ?? 'test-jti',
          expSec: decoded.exp ?? 9999999999,
        };
      },
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
    },
    // The composition root pulls every useCase index export; fill the rest
    // with no-op stubs so api.router import does not blow up.
    registerUseCase: { execute: jest.fn() },
    getProfileUseCase: { execute: jest.fn() },
    deleteAccountUseCase: { execute: jest.fn() },
    forgotPasswordUseCase: { execute: jest.fn() },
    resetPasswordUseCase: { execute: jest.fn() },
    socialLoginUseCase: { execute: jest.fn() },
    nonceStore: { issue: jest.fn(), consume: jest.fn() },
    exportUserDataUseCase: { execute: jest.fn() },
    changePasswordUseCase: { execute: jest.fn() },
    changeEmailUseCase: { execute: jest.fn() },
    confirmEmailChangeUseCase: { execute: jest.fn() },
    verifyEmailUseCase: { execute: jest.fn() },
    completeOnboarding: jest.fn(),
    generateApiKeyUseCase: { execute: jest.fn() },
    revokeApiKeyUseCase: { execute: jest.fn() },
    listApiKeysUseCase: { execute: jest.fn() },
    userRepository: { getUserById: jest.fn() },
    wireAuthMiddleware: jest.fn(),
  };
});

// auditService.log is `await`-ed in every handler. Mock as a resolved promise
// so the handler completes; jest.fn().mockResolvedValue is implicit because
// `auditService.log` returns void → undefined, which is awaitable.
jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn().mockResolvedValue(undefined) },
}));

const { app } = createRouteTestApp();

const MFA_BASE = '/api/auth/mfa';

describe('MFA Routes — HTTP layer', () => {
  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  // ─── GET /api/auth/mfa/status ────────────────────────────────────

  describe('GET /api/auth/mfa/status', () => {
    it('returns 401 without an access token', async () => {
      const res = await request(app).get(`${MFA_BASE}/status`);
      expect(res.status).toBe(401);
      expect(mockGetStatus).not.toHaveBeenCalled();
    });

    it('returns the envelope (enrolled=false) for a fresh user', async () => {
      const envelope = { mfaEnrolled: false, methods: [], lastVerifiedAt: null };
      mockGetStatus.mockResolvedValueOnce(envelope);
      const token = makeToken();

      const res = await request(app)
        .get(`${MFA_BASE}/status`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject(envelope);
      expect(mockGetStatus).toHaveBeenCalledWith(1);
    });

    it('returns the envelope (enrolled=true) for an enrolled user', async () => {
      const envelope = {
        mfaEnrolled: true,
        methods: ['totp'],
        lastVerifiedAt: '2026-05-01T12:00:00.000Z',
      };
      mockGetStatus.mockResolvedValueOnce(envelope);
      const token = makeToken({ sub: '42' });

      const res = await request(app)
        .get(`${MFA_BASE}/status`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject(envelope);
      expect(mockGetStatus).toHaveBeenCalledWith(42);
    });
  });

  // ─── POST /api/auth/mfa/enroll ───────────────────────────────────

  describe('POST /api/auth/mfa/enroll', () => {
    it('returns 401 without an access token', async () => {
      const res = await request(app).post(`${MFA_BASE}/enroll`);
      expect(res.status).toBe(401);
      expect(mockEnroll).not.toHaveBeenCalled();
    });

    it('returns 200 with the enrollment payload + audit row', async () => {
      const enrollResult = {
        secret: 'JBSWY3DPEHPK3PXP',
        otpauthUrl: 'otpauth://totp/test',
        recoveryCodes: ['AAAA-BBBB', 'CCCC-DDDD'],
      };
      mockEnroll.mockResolvedValueOnce(enrollResult);
      const { auditService } = jest.requireMock('@shared/audit') as {
        auditService: { log: jest.Mock };
      };

      const token = makeToken({ sub: '7' });
      const res = await request(app)
        .post(`${MFA_BASE}/enroll`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject(enrollResult);
      expect(mockEnroll).toHaveBeenCalledWith(7);
      expect(auditService.log).toHaveBeenCalledTimes(1);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MFA_ENROLL_STARTED',
          actorType: 'user',
          actorId: 7,
          targetType: 'user',
          targetId: '7',
        }),
      );
    });
  });

  // ─── POST /api/auth/mfa/enroll/verify ────────────────────────────

  describe('POST /api/auth/mfa/enroll/verify', () => {
    it('returns 401 without an access token', async () => {
      const res = await request(app).post(`${MFA_BASE}/enroll/verify`).send({ code: '123456' });
      expect(res.status).toBe(401);
      expect(mockVerify).not.toHaveBeenCalled();
    });

    it('returns 400 when the body is empty (zod)', async () => {
      const token = makeToken();
      const res = await request(app)
        .post(`${MFA_BASE}/enroll/verify`)
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
      expect(mockVerify).not.toHaveBeenCalled();
    });

    it('returns 400 when the code is too short', async () => {
      const token = makeToken();
      const res = await request(app)
        .post(`${MFA_BASE}/enroll/verify`)
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '123' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when the code is too long', async () => {
      const token = makeToken();
      const res = await request(app)
        .post(`${MFA_BASE}/enroll/verify`)
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '1234567' });
      expect(res.status).toBe(400);
    });

    it('returns 200 with enrolledAt + audit row on success', async () => {
      const enrolledAt = new Date('2026-04-01T00:00:00.000Z');
      mockVerify.mockResolvedValueOnce({ enrolledAt });
      const { auditService } = jest.requireMock('@shared/audit') as {
        auditService: { log: jest.Mock };
      };

      const token = makeToken({ sub: '7' });
      const res = await request(app)
        .post(`${MFA_BASE}/enroll/verify`)
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '654321' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ enrolledAt: enrolledAt.toISOString() });
      expect(mockVerify).toHaveBeenCalledWith(7, '654321');
      expect(auditService.log).toHaveBeenCalledTimes(1);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MFA_ENROLL_VERIFIED',
          actorType: 'user',
          actorId: 7,
          targetType: 'user',
          targetId: '7',
        }),
      );
    });

    it('surfaces INVALID_MFA_CODE 401 from the use case', async () => {
      mockVerify.mockRejectedValueOnce(
        new AppError({ message: 'bad code', statusCode: 401, code: 'INVALID_MFA_CODE' }),
      );
      const token = makeToken();
      const res = await request(app)
        .post(`${MFA_BASE}/enroll/verify`)
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '000000' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_MFA_CODE');
    });
  });

  // ─── POST /api/auth/mfa/challenge ────────────────────────────────

  describe('POST /api/auth/mfa/challenge', () => {
    it('returns 400 when the body is empty (zod)', async () => {
      const res = await request(app).post(`${MFA_BASE}/challenge`).send({});
      expect(res.status).toBe(400);
      expect(mockChallenge).not.toHaveBeenCalled();
    });

    it('returns 400 when mfaSessionToken is missing', async () => {
      const res = await request(app).post(`${MFA_BASE}/challenge`).send({ code: '123456' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when code length is invalid', async () => {
      const sessionToken = issueMfaSessionToken(11);
      const res = await request(app)
        .post(`${MFA_BASE}/challenge`)
        .send({ mfaSessionToken: sessionToken, code: '12' });
      expect(res.status).toBe(400);
    });

    it('returns 200 with the session payload and logs CHALLENGE_SUCCESS', async () => {
      const session = {
        accessToken: 'at-ch',
        refreshToken: 'rt-ch',
        expiresIn: 900,
        refreshExpiresIn: 86400,
        user: { id: 11, email: 'mfa@test.com' },
      };
      mockChallenge.mockResolvedValueOnce({ session, userId: 11 });
      const sessionToken = issueMfaSessionToken(11);
      const { auditService } = jest.requireMock('@shared/audit') as {
        auditService: { log: jest.Mock };
      };

      const res = await request(app)
        .post(`${MFA_BASE}/challenge`)
        .send({ mfaSessionToken: sessionToken, code: '123456' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject(session);
      expect(mockChallenge).toHaveBeenCalledWith({
        mfaSessionToken: sessionToken,
        code: '123456',
      });
      expect(auditService.log).toHaveBeenCalledTimes(1);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MFA_CHALLENGE_SUCCESS',
          actorType: 'user',
          actorId: 11,
          targetType: 'user',
          targetId: '11',
        }),
      );
    });

    it('logs CHALLENGE_FAILED (decoded user) when use case throws INVALID_MFA_CODE with a valid session token', async () => {
      mockChallenge.mockRejectedValueOnce(
        new AppError({ message: 'bad', statusCode: 401, code: 'INVALID_MFA_CODE' }),
      );
      const sessionToken = issueMfaSessionToken(11);
      const { auditService } = jest.requireMock('@shared/audit') as {
        auditService: { log: jest.Mock };
      };

      const res = await request(app)
        .post(`${MFA_BASE}/challenge`)
        .send({ mfaSessionToken: sessionToken, code: '000000' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_MFA_CODE');
      expect(auditService.log).toHaveBeenCalledTimes(1);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MFA_CHALLENGE_FAILED',
          actorType: 'user',
          actorId: 11,
          targetType: 'user',
          targetId: '11',
        }),
      );
    });

    it('logs CHALLENGE_FAILED as anonymous when INVALID_MFA_CODE fires and the session token cannot be decoded', async () => {
      // The Zod schema only enforces min(1); a malformed string is still accepted
      // at validation time, so the use-case rejection drives us into the catch
      // block, and `verifyMfaSessionToken(...)` throws → anonymous audit branch.
      mockChallenge.mockRejectedValueOnce(
        new AppError({ message: 'bad', statusCode: 401, code: 'INVALID_MFA_CODE' }),
      );
      const { auditService } = jest.requireMock('@shared/audit') as {
        auditService: { log: jest.Mock };
      };

      const res = await request(app)
        .post(`${MFA_BASE}/challenge`)
        .send({ mfaSessionToken: 'totally-not-a-jwt', code: '000000' });

      expect(res.status).toBe(401);
      expect(auditService.log).toHaveBeenCalledTimes(1);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MFA_CHALLENGE_FAILED',
          actorType: 'anonymous',
        }),
      );
      // The anonymous branch MUST NOT carry actorId / targetType / targetId.
      const logCall = auditService.log.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(logCall.actorId).toBeUndefined();
      expect(logCall.targetType).toBeUndefined();
      expect(logCall.targetId).toBeUndefined();
    });

    it('does NOT emit a CHALLENGE_FAILED audit row when the use case throws a non-INVALID_MFA_CODE AppError', async () => {
      mockChallenge.mockRejectedValueOnce(
        new AppError({
          message: 'expired',
          statusCode: 401,
          code: 'INVALID_MFA_SESSION',
        }),
      );
      const sessionToken = issueMfaSessionToken(11);
      const { auditService } = jest.requireMock('@shared/audit') as {
        auditService: { log: jest.Mock };
      };

      const res = await request(app)
        .post(`${MFA_BASE}/challenge`)
        .send({ mfaSessionToken: sessionToken, code: '123456' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_MFA_SESSION');
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('does NOT emit a CHALLENGE_FAILED audit row when the use case throws a non-AppError', async () => {
      mockChallenge.mockRejectedValueOnce(new Error('boom'));
      const sessionToken = issueMfaSessionToken(11);
      const { auditService } = jest.requireMock('@shared/audit') as {
        auditService: { log: jest.Mock };
      };

      const res = await request(app)
        .post(`${MFA_BASE}/challenge`)
        .send({ mfaSessionToken: sessionToken, code: '123456' });

      // Generic Error → 500 from the error middleware (buildPayload default).
      expect(res.status).toBe(500);
      expect(auditService.log).not.toHaveBeenCalled();
    });
  });

  // ─── POST /api/auth/mfa/recovery ─────────────────────────────────

  describe('POST /api/auth/mfa/recovery', () => {
    it('returns 400 when the body is empty (zod)', async () => {
      const res = await request(app).post(`${MFA_BASE}/recovery`).send({});
      expect(res.status).toBe(400);
      expect(mockRecovery).not.toHaveBeenCalled();
    });

    it('returns 400 when the recovery code is shorter than 6', async () => {
      const sessionToken = issueMfaSessionToken(11);
      const res = await request(app)
        .post(`${MFA_BASE}/recovery`)
        .send({ mfaSessionToken: sessionToken, recoveryCode: '12345' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when the recovery code exceeds 32 chars', async () => {
      const sessionToken = issueMfaSessionToken(11);
      const res = await request(app)
        .post(`${MFA_BASE}/recovery`)
        .send({ mfaSessionToken: sessionToken, recoveryCode: 'a'.repeat(33) });
      expect(res.status).toBe(400);
    });

    it('returns 200 with session + remainingRecoveryCodes and logs RECOVERY_USED', async () => {
      const session = {
        accessToken: 'at-rec',
        refreshToken: 'rt-rec',
        expiresIn: 900,
        refreshExpiresIn: 86400,
        user: { id: 11, email: 'mfa@test.com' },
      };
      mockRecovery.mockResolvedValueOnce({ session, userId: 11, remainingCodes: 4 });
      const sessionToken = issueMfaSessionToken(11);
      const { auditService } = jest.requireMock('@shared/audit') as {
        auditService: { log: jest.Mock };
      };

      const res = await request(app)
        .post(`${MFA_BASE}/recovery`)
        .send({ mfaSessionToken: sessionToken, recoveryCode: 'TEST00-CODE00' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ...session, remainingRecoveryCodes: 4 });
      expect(mockRecovery).toHaveBeenCalledWith({
        mfaSessionToken: sessionToken,
        recoveryCode: 'TEST00-CODE00',
      });
      expect(auditService.log).toHaveBeenCalledTimes(1);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MFA_RECOVERY_USED',
          actorType: 'user',
          actorId: 11,
          targetType: 'user',
          targetId: '11',
          metadata: { remainingCodes: 4 },
        }),
      );
    });

    it('surfaces INVALID_RECOVERY_CODE 401 from the use case', async () => {
      mockRecovery.mockRejectedValueOnce(
        new AppError({
          message: 'bad recovery',
          statusCode: 401,
          code: 'INVALID_RECOVERY_CODE',
        }),
      );
      const sessionToken = issueMfaSessionToken(11);
      const res = await request(app)
        .post(`${MFA_BASE}/recovery`)
        .send({ mfaSessionToken: sessionToken, recoveryCode: 'TEST00-CODE00' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_RECOVERY_CODE');
    });
  });

  // ─── POST /api/auth/mfa/disable ──────────────────────────────────

  describe('POST /api/auth/mfa/disable', () => {
    it('returns 401 without an access token', async () => {
      const res = await request(app)
        .post(`${MFA_BASE}/disable`)
        .send({ currentPassword: 'whatever' });
      expect(res.status).toBe(401);
      expect(mockDisable).not.toHaveBeenCalled();
    });

    it('returns 400 when body is empty (zod requires currentPassword)', async () => {
      const token = makeToken();
      const res = await request(app)
        .post(`${MFA_BASE}/disable`)
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
      expect(mockDisable).not.toHaveBeenCalled();
    });

    it('returns 400 when currentPassword is the empty string', async () => {
      const token = makeToken();
      const res = await request(app)
        .post(`${MFA_BASE}/disable`)
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: '' });
      expect(res.status).toBe(400);
    });

    it('returns 200 with { disabled: true } and audit row on success', async () => {
      mockDisable.mockResolvedValueOnce(undefined);
      const { auditService } = jest.requireMock('@shared/audit') as {
        auditService: { log: jest.Mock };
      };

      const token = makeToken({ sub: '7' });
      const res = await request(app)
        .post(`${MFA_BASE}/disable`)
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'pw-test-1' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ disabled: true });
      // Asserting the literal `true` kills the BooleanLiteral mutant at L250:38.
      expect(res.body.disabled).toBe(true);
      expect(mockDisable).toHaveBeenCalledWith(7, 'pw-test-1');
      expect(auditService.log).toHaveBeenCalledTimes(1);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MFA_DISABLED',
          actorType: 'user',
          actorId: 7,
          targetType: 'user',
          targetId: '7',
        }),
      );
    });

    it('surfaces INVALID_PASSWORD 401 from the use case', async () => {
      mockDisable.mockRejectedValueOnce(
        new AppError({ message: 'wrong password', statusCode: 401, code: 'INVALID_PASSWORD' }),
      );
      const token = makeToken();
      const res = await request(app)
        .post(`${MFA_BASE}/disable`)
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'wrong' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_PASSWORD');
    });
  });

  // ─── bySessionOrIp branches — exercised via rate-limit isolation ─

  describe('bySessionOrIp key generator (rate-limit bucketing)', () => {
    // Verifies the helper's three branches by checking that the per-key bucket
    // is isolated:
    //   1. Valid mfaSessionToken → bucket `mfa-session:<userId>`
    //   2. Missing/invalid mfaSessionToken → bucket `ip:<ip>`
    // The rate-limit cap on /challenge + /recovery is 5/15min (RATE_LIMIT_OPTIONS).

    it('challenge: a valid mfaSessionToken keys the bucket per user (different users do not share)', async () => {
      mockChallenge.mockResolvedValue({
        session: { accessToken: 'at', refreshToken: 'rt' },
        userId: 11,
      });

      const tokA = issueMfaSessionToken(11);
      const tokB = issueMfaSessionToken(22);

      // 5 successful calls under user 11 — the bucket is `mfa-session:11`.
      for (let i = 0; i < 5; i += 1) {
        const ok = await request(app)
          .post(`${MFA_BASE}/challenge`)
          .send({ mfaSessionToken: tokA, code: '123456' });
        expect(ok.status).toBe(200);
      }

      // 6th call under user 11 → 429.
      const blocked = await request(app)
        .post(`${MFA_BASE}/challenge`)
        .send({ mfaSessionToken: tokA, code: '123456' });
      expect(blocked.status).toBe(429);

      // A call under user 22 (different session bucket) MUST still pass.
      const otherUser = await request(app)
        .post(`${MFA_BASE}/challenge`)
        .send({ mfaSessionToken: tokB, code: '123456' });
      expect(otherUser.status).toBe(200);
    });

    it('challenge: an invalid mfaSessionToken falls back to the IP bucket', async () => {
      mockChallenge.mockResolvedValue({
        session: { accessToken: 'at', refreshToken: 'rt' },
        userId: 11,
      });

      // 5 successful calls with the SAME malformed token — all hit `ip:<ip>`.
      for (let i = 0; i < 5; i += 1) {
        const ok = await request(app)
          .post(`${MFA_BASE}/challenge`)
          .send({ mfaSessionToken: 'malformed.jwt.token', code: '123456' });
        expect(ok.status).toBe(200);
      }

      // 6th call under a DIFFERENT malformed token — same IP bucket, still 429.
      const blocked = await request(app)
        .post(`${MFA_BASE}/challenge`)
        .send({ mfaSessionToken: 'another.malformed.token', code: '123456' });
      expect(blocked.status).toBe(429);
    });

    it('recovery: a valid mfaSessionToken keys the bucket per user (different users do not share)', async () => {
      mockRecovery.mockResolvedValue({
        session: { accessToken: 'at', refreshToken: 'rt' },
        userId: 11,
        remainingCodes: 3,
      });

      const tokA = issueMfaSessionToken(11);
      const tokB = issueMfaSessionToken(22);

      for (let i = 0; i < 5; i += 1) {
        const ok = await request(app)
          .post(`${MFA_BASE}/recovery`)
          .send({ mfaSessionToken: tokA, recoveryCode: 'TEST00-CODE00' });
        expect(ok.status).toBe(200);
      }

      const blocked = await request(app)
        .post(`${MFA_BASE}/recovery`)
        .send({ mfaSessionToken: tokA, recoveryCode: 'TEST00-CODE00' });
      expect(blocked.status).toBe(429);

      const otherUser = await request(app)
        .post(`${MFA_BASE}/recovery`)
        .send({ mfaSessionToken: tokB, recoveryCode: 'TEST00-CODE00' });
      expect(otherUser.status).toBe(200);
    });

    it('recovery: empty-string mfaSessionToken is rejected by Zod (min(1)) — limiter never asked', async () => {
      // Sanity check on L56's `token.length > 0` branch: an empty token never
      // reaches the limiter because zod's min(1) trips first with a 400.
      const res = await request(app)
        .post(`${MFA_BASE}/recovery`)
        .send({ mfaSessionToken: '', recoveryCode: 'TEST00-CODE00' });
      expect(res.status).toBe(400);
    });
  });

  // ─── enroll/verify/disable limiters — user bucket ────────────────

  describe('enroll/verify/disable limiters key per user', () => {
    it('POST /enroll returns 429 after 5 successful enrolls for the same user', async () => {
      mockEnroll.mockResolvedValue({ secret: 's', otpauthUrl: 'u', recoveryCodes: [] });
      const token = makeToken({ sub: '7' });

      for (let i = 0; i < 5; i += 1) {
        const ok = await request(app)
          .post(`${MFA_BASE}/enroll`)
          .set('Authorization', `Bearer ${token}`);
        expect(ok.status).toBe(200);
      }
      const blocked = await request(app)
        .post(`${MFA_BASE}/enroll`)
        .set('Authorization', `Bearer ${token}`);
      expect(blocked.status).toBe(429);

      // A different user must still pass — proves the bucket is per-user.
      const otherToken = makeToken({ sub: '8' });
      const otherUser = await request(app)
        .post(`${MFA_BASE}/enroll`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(otherUser.status).toBe(200);
    });
  });
});

// ─── bySessionOrIp helper — direct unit tests ──────────────────────────
// The route-level mocking of createRateLimitMiddleware prevents Stryker's
// perTest coverage from mapping mutants in this private helper. Direct
// invocation makes every mutation observable.
import type { Request } from 'express';
import {
  bySessionOrIp,
  MFA_RATE_LIMIT_BUCKET_PREFIX,
} from '@modules/auth/adapters/primary/http/routes/mfa.route';

describe('bySessionOrIp — direct unit', () => {
  const makeReq = (overrides: Partial<Request> = {}): Request =>
    ({
      body: {},
      ip: '198.51.100.7',
      socket: { remoteAddress: '198.51.100.7' },
      ...overrides,
    }) as unknown as Request;

  it('returns "user:<id>" when req.user.id is set', () => {
    const req = makeReq({ user: { id: 42, role: 'visitor', museumId: null } });
    expect(bySessionOrIp(req)).toBe(`${MFA_RATE_LIMIT_BUCKET_PREFIX.USER}42`);
    expect(bySessionOrIp(req)).toBe('user:42');
  });

  it('returns "user:<id>" even when an mfaSessionToken is also in the body (user wins)', () => {
    const req = makeReq({
      user: { id: 7, role: 'visitor', museumId: null },
      body: { mfaSessionToken: issueMfaSessionToken(99) },
    });
    expect(bySessionOrIp(req)).toBe('user:7');
  });

  it('returns "mfa-session:<userId>" when token decodes and no user set', () => {
    const token = issueMfaSessionToken(11);
    const req = makeReq({ body: { mfaSessionToken: token } });
    expect(bySessionOrIp(req)).toBe(`${MFA_RATE_LIMIT_BUCKET_PREFIX.MFA_SESSION}11`);
    expect(bySessionOrIp(req)).toBe('mfa-session:11');
  });

  it('falls back to "ip:<ip>" when token decode throws', () => {
    const req = makeReq({ body: { mfaSessionToken: 'not-a-valid-jwt' } });
    expect(bySessionOrIp(req)).toBe(`${MFA_RATE_LIMIT_BUCKET_PREFIX.IP}198.51.100.7`);
    expect(bySessionOrIp(req)).toBe('ip:198.51.100.7');
  });

  it('falls back to "ip:<ip>" when mfaSessionToken is empty string (length-0 short-circuit)', () => {
    const req = makeReq({ body: { mfaSessionToken: '' } });
    expect(bySessionOrIp(req)).toBe('ip:198.51.100.7');
  });

  it('falls back to "ip:<ip>" when mfaSessionToken is non-string (number)', () => {
    const req = makeReq({ body: { mfaSessionToken: 12345 } });
    expect(bySessionOrIp(req)).toBe('ip:198.51.100.7');
  });

  it('falls back to "ip:<ip>" when neither user nor token are present', () => {
    const req = makeReq();
    expect(bySessionOrIp(req)).toBe('ip:198.51.100.7');
  });

  it('uses socket.remoteAddress when req.ip is undefined', () => {
    const req = makeReq({
      ip: undefined,
      socket: { remoteAddress: '203.0.113.9' } as Request['socket'],
    });
    expect(bySessionOrIp(req)).toBe('ip:203.0.113.9');
  });

  it('exposes the bucket prefixes as a typed const for downstream assertions', () => {
    expect(MFA_RATE_LIMIT_BUCKET_PREFIX).toEqual({
      USER: 'user:',
      MFA_SESSION: 'mfa-session:',
      IP: 'ip:',
    });
  });
});
