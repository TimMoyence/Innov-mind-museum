import type { Response, NextFunction } from 'express';
import { requestIdMiddleware } from '@src/helpers/middleware/request-id.middleware';
import { makePartialRequest } from '../../helpers/http/express-mock.helpers';

const mockReq = (headers: Record<string, string | undefined> = {}) =>
  makePartialRequest({ headers });

type MockRes = Response & { headers: Record<string, string> };
const mockRes = (): MockRes => {
  const headers: Record<string, string> = {};
  const res = {
    headers,
    setHeader: jest.fn((name: string, value: string) => {
      headers[name] = value;
    }),
  };
  return res as unknown as MockRes;
};

describe('requestIdMiddleware', () => {
  it('uses the inbound x-request-id header when present', () => {
    const req = mockReq({ 'x-request-id': 'incoming-id-123' });
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBe('incoming-id-123');
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'incoming-id-123');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('generates a UUID when x-request-id header is absent', () => {
    const req = mockReq({});
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    requestIdMiddleware(req, res, next);

    const requestId = req.requestId;
    // UUID v4 pattern (also validates it's defined and non-empty)
    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', requestId);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('generates a UUID when x-request-id header is empty/whitespace', () => {
    const req = mockReq({ 'x-request-id': '   ' });
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    requestIdMiddleware(req, res, next);

    const requestId = req.requestId;
    // Should not be whitespace — should be a generated UUID
    expect(requestId).toMatch(/^[0-9a-f]{8}-/);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
