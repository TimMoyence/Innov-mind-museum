import crypto from 'crypto';
import type { NextFunction, Request } from 'express';
import type { ApiKeyRepository } from '@modules/auth/domain/apiKey.repository.interface';
import { makePartialRequest, makePartialResponse } from '../../helpers/http/express-mock.helpers';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@shared/observability/sentry', () => ({
  setUser: jest.fn(),
}));

import {
  validateApiKey,
  setApiKeyRepository,
  getApiKeyRepository,
  setUserRoleResolver,
} from '@src/helpers/middleware/apiKey.middleware';

const mockRes = makePartialResponse;

const makeFakeApiKeyRepo = (
  overrides: Partial<jest.Mocked<ApiKeyRepository>> = {},
): jest.Mocked<ApiKeyRepository> => ({
  findByPrefix: jest.fn(),
  findByUserId: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
  updateLastUsed: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const expectUnauthorizedAsync = async (promise: Promise<void>, message: string): Promise<void> => {
  await expect(promise).rejects.toMatchObject({
    statusCode: 401,
    code: 'UNAUTHORIZED',
    message,
  });
};

describe('validateApiKey middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getApiKeyRepository returns the currently set repository', () => {
    const fakeRepo = makeFakeApiKeyRepo();
    setApiKeyRepository(fakeRepo);
    expect(getApiKeyRepository()).toBe(fakeRepo);
  });

  it('throws 401 AppError when apiKeyRepo is null', async () => {
    await jest.isolateModulesAsync(async () => {
      const {
        validateApiKey: freshValidateApiKey,
      } = require('@src/helpers/middleware/apiKey.middleware');
      const req = {} as Request;
      const res = mockRes();
      const next = jest.fn() as NextFunction;

      await expectUnauthorizedAsync(
        freshValidateApiKey('msk_12345678rest', req, res, next),
        'API key authentication not available',
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  it('throws 401 AppError when token body is too short (<8 chars after msk_)', async () => {
    const fakeRepo = makeFakeApiKeyRepo();
    setApiKeyRepository(fakeRepo);

    const req = {} as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await expectUnauthorizedAsync(
      validateApiKey('msk_short', req, res, next),
      'Invalid API key format',
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('throws 401 AppError when no API key found for prefix', async () => {
    const fakeRepo = makeFakeApiKeyRepo({
      findByPrefix: jest.fn().mockResolvedValue(null),
    });
    setApiKeyRepository(fakeRepo);

    const req = {} as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await expectUnauthorizedAsync(
      validateApiKey('msk_12345678rest', req, res, next),
      'Invalid API key',
    );
    expect(fakeRepo.findByPrefix).toHaveBeenCalledWith('12345678');
  });

  it('throws 401 AppError when API key is expired', async () => {
    const fakeRepo = makeFakeApiKeyRepo({
      findByPrefix: jest.fn().mockResolvedValue({
        id: 1,
        userId: 10,
        prefix: '12345678',
        hash: 'abc',
        salt: 'salt',
        isActive: true,
        expiresAt: new Date('2020-01-01'),
      }),
    });
    setApiKeyRepository(fakeRepo);

    const req = {} as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await expectUnauthorizedAsync(
      validateApiKey('msk_12345678rest', req, res, next),
      'API key has expired',
    );
  });

  it('throws 401 AppError when API key is revoked (not active)', async () => {
    const fakeRepo = makeFakeApiKeyRepo({
      findByPrefix: jest.fn().mockResolvedValue({
        id: 1,
        userId: 10,
        prefix: '12345678',
        hash: 'abc',
        salt: 'salt',
        isActive: false,
        expiresAt: null,
      }),
    });
    setApiKeyRepository(fakeRepo);

    const req = {} as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await expectUnauthorizedAsync(
      validateApiKey('msk_12345678rest', req, res, next),
      'API key has been revoked',
    );
  });

  it('throws 401 AppError when HMAC hash does not match', async () => {
    const token = 'msk_12345678restofthekey';
    const salt = 'testsalt';
    const wrongHash = 'a'.repeat(64); // wrong hash

    const fakeRepo = makeFakeApiKeyRepo({
      findByPrefix: jest.fn().mockResolvedValue({
        id: 1,
        userId: 10,
        prefix: '12345678',
        hash: wrongHash,
        salt,
        isActive: true,
        expiresAt: null,
      }),
    });
    setApiKeyRepository(fakeRepo);

    const req = {} as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await expectUnauthorizedAsync(validateApiKey(token, req, res, next), 'Invalid API key');
  });

  it('calls next() and sets req.user when HMAC matches', async () => {
    const token = 'msk_12345678restofthekey';
    const salt = 'testsalt';
    const hash = crypto.createHmac('sha256', salt).update(token).digest('hex');

    const fakeRepo = makeFakeApiKeyRepo({
      findByPrefix: jest.fn().mockResolvedValue({
        id: 1,
        userId: 10,
        prefix: '12345678',
        hash,
        salt,
        isActive: true,
        expiresAt: null,
        museumId: null,
      }),
    });
    setApiKeyRepository(fakeRepo);

    // No user role resolver set — should default to 'visitor'
    setUserRoleResolver(undefined as unknown as (userId: number) => Promise<null>);

    const req = makePartialRequest();
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await validateApiKey(token, req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({ id: 10, role: 'visitor', museumId: null });
    expect(fakeRepo.updateLastUsed).toHaveBeenCalledWith(1);
  });

  it('resolves user role via resolver when available', async () => {
    const token = 'msk_12345678restofthekey';
    const salt = 'testsalt';
    const hash = crypto.createHmac('sha256', salt).update(token).digest('hex');

    const fakeRepo = makeFakeApiKeyRepo({
      findByPrefix: jest.fn().mockResolvedValue({
        id: 1,
        userId: 10,
        prefix: '12345678',
        hash,
        salt,
        isActive: true,
        expiresAt: null,
        museumId: 5,
      }),
    });
    setApiKeyRepository(fakeRepo);
    setUserRoleResolver(async (_userId: number) => 'admin');

    const req = makePartialRequest();
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await validateApiKey(token, req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({ id: 10, role: 'admin', museumId: 5 });
    expect(req.museumId).toBe(5);
  });

  it('defaults to visitor when role resolver returns null', async () => {
    const token = 'msk_12345678restofthekey';
    const salt = 'testsalt';
    const hash = crypto.createHmac('sha256', salt).update(token).digest('hex');

    const fakeRepo = makeFakeApiKeyRepo({
      findByPrefix: jest.fn().mockResolvedValue({
        id: 1,
        userId: 10,
        prefix: '12345678',
        hash,
        salt,
        isActive: true,
        expiresAt: null,
      }),
    });
    setApiKeyRepository(fakeRepo);
    setUserRoleResolver(async () => null);

    const req = makePartialRequest();
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await validateApiKey(token, req, res, next);

    expect(req.user!.role).toBe('visitor');
  });

  it('throws 401 AppError when findByPrefix throws', async () => {
    const fakeRepo = makeFakeApiKeyRepo({
      findByPrefix: jest.fn().mockRejectedValue(new Error('DB error')),
    });
    setApiKeyRepository(fakeRepo);

    const req = {} as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await expectUnauthorizedAsync(
      validateApiKey('msk_12345678rest', req, res, next),
      'API key validation failed',
    );
  });

  it('handles updateLastUsed failure gracefully (fire-and-forget)', async () => {
    const token = 'msk_12345678restofthekey';
    const salt = 'testsalt';
    const hash = crypto.createHmac('sha256', salt).update(token).digest('hex');

    const fakeRepo = makeFakeApiKeyRepo({
      findByPrefix: jest.fn().mockResolvedValue({
        id: 1,
        userId: 10,
        prefix: '12345678',
        hash,
        salt,
        isActive: true,
        expiresAt: null,
      }),
      updateLastUsed: jest.fn().mockRejectedValue(new Error('update failed')),
    });
    setApiKeyRepository(fakeRepo);
    setUserRoleResolver(undefined as unknown as (userId: number) => Promise<null>);

    const req = makePartialRequest();
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await validateApiKey(token, req, res, next);

    // Should still call next() despite updateLastUsed failure
    expect(next).toHaveBeenCalledTimes(1);

    // Wait a tick for the fire-and-forget promise to settle
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
});
