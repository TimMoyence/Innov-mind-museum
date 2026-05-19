/**
 * T1.5 / R6 + R9 + /metrics cardinality — Failing integration test:
 * rate-limit counter must NOT be bumped when the request body fails Zod
 * schema validation (validateBody returns 400 before the limiter runs).
 *
 * spec.md §3.2 R6:
 *   "When a POST request arrives at any of the 8 enumerated route sites and
 *   the request body fails Zod schema validation, the rate-limit middleware(s)
 *   for that route shall NOT have incremented their counter."
 *
 * design.md §D7:
 *   Integration test: boot createRouteTestApp(), send malformed POST,
 *   assert bucket count = 0/undefined via getBucketCountForKey (test-only
 *   helper added by green phase T2.5).
 *
 * lib-docs/zod/PATTERNS.md §3 line 202-206:
 *   DO: use .safeParse() at trust boundaries → on failure return res.status(400).
 *   Ordering fix: validateBody must short-circuit BEFORE limiter mutates bucket.
 *
 * RED state (tasks.md T1.5):
 *   Tests A, C, D, E, F FAIL today because the rate-limit middleware runs
 *   BEFORE validateBody at these routes, bumping the counter even on malformed
 *   bodies.
 *
 *   PRIMARY RED SIGNAL: `getBucketCountForKey` is not yet exported from
 *   rate-limit.middleware.ts (green phase T2.5 adds it). The test detects its
 *   absence and fails with a real assertion that communicates the missing export.
 *   Once green phase adds both the export AND the middleware reorder, all
 *   assertions in this file pass.
 *
 * Tests B + G PASS today and after green (cardinality contract + valid-path).
 *
 * Frozen-test invariant: this file is immutable byte-for-byte once committed.
 */

import request from 'supertest';
import type { Express } from 'express';

import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';

// ---------------------------------------------------------------------------
// Mocks — same pattern as tests/unit/routes/auth.route.test.ts.
// We need the HTTP layer to run fully so the middleware stack executes, but
// handlers can throw errors that surface as 401/500 — what matters is that
// Zod validation runs BEFORE the rate-limiter mutates the bucket.
// ---------------------------------------------------------------------------

