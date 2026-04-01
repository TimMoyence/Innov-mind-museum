import type { Request, Response, NextFunction } from 'express';
import { errorHandler } from '@src/helpers/middleware/error.middleware';
import { AppError } from '@shared/errors/app.error';
import { MulterError } from 'multer';

// Silence logger output during tests
jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@shared/observability/sentry', () => ({
  captureExceptionWithContext: jest.fn(),
}));

import { captureExceptionWithContext } from '@shared/observability/sentry';
import { logger } from '@shared/logger/logger';

const mockReq = (overrides: Record<string, unknown> = {}): Request =>
  ({
    method: 'GET',
    originalUrl: '/api/test',
    ...overrides,
  }) as unknown as Request;

const mockRes = (): Response => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
};

const noop: NextFunction = jest.fn();

describe('errorHandler middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns structured 400 for AppError with statusCode < 500', () => {
    const err = new AppError({ message: 'Bad input', statusCode: 400, code: 'BAD_REQUEST' });
    const req = mockReq({ requestId: 'req-123' });
    const res = mockRes();

    errorHandler(err, req, res, noop);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'BAD_REQUEST',
        message: 'Bad input',
        requestId: 'req-123',
      },
    });
  });

  it('does NOT call Sentry or logger.error for 4xx errors', () => {
    const err = new AppError({ message: 'Not found', statusCode: 404, code: 'NOT_FOUND' });
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, noop);

    expect(captureExceptionWithContext).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('returns 500 and masks message for unknown (non-AppError) errors', () => {
    const err = new Error('database connection lost');
    const req = mockReq({ requestId: 'req-456' });
    const res = mockRes();

    errorHandler(err, req, res, noop);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Internal server error');
    expect(body.error.requestId).toBe('req-456');
    // Must NOT leak internal error message
    expect(body.error.message).not.toContain('database');
  });

  it('calls Sentry and logger.error for 5xx errors', () => {
    const err = new Error('unexpected crash');
    const req = mockReq({ requestId: 'req-789' });
    const res = mockRes();

    errorHandler(err, req, res, noop);

    expect(captureExceptionWithContext).toHaveBeenCalledWith(err, {
      requestId: 'req-789',
      method: 'GET',
      path: '/api/test',
    });
    expect(logger.error).toHaveBeenCalledWith(
      'request_failed',
      expect.objectContaining({
        requestId: 'req-789',
        statusCode: 500,
      }),
    );
  });

  it('calls Sentry for AppError with statusCode 500', () => {
    const err = new AppError({ message: 'server broke', statusCode: 500, code: 'INTERNAL_ERROR' });
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, noop);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(captureExceptionWithContext).toHaveBeenCalledWith(err, expect.any(Object));
    expect(logger.error).toHaveBeenCalled();
  });

  it('includes AppError details when present', () => {
    const err = new AppError({
      message: 'Validation failed',
      statusCode: 422,
      code: 'VALIDATION_ERROR',
      details: { field: 'email', issue: 'invalid format' },
    });
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, noop);

    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error.details).toEqual({ field: 'email', issue: 'invalid format' });
  });

  it('omits details key when AppError has no details', () => {
    const err = new AppError({ message: 'Conflict', statusCode: 409, code: 'CONFLICT' });
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, noop);

    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error).not.toHaveProperty('details');
  });

  it('handles requestId being undefined', () => {
    const err = new AppError({ message: 'Bad', statusCode: 400, code: 'BAD_REQUEST' });
    const req = mockReq(); // no requestId
    const res = mockRes();

    errorHandler(err, req, res, noop);

    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error.requestId).toBeUndefined();
  });

  it('handles non-Error objects thrown as errors', () => {
    const err = 'string error';
    const req = mockReq({ requestId: 'r-str' });
    const res = mockRes();

    errorHandler(err as unknown, req, res, noop);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Internal server error');
    // Logger should log the stringified version
    expect(logger.error).toHaveBeenCalledWith(
      'request_failed',
      expect.objectContaining({
        error: 'string error',
      }),
    );
  });

  it('uses AppError statusCode for 429 (Too Many Requests)', () => {
    const err = new AppError({ message: 'Too fast', statusCode: 429, code: 'TOO_MANY_REQUESTS' });
    const req = mockReq();
    const res = mockRes();

    errorHandler(err, req, res, noop);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(captureExceptionWithContext).not.toHaveBeenCalled();
  });

  it('maps multer file-size errors to 413 payload-too-large', () => {
    const err = new MulterError('LIMIT_FILE_SIZE');
    const req = mockReq({ requestId: 'req-upload' });
    const res = mockRes();

    errorHandler(err, req, res, noop);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'File too large',
        requestId: 'req-upload',
      },
    });
    expect(captureExceptionWithContext).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});
