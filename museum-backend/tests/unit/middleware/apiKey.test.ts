import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

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

const mockRes = (): Response => {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
};

describe('validateApiKey middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getApiKeyRepository returns the currently set repository', () => {
    const fakeRepo = { findByPrefix: jest.fn(), updateLastUsed: jest.fn() };
    setApiKeyRepository(fakeRepo as any);
    expect(getApiKeyRepository()).toBe(fakeRepo);
  });

  it('returns 401 when apiKeyRepo is null', async () => {
    // Reset the repo to null by setting it to null via the internal state
    // We need to use jest.isolateModules to get a fresh module
    await jest.isolateModulesAsync(async () => {
      const { validateApiKey: freshValidateApiKey } = require('@src/helpers/middleware/apiKey.middleware');
      const req = {} as Request;
      const res = mockRes();
      const next = jest.fn() as NextFunction;

      await freshValidateApiKey('msk_12345678rest', req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: { code: 'UNAUTHORIZED', message: 'API key authentication not available' },
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  it('returns 401 when token body is too short (<8 chars after msk_)', async () => {
    const fakeRepo = {
      findByPrefix: jest.fn(),
      updateLastUsed: jest.fn().mockResolvedValue(undefined),
    };
    setApiKeyRepository(fakeRepo as any);

    const req = {} as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await validateApiKey('msk_short', req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHORIZED', message: 'Invalid API key format' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when no API key found for prefix', async () => {
    const fakeRepo = {
      findByPrefix: jest.fn().mockResolvedValue(null),
      updateLastUsed: jest.fn().mockResolvedValue(undefined),
    };
    setApiKeyRepository(fakeRepo as any);

    const req = {} as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await validateApiKey('msk_12345678rest', req, res, next);

    expect(fakeRepo.findByPrefix).toHaveBeenCalledWith('12345678');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
    });
  });

  it('returns 401 when API key is expired', async () => {
    const fakeRepo = {
      findByPrefix: jest.fn().mockResolvedValue({
        id: 1,
        userId: 10,
        prefix: '12345678',
        hash: 'abc',
        salt: 'salt',
        isActive: true,
        expiresAt: new Date('2020-01-01'),
      }),
      updateLastUsed: jest.fn().mockResolvedValue(undefined),
    };
    setApiKeyRepository(fakeRepo as any);

    const req = {} as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await validateApiKey('msk_12345678rest', req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHORIZED', message: 'API key has expired' },
    });
  });

  it('returns 401 when API key is revoked (not active)', async () => {
    const fakeRepo = {
      findByPrefix: jest.fn().mockResolvedValue({
        id: 1,
        userId: 10,
        prefix: '12345678',
        hash: 'abc',
        salt: 'salt',
        isActive: false,
        expiresAt: null,
      }),
      updateLastUsed: jest.fn().mockResolvedValue(undefined),
    };
    setApiKeyRepository(fakeRepo as any);

    const req = {} as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await validateApiKey('msk_12345678rest', req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHORIZED', message: 'API key has been revoked' },
    });
  });

  it('returns 401 when HMAC hash does not match', async () => {
    const token = 'msk_12345678restofthekey';
    const salt = 'testsalt';
    const wrongHash = 'a'.repeat(64); // wrong hash

    const fakeRepo = {
      findByPrefix: jest.fn().mockResolvedValue({
        id: 1,
        userId: 10,
        prefix: '12345678',
        hash: wrongHash,
        salt,
        isActive: true,
        expiresAt: null,
      }),
      updateLastUsed: jest.fn().mockResolvedValue(undefined),
    };
    setApiKeyRepository(fakeRepo as any);

    const req = {} as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await validateApiKey(token, req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
    });
  });

  it('calls next() and sets req.user when HMAC matches', async () => {
    const token = 'msk_12345678restofthekey';
    const salt = 'testsalt';
    const hash = crypto.createHmac('sha256', salt).update(token).digest('hex');

    const fakeRepo = {
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
      updateLastUsed: jest.fn().mockResolvedValue(undefined),
    };
    setApiKeyRepository(fakeRepo as any);

    // No user role resolver set — should default to 'visitor'
    setUserRoleResolver(null as any);

    const req = { headers: {} } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await validateApiKey(token, req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((req as any).user).toEqual({ id: 10, role: 'visitor', museumId: null });
    expect(fakeRepo.updateLastUsed).toHaveBeenCalledWith(1);
  });

  it('resolves user role via resolver when available', async () => {
    const token = 'msk_12345678restofthekey';
    const salt = 'testsalt';
    const hash = crypto.createHmac('sha256', salt).update(token).digest('hex');

    const fakeRepo = {
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
      updateLastUsed: jest.fn().mockResolvedValue(undefined),
    };
    setApiKeyRepository(fakeRepo as any);
    setUserRoleResolver(async (_userId: number) => 'admin');

    const req = { headers: {} } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await validateApiKey(token, req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((req as any).user).toEqual({ id: 10, role: 'admin', museumId: 5 });
    expect((req as any).museumId).toBe(5);
  });

  it('defaults to visitor when role resolver returns null', async () => {
    const token = 'msk_12345678restofthekey';
    const salt = 'testsalt';
    const hash = crypto.createHmac('sha256', salt).update(token).digest('hex');

    const fakeRepo = {
      findByPrefix: jest.fn().mockResolvedValue({
        id: 1,
        userId: 10,
        prefix: '12345678',
        hash,
        salt,
        isActive: true,
        expiresAt: null,
      }),
      updateLastUsed: jest.fn().mockResolvedValue(undefined),
    };
    setApiKeyRepository(fakeRepo as any);
    setUserRoleResolver(async () => null);

    const req = { headers: {} } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await validateApiKey(token, req, res, next);

    expect((req as any).user.role).toBe('visitor');
  });

  it('returns 401 when findByPrefix throws', async () => {
    const fakeRepo = {
      findByPrefix: jest.fn().mockRejectedValue(new Error('DB error')),
      updateLastUsed: jest.fn().mockResolvedValue(undefined),
    };
    setApiKeyRepository(fakeRepo as any);

    const req = {} as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await validateApiKey('msk_12345678rest', req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHORIZED', message: 'API key validation failed' },
    });
  });

  it('handles updateLastUsed failure gracefully (fire-and-forget)', async () => {
    const token = 'msk_12345678restofthekey';
    const salt = 'testsalt';
    const hash = crypto.createHmac('sha256', salt).update(token).digest('hex');

    const fakeRepo = {
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
    };
    setApiKeyRepository(fakeRepo as any);
    setUserRoleResolver(null as any);

    const req = { headers: {} } as unknown as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await validateApiKey(token, req, res, next);

    // Should still call next() despite updateLastUsed failure
    expect(next).toHaveBeenCalledTimes(1);

    // Wait a tick for the fire-and-forget promise to settle
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
});