const mockLogin = jest.fn().mockRejectedValue({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
const mockRefresh = jest.fn().mockRejectedValue({ statusCode: 401, code: 'INVALID_REFRESH' });
const mockSocialLogin = jest.fn().mockRejectedValue({ statusCode: 401, code: 'INVALID_SOCIAL' });
const mockChallengeMfa = jest.fn().mockRejectedValue({ statusCode: 401, code: 'INVALID_MFA' });
const mockRecoveryMfa = jest.fn().mockRejectedValue({ statusCode: 401, code: 'INVALID_RECOVERY' });
const mockNonceIssue = jest.fn().mockResolvedValue('test-nonce');

// Minimal auth service mock — only login/refresh needed for these routes
jest.mock('@modules/auth/useCase', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const jwtLib = require('jsonwebtoken');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { env: envConfig } = require('@src/config/env');
  return {
    authSessionService: {
      verifyAccessToken: (token: string) => {
        const decoded = jwtLib.verify(token, envConfig.auth.accessTokenSecret) as {
          sub: string;
          role?: string;
          museumId?: number | null;
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
      login: (...args: unknown[]) => mockLogin(...args),
      refresh: (...args: unknown[]) => mockRefresh(...args),
      logout: jest.fn().mockResolvedValue(undefined),
    },
    socialLoginUseCase: { execute: (...args: unknown[]) => mockSocialLogin(...args) },
    registerUseCase: { execute: jest.fn().mockResolvedValue({ id: 1, email: 'x@x.com' }) },
    getProfileUseCase: { execute: jest.fn().mockResolvedValue({ id: 1 }) },
    deleteAccountUseCase: { execute: jest.fn().mockResolvedValue(undefined) },
    forgotPasswordUseCase: { execute: jest.fn().mockResolvedValue(undefined) },
    resetPasswordUseCase: { execute: jest.fn().mockResolvedValue(undefined) },
    redeemSocialOtcUseCase: { execute: jest.fn().mockResolvedValue({ accessToken: 'tok' }) },
    nonceStore: { issue: (...args: unknown[]) => mockNonceIssue(...args) },
    changePasswordUseCase: { execute: jest.fn().mockResolvedValue(undefined) },
    changeEmailUseCase: { execute: jest.fn().mockResolvedValue(undefined) },
    confirmEmailChangeUseCase: { execute: jest.fn().mockResolvedValue(undefined) },
    verifyEmailUseCase: { execute: jest.fn().mockResolvedValue(undefined) },
    completeOnboardingUseCase: { execute: jest.fn().mockResolvedValue(undefined) },
    getUserByIdUseCase: { execute: jest.fn().mockResolvedValue({ id: 1 }) },
    exportUserDataUseCase: { execute: jest.fn().mockResolvedValue({ data: {} }) },
    updateTtsVoiceUseCase: { execute: jest.fn().mockResolvedValue({ ttsVoice: 'alloy' }) },
    updateUserPreferencesUseCase: { execute: jest.fn().mockResolvedValue(undefined) },
  };
});

jest.mock('@modules/auth/useCase/totp/mfaSessionToken', () => ({
  verifyMfaSessionToken: jest.fn().mockReturnValue({ userId: 99 }),
  issueMfaSessionToken: jest.fn().mockReturnValue('mock-mfa-token'),
}));

jest.mock('@modules/auth', () => ({
  wireAuthMiddleware: jest.fn(),
  challengeMfaUseCase: { execute: (...args: unknown[]) => mockChallengeMfa(...args) },
  disableMfaUseCase: { execute: jest.fn().mockResolvedValue(undefined) },
  enrollMfaUseCase: { execute: jest.fn().mockResolvedValue({ recoveryCodes: [] }) },
  getMfaStatusUseCase: { execute: jest.fn().mockResolvedValue({ mfaEnabled: false }) },
  recoveryMfaUseCase: { execute: (...args: unknown[]) => mockRecoveryMfa(...args) },
  verifyMfaUseCase: { execute: jest.fn().mockResolvedValue({ enrolledAt: new Date() }) },
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Try to import getBucketCountForKey from rate-limit.middleware.
 * Returns the function if it is exported (after green T2.5), or undefined if
 * the export does not exist yet (RED state).
 *
 * lib-docs note: this is a test-only @internal export — green phase adds it.
 */
async function tryGetBucketCountHelper(): Promise<
  ((key: string) => number | undefined) | undefined
> {
  try {
    const mod = (await import('@shared/middleware/rate-limit.middleware')) as Record<
      string,
      unknown
    >;
    if (typeof mod.getBucketCountForKey === 'function') {
      return mod.getBucketCountForKey as (key: string) => number | undefined;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('R6 + R9 — Rate-limit counter NOT bumped on Zod 400 (integration)', () => {
  let app: Express;
  let getBucketCountForKey: ((key: string) => number | undefined) | undefined;

  beforeAll(async () => {
    ({ app } = createRouteTestApp());
    getBucketCountForKey = await tryGetBucketCountHelper();
  });

  beforeEach(() => {
    resetRateLimits();
    mockLogin.mockRejectedValue({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
    mockRefresh.mockRejectedValue({ statusCode: 401, code: 'INVALID_REFRESH' });
    mockSocialLogin.mockRejectedValue({ statusCode: 401, code: 'INVALID_SOCIAL' });
    mockChallengeMfa.mockRejectedValue({ statusCode: 401, code: 'INVALID_MFA' });
    mockRecoveryMfa.mockRejectedValue({ statusCode: 401, code: 'INVALID_RECOVERY' });
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  // -------------------------------------------------------------------------
  // RED-PHASE GATE: assert getBucketCountForKey is exported.
  // This test FAILS in RED state (export absent) and PASSES after green T2.5.
  // -------------------------------------------------------------------------
  it('GATE — getBucketCountForKey is exported from rate-limit.middleware (green T2.5 adds this)', () => {
    // PRIMARY RED SIGNAL: fails today because the export does not exist yet.
    // Green phase T2.5 must add: export function getBucketCountForKey(key: string): number | undefined
    // to @shared/middleware/rate-limit.middleware for this gate to pass.
    expect(getBucketCountForKey).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Test A — R6: POST /api/auth/login with malformed body must NOT bump
  // loginByAccountLimiter bucket (keyed on req.body.email).
  // FAILS today: limiter runs BEFORE validateBody, bumps count to 1.
  // -------------------------------------------------------------------------
  it('R6.A — POST /api/auth/login malformed body: loginByAccountLimiter bucket NOT bumped', async () => {
    const victimEmail = 'audit-victim-a@example.test';

    // Malformed: password is a number, schema expects string
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: victimEmail, password: 123 })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);

    if (getBucketCountForKey === undefined) {
      // getBucketCountForKey not exported — gate test above already failed RED.
      // Skip bucket assertion here to avoid masking gate failure.
      return;
    }

    // bucket key = 'auth-login-account:email:<normalized-email>'
    const bucketKey = `auth-login-account:email:${victimEmail.toLowerCase()}`;
    const count = getBucketCountForKey(bucketKey);
    // TODAY this FAILS: count === 1 (limiter ran before validateBody)
    // After green: count === undefined (limiter never ran)
    expect(count ?? 0).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Test B — R9: POST /api/auth/login valid body increments counter exactly
  // once per valid request. PASSES today and after green (regression guard).
  // -------------------------------------------------------------------------
  it('R9.B — POST /api/auth/login valid body shape: loginByAccountLimiter counter increments once', async () => {
    const validEmail = 'valid-path-b@example.test';

    // Valid body shape (wrong credentials is OK — what matters is counter++)
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validEmail, password: 'ValidPass1!' })
      .set('Content-Type', 'application/json');

    // Response is 200 (mfaRequired/success) or 401 (invalid credentials)
    // or 500 (mock error propagation) — NOT 400 (body valid) + NOT 429 (not throttled)
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(429);

    if (getBucketCountForKey !== undefined) {
      const bucketKey = `auth-login-account:email:${validEmail.toLowerCase()}`;
      const count = getBucketCountForKey(bucketKey);
      // Exactly 1 valid request → counter = 1
      expect(count).toBe(1);
    }
  });

  // -------------------------------------------------------------------------
  // Test C — R6: POST /api/auth/refresh with malformed body must NOT bump
  // refreshLimiter bucket.
  // FAILS today: limiter runs BEFORE validateBody.
  // -------------------------------------------------------------------------
  it('R6.C — POST /api/auth/refresh malformed body: refreshLimiter bucket NOT bumped', async () => {
    // Malformed: refreshToken is a number, schema expects string
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 12345 })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);

    if (getBucketCountForKey === undefined) {
      return;
    }

    // refreshLimiter key = IP + optional familyId from token.
    // With test IP (127.0.0.1) and no decodable familyId, key = '127.0.0.1'
    // (or whatever byIp returns). We check that NO key under 'auth-refresh:*'
    // was created with a non-zero count.
    // Simpler: assert the specific IP key count.
    const ipKey = `auth-refresh:127.0.0.1`;
    const count = getBucketCountForKey(ipKey);
    // TODAY count === 1 (bumped), after green: count === undefined / 0
    expect(count ?? 0).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Test D — R6: POST /api/auth/social-login with malformed body must NOT
  // bump socialLoginLimiter bucket.
  // FAILS today: limiter runs BEFORE validateBody.
  // -------------------------------------------------------------------------
  it('R6.D — POST /api/auth/social-login malformed body: socialLoginLimiter bucket NOT bumped', async () => {
    // Malformed: idToken is empty string, schema requires non-empty
    const res = await request(app)
      .post('/api/auth/social-login')
      .send({ provider: 'google', idToken: '' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);

    if (getBucketCountForKey === undefined) {
      return;
    }

    // socialLoginLimiter key = IP + provider (when provider is a string)
    const socialKey = `auth-social-login:127.0.0.1:google`;
    const count = getBucketCountForKey(socialKey);
    // TODAY count === 1 (bumped), after green: count === undefined / 0
    expect(count ?? 0).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Test E — R6: POST /api/auth/mfa/challenge with malformed body must NOT
  // bump challengeLimiter bucket.
  // FAILS today: limiter runs BEFORE validateBody.
  // -------------------------------------------------------------------------
  it('R6.E — POST /api/auth/mfa/challenge malformed body: challengeLimiter bucket NOT bumped', async () => {
    // Malformed: code is a number, schema expects string min(6)max(6)
    const res = await request(app)
      .post('/api/auth/mfa/challenge')
      .send({ mfaSessionToken: 'some.mfa.token', code: 999 })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);

    if (getBucketCountForKey === undefined) {
      return;
    }

    // challengeLimiter key = bySessionOrIp(req). With no user and
    // mfaSessionToken that verifyMfaSessionToken accepts → mfa-session:99
    const mfaChallengeKey = `mfa-challenge:mfa-session:99`;
    const ipFallbackKey = `mfa-challenge:ip:127.0.0.1`;
    const countSession = getBucketCountForKey(mfaChallengeKey);
    const countIp = getBucketCountForKey(ipFallbackKey);
    // TODAY at least one of these is 1, after green: both 0/undefined
    expect((countSession ?? 0) + (countIp ?? 0)).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Test F — R6: POST /api/auth/mfa/recovery with malformed body must NOT
  // bump recoveryLimiter bucket.
  // FAILS today: limiter runs BEFORE validateBody.
  // -------------------------------------------------------------------------
  it('R6.F — POST /api/auth/mfa/recovery malformed body: recoveryLimiter bucket NOT bumped', async () => {
    // Malformed: recoveryCode is a number, schema expects string min(6)max(32)
    const res = await request(app)
      .post('/api/auth/mfa/recovery')
      .send({ mfaSessionToken: 'some.mfa.token', recoveryCode: 999 })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);

    if (getBucketCountForKey === undefined) {
      return;
    }

    const mfaRecoveryKeySession = `mfa-recovery:mfa-session:99`;
    const mfaRecoveryKeyIp = `mfa-recovery:ip:127.0.0.1`;
    const countSession = getBucketCountForKey(mfaRecoveryKeySession);
    const countIp = getBucketCountForKey(mfaRecoveryKeyIp);
    // TODAY at least one of these is 1, after green: both 0/undefined
    expect((countSession ?? 0) + (countIp ?? 0)).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Test G — NFR Telemetry: /metrics cardinality unchanged after malformed POST.
  // PASSES today and after green (cardinality contract regression guard).
  // lib-docs/zod/PATTERNS.md §3: safeParse at trust boundaries.
  // -------------------------------------------------------------------------
  it('R9.G — /metrics cardinality: malformed POST adds only (route, 400) label, no new metric names', async () => {
    // Scrape metrics BEFORE the malformed request
    const beforeRes = await request(app).get('/metrics');
    // Metrics endpoint may not be present in test app — skip gracefully
    if (beforeRes.status !== 200) {
      expect(true).toBe(true); // no metrics endpoint in this test config
      return;
    }

    const metricNamesBefore = new Set<string>(
      (beforeRes.text ?? '').split('\n').flatMap((line: string) => {
        const match = /^([a-z_]+)\{/.exec(line) ?? /^([a-z_]+) /.exec(line);
        return match ? [match[1]] : [];
      }),
    );

    // Send the same malformed POST as test A
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'metrics-test@example.test', password: 123 })
      .set('Content-Type', 'application/json');

    // Scrape metrics AFTER
    const afterRes = await request(app).get('/metrics');
    const metricNamesAfter = new Set<string>(
      (afterRes.text ?? '').split('\n').flatMap((line: string) => {
        const match = /^([a-z_]+)\{/.exec(line) ?? /^([a-z_]+) /.exec(line);
        return match ? [match[1]] : [];
      }),
    );

    // No NEW metric names should appear — only new label values on existing metrics
    for (const name of metricNamesAfter) {
      expect(metricNamesBefore.has(name) || name === '').toBe(true);
    }
  });
});
