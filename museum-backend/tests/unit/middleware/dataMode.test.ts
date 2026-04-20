import type { Request, Response, NextFunction } from 'express';

import { dataModeMiddleware } from '@src/helpers/dataMode.middleware';

const mockReq = (headers: Record<string, string | string[] | undefined> = {}): Request =>
  ({ headers }) as unknown as Request;

const mockRes = (): Response => ({}) as Response;

describe('dataModeMiddleware', () => {
  it('resolves to "low" when X-Data-Mode header is "low"', () => {
    const req = mockReq({ 'x-data-mode': 'low' });
    const next = jest.fn() as NextFunction;

    dataModeMiddleware(req, mockRes(), next);

    expect(req.dataMode).toBe('low');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('resolves to "normal" when header is absent', () => {
    const req = mockReq();
    const next = jest.fn() as NextFunction;

    dataModeMiddleware(req, mockRes(), next);

    expect(req.dataMode).toBe('normal');
  });

  it('resolves to "normal" for unknown values (defensive default)', () => {
    const req = mockReq({ 'x-data-mode': 'ultra-low' });
    const next = jest.fn() as NextFunction;

    dataModeMiddleware(req, mockRes(), next);

    expect(req.dataMode).toBe('normal');
  });

  it('uses the first value when the header arrives as an array', () => {
    const req = mockReq({ 'x-data-mode': ['low', 'normal'] });
    const next = jest.fn() as NextFunction;

    dataModeMiddleware(req, mockRes(), next);

    expect(req.dataMode).toBe('low');
  });

  it('always calls next to continue the chain', () => {
    const req = mockReq({ 'x-data-mode': 'low' });
    const next = jest.fn() as NextFunction;

    dataModeMiddleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith();
  });
});
