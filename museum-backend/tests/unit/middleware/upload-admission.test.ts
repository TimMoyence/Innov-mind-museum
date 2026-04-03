import { createUploadAdmissionMiddleware } from '@src/helpers/middleware/upload-admission.middleware';

import type { Request, Response, NextFunction } from 'express';

interface MockResponse extends Response {
  triggerClose: () => void;
}

const mockReq = (contentType = ''): Request =>
  ({
    headers: { 'content-type': contentType },
  }) as unknown as Request;

const mockRes = (): MockResponse => {
  const closeHandlers: (() => void)[] = [];
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    on: jest.fn((event: string, handler: () => void) => {
      if (event === 'close') {
        closeHandlers.push(handler);
      }
    }),
    triggerClose() {
      for (const h of closeHandlers) h();
    },
  } as unknown as MockResponse;
};

describe('uploadAdmissionMiddleware', () => {
  it('passes through non-multipart requests without counting', () => {
    const middleware = createUploadAdmissionMiddleware(2);
    const req = mockReq('application/json');
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows multipart requests under the limit', () => {
    const middleware = createUploadAdmissionMiddleware(2);
    const req = mockReq('multipart/form-data; boundary=something');
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 503 when concurrent limit is reached', () => {
    const middleware = createUploadAdmissionMiddleware(1);

    // First request — fills the slot
    const req1 = mockReq('multipart/form-data');
    const res1 = mockRes();
    const next1 = jest.fn() as NextFunction;
    middleware(req1, res1, next1);
    expect(next1).toHaveBeenCalledTimes(1);

    // Second request — should be rejected
    const req2 = mockReq('multipart/form-data');
    const res2 = mockRes();
    const next2 = jest.fn() as NextFunction;
    middleware(req2, res2, next2);

    expect(next2).not.toHaveBeenCalled();
    expect(res2.status).toHaveBeenCalledWith(503);
    expect(res2.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'SERVICE_UNAVAILABLE',
        }),
      }),
    );
  });

  it('releases slot after response close and allows new requests', () => {
    const middleware = createUploadAdmissionMiddleware(1);

    // First request
    const req1 = mockReq('multipart/form-data');
    const res1 = mockRes();
    const next1 = jest.fn() as NextFunction;
    middleware(req1, res1, next1);
    expect(next1).toHaveBeenCalledTimes(1);

    // Simulate response close
    res1.triggerClose();

    // Second request should now succeed
    const req2 = mockReq('multipart/form-data');
    const res2 = mockRes();
    const next2 = jest.fn() as NextFunction;
    middleware(req2, res2, next2);
    expect(next2).toHaveBeenCalledTimes(1);
  });

  it('releases slot on aborted connection (close event)', () => {
    const middleware = createUploadAdmissionMiddleware(1);

    // Fill the slot
    const req1 = mockReq('multipart/form-data');
    const res1 = mockRes();
    const next1 = jest.fn() as NextFunction;
    middleware(req1, res1, next1);

    // Simulate abort via close event
    res1.triggerClose();

    // New request should succeed
    const req2 = mockReq('multipart/form-data');
    const res2 = mockRes();
    const next2 = jest.fn() as NextFunction;
    middleware(req2, res2, next2);
    expect(next2).toHaveBeenCalledTimes(1);
  });

  it('uses default maxConcurrent of 50 when not specified', () => {
    const middleware = createUploadAdmissionMiddleware();

    // Should allow 50 concurrent requests
    const responses: ReturnType<typeof mockRes>[] = [];
    for (let i = 0; i < 50; i++) {
      const req = mockReq('multipart/form-data');
      const res = mockRes();
      const next = jest.fn() as NextFunction;
      middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      responses.push(res);
    }

    // 51st should be rejected
    const req51 = mockReq('multipart/form-data');
    const res51 = mockRes();
    const next51 = jest.fn() as NextFunction;
    middleware(req51, res51, next51);
    expect(next51).not.toHaveBeenCalled();
    expect(res51.status).toHaveBeenCalledWith(503);

    // Clean up
    for (const res of responses) {
      res.triggerClose();
    }
  });

  it('never decrements below zero', () => {
    const middleware = createUploadAdmissionMiddleware(1);

    const req1 = mockReq('multipart/form-data');
    const res1 = mockRes();
    const next1 = jest.fn() as NextFunction;
    middleware(req1, res1, next1);

    // Double close should not break anything
    res1.triggerClose();
    res1.triggerClose();

    // Should still work correctly
    const req2 = mockReq('multipart/form-data');
    const res2 = mockRes();
    const next2 = jest.fn() as NextFunction;
    middleware(req2, res2, next2);
    expect(next2).toHaveBeenCalledTimes(1);

    // And the second slot should not be magically opened
    const req3 = mockReq('multipart/form-data');
    const res3 = mockRes();
    const next3 = jest.fn() as NextFunction;
    middleware(req3, res3, next3);
    expect(next3).not.toHaveBeenCalled();
    expect(res3.status).toHaveBeenCalledWith(503);
  });
});
