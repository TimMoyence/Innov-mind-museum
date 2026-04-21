import type { Response, NextFunction } from 'express';
import { requestLoggerMiddleware } from '@src/helpers/middleware/request-logger.middleware';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { logger } from '@shared/logger/logger';
import { makePartialRequest } from '../../helpers/http/express-mock.helpers';

describe('requestLoggerMiddleware', () => {
  let finishHandler: (() => void) | undefined;

  const mockReq = (overrides: Record<string, unknown> = {}) =>
    makePartialRequest({ method: 'GET', originalUrl: '/api/test', ip: '127.0.0.1', ...overrides });

  const mockRes = (overrides: Record<string, unknown> = {}): Response => {
    const handlers: Record<string, (() => void)[]> = {};
    return {
      statusCode: 200,
      on: jest.fn((event: string, handler: () => void) => {
        handlers[event] = handlers[event] || [];
        handlers[event].push(handler);
        if (event === 'finish') finishHandler = handler;
      }),
      emit: (event: string) => {
        for (const fn of handlers[event] || []) fn();
      },
      ...overrides,
    } as unknown as Response;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    finishHandler = undefined;
  });

  it('logs request details on response finish', () => {
    const req = mockReq({ requestId: 'rid-1' });
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    requestLoggerMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(logger.info).not.toHaveBeenCalled();

    // Simulate response finish
    finishHandler?.();

    expect(logger.info).toHaveBeenCalledWith(
      'http_request',
      expect.objectContaining({
        requestId: 'rid-1',
        method: 'GET',
        path: '/api/test',
        statusCode: 200,
        ip: '127.0.0.1',
      }),
    );
  });

  it('includes userId when user is on the request', () => {
    const req = mockReq({ requestId: 'rid-2', user: { id: 42 } });
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    requestLoggerMiddleware(req, res, next);
    finishHandler?.();

    expect(logger.info).toHaveBeenCalledWith(
      'http_request',
      expect.objectContaining({ userId: 42 }),
    );
  });

  it('omits userId when user is not on the request', () => {
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    requestLoggerMiddleware(req, res, next);
    finishHandler?.();

    const logContext = (logger.info as jest.Mock).mock.calls[0][1];
    expect(logContext).not.toHaveProperty('userId');
  });

  it('includes latencyMs as a non-negative number', () => {
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    requestLoggerMiddleware(req, res, next);
    finishHandler?.();

    const logContext = (logger.info as jest.Mock).mock.calls[0][1];
    expect(typeof logContext.latencyMs).toBe('number');
    expect(logContext.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
