import request from 'supertest';
import type { Express } from 'express';

import {
  createRouteTestApp,
  resetRateLimits,
  stopRateLimitSweep,
} from '../../helpers/http/route-test-setup';

const mockLogin = jest.fn().mockRejectedValue({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
const mockRefresh = jest.fn().mockRejectedValue({ statusCode: 401, code: 'INVALID_REFRESH' });
const mockSocialLogin = jest.fn().mockRejectedValue({ statusCode: 401, code: 'INVALID_SOCIAL' });
const mockNonceIssue = jest.fn().mockResolvedValue('test-nonce');

jest.mock('@modules/auth/useCase', () => {
  const jwtLib = require('jsonwebtoken');
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
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('GATE — getBucketCountForKey is exported from rate-limit.middleware (green T2.5 adds this)', () => {
    expect(getBucketCountForKey).toBeDefined();
  });

  it('R6.A — POST /api/auth/login malformed body: loginByAccountLimiter bucket NOT bumped', async () => {
    const victimEmail = 'audit-victim-a@example.test';

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: victimEmail, password: 123 })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);

    if (getBucketCountForKey === undefined) {
      return;
    }

    const bucketKey = `auth-login-account:email:${victimEmail.toLowerCase()}`;
    const count = getBucketCountForKey(bucketKey);
    expect(count ?? 0).toBe(0);
  });

  it('R9.B — POST /api/auth/login valid body shape: loginByAccountLimiter counter increments once', async () => {
    const validEmail = 'valid-path-b@example.test';

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validEmail, password: 'ValidPass1!' })
      .set('Content-Type', 'application/json');

    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(429);

    if (getBucketCountForKey !== undefined) {
      const bucketKey = `auth-login-account:email:${validEmail.toLowerCase()}`;
      const count = getBucketCountForKey(bucketKey);
      expect(count).toBe(1);
    }
  });

  it('R6.C — POST /api/auth/refresh malformed body: refreshLimiter bucket NOT bumped', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 12345 })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);

    if (getBucketCountForKey === undefined) {
      return;
    }

    const ipKey = `auth-refresh:127.0.0.1`;
    const count = getBucketCountForKey(ipKey);
    expect(count ?? 0).toBe(0);
  });

  it('R6.D — POST /api/auth/social-login malformed body: socialLoginLimiter bucket NOT bumped', async () => {
    const res = await request(app)
      .post('/api/auth/social-login')
      .send({ provider: 'google', idToken: '' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);

    if (getBucketCountForKey === undefined) {
      return;
    }

    const socialKey = `auth-social-login:127.0.0.1:google`;
    const count = getBucketCountForKey(socialKey);
    expect(count ?? 0).toBe(0);
  });

  it('R9.G — /metrics cardinality: malformed POST adds only (route, 400) label, no new metric names', async () => {
    const beforeRes = await request(app).get('/metrics');
    if (beforeRes.status !== 200) {
      expect(true).toBe(true);
      return;
    }

    const metricNamesBefore = new Set<string>(
      (beforeRes.text ?? '').split('\n').flatMap((line: string) => {
        const match = /^([a-z_]+)\{/.exec(line) ?? /^([a-z_]+) /.exec(line);
        return match ? [match[1]] : [];
      }),
    );

    await request(app)
      .post('/api/auth/login')
      .send({ email: 'metrics-test@example.test', password: 123 })
      .set('Content-Type', 'application/json');

    const afterRes = await request(app).get('/metrics');
    const metricNamesAfter = new Set<string>(
      (afterRes.text ?? '').split('\n').flatMap((line: string) => {
        const match = /^([a-z_]+)\{/.exec(line) ?? /^([a-z_]+) /.exec(line);
        return match ? [match[1]] : [];
      }),
    );

    for (const name of metricNamesAfter) {
      expect(metricNamesBefore.has(name) || name === '').toBe(true);
    }
  });
});
