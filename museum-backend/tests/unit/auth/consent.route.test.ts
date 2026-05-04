import request from 'supertest';

import { createRouteTestApp, stopRateLimitSweep } from '../../helpers/http/route-test-setup';
import { makeToken } from '../../helpers/auth/token.helpers';

// ─── Mock the auth useCase barrel — route + isAuthenticated middleware both
//     pull from @modules/auth/useCase, so the mock must expose everything the
//     route reaches (use cases + repo) AND everything isAuthenticated needs
//     (authSessionService.verifyAccessToken).
// ────────────────────────────────────────────────────────────────────────────

jest.mock('@modules/auth/useCase', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory runs before ESM imports
  const jwtLib = require('jsonwebtoken');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factory runs before ESM imports
  const { env: envConfig } = require('@src/config/env');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- same reason
  const { GrantConsentUseCase } = require('@modules/auth/useCase/consent/grantConsent.useCase');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- same reason
  const { RevokeConsentUseCase } = require('@modules/auth/useCase/consent/revokeConsent.useCase');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- factory hoisted above top-level imports
  const { makeUserConsentRepo: makeRepo } = require('../../helpers/auth/userConsent-repo.mock');

  const sharedRepo = makeRepo();
  const grantConsentUseCase = new GrantConsentUseCase(sharedRepo);
  const revokeConsentUseCase = new RevokeConsentUseCase(sharedRepo);

  return {
    authSessionService: {
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
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
    },
    // Other auth use cases — the auth route also imports these but consent
    // tests only exercise the consent sub-router, so stubs suffice.
    registerUseCase: { execute: jest.fn() },
    forgotPasswordUseCase: { execute: jest.fn() },
    resetPasswordUseCase: { execute: jest.fn() },
    socialLoginUseCase: { execute: jest.fn() },
    deleteAccountUseCase: { execute: jest.fn() },
    exportUserDataUseCase: { execute: jest.fn() },
    getProfileUseCase: { execute: jest.fn() },
    changePasswordUseCase: { execute: jest.fn() },
    changeEmailUseCase: { execute: jest.fn() },
    confirmEmailChangeUseCase: { execute: jest.fn() },
    verifyEmailUseCase: { execute: jest.fn() },
    updateContentPreferencesUseCase: { execute: jest.fn() },
    completeOnboarding: jest.fn(),
    generateApiKeyUseCase: { execute: jest.fn() },
    revokeApiKeyUseCase: { execute: jest.fn() },
    listApiKeysUseCase: { execute: jest.fn() },
    grantConsentUseCase,
    revokeConsentUseCase,
    userConsentRepository: sharedRepo,
    wireAuthMiddleware: jest.fn(),
  };
});

jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn() },
}));

// After jest.mock hoisting, re-grab the shared repo through the mocked
// module so tests can assert against it directly.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- factory module boot order
const { userConsentRepository: sharedRepo } = require('@modules/auth/useCase') as {
  userConsentRepository: ReturnType<
    typeof import('../../helpers/auth/userConsent-repo.mock').makeUserConsentRepo
  >;
};

const { app } = createRouteTestApp();

describe('Consent Routes — HTTP + auth gate', () => {
  beforeEach(() => {
    sharedRepo.reset();
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  describe('auth gate', () => {
    it('returns 401 on POST /api/auth/consent without token', async () => {
      const res = await request(app)
        .post('/api/auth/consent')
        .send({ scope: 'location_to_llm', version: '2026-04-24' });
      expect(res.status).toBe(401);
    });

    it('returns 401 on GET /api/auth/consent without token', async () => {
      const res = await request(app).get('/api/auth/consent');
      expect(res.status).toBe(401);
    });

    it('returns 401 on DELETE /api/auth/consent/:scope without token', async () => {
      const res = await request(app).delete('/api/auth/consent/location_to_llm');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/consent (grant)', () => {
    it('accepts a valid payload and returns 201 with the persisted row', async () => {
      const token = makeToken({ sub: '42' });

      const res = await request(app)
        .post('/api/auth/consent')
        .set('Authorization', `Bearer ${token}`)
        .send({ scope: 'location_to_llm', version: '2026-04-24' });

      expect(res.status).toBe(201);
      expect(res.body.consent).toMatchObject({
        scope: 'location_to_llm',
        version: '2026-04-24',
        source: 'api',
      });
      expect(await sharedRepo.isGranted(42, 'location_to_llm')).toBe(true);
    });

    it('returns 400 for an unknown scope', async () => {
      const token = makeToken({ sub: '1' });

      const res = await request(app)
        .post('/api/auth/consent')
        .set('Authorization', `Bearer ${token}`)
        .send({ scope: 'mining_bitcoin', version: '2026-04-24' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for an empty version', async () => {
      const token = makeToken({ sub: '1' });

      const res = await request(app)
        .post('/api/auth/consent')
        .set('Authorization', `Bearer ${token}`)
        .send({ scope: 'location_to_llm', version: '' });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/auth/consent/:scope (revoke)', () => {
    it('revokes an existing grant and returns 200', async () => {
      await sharedRepo.grant(42, 'location_to_llm', '2026-04-24', 'api');
      const token = makeToken({ sub: '42' });

      const res = await request(app)
        .delete('/api/auth/consent/location_to_llm')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ revoked: true, scope: 'location_to_llm' });
      expect(await sharedRepo.isGranted(42, 'location_to_llm')).toBe(false);
    });

    it('returns 400 when the scope is unknown', async () => {
      const token = makeToken({ sub: '42' });

      const res = await request(app)
        .delete('/api/auth/consent/telepathy')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/auth/consent (list)', () => {
    it("returns the authenticated user's consent history", async () => {
      await sharedRepo.grant(42, 'location_to_llm', '2026-04-24', 'ui');
      await sharedRepo.grant(42, 'analytics', '2026-04-24', 'api');
      await sharedRepo.grant(99, 'location_to_llm', '2026-04-24', 'ui'); // other user — must not leak
      const token = makeToken({ sub: '42' });

      const res = await request(app)
        .get('/api/auth/consent')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.consents).toHaveLength(2);
      const scopes = res.body.consents.map((c: { scope: string }) => c.scope);
      expect(scopes).toEqual(expect.arrayContaining(['location_to_llm', 'analytics']));
    });
  });
});
