import type { Request, Response, NextFunction } from 'express';
import { requestIdMiddleware } from '@src/helpers/middleware/request-id.middleware';

const mockReq = (headers: Record<string, string | undefined> = {}): Request =>
  ({
    header: (name: string) => headers[name.toLowerCase()],
    headers,
  }) as unknown as Request;

const mockRes = (): Response & { headers: Record<string, string> } => {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader: jest.fn((name: string, value: string) => {
      headers[name] = value;
    }),
  } as unknown as Response & { headers: Record<string, string> };
};

describe('requestIdMiddleware', () => {
  it('uses the inbound x-request-id header when present', () => {
    const req = mockReq({ 'x-request-id': 'incoming-id-123' });
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    requestIdMiddleware(req, res, next);

    expect((req as unknown as { requestId: string }).requestId).toBe('incoming-id-123');
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'incoming-id-123');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('generates a UUID when x-request-id header is absent', () => {
    const req = mockReq({});
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    requestIdMiddleware(req, res, next);

    const requestId = (req as unknown as { requestId: string }).requestId;
    expect(requestId).toBeDefined();
    // UUID v4 pattern
    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', requestId);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('generates a UUID when x-request-id header is empty/whitespace', () => {
    const req = mockReq({ 'x-request-id': '   ' });
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    requestIdMiddleware(req, res, next);

    const requestId = (req as unknown as { requestId: string }).requestId;
    // Should not be whitespace — should be a generated UUID
    expect(requestId).toMatch(/^[0-9a-f]{8}-/);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
