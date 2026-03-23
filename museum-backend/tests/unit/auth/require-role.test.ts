import { Request, Response, NextFunction } from 'express';
import { requireRole } from '@src/helpers/middleware/require-role.middleware';

const mockRes = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
};

const mockNext: NextFunction = jest.fn();

describe('requireRole middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls next() when user has an allowed role', () => {
    const middleware = requireRole('admin', 'moderator');
    const req = { user: { id: 1, role: 'admin' } } as unknown as Request;
    const res = mockRes();

    middleware(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 when user role is not in allowed list', () => {
    const middleware = requireRole('admin');
    const req = { user: { id: 1, role: 'visitor' } } as unknown as Request;
    const res = mockRes();

    middleware(req, res, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
    });
  });

  it('returns 403 when req.user is missing', () => {
    const middleware = requireRole('admin');
    const req = {} as Request;
    const res = mockRes();

    middleware(req, res, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 403 when req.user has no role', () => {
    const middleware = requireRole('admin');
    const req = { user: { id: 1 } } as unknown as Request;
    const res = mockRes();

    middleware(req, res, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('supports multiple allowed roles', () => {
    const middleware = requireRole('admin', 'moderator', 'museum_manager');
    const req = { user: { id: 1, role: 'museum_manager' } } as unknown as Request;
    const res = mockRes();

    middleware(req, res, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  it('does not leak required roles in error message', () => {
    const middleware = requireRole('admin');
    const req = { user: { id: 1, role: 'visitor' } } as unknown as Request;
    const res = mockRes();

    middleware(req, res, mockNext);

    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error.message).not.toContain('admin');
    expect(body.error.message).toBe('Insufficient permissions');
  });
});
