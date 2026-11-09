import request from 'supertest';

import { createRouteTestApp, stopRateLimitSweep } from '../../helpers/http/route-test-setup';
import { makeToken } from '../../helpers/auth/token.helpers';

jest.mock('@modules/auth/useCase', () => {
  const jwtLib = require('jsonwebtoken');
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
    registerUseCase: { execute: jest.fn() },
    forgotPasswordUseCase: { execute: jest.fn() },
    resetPasswordUseCase: { execute: jest.fn() },
    socialLoginUseCase: { execute: jest.fn() },
    exportUserDataUseCase: { execute: jest.fn() },
    changePasswordUseCase: { execute: jest.fn() },
    changeEmailUseCase: { execute: jest.fn() },
    confirmEmailChangeUseCase: { execute: jest.fn() },
    verifyEmailUseCase: { execute: jest.fn() },
    grantConsentUseCase: { execute: jest.fn() },
    revokeConsentUseCase: { execute: jest.fn() },
    userConsentRepository: {},
  };
});

jest.mock('@shared/audit', () => ({
  auditService: { log: jest.fn().mockResolvedValue(undefined) },
}));

const { auditService } = require('@shared/audit') as {
  auditService: { log: jest.Mock };
};
const { deleteAccountUseCase } = require('@modules/auth/useCase') as {
  deleteAccountUseCase: { execute: jest.Mock };
};

const ACTION_REQUESTED = 'ACCOUNT_DELETION_REQUESTED';
const ACTION_DELETED = 'ACCOUNT_DELETED';

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

    const requestedCall = auditService.log.mock.calls.find(
      (c) => (c[0] as { action: string }).action === ACTION_REQUESTED,
    );
    expect(requestedCall).toBeDefined();

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
    expect(deletedOrder!).toBeGreaterThan(executeOrder);
  });

  it('does NOT emit ACCOUNT_DELETED when execute() rejects; keeps REQUESTED only + non-2xx (R3)', async () => {
    deleteAccountUseCase.execute.mockRejectedValue(new Error('DB down during cascade'));
    const token = makeToken({ sub: '9' });

    const res = await request(app)
      .delete('/api/auth/account')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBeGreaterThanOrEqual(500);

    const actions = loggedActions();
    expect(actions).toContain(ACTION_REQUESTED);
    expect(actions).not.toContain(ACTION_DELETED);
  });
});
