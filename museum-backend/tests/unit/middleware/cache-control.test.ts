import type { Request, Response, NextFunction } from 'express';
import { setCacheControl, NO_STORE, PRIVATE_NO_STORE, SHORT_PUBLIC } from '@src/helpers/middleware/cache-control.middleware';

const mockRes = (): Response => {
  return {
    set: jest.fn(),
  } as unknown as Response;
};

describe('setCacheControl middleware', () => {
  it('sets Cache-Control header to the given directive', () => {
    const mw = setCacheControl('public, max-age=3600');
    const req = {} as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    mw(req, res, next);

    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'public, max-age=3600');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('works with NO_STORE constant', () => {
    const mw = setCacheControl(NO_STORE);
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    mw({} as Request, res, next);

    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('works with PRIVATE_NO_STORE constant', () => {
    const mw = setCacheControl(PRIVATE_NO_STORE);
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    mw({} as Request, res, next);

    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });

  it('works with SHORT_PUBLIC constant', () => {
    const mw = setCacheControl(SHORT_PUBLIC);
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    mw({} as Request, res, next);

    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'public, max-age=10, s-maxage=10');
  });
});
